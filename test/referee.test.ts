import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { AlpacaClient } from '../src/alpaca/client.ts';
import type { TradeStream } from '../src/alpaca/stream.ts';
import type { AlpacaOrder, AlpacaTradeUpdate } from '../src/alpaca/types.ts';
import { ConfigStore } from '../src/server/config.ts';
import { RefereeHttp } from '../src/server/http.ts';
import { Logger } from '../src/server/log.ts';
import { Referee } from '../src/server/referee.ts';
import type { ServerEvent, StateResponse } from '../src/server/api.ts';
import { CREDS as creds, FakeAlpaca, FakeStream, activity, fillUpdate as fillUpdateAt, order as orderAt } from './helpers/fake-alpaca.ts';

let fake: FakeAlpaca;
let dir: string;
let clock = Date.parse('2026-10-12T14:00:00Z'); // Monday 10:00 ET
const now = () => clock;

const order = (id: string, symbol: string, side: 'buy' | 'sell', type: string, status: string, extra: Partial<AlpacaOrder> = {}): AlpacaOrder => orderAt(clock, id, symbol, side, type, status, extra);
const fillUpdate = (id: string, symbol: string, side: 'buy' | 'sell', qty: number, price: number): AlpacaTradeUpdate => fillUpdateAt(clock, id, symbol, side, qty, price);

async function makeReferee(opts: { dryRun?: boolean; enabled?: boolean } = {}) {
  const config = new ConfigStore(dir);
  config.update({ alpaca: creds, enforcement: { enabled: opts.enabled ?? true, dryRun: opts.dryRun ?? false, killedAt: null }, rules: { ...config.get().rules, stopRequired: { enabled: true, withinSeconds: 30, action: 'flatten' }, maxTradesPerDay: { enabled: true, count: 2, action: 'flatten' } } });
  const log = new Logger(null, 'error');
  const referee = new Referee({
    config,
    log,
    now,
    timers: false,
    clientFactory: (c) => new AlpacaClient(c, { tradingHost: `http://127.0.0.1:${fake.port}`, dataHost: `http://127.0.0.1:${fake.port}`, retries: 0 }),
    streamFactory: (_c, handlers) => new FakeStream(handlers) as unknown as TradeStream,
    dbFile: (mode) => join(dir, `test-${mode}.sqlite`),
  });
  const events: ServerEvent[] = [];
  referee.onEvent((e) => events.push(e));
  await referee.start();
  return { referee, events, config };
}

before(async () => {
  fake = new FakeAlpaca();
  await fake.start();
  dir = mkdtempSync(join(tmpdir(), 'referee-'));
});
after(async () => {
  await fake.stop();
  rmSync(dir, { recursive: true, force: true });
});

