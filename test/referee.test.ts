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
import { CREDS as creds, FakeAlpaca, FakeStream, activity, fillUpdate as fillUpdateAt, order as orderAt, position } from './helpers/fake-alpaca.ts';

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
    clientFactory: (c) => new AlpacaClient(c, { tradingHost: `http://127.0.0.1:${fake.port}`, dataHost: `http://127.0.0.1:${fake.port}`, retries: 0, sleep: () => new Promise((r) => setTimeout(r, 1)) }),
    streamFactory: (_c, handlers) => new FakeStream(handlers) as unknown as TradeStream,
    dbFile: (mode) => join(dir, `test-${mode}.sqlite`),
    sleep: () => Promise.resolve(),
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

const tick = (r: Referee) => (r as unknown as { onTick(): Promise<void> }).onTick();
const settle = () => new Promise((r) => setTimeout(r, 60));

test('fix: saving settings keeps an open position\'s stop, so the next tick does not flatten it', async () => {
  clock = Date.parse('2026-10-14T14:00:00Z');
  const { referee } = await makeReferee();
  const stream = FakeStream.current!;
  fake.positions = [position('GGG', 10, 50)];
  stream.push(fillUpdate('g1', 'GGG', 'buy', 10, 50));
  clock += 5000;
  const stopOrder = order('gstop', 'GGG', 'sell', 'stop', 'new', { stop_price: '49' });
  fake.openOrders = [stopOrder];
  stream.push({ event: 'new', timestamp: new Date(clock).toISOString(), order: stopOrder });
  clock += 120000;
  fake.calls = [];
  await referee.updateSettings({ stopPct: 1.5 });
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'GGG')?.stop?.orderId, 'gstop', 'the rebuilt engine still knows the stop');
  await tick(referee);
  await settle();
  assert.ok(!fake.calls.some((c) => c.startsWith('DELETE') && /GGG|gstop/.test(c)), `GGG untouched: ${fake.calls.join(', ')}`);
  assert.ok(!referee.state().todayBreaches.some((b) => b.rule === 'stopRequired' && b.symbol === 'GGG'));
  fake.openOrders = [];
  fake.positions = [];
  await referee.stop();
});

test('fix: a backfilled fill older than a stream fill is replayed in time order, not booked as a phantom trade', async () => {
  clock = Date.parse('2026-10-15T14:00:00Z');
  const { referee } = await makeReferee({ dryRun: true });
  fake.fills.push(activity('h-in', 'HHH', 'buy', 10, 20, clock - 60000)); // the stream missed the entry
  FakeStream.current!.push(fillUpdate('h-out', 'HHH', 'sell', 10, 21)); // and delivered the exit
  await referee.reconcile('test');
  const hhh = referee.state().todayTrades.filter((t) => t.symbol === 'HHH');
  assert.equal(hhh.length, 1);
  assert.equal(hhh[0].direction, 'long');
  assert.equal(hhh[0].pnl, 10);
  assert.ok(!referee.state().snapshot.positions.some((p) => p.symbol === 'HHH'));
  await referee.stop();
});

test('fix: flatten cancels bracket legs, waits for the cancels, retries a failed close, and still enforces a new trade in the same symbol', async () => {
  clock = Date.parse('2026-10-16T14:00:00Z');
  const { referee } = await makeReferee();
  const stream = FakeStream.current!;
  // 300 x $50 = $15,000 breaks the $10,000 size rule (flatten). The entry carries a stop and a target leg.
  const legs = [order('kstop', 'KKK', 'sell', 'stop', 'held', { stop_price: '48' }), order('ktp', 'KKK', 'sell', 'limit', 'new', { limit_price: '55' })];
  const parent = { ...fillUpdate('kp', 'KKK', 'buy', 300, 50).order, order_class: 'bracket', legs };
  fake.openOrders = [parent];
  fake.positions = [position('KKK', 300, 50)];
  fake.failClose = 4; // every in-line attempt fails; the tick loop must take over
  fake.calls = [];
  stream.push({ ...fillUpdate('kp', 'KKK', 'buy', 300, 50), order: parent });
  await settle();
  assert.ok(fake.calls.includes('DELETE /v2/orders/kstop') && fake.calls.includes('DELETE /v2/orders/ktp'), `legs cancelled: ${fake.calls.join(', ')}`);
  assert.equal(fake.positions.length, 1, 'still open after four failed closes');
  assert.ok(referee.state().recentActions.some((a) => a.kind === 'error' && /Retrying in 5 s/.test(a.detail)));
  clock += 6000;
  await tick(referee);
  assert.equal(fake.positions.length, 0, 'the retry closed it');
  assert.ok(referee.state().recentActions.some((a) => a.kind === 'flatten' && a.symbol === 'KKK' && /retry/.test(a.detail)));

  // The exit fill arrives, then a new oversized KKK entry two seconds later: it must be closed too.
  clock += 1000;
  stream.push(fillUpdate('close-KKK', 'KKK', 'sell', 300, 49.9));
  clock += 2000;
  fake.positions = [position('KKK', 300, 50)];
  const before = fake.calls.filter((c) => c === 'DELETE /v2/positions/KKK').length;
  stream.push(fillUpdate('k2', 'KKK', 'buy', 300, 50));
  await settle();
  assert.equal(fake.calls.filter((c) => c === 'DELETE /v2/positions/KKK').length, before + 1, 'second trade flattened');
  assert.equal(fake.positions.length, 0);
  await referee.stop();
});

