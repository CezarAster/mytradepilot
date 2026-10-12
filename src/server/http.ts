// Local HTTP server: JSON API, server-sent events, and the built UI. Binds to 127.0.0.1 only.
// Cross-site requests from a browser tab on another origin are refused by the Origin check, so a web page
// cannot drive the referee or read the trader's data.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import type { ServerEvent } from './api.ts';
import type { Logger } from './log.ts';
import { HttpError, type Referee } from './referee.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const MAX_BODY = 25 * 1024 * 1024;

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, body: unknown) => Promise<unknown> | unknown;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

export interface HttpOptions {
  port: number;
  host?: string;
  /** Directory with the built UI (dist-app). Optional: the API works without it. */
  staticDir: string | null;
  log: Logger;
}

export class RefereeHttp {
  private readonly routes: Route[] = [];
  private readonly referee: Referee;
  private readonly opts: HttpOptions;
  private server: Server | null = null;
  private sseClients = new Set<ServerResponse>();
  private unsubscribe: (() => void) | null = null;

  constructor(referee: Referee, opts: HttpOptions) {
    this.referee = referee;
    this.opts = opts;
    this.register();
  }

  private route(method: string, path: string, handler: Handler): void {
    const keys: string[] = [];
    const pattern = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
    this.routes.push({ method, pattern, keys, handler });
  }

  private register(): void {
    const r = this.referee;
    this.route('GET', '/api/health', () => ({ ok: true, time: Date.now() }));
    this.route('GET', '/api/state', () => r.state());
    this.route('GET', '/api/status', () => r.status());
    this.route('GET', '/api/report', () => r.report());
    this.route('GET', '/api/trades', (req) => r.trades(num(query(req, 'days'), 90, 1, 3650)));
    this.route('GET', '/api/breaches', (req) => r.breaches(num(query(req, 'days'), 30, 1, 3650)));
    this.route('GET', '/api/actions', (req) => r.actions(num(query(req, 'limit'), 200, 1, 5000)));
    this.route('GET', '/api/rules', () => r.state().rules);
    this.route('PUT', '/api/rules', (_q, _s, _p, body) => r.setRules(body));
    this.route('POST', '/api/declare', (_q, _s, _p, body) => r.declare(obj(body)));
    this.route('DELETE', '/api/declare', () => (r.cancelDeclaration(), { ok: true }));
    this.route('POST', '/api/plan', (_q, _s, _p, body) => r.confirmPlan(str(obj(body).note)));
    this.route('POST', '/api/enforcement', (_q, _s, _p, body) => {
      const b = obj(body);
      const patch: { enabled?: boolean; dryRun?: boolean } = {};
      if (typeof b.enabled === 'boolean') patch.enabled = b.enabled;
      if (typeof b.dryRun === 'boolean') patch.dryRun = b.dryRun;
      return r.setEnforcement(patch);
    });
    this.route('POST', '/api/kill', () => r.kill());
    this.route('POST', '/api/flatten', (_q, _s, _p, body) => r.manualFlatten(str(obj(body).symbol)));
    this.route('GET', '/api/settings', () => r.settingsView());
    this.route('PUT', '/api/settings', (_q, _s, _p, body) => r.updateSettings(obj(body)));
    this.route('POST', '/api/settings/test', (_q, _s, _p, body) => r.testConnection(obj(body).alpaca as never));
    this.route('POST', '/api/import', (_q, _s, _p, body) => {
      const b = obj(body);
      return r.importCsv({ fileName: String(b.fileName ?? 'import.csv'), text: String(b.text ?? ''), timeZone: String(b.timeZone ?? '') });
    });
    this.route('GET', '/api/strategy', () => r.strategy());
    this.route('PUT', '/api/strategy', (_q, _s, _p, body) => r.setStrategy(body));
    this.route('POST', '/api/setup-check', (_q, _s, _p, body) => {
      const b = obj(body);
      return r.setupCheck(String(b.symbol ?? ''), b.side === 'short' ? 'short' : 'long');
    });
  }

  listen(): Promise<number> {
    const host = this.opts.host ?? '127.0.0.1';
    this.server = createServer((req, res) => void this.handle(req, res));
    this.server.keepAliveTimeout = 65000;
    this.unsubscribe = this.referee.onEvent((e) => this.broadcast(e));
    return new Promise((resolvePort, reject) => {
      this.server!.once('error', reject);
      this.server!.listen(this.opts.port, host, () => {
        const addr = this.server!.address();
        resolvePort(typeof addr === 'object' && addr ? addr.port : this.opts.port);
      });
    });
  }

