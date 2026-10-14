// Alpaca trade_updates WebSocket with reconnect. Uses Node's built-in WebSocket (Node 22+).
import { STREAM_HOST } from './client.ts';
import type { AlpacaCredentials, AlpacaTradeUpdate } from './types.ts';

export type StreamStatus = 'stopped' | 'connecting' | 'authenticating' | 'live' | 'reconnecting' | 'unauthorized';

export interface StreamHandlers {
  onUpdate: (u: AlpacaTradeUpdate) => void;
  onStatus: (s: StreamStatus, detail?: string) => void;
  /** Called after each (re)connect once live, so the owner can backfill what it missed. */
  onLive: () => void;
}

export interface StreamOptions {
  url?: string;
  /** Test hook: a WebSocket constructor. */
  WebSocketImpl?: typeof WebSocket;
  minBackoffMs?: number;
  maxBackoffMs?: number;
  /** While live, re-send "listen" this often; Alpaca answers with a "listening" message, which proves the socket. */
  heartbeatMs?: number;
  /** No message at all for this long while live: the socket is dead even if it never closed. Reconnect. */
  idleTimeoutMs?: number;
}

export class TradeStream {
  private ws: WebSocket | null = null;
  private status: StreamStatus = 'stopped';
  private stopped = true;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private listening = false;
  private readonly url: string;
  private readonly WS: typeof WebSocket;
  private readonly minBackoff: number;
  private readonly maxBackoff: number;
  private readonly heartbeatMs: number;
  private readonly idleTimeoutMs: number;

  private readonly creds: AlpacaCredentials;
  private readonly handlers: StreamHandlers;

  constructor(creds: AlpacaCredentials, handlers: StreamHandlers, opts: StreamOptions = {}) {
    this.creds = creds;
    this.handlers = handlers;
    this.url = opts.url ?? STREAM_HOST[creds.mode];
    this.WS = opts.WebSocketImpl ?? WebSocket;
    this.minBackoff = opts.minBackoffMs ?? 1000;
    this.maxBackoff = opts.maxBackoffMs ?? 60000;
    this.heartbeatMs = opts.heartbeatMs ?? 30000;
    this.idleTimeoutMs = opts.idleTimeoutMs ?? 75000;
  }

  getStatus(): StreamStatus {
    return this.status;
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.stopHeartbeat();
    this.set('stopped');
    const ws = this.ws;
    this.ws = null;
    try {
      ws?.close();
    } catch {
      // already closed
    }
  }

  private set(s: StreamStatus, detail?: string): void {
    if (this.status === s && !detail) return;
    this.status = s;
    this.handlers.onStatus(s, detail);
  }

  private connect(): void {
    if (this.stopped) return;
    this.set(this.attempts ? 'reconnecting' : 'connecting', this.attempts ? `attempt ${this.attempts + 1}` : undefined);
    let ws: WebSocket;
    try {
      ws = new this.WS(this.url);
    } catch (err) {
      this.scheduleReconnect(String(err));
      return;
    }
    this.ws = ws;
    this.listening = false;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.set('authenticating');
      ws.send(JSON.stringify({ action: 'auth', key: this.creds.keyId, secret: this.creds.secretKey }));
    };
    ws.onmessage = (ev: MessageEvent) => this.onMessage(ws, ev.data);
    ws.onerror = (ev: Event) => {
      const msg = (ev as ErrorEvent).message ?? 'socket error';
      if (this.ws === ws) this.handlers.onStatus(this.status, msg);
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.stopHeartbeat();
      if (this.status === 'unauthorized') {
        // Bad keys: do not hammer the API. Try again slowly in case they were just rotated.
        this.scheduleReconnect(`closed ${ev.code}`, this.maxBackoff);
        return;
      }
      this.scheduleReconnect(`closed ${ev.code}${ev.reason ? ` ${ev.reason}` : ''}`);
    };
  }

  private onMessage(ws: WebSocket, raw: unknown): void {
    if (this.ws !== ws) return; // a socket we already gave up on
    this.lastMessageAt = Date.now();
    let text: string;
    if (typeof raw === 'string') text = raw;
    else if (raw instanceof ArrayBuffer) text = new TextDecoder().decode(raw);
    else if (ArrayBuffer.isView(raw)) text = new TextDecoder().decode(raw as Uint8Array);
    else return;
    let msg: { stream?: string; data?: Record<string, unknown> };
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    const data = msg.data ?? {};
    if (msg.stream === 'authorization') {
      if (data.status === 'authorized') {
        ws.send(JSON.stringify({ action: 'listen', data: { streams: ['trade_updates'] } }));
      } else {
        this.set('unauthorized', String(data.status ?? 'unauthorized'));
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
      return;
    }
    if (msg.stream === 'listening') {
      if (this.listening) return; // a heartbeat answer
      this.listening = true;
      this.attempts = 0;
      this.set('live');
      this.startHeartbeat(ws);
      this.handlers.onLive();
      return;
    }
    if (msg.stream === 'trade_updates' && data && typeof data === 'object' && 'event' in data && 'order' in data) {
      this.handlers.onUpdate(data as unknown as AlpacaTradeUpdate);
    }
  }

  private startHeartbeat(ws: WebSocket): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      if (this.ws !== ws) return this.stopHeartbeat();
      const idle = Date.now() - this.lastMessageAt;
      if (idle >= this.idleTimeoutMs) {
        // Silent socket: treat as dead. Detach first so its late close event is ignored.
        this.ws = null;
        this.stopHeartbeat();
        try {
          ws.close();
        } catch {
          // ignore
        }
        this.scheduleReconnect(`no message for ${Math.round(idle / 1000)}s`);
        return;
      }
      try {
        ws.send(JSON.stringify({ action: 'listen', data: { streams: ['trade_updates'] } }));
      } catch {
        // the idle check above will catch a dead socket
      }
    }, this.heartbeatMs);
    (this.heartbeat as { unref?: () => void }).unref?.();
  }

  private stopHeartbeat(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  private scheduleReconnect(detail: string, fixedDelay?: number): void {
    if (this.stopped) return;
    const delay = fixedDelay ?? Math.min(this.maxBackoff, this.minBackoff * 2 ** Math.min(this.attempts, 6)) * (0.75 + Math.random() * 0.5);
    this.attempts++;
    this.set('reconnecting', `${detail}; retry in ${Math.round(delay / 1000)}s`);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), delay);
  }
}