test('startup backfills history from activities without enforcing, then a live breach is flattened', async () => {
  // Two closed trades last week in the account's history.
  const lastWeek = clock - 5 * 86400000;
  fake.fills = [activity('h1', 'AAA', 'buy', 10, 100, lastWeek), activity('h2', 'AAA', 'sell', 10, 101, lastWeek + 600000), activity('h3', 'BBB', 'buy', 5, 50, lastWeek + 1200000), activity('h4', 'BBB', 'sell', 5, 49, lastWeek + 1800000)];
  const { referee, events } = await makeReferee();
  let st = referee.state();
  assert.equal(st.status.counts.fills, 4);
  assert.equal(st.status.counts.trades, 2);
  assert.equal(st.snapshot.day.tradesOpened, 0, 'history is not today');
  assert.equal(st.todayBreaches.length, 0);
  assert.equal(st.status.account?.equity, 1500);

  // Live: trade 1 with a bracket stop leg: no breach.
  const stream = FakeStream.current!;
  fake.positions = [{ symbol: 'CCC', qty: '10', side: 'long', avg_entry_price: '20', current_price: '20', market_value: '200', unrealized_pl: '0', unrealized_plpc: '0', cost_basis: '200' }];
  const leg = order('stop1', 'CCC', 'sell', 'stop', 'held', { stop_price: '19.5' });
  stream.push({ ...fillUpdate('e1', 'CCC', 'buy', 10, 20), order: { ...fillUpdate('e1', 'CCC', 'buy', 10, 20).order, order_class: 'bracket', legs: [leg] } });
  st = referee.state();
  assert.equal(st.snapshot.positions.length, 1);
  assert.equal(st.snapshot.positions[0].stop?.orderId, 'stop1');
  assert.equal(st.todayBreaches.length, 0);
  clock += 60000;
  fake.positions = [];
  stream.push(fillUpdate('x1', 'CCC', 'sell', 10, 20.5));
  st = referee.state();
  assert.equal(st.snapshot.day.tradesClosed, 1);
  assert.equal(st.todayTrades[0].pnl, 5);

  // Trade 2 with no stop: after 30 s the referee closes it.
  clock += 60000;
  fake.positions = [{ symbol: 'DDD', qty: '10', side: 'long', avg_entry_price: '30', current_price: '30', market_value: '300', unrealized_pl: '0', unrealized_plpc: '0', cost_basis: '300' }];
  fake.openOrders = [];
  stream.push(fillUpdate('e2', 'DDD', 'buy', 10, 30));
  clock += 31000;
  await (referee as unknown as { onTick(): Promise<void> }).onTick();
  await new Promise((r) => setTimeout(r, 50));
  st = referee.state();
  assert.deepEqual(st.todayBreaches.map((b) => b.rule), ['stopRequired']);
  assert.ok(fake.calls.includes('DELETE /v2/positions/DDD'), `flatten sent: ${fake.calls.filter((c) => c.startsWith('DELETE')).join(',')}`);
  assert.ok(st.recentActions.some((a) => a.kind === 'flatten' && a.symbol === 'DDD' && a.ok));
  assert.ok(events.some((e) => e.type === 'breach'));
  assert.ok(events.some((e) => e.type === 'action' && e.action.kind === 'flatten'));

  // The exit fill from the referee's close arrives; the trade is tagged.
  clock += 2000;
  stream.push(fillUpdate('close-DDD', 'DDD', 'sell', 10, 29.9));
  st = referee.state();
  assert.equal(st.todayTrades.find((t) => t.symbol === 'DDD')?.refereeClosed, true);

  // Trade 3 breaks max trades (2): closed immediately, but only once per 10 s.
  clock += 60000;
  fake.positions = [{ symbol: 'EEE', qty: '1', side: 'long', avg_entry_price: '10', current_price: '10', market_value: '10', unrealized_pl: '0', unrealized_plpc: '0', cost_basis: '10' }];
  stream.push(fillUpdate('e3', 'EEE', 'buy', 1, 10));
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(fake.calls.filter((c) => c === 'DELETE /v2/positions/EEE').length, 1);
  assert.ok(referee.state().todayBreaches.some((b) => b.rule === 'maxTradesPerDay'));

  // A duplicate of a fill we already have (stream + backfill race) is ignored.
  const before = referee.state().status.counts.fills;
  stream.push(fillUpdate('e3', 'EEE', 'buy', 1, 10));
  assert.equal(referee.state().status.counts.fills, before);
  await referee.stop();
});

test('restart rebuilds today from stored fills, and backfill catches a fill missed while offline', async () => {
  // While "offline", the EEE position was closed and a new fill happened.
  clock += 120000;
  fake.fills.push(activity('off1', 'EEE', 'sell', 1, 10.2, clock - 60000));
  fake.positions = [];
  const { referee } = await makeReferee();
  const st = referee.state();
  assert.equal(st.snapshot.day.tradesOpened, 3, 'the three trades today survive a restart');
  assert.equal(st.snapshot.positions.length, 0, 'the offline exit was backfilled');
  assert.equal(st.todayTrades.length, 3);
  assert.equal(st.snapshot.nextTrade.allowed, false);
  assert.ok(st.snapshot.nextTrade.blockers.some((b) => b.rule === 'maxTradesPerDay'));
  // Breaches were persisted once, not re-created by the replay: no stop, trade 3 of 2, and re-entry 1 min after DDD's loss.
  assert.deepEqual(st.todayBreaches.map((b) => b.rule).sort(), ['maxTradesPerDay', 'noReentryAfterLoss', 'stopRequired']);
  assert.ok(st.snapshot.lock, 'three breaches lock the day');
  await referee.stop();
});