test('fix: close-all reads the 207: a refused symbol is logged, kept marked, and retried; the closed one is not', async () => {
  clock = Date.parse('2026-10-19T14:00:00Z');
  const { referee } = await makeReferee();
  const stream = FakeStream.current!;
  for (const sym of ['MMM', 'NNN']) {
    const leg = order(`${sym}-stop`, sym, 'sell', 'stop', 'held', { stop_price: '9' });
    const entry = fillUpdate(`${sym}-in`, sym, 'buy', 10, 10);
    stream.push({ ...entry, order: { ...entry.order, order_class: 'bracket', legs: [leg] } });
  }
  fake.positions = [position('MMM', 10, 10), position('NNN', 10, 10)];
  fake.refuseCloseAll = new Set(['NNN']);
  fake.calls = [];
  const out = await referee.manualFlatten(null);
  assert.match(out.detail, /Closed MMM/);
  assert.match(out.detail, /Could not close NNN/);
  const actions = referee.state().recentActions;
  assert.ok(actions.some((a) => a.kind === 'error' && a.symbol === 'NNN' && /insufficient qty/.test(a.detail) && /Retrying in 5 s/.test(a.detail)), 'one error per refused symbol');
  assert.equal(actions.find((a) => a.kind === 'flatten_all')?.ok, false, 'close-all is not reported as a full success');
  assert.deepEqual(fake.positions.map((p) => p.symbol), ['NNN']);

  // The retry closes NNN on its own once the refusal clears.
  fake.refuseCloseAll = new Set();
  clock += 6000;
  await tick(referee);
  assert.ok(fake.calls.includes('DELETE /v2/positions/NNN'), `NNN retried: ${fake.calls.join(', ')}`);
  assert.equal(fake.positions.length, 0);
  assert.ok(referee.state().recentActions.some((a) => a.kind === 'flatten' && a.symbol === 'NNN' && /retry/.test(a.detail)));
  await settle();
  await referee.stop();
});

