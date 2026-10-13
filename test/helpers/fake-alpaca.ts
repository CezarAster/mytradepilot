// A fake Alpaca trading API and a hand-driven stream, shared by the service tests and the UI scenario runner.
import { createServer, type Server } from 'node:http';
import type { StreamHandlers, StreamStatus } from '../../src/alpaca/stream.ts';
import type { AlpacaCredentials, AlpacaFillActivity, AlpacaOrder, AlpacaPosition, AlpacaTradeUpdate } from '../../src/alpaca/types.ts';

// ---- a fake Alpaca trading API ----
export class FakeAlpaca {
  server!: Server;
  port = 0;
  fills: AlpacaFillActivity[] = [];
  openOrders: AlpacaOrder[] = [];
  positions: AlpacaPosition[] = [];
  calls: string[] = [];
  failNext: string | null = null;
  /** Fail this many close-position calls with a 500. */
  failClose = 0;
  /** Symbols whose entry in a close-all answer fails. */
  failCloseAll: string[] = [];

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://x');
      this.calls.push(`${req.method} ${url.pathname}`);
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.headers['apca-api-key-id'] !== 'KEYKEYKEY') return json(401, { message: 'unauthorized' });
      if (this.failNext === url.pathname) {
        this.failNext = null;
        return json(500, { message: 'boom' });
      }
      if (url.pathname === '/v2/account') return json(200, { id: 'acct-1', account_number: 'PA123', status: 'ACTIVE', currency: 'USD', cash: '1000', equity: '1500', last_equity: '1500', buying_power: '4000', daytrade_count: 1, pattern_day_trader: false, trading_blocked: false, account_blocked: false });
      if (url.pathname === '/v2/clock') return json(200, { timestamp: new Date().toISOString(), is_open: true, next_open: '', next_close: '' });
      if (url.pathname === '/v2/positions' && req.method === 'GET') return json(200, this.positions);
      if (url.pathname === '/v2/positions' && req.method === 'DELETE') {
        // Like Alpaca: 207 Multi-Status, one entry per position, each with its own status.
        const out = this.positions.map((p) =>
          this.failCloseAll.includes(p.symbol)
            ? { symbol: p.symbol, status: 403, body: { code: 40310000, message: 'insufficient qty available for order' } }
            : { symbol: p.symbol, status: 200, body: { id: 'close-' + p.symbol, symbol: p.symbol, status: 'accepted' } },
        );
        this.positions = this.positions.filter((p) => this.failCloseAll.includes(p.symbol));
        this.openOrders = [];
        return json(207, out);
      }
      // Like Alpaca: bracket legs nest under their parent with nested=true; a cancel completes asynchronously
      // (listed once as pending_cancel); a close is refused while any order on the symbol holds the shares.
      const flat = (list: AlpacaOrder[]) => list.flatMap((o) => [o, ...(o.legs ?? [])]);
      const live = (o: AlpacaOrder) => o.status !== 'filled' && o.status !== 'canceled';
      if (url.pathname.startsWith('/v2/positions/') && req.method === 'DELETE') {
        const sym = url.pathname.split('/').pop()!;
        if (this.failClose > 0) {
          this.failClose--;
          return json(500, { message: 'boom' });
        }
        if (flat(this.openOrders).some((o) => o.symbol === sym && live(o))) return json(403, { code: 40310000, message: 'insufficient qty available for order' });
        if (!this.positions.some((p) => p.symbol === sym)) return json(404, { message: 'position does not exist' });
        this.positions = this.positions.filter((p) => p.symbol !== sym);
        return json(200, { id: 'close-' + sym, symbol: sym, side: 'sell', status: 'accepted' });
      }
      if (url.pathname === '/v2/orders' && req.method === 'GET') {
        const sym = url.searchParams.get('symbols');
        const pick = (o: AlpacaOrder) => !sym || o.symbol === sym;
        json(200, url.searchParams.get('nested') === 'true' ? this.openOrders.filter(pick) : flat(this.openOrders).filter((o) => live(o) && pick(o)));
        for (const o of flat(this.openOrders)) if (o.status === 'pending_cancel') o.status = 'canceled';
        this.openOrders = this.openOrders.filter((o) => live(o) || (o.legs ?? []).some(live));
        return;
      }
      if (url.pathname.startsWith('/v2/orders/') && req.method === 'DELETE') {
        const id = url.pathname.split('/').pop()!;
        const o = flat(this.openOrders).find((x) => x.id === id);
        if (!o || !live(o)) return json(422, { message: 'order is not cancelable' });
        o.status = 'pending_cancel';
        res.writeHead(204);
        return res.end();
      }
      if (url.pathname === '/v2/account/activities/FILL') {
        const after = url.searchParams.get('after');
        const token = url.searchParams.get('page_token');
        let list = this.fills.filter((f) => !after || f.transaction_time > after);
        if (token) list = list.slice(list.findIndex((f) => f.id === token) + 1);
        return json(200, list.slice(0, 100));
      }
      if (url.pathname.includes('/v2/stocks/')) return json(200, { bars: [], next_page_token: null });
      json(404, { message: `no ${req.method} ${url.pathname}` });
    });
    await new Promise<void>((r) => this.server.listen(0, '127.0.0.1', () => r()));
    this.port = (this.server.address() as { port: number }).port;
  }

  stop(): Promise<void> {
    return new Promise((r) => this.server.close(() => r()));
  }
}