test('dry run logs instead of sending, kill switch turns enforcement off, and the HTTP API round-trips', async () => {
  clock = Date.parse('2026-10-13T14:00:00Z'); // next day
  const { referee } = await makeReferee({ dryRun: true });
  const http = new RefereeHttp(referee, { port: 0, staticDir: null, log: new Logger(null, 'error') });
  const port = await http.listen();
  const base = `http://127.0.0.1:${port}`;
  const get = async (p: string) => (await fetch(base + p)).json();
  const send = async (method: string, p: string, body?: unknown) => {
    const res = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };

  const state = (await get('/api/state')) as StateResponse;
  assert.equal(state.snapshot.day.tradesOpened, 0);
  assert.equal(state.status.enforcement.dryRun, true);

  // Declare, then an entry that breaks the size rule: dry run, nothing sent.
  const decl = await send('POST', '/api/declare', { symbol: 'fff', side: 'long', qty: 100 });
  assert.equal(decl.status, 200);
  assert.equal(decl.body.symbol, 'FFF');
  fake.calls = [];
  fake.positions = [{ symbol: 'FFF', qty: '2000', side: 'long', avg_entry_price: '10', current_price: '10', market_value: '20000', unrealized_pl: '0', unrealized_plpc: '0', cost_basis: '20000' }];
  FakeStream.current!.push(fillUpdate('big', 'FFF', 'buy', 2000, 10));
  await new Promise((r) => setTimeout(r, 50));
  const st2 = (await get('/api/state')) as StateResponse;
  assert.deepEqual(st2.todayBreaches.map((b) => b.rule).sort(), ['maxPositionDollars', 'sizeMatchesDeclaration']);
  assert.equal(st2.todayTrades.length, 0);
  assert.equal(st2.snapshot.positions[0].declared, true);
  assert.ok(st2.recentActions.some((a) => a.kind === 'dry_run'));
  assert.ok(!fake.calls.some((c) => c.startsWith('DELETE')), 'dry run sends nothing');

  // Rules validation.
  const bad = await send('PUT', '/api/rules', { ...st2.rules, maxTradesPerDay: { enabled: true, count: 0, action: 'flatten' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /maxTradesPerDay/);
  const good = await send('PUT', '/api/rules', { ...st2.rules, maxTradesPerDay: { enabled: true, count: 5, action: 'warn' } });
  assert.equal(good.status, 200);
  assert.equal(good.body.maxTradesPerDay.count, 5);

  // Kill switch.
  const killed = await send('POST', '/api/kill');
  assert.equal(killed.body.enabled, false);
  assert.ok(killed.body.killedAt);
  const back = await send('POST', '/api/enforcement', { enabled: true, dryRun: false });
  assert.equal(back.body.enabled, true);
  assert.equal(back.body.killedAt, null);

  // Plan, settings view (no secrets), strategy, import, cross-origin refusal.
  const plan = await send('POST', '/api/plan', { note: 'calm' });
  assert.equal(plan.body.note, 'calm');
  const settings = await get('/api/settings');
  assert.equal(settings.alpaca.configured, true);
  assert.ok(!JSON.stringify(settings).includes('SECRETSECRET'));
  const strat = await send('PUT', '/api/strategy', { ...(await get('/api/strategy')), emaFast: 30, emaSlow: 20 });
  assert.equal(strat.status, 400);
  const imp = await send('POST', '/api/import', { fileName: 'fills.csv', timeZone: 'America/New_York', text: 'Symbol,Side,Qty,Price,Time\nZZZ,Buy,10,10,2026-09-01 09:35\nZZZ,Sell,10,11,2026-09-01 09:45\n' });
  assert.equal(imp.status, 200);
  assert.equal(imp.body.imported, 1);
  assert.equal(((await get('/api/report')) as { trades: number }).trades >= 1, true);
  const xo = await fetch(base + '/api/state', { headers: { origin: 'https://evil.example' } });
  assert.equal(xo.status, 403);
  const missing = await send('POST', '/api/nope');
  assert.equal(missing.status, 404);

  // SSE delivers a snapshot first.
  const ctrl = new AbortController();
  const sse = await fetch(base + '/api/events', { signal: ctrl.signal });
  const reader = sse.body!.getReader();
  const chunk = new TextDecoder().decode((await reader.read()).value);
  assert.match(chunk, /^event: snapshot\ndata: \{"type":"snapshot"/);
  ctrl.abort();

  await http.close();
  await referee.stop();
});

test('a wrong Alpaca key is reported by the connection test, not thrown', async () => {
  const { referee } = await makeReferee();
  const bad = await referee.testConnection({ keyId: 'WRONGWRONG', secretKey: 'SECRETSECRET', mode: 'paper' });
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /401/);
  const good = await referee.testConnection();
  assert.equal(good.ok, true);
  await referee.stop();
});