test('fix: the HTTP API refuses a foreign Host, a localhost page on another port, and non-JSON writes', async () => {
  clock = Date.parse('2026-10-20T14:00:00Z');
  const { referee } = await makeReferee({ dryRun: true });
  const http = new RefereeHttp(referee, { port: 0, staticDir: null, log: new Logger(null, 'error') });
  const port = await http.listen();
  const { request } = await import('node:http');
  const call = (method: string, path: string, headers: Record<string, string>, body?: string) =>
    new Promise<number>((resolveStatus, reject) => {
      const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        res.resume();
        resolveStatus(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.end(body);
    });
  const json = { 'content-type': 'application/json' };

  // DNS rebinding: the page's own name arrives as Host.
  assert.equal(await call('GET', '/api/state', { host: `evil.example:${port}` }), 403);
  assert.equal(await call('POST', '/api/kill', { ...json, host: `evil.example:${port}`, origin: `http://evil.example:${port}` }, '{}'), 403);
  assert.equal(await call('GET', '/', { host: `evil.example:${port}` }), 403);
  // Another local page, on any other port.
  assert.equal(await call('POST', '/api/kill', { ...json, host: `127.0.0.1:${port}`, origin: 'http://localhost:9999' }, '{}'), 403);
  assert.equal(await call('POST', '/api/kill', { ...json, host: `127.0.0.1:${port}`, origin: `https://127.0.0.1:${port}` }, '{}'), 403);
  // A plain-text form post needs no preflight, so it is refused even without an Origin.
  assert.equal(await call('POST', '/api/kill', { host: `127.0.0.1:${port}`, 'content-type': 'text/plain' }, '{}'), 415);
  assert.equal(await call('DELETE', '/api/declare', { host: `127.0.0.1:${port}` }), 415);
  assert.equal(referee.state().status.enforcement.enabled, true, 'none of those reached the kill switch');

  // Our own page, by IP or name, and the Vite dev server proxy.
  assert.equal(await call('GET', '/api/state', { host: `localhost:${port}` }), 200);
  assert.equal(await call('POST', '/api/plan', { ...json, host: `localhost:${port}`, origin: `http://localhost:${port}` }, '{}'), 200);
  assert.equal(await call('DELETE', '/api/declare', { ...json, host: '127.0.0.1:5174', origin: 'http://127.0.0.1:5174' }), 200);
  assert.equal(await call('POST', '/api/kill', { 'content-type': 'application/json; charset=utf-8', host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}` }, '{}'), 200);
  assert.equal(referee.state().status.enforcement.enabled, false);

  await http.close();
  await referee.stop();
});

test('fix: today\'s backfilled fills are judged: an open trade is enforced, a closed one is reported, and the stream reconnects', async () => {
  clock = Date.parse('2026-10-21T14:00:00Z');
  const { referee } = await makeReferee();
  await settle(); // let the first-live sync finish
  // The stream missed all of this. PPP (300 x $50, over the $10,000 cap) is still open; QQQ (same size) already closed.
  fake.fills.push(activity('p-in', 'PPP', 'buy', 300, 50, clock - 10 * 60000), activity('q-in', 'QQQ', 'buy', 300, 50, clock - 9 * 60000), activity('q-out', 'QQQ', 'sell', 300, 50, clock - 8 * 60000));
  fake.positions = [position('PPP', 300, 50)];
  fake.calls = [];
  await referee.reconcile('periodic');
  await settle();
  const late = referee.state().todayBreaches.filter((b) => b.rule === 'maxPositionDollars');
  assert.deepEqual(late.map((b) => b.symbol).sort(), ['PPP', 'QQQ'], 'both stored, though older than 5 minutes');
  assert.ok(late.every((b) => b.message.startsWith('(seen late)')));
  assert.ok(fake.calls.includes('DELETE /v2/positions/PPP'), `open trade closed: ${fake.calls.join(', ')}`);
  assert.ok(!fake.calls.includes('DELETE /v2/positions/QQQ'), 'closed trade left alone');
  assert.deepEqual(FakeStream.current!.reconnects.length, 1, 'a live stream that missed fills is reconnected');
  await referee.stop();
});

test('fix: a position Alpaca and our fills disagree on triggers a sync, at most once a minute', async () => {
  clock = Date.parse('2026-10-22T14:00:00Z');
  const { referee } = await makeReferee({ dryRun: true });
  await settle(); // let the first-live sync finish
  fake.positions = [position('RRR', 10, 10)]; // no fill explains it
  const syncs = () => fake.calls.filter((c) => c === 'GET /v2/account/activities/FILL').length;
  fake.calls = [];
  clock += 31000;
  await tick(referee);
  await settle();
  assert.equal(syncs(), 1, 'drift synced');
  clock += 31000;
  await tick(referee);
  await settle();
  assert.equal(syncs(), 1, 'not again within a minute');
  clock += 31000;
  await tick(referee);
  await settle();
  assert.equal(syncs(), 2);
  fake.positions = [];
  await referee.stop();
});

test('fix: re-importing a CSV does not recount today\'s trades, and a restart keeps the imported count', async () => {
  clock = Date.parse('2026-10-23T14:00:00Z'); // Friday 10:00 ET
  const csv = 'Symbol,Side,Qty,Price,Time\nIMP,Buy,10,10,2026-10-23 09:35\nIMP,Sell,10,11,2026-10-23 09:40\nIMQ,Buy,10,10,2026-10-23 09:45\nIMQ,Sell,10,9,2026-10-23 09:50\n';
  let { referee } = await makeReferee({ dryRun: true });
  referee.importCsv({ fileName: 'today.csv', timeZone: 'America/New_York', text: csv });
  assert.equal(referee.state().snapshot.day.tradesOpened, 2);
  referee.importCsv({ fileName: 'today.csv', timeZone: 'America/New_York', text: csv });
  assert.equal(referee.state().snapshot.day.tradesOpened, 2, 're-import adds nothing');
  await referee.stop();
  ({ referee } = await makeReferee({ dryRun: true }));
  const day = referee.state().snapshot.day;
  assert.equal(day.tradesOpened, 2, 'survives a restart');
  assert.equal(day.realizedPnl, 0);
  await referee.stop();
});

test('fix: a database that refuses writes does not stop a flatten, and the kill switch works without config.json', async () => {
  clock = Date.parse('2026-10-26T14:00:00Z');
  const { referee, config } = await makeReferee();
  const store = (referee as unknown as { store: Record<string, unknown> }).store;
  for (const m of ['insertBreach', 'insertAction', 'setKv', 'setTradeMeta', 'insertFill', 'upsertOrder']) store[m] = () => { throw new Error('disk full'); };
  fake.positions = [position('SSS', 300, 50)];
  fake.calls = [];
  const entry = fillUpdate('s-in', 'SSS', 'buy', 300, 50);
  FakeStream.current!.push(entry);
  await settle();
  assert.ok(fake.calls.includes('DELETE /v2/positions/SSS'), `flattened without a database: ${fake.calls.join(', ')}`);
  FakeStream.current!.push(entry); // a redelivery is still a duplicate
  assert.equal(referee.state().snapshot.day.tradesOpened, 1);

  (config as unknown as { file: string }).file = join(dir, 'no-such-folder', 'config.json');
  const k = referee.kill();
  assert.equal(k.enabled, false);
  assert.equal(config.get().enforcement.enabled, false, 'off in memory though the file write failed');
  fake.calls = [];
  fake.positions = [position('SST', 300, 50)];
  FakeStream.current!.push(fillUpdate('t-in', 'SST', 'buy', 300, 50));
  await settle();
  assert.ok(!fake.calls.some((c) => c.startsWith('DELETE')), 'killed: nothing sent');
  fake.positions = [];
  await referee.stop();
});

test('fix: switching paper to live mid-sync never writes paper fills into the live database, and the live sync still runs', async () => {
  clock = Date.parse('2026-10-27T14:00:00Z');
  const fakeLive = new FakeAlpaca();
  await fakeLive.start();
  const d = mkdtempSync(join(tmpdir(), 'referee-switch-'));
  const config = new ConfigStore(d);
  config.update({ alpaca: creds, enforcement: { enabled: true, dryRun: true, killedAt: null } });
  const referee = new Referee({
    config,
    log: new Logger(null, 'error'),
    now,
    timers: false,
    clientFactory: (c) => {
      const port = (c.mode === 'live' ? fakeLive : fake).port;
      return new AlpacaClient(c, { tradingHost: `http://127.0.0.1:${port}`, dataHost: `http://127.0.0.1:${port}`, retries: 0 });
    },
    streamFactory: (_c, handlers) => new FakeStream(handlers) as unknown as TradeStream,
    dbFile: (mode) => join(d, `t-${mode}.sqlite`),
    sleep: () => Promise.resolve(),
  });
  await referee.start();
  fake.fills.push(activity('paper-only', 'TTT', 'buy', 10, 10, clock - 60000));
  let release!: () => void;
  fake.holdFills = new Promise<void>((r) => (release = r));
  const sync = referee.reconcile('test'); // paper sync, held at the fills request
  await settle();
  const switching = referee.updateSettings({ alpaca: { ...creds, mode: 'live' } });
  await settle();
  release();
  await sync;
  await switching;
  await settle();
  const st = referee.state();
  assert.equal(st.status.counts.fills, 0, 'live database has no paper fill');
  assert.ok(!st.snapshot.positions.some((p) => p.symbol === 'TTT'));
  assert.ok(fakeLive.calls.includes('GET /v2/account/activities/FILL'), 'the live sync ran after the dropped one');
  await referee.stop();
  await fakeLive.stop();
  rmSync(d, { recursive: true, force: true });
});