  close(): Promise<void> {
    this.unsubscribe?.();
    for (const c of this.sseClients) c.end();
    this.sseClients.clear();
    return new Promise((res) => (this.server ? this.server.close(() => res()) : res()));
  }

  private broadcast(e: ServerEvent): void {
    if (!this.sseClients.size) return;
    const line = `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
    for (const c of this.sseClients) {
      try {
        c.write(line);
      } catch {
        this.sseClients.delete(c);
      }
    }
  }

  private sameOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (!origin) return true; // same-origin fetches and curl send no Origin on GET; browsers send it on POST from our page too
    try {
      const o = new URL(origin);
      const host = req.headers.host ?? '';
      if (o.host === host) return true;
      // Vite dev server on another port, same machine.
      return (o.hostname === '127.0.0.1' || o.hostname === 'localhost') && (host.startsWith('127.0.0.1') || host.startsWith('localhost'));
    } catch {
      return false;
    }
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const path = url.pathname;
    try {
      if (path === '/api/events' && req.method === 'GET') return this.sse(req, res);
      if (path.startsWith('/api/')) {
        if (!this.sameOrigin(req)) return this.json(res, 403, { error: 'cross-origin request refused' });
        const route = this.routes.find((r) => r.method === req.method && r.pattern.test(path));
        if (!route) return this.json(res, 404, { error: `no ${req.method} ${path}` });
        const m = route.pattern.exec(path)!;
        const params: Record<string, string> = {};
        route.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await this.readJson(req);
        const out = await route.handler(req, res, params, body);
        return this.json(res, 200, out ?? { ok: true });
      }
      return this.serveStatic(path, res);
    } catch (err) {
      if (err instanceof HttpError) return this.json(res, err.status, { error: err.message });
      this.opts.log.error(`${req.method} ${path} failed`, err);
      return this.json(res, 500, { error: (err as Error).message ?? 'internal error' });
    }
  }

  private readJson(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolveBody, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) {
          reject(new HttpError(413, 'body too large'));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (!text.trim()) return resolveBody({});
        try {
          resolveBody(JSON.parse(text));
        } catch {
          reject(new HttpError(400, 'body must be JSON'));
        }
      });
      req.on('error', reject);
    });
  }

  private json(res: ServerResponse, status: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(text);
  }

  private sse(req: IncomingMessage, res: ServerResponse): void {
    if (!this.sameOrigin(req)) return this.json(res, 403, { error: 'cross-origin request refused' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    res.write(`event: snapshot\ndata: ${JSON.stringify({ type: 'snapshot', snapshot: this.referee.snapshot(), status: this.referee.status() })}\n\n`);
    this.sseClients.add(res);
    const ping = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(ping);
      }
    }, 20000);
    req.on('close', () => {
      clearInterval(ping);
      this.sseClients.delete(res);
    });
  }

  private serveStatic(path: string, res: ServerResponse): void {
    const dir = this.opts.staticDir;
    if (!dir || !existsSync(dir)) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><meta charset="utf-8"><title>MyTradePilot Referee</title><body style="font-family:system-ui;padding:2rem;max-width:40rem"><h1>The referee is running</h1><p>The browser UI is not built yet. Run <code>npm run build:app</code> once, then reload. For development run <code>npm run dev:app</code> and open <a href="http://127.0.0.1:5174">http://127.0.0.1:5174</a>.</p><p>API: <a href="/api/state">/api/state</a></p></body>',
      );
      return;
    }
    const root = resolve(dir);
    let file = resolve(join(root, normalize(path === '/' ? '/index.html' : path)));
    if (!file.startsWith(root + sep) && file !== root) return this.json(res, 404, { error: 'not found' });
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html'); // hash-routed SPA
    if (!existsSync(file)) return this.json(res, 404, { error: 'not found' });
    res.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': extname(file) === '.html' ? 'no-store' : 'public, max-age=3600' });
    createReadStream(file).pipe(res);
  }
}

const query = (req: IncomingMessage, k: string) => new URL(req.url ?? '/', 'http://x').searchParams.get(k);
const num = (v: string | null, d: number, lo: number, hi: number) => {
  const n = Number(v);
  return v !== null && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const obj = (b: unknown): Record<string, unknown> => (b && typeof b === 'object' && !Array.isArray(b) ? (b as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
