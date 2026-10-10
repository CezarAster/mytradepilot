// Thin Alpaca REST client on fetch. No SDK: the surface we use is small and this keeps it testable.
import type {
  AlpacaAccount,
  AlpacaBar,
  AlpacaClock,
  AlpacaCredentials,
  AlpacaFillActivity,
  AlpacaOrder,
  AlpacaPosition,
  AlpacaSnapshot,
} from './types.ts';
import { AlpacaError } from './types.ts';

export const TRADING_HOST = { paper: 'https://paper-api.alpaca.markets', live: 'https://api.alpaca.markets' } as const;
export const STREAM_HOST = { paper: 'wss://paper-api.alpaca.markets/stream', live: 'wss://api.alpaca.markets/stream' } as const;
export const DATA_HOST = 'https://data.alpaca.markets';

export interface ClientOptions {
  /** Per-request timeout. */
  timeoutMs?: number;
  /** Retries for idempotent requests on 429/5xx/network errors. */
  retries?: number;
  fetchImpl?: typeof fetch;
  /** Override hosts (tests point these at a local fake). */
  tradingHost?: string;
  dataHost?: string;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AlpacaClient {
  readonly creds: AlpacaCredentials;
  private readonly tradingHost: string;
  private readonly dataHost: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(creds: AlpacaCredentials, opts: ClientOptions = {}) {
    this.creds = creds;
    this.tradingHost = opts.tradingHost ?? TRADING_HOST[creds.mode];
    this.dataHost = opts.dataHost ?? DATA_HOST;
    this.timeoutMs = opts.timeoutMs ?? 15000;
    this.retries = opts.retries ?? 3;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private headers(): Record<string, string> {
    return { 'APCA-API-KEY-ID': this.creds.keyId, 'APCA-API-SECRET-KEY': this.creds.secretKey, accept: 'application/json' };
  }

  private async request<T>(method: string, url: string, body?: unknown, idempotent = method === 'GET'): Promise<T> {
    let attempt = 0;
    for (;;) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(url, {
          method,
          headers: body === undefined ? this.headers() : { ...this.headers(), 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctrl.signal,
        });
        const text = await res.text();
        if (res.ok) return (text ? JSON.parse(text) : null) as T;
        const retryable = res.status === 429 || res.status >= 500;
        if (retryable && idempotent && attempt < this.retries) {
          attempt++;
          await this.sleep(Math.min(8000, 500 * 2 ** attempt));
          continue;
        }
        throw new AlpacaError(res.status, text);
      } catch (err) {
        if (err instanceof AlpacaError) throw err;
        if (idempotent && attempt < this.retries) {
          attempt++;
          await this.sleep(Math.min(8000, 500 * 2 ** attempt));
          continue;
        }
        throw new AlpacaError(0, String(err), `Alpaca request failed: ${(err as Error).message ?? err}`);
      } finally {
        clearTimeout(timer);
      }
    }
  }

  private q(params: Record<string, string | number | boolean | undefined>): string {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) u.set(k, String(v));
    const s = u.toString();
    return s ? `?${s}` : '';
  }

  getAccount(): Promise<AlpacaAccount> {
    return this.request('GET', `${this.tradingHost}/v2/account`);
  }

  getClock(): Promise<AlpacaClock> {
    return this.request('GET', `${this.tradingHost}/v2/clock`);
  }

  listPositions(): Promise<AlpacaPosition[]> {
    return this.request('GET', `${this.tradingHost}/v2/positions`);
  }

  /** Close one symbol at market. Alpaca rejects it while sell orders reserve the shares, so cancel those first. */
  async closePosition(symbol: string): Promise<AlpacaOrder> {
    return this.request('DELETE', `${this.tradingHost}/v2/positions/${encodeURIComponent(symbol)}`, undefined, false);
  }

  closeAllPositions(cancelOrders = true): Promise<unknown> {
    return this.request('DELETE', `${this.tradingHost}/v2/positions${this.q({ cancel_orders: cancelOrders })}`, undefined, false);
  }