test('fix: Retry-After is honoured: reads wait it out (capped), a long one on a close goes to the tick-loop retry', async () => {
  const slept: number[] = [];
  const client = new AlpacaClient(creds, { tradingHost: `http://127.0.0.1:${fake.port}`, retries: 2, sleep: async (ms) => void slept.push(ms) });
  fake.rateLimitNext = { path: '/v2/account', retryAfter: '2' };
  await client.getAccount();
  fake.rateLimitNext = { path: '/v2/account', retryAfter: '120' };
  await client.getAccount();
  assert.deepEqual(slept, [2000, 30000]);

  clock = Date.parse('2026-10-28T14:00:00Z');
  const { referee } = await makeReferee();
  fake.positions = [position('UUU', 300, 50)];
  fake.rateLimitNext = { path: '/v2/positions/UUU', retryAfter: '30' };
  FakeStream.current!.push(fillUpdate('u-in', 'UUU', 'buy', 300, 50));
  await settle();
  assert.equal(fake.positions.length, 1, 'not hammered in-line');
  assert.ok(referee.state().recentActions.some((a) => a.kind === 'error' && a.symbol === 'UUU' && /Retrying in 30 s/.test(a.detail)));
  clock += 31000;
  await tick(referee);
  assert.equal(fake.positions.length, 0, 'closed once the limit reset');
  await settle();
  await referee.stop();
});