// ---- a fake stream the test drives by hand ----
export class FakeStream {
  static current: FakeStream | null = null;
  status: StreamStatus = 'stopped';
  handlers: StreamHandlers;
  constructor(handlers: StreamHandlers) {
    this.handlers = handlers;
    FakeStream.current = this;
  }
  start(): void {
    this.status = 'live';
    this.handlers.onStatus('live');
    this.handlers.onLive();
  }
  stop(): void {
    this.status = 'stopped';
  }
  getStatus(): StreamStatus {
    return this.status;
  }
  push(u: AlpacaTradeUpdate): void {
    this.handlers.onUpdate(u);
  }
}

const creds: AlpacaCredentials = { keyId: 'KEYKEYKEY', secretKey: 'SECRETSECRET', mode: 'paper' };

export const CREDS: AlpacaCredentials = { keyId: 'KEYKEYKEY', secretKey: 'SECRETSECRET', mode: 'paper' };

export function order(clock: number, id: string, symbol: string, side: 'buy' | 'sell', type: string, status: string, extra: Partial<AlpacaOrder> = {}): AlpacaOrder {
  return { id, client_order_id: id, created_at: new Date(clock).toISOString(), updated_at: new Date(clock).toISOString(), submitted_at: null, filled_at: null, canceled_at: null, replaced_at: null, replaced_by: null, replaces: null, symbol, qty: '10', notional: null, filled_qty: '0', filled_avg_price: null, order_class: 'simple', order_type: type, type, side, time_in_force: 'day', limit_price: null, stop_price: null, status, legs: null, ...extra };
}

export function fillUpdate(clock: number, id: string, symbol: string, side: 'buy' | 'sell', qty: number, price: number): AlpacaTradeUpdate {
  return { event: 'fill', execution_id: 'x' + id, timestamp: new Date(clock).toISOString(), price: String(price), qty: String(qty), position_qty: String(side === 'buy' ? qty : -qty), order: order(clock, id, symbol, side, 'market', 'filled', { filled_qty: String(qty), filled_avg_price: String(price), filled_at: new Date(clock).toISOString() }) };
}

export function activity(id: string, symbol: string, side: 'buy' | 'sell', qty: number, price: number, time: number): AlpacaFillActivity {
  return { id: `${new Date(time).toISOString()}::${id}`, activity_type: 'FILL', transaction_time: new Date(time).toISOString(), type: 'fill', price: String(price), qty: String(qty), side, symbol, leaves_qty: '0', order_id: id, cum_qty: String(qty) };
}

export function position(symbol: string, qty: number, avg: number, mark = avg): AlpacaPosition {
  return { symbol, qty: String(Math.abs(qty)), side: qty >= 0 ? 'long' : 'short', avg_entry_price: String(avg), current_price: String(mark), market_value: String(Math.abs(qty) * mark), unrealized_pl: String((mark - avg) * qty), unrealized_plpc: '0', cost_basis: String(Math.abs(qty) * avg) };
}