  listOrders(params: { status?: 'open' | 'closed' | 'all'; after?: string; until?: string; limit?: number; direction?: 'asc' | 'desc'; nested?: boolean; symbols?: string } = {}): Promise<AlpacaOrder[]> {
    return this.request('GET', `${this.tradingHost}/v2/orders${this.q({ nested: true, limit: 500, ...params })}`);
  }

  getOrder(id: string): Promise<AlpacaOrder> {
    return this.request('GET', `${this.tradingHost}/v2/orders/${encodeURIComponent(id)}${this.q({ nested: true })}`);
  }

  cancelOrder(id: string): Promise<void> {
    return this.request('DELETE', `${this.tradingHost}/v2/orders/${encodeURIComponent(id)}`, undefined, false);
  }

  async cancelOrdersFor(symbol: string): Promise<number> {
    const open = await this.listOrders({ status: 'open', symbols: symbol });
    let n = 0;
    for (const o of open) {
      if (o.symbol.toUpperCase() !== symbol.toUpperCase()) continue;
      try {
        await this.cancelOrder(o.id);
        n++;
      } catch (err) {
        // Already filled or cancelled between the list and the cancel: fine.
        if (!(err instanceof AlpacaError && (err.status === 404 || err.status === 422))) throw err;
      }
    }
    return n;
  }

  /** One page of fills. Alpaca pages with page_token = the last activity id of the previous page. */
  listFills(params: { after?: string; until?: string; pageSize?: number; pageToken?: string; direction?: 'asc' | 'desc' } = {}): Promise<AlpacaFillActivity[]> {
    return this.request(
      'GET',
      `${this.tradingHost}/v2/account/activities/FILL${this.q({ after: params.after, until: params.until, page_size: params.pageSize ?? 100, page_token: params.pageToken, direction: params.direction ?? 'asc' })}`,
    );
  }

  /** Every fill since `after` (ISO), oldest first, across pages. */
  async allFillsSince(after?: string): Promise<AlpacaFillActivity[]> {
    const out: AlpacaFillActivity[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < 1000; i++) {
      const page = await this.listFills({ after, pageSize: 100, pageToken, direction: 'asc' });
      out.push(...page);
      if (page.length < 100) break;
      pageToken = page[page.length - 1].id;
    }
    return out;
  }

  async getBars(symbol: string, timeframe: string, params: { start?: string; end?: string; limit?: number; feed?: string; adjustment?: string } = {}): Promise<AlpacaBar[]> {
    const bars: AlpacaBar[] = [];
    let pageToken: string | undefined;
    for (let i = 0; i < 20; i++) {
      const res = await this.request<{ bars: AlpacaBar[] | null; next_page_token: string | null }>(
        'GET',
        `${this.dataHost}/v2/stocks/${encodeURIComponent(symbol)}/bars${this.q({ timeframe, start: params.start, end: params.end, limit: params.limit ?? 1000, feed: params.feed ?? 'iex', adjustment: params.adjustment ?? 'raw', page_token: pageToken, sort: 'asc' })}`,
      );
      bars.push(...(res.bars ?? []));
      if (!res.next_page_token || (params.limit && bars.length >= params.limit)) break;
      pageToken = res.next_page_token;
    }
    return bars;
  }

  async getSnapshots(symbols: string[], feed = 'iex'): Promise<Record<string, AlpacaSnapshot>> {
    if (!symbols.length) return {};
    return this.request('GET', `${this.dataHost}/v2/stocks/snapshots${this.q({ symbols: symbols.join(','), feed })}`);
  }

  async latestPrices(symbols: string[], feed = 'iex'): Promise<Record<string, number>> {
    const snaps = await this.getSnapshots(symbols, feed);
    const out: Record<string, number> = {};
    for (const [sym, s] of Object.entries(snaps)) {
      const p = s.latestTrade?.p ?? s.minuteBar?.c ?? s.dailyBar?.c;
      if (p !== undefined && Number.isFinite(p)) out[sym.toUpperCase()] = p;
    }
    return out;
  }
}
