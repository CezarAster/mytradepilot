// Review findings 6 to 11 and the review of their fixes: backfilled fills, drift, imports, failing writes, account
// switches, the close retry queue, rate limits.
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { AlpacaClient } from '../src/alpaca/client.ts';
import type { TradeStream } from '../src/alpaca/stream.ts';
import { DEFAULT_RULES, type RuleSet } from '../src/engine/types.ts';
import type { ServerEvent } from '../src/server/api.ts';
import { ConfigStore } from '../src/server/config.ts';
import { Logger } from '../src/server/log.ts';
import { Referee } from '../src/server/referee.ts';
import { CREDS, FakeAlpaca, FakeStream, activity, fillUpdate, order, position } from './helpers/fake-alpaca.ts';

const MIN = 60000;
let fake: FakeAlpaca;
let root: string;
let clock = 0;
const now = () => clock;

before(async () => {
  fake = new FakeAlpaca();
  await fake.start();
  root = mkdtempSync(join(tmpdir(), 'referee-sync-'));
});
after(async () => {
  await fake.stop();
  rmSync(root, { recursive: true, force: true });
});

/** A fresh account and data folder for each test. */
function reset(at: string): string {
  clock = Date.parse(at);
  Object.assign(fake, { fills: [], positions: [], openOrders: [], calls: [], hooks: [], failCloseAll: [], failClose: 0, rateLimit: null, holdFills: null });
  return mkdtempSync(join(root, 'home-'));
}

const NO_STOP_RULE: Partial<RuleSet> = { stopRequired: { enabled: false, withinSeconds: 60, action: 'flatten' } };

async function makeReferee(home: string, opts: { dryRun?: boolean; rules?: Partial<RuleSet>; sleeps?: number[] } = {}) {
  const config = new ConfigStore(home);
  config.update({
    alpaca: CREDS,
    webhookUrl: `http://127.0.0.1:${fake.port}/hook`,
    notifications: { desktop: false, sound: false },
    enforcement: { enabled: true, dryRun: opts.dryRun ?? false, killedAt: null },
    rules: { ...structuredClone(DEFAULT_RULES), ...opts.rules },
  });
  const referee = new Referee({
    config,
    log: new Logger(null, 'error'),
    now,
    timers: false,
    clientFactory: (c) => new AlpacaClient(c, { tradingHost: `http://127.0.0.1:${fake.port}`, dataHost: `http://127.0.0.1:${fake.port}`, retries: 0, sleep: () => new Promise((r) => setTimeout(r, 1)) }),
    streamFactory: (_c, handlers) => new FakeStream(handlers) as unknown as TradeStream,
    dbFile: (mode) => join(home, `test-${mode}.sqlite`),
    sleep: (ms) => {
      opts.sleeps?.push(ms);
      return Promise.resolve();
    },
  });
  const events: ServerEvent[] = [];
  referee.onEvent((e) => events.push(e));
  await referee.start();
  // The stream's first-live sync is in flight; a sync asked for now joins it, so this waits for both.
  await referee.reconcile('test ready');
  return { referee, config, events };
}

const tick = (r: Referee) => (r as unknown as { onTick(): Promise<void> }).onTick();
/** Poll for an outcome instead of guessing how long it takes (CI machines are slow). */
async function waitFor(what: string, ok: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}
/** Only before asserting that something did NOT happen: a slow machine can make it pass, never fail. */
const idle = () => new Promise((r) => setTimeout(r, 80));
const count = (call: string) => fake.calls.filter((c) => c === call).length;
const FILLS = 'GET /v2/account/activities/FILL';
const breach = (r: Referee, rule: string, symbol: string) => r.state().todayBreaches.find((b) => b.rule === rule && b.symbol === symbol);

// ---------------------------------------------------------------- 6 and 7: fills only the backfill found

test('fix 6/7: a fill only the backfill found is stored, notified and enforced while its trade is still open', async () => {
  const home = reset('2026-10-12T15:00:00Z'); // Monday 11:00 ET
  const { referee } = await makeReferee(home);
  // The stream never delivered this entry, ten minutes ago: 300 x $50 breaks the $10,000 size rule.
  fake.fills.push(activity('miss1', 'LLA', 'buy', 300, 50, clock - 10 * MIN));
  fake.positions = [position('LLA', 300, 50)];
  await referee.reconcile('test');
  await waitFor('the close', () => fake.calls.includes('DELETE /v2/positions/LLA'));
  const b = breach(referee, 'maxPositionDollars', 'LLA');
  assert.ok(b, 'stored');
  assert.match(b.message, /^\(seen late\)/);
  await waitFor('the notification', () => fake.hooks.some((h) => /maxPositionDollars LLA/.test(h.title)));
  await referee.stop();
});

test('fix 6/7: a backfilled breach whose trade already closed is stored but not enforced, and a newer trade in the symbol is left alone', async () => {
  const home = reset('2026-10-12T15:00:00Z');
  const { referee } = await makeReferee(home);
  // One batch: an oversized trade that opened and closed, then a small new trade in the same symbol, still open.
  fake.fills.push(activity('mb1', 'LLB', 'buy', 300, 50, clock - 20 * MIN), activity('mb2', 'LLB', 'sell', 300, 50.5, clock - 15 * MIN), activity('mb3', 'LLB', 'buy', 10, 50, clock - 5 * MIN));
  fake.positions = [position('LLB', 10, 50)];
  fake.calls = [];
  await referee.reconcile('test');
  await idle();
  assert.ok(breach(referee, 'maxPositionDollars', 'LLB'), 'stored');
  assert.ok(!fake.calls.some((c) => c.startsWith('DELETE')), `nothing cancelled or closed: ${fake.calls.join(', ')}`);
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'LLB')?.qty, 10);
  await referee.stop();
});

/** Two missing-stop breaches (time-based: a replay of fills cannot re-derive them), which lock a day capped at 2. */
async function lockTheDay(referee: Referee): Promise<void> {
  const stream = FakeStream.current!;
  for (const sym of ['SSA', 'SSB']) {
    fake.positions = [position(sym, 10, 20)];
    stream.push(fillUpdate(clock, `${sym}-in`, sym, 'buy', 10, 20));
    clock += 61000;
    await tick(referee);
    clock += 1000;
    fake.positions = [];
    stream.push(fillUpdate(clock, `close-${sym}`, sym, 'sell', 10, 21)); // a win, so no re-entry rule fires
    clock += MIN;
  }
  await waitFor('the lock', () => referee.state().snapshot.lock !== null);
}

test('fix 7: a fill backfilled out of order is replayed in order, its breach stored, and the saved lock kept', async () => {
  const home = reset('2026-10-13T15:00:00Z'); // Tuesday 11:00 ET
  const { referee } = await makeReferee(home, { dryRun: true, rules: { maxBreachesPerDay: { enabled: true, count: 2 } } });
  const t0 = clock;
  await lockTheDay(referee);
  // The stream missed an oversized round trip between them (closed at a profit); the backfill finds it.
  fake.fills.push(activity('rr1', 'RRR', 'buy', 300, 50, t0 + 30000), activity('rr2', 'RRR', 'sell', 300, 50.5, t0 + 40000));
  await referee.reconcile('test');
  const st = referee.state();
  assert.match(breach(referee, 'maxPositionDollars', 'RRR')?.message ?? '', /^\(seen late\)/);
  assert.ok(st.snapshot.lock, 'lock kept');
  assert.equal(st.snapshot.day.breaches, 3, 'two saved plus the late one');
  assert.equal(st.recentActions.filter((a) => a.kind === 'lock').length, 1, 'no second lock announcement');
  await referee.stop();
});

test('fix 7 (review): a missed fill that pushes a breach onto a fill already applied gets that breach stored and enforced', async () => {
  const home = reset('2026-10-13T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: { ...NO_STOP_RULE, maxTradesPerDay: { enabled: true, count: 2, action: 'flatten' } } });
  const stream = FakeStream.current!;
  const t0 = clock;
  stream.push(fillUpdate(t0, 'xa1', 'XXA', 'buy', 10, 20));
  stream.push(fillUpdate(t0 + MIN, 'xa2', 'XXA', 'sell', 10, 21));
  // YYA's round trip at +2 min never arrived. ZZA at +3 min arrives as trade 2 of 2: no breach yet.
  fake.positions = [position('ZZA', 10, 20)];
  stream.push(fillUpdate(t0 + 3 * MIN, 'za1', 'ZZA', 'buy', 10, 20));
  assert.equal(referee.state().todayBreaches.length, 0);
  clock = t0 + 4 * MIN;
  fake.fills.push(activity('ya1', 'YYA', 'buy', 10, 20, t0 + 2 * MIN), activity('ya2', 'YYA', 'sell', 10, 21, t0 + 2 * MIN + 30000));
  await referee.reconcile('test');
  // In order, ZZA is trade 3 of 2.
  assert.match(breach(referee, 'maxTradesPerDay', 'ZZA')?.message ?? '', /^\(seen late\).*trade 3/);
  await waitFor('ZZA closed', () => fake.calls.includes('DELETE /v2/positions/ZZA'));
  await referee.stop();
});

test('fix 7 (review): an entry backfilled out of order while the day was locked is judged against the saved lock', async () => {
  const home = reset('2026-10-13T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: { maxBreachesPerDay: { enabled: true, count: 2 }, maxTradesPerDay: { enabled: true, count: 20, action: 'flatten' } } });
  await lockTheDay(referee);
  const stream = FakeStream.current!;
  const tLock = clock;
  // LKA (missed) and LKB (delivered) are entered while locked. LKB is closed at once; LKA is found later.
  fake.positions = [position('LKA', 10, 20), position('LKB', 10, 20)];
  fake.openOrders = [];
  stream.push(fillUpdate(tLock + MIN, 'lkb', 'LKB', 'buy', 10, 20));
  await waitFor('LKB closed', () => fake.calls.includes('DELETE /v2/positions/LKB'));
  clock = tLock + 2 * MIN;
  fake.fills.push(activity('lka', 'LKA', 'buy', 10, 20, tLock + 30000));
  await referee.reconcile('test');
  assert.match(breach(referee, 'locked', 'LKA')?.message ?? '', /^\(seen late\)/);
  await waitFor('LKA closed', () => fake.calls.includes('DELETE /v2/positions/LKA'));
  await referee.stop();
});

test("fix 8 (review): an entry backfilled out of order counts today's imported trades", async () => {
  const home = reset('2026-10-14T15:00:00Z'); // Wednesday 11:00 ET
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE }); // max 3 trades a day
  referee.importCsv({ fileName: 'other-broker.csv', timeZone: 'America/New_York', text: 'Symbol,Side,Qty,Price,Time\nIA,Buy,1,10,2026-10-14 09:35\nIA,Sell,1,11,2026-10-14 09:40\nIB,Buy,1,10,2026-10-14 09:45\nIB,Sell,1,11,2026-10-14 09:50\nIC,Buy,1,10,2026-10-14 09:55\nIC,Sell,1,11,2026-10-14 10:00\n' });
  const t0 = clock;
  fake.positions = [position('CCC', 10, 20), position('DDD', 10, 20)];
  FakeStream.current!.push(fillUpdate(t0 + 6 * MIN, 'ddd', 'DDD', 'buy', 10, 20)); // trade 4: breached live
  await waitFor('DDD closed', () => fake.calls.includes('DELETE /v2/positions/DDD'));
  clock = t0 + 7 * MIN;
  fake.fills.push(activity('ccc', 'CCC', 'buy', 10, 20, t0 + 5 * MIN)); // missed, before DDD
  await referee.reconcile('test');
  assert.match(breach(referee, 'maxTradesPerDay', 'CCC')?.message ?? '', /^\(seen late\).*trade 4/);
  await waitFor('CCC closed', () => fake.calls.includes('DELETE /v2/positions/CCC'));
  assert.equal(referee.state().todayBreaches.filter((b) => b.symbol === 'DDD').length, 1, 'DDD not stored twice');
  await referee.stop();
});

// ---------------------------------------------------------------- 6: drift and coalesced syncs

test('fix 6: a position Alpaca and our fills disagree on triggers a sync, at most once a minute', async () => {
  const home = reset('2026-10-12T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  // The stream dropped this fill and nothing else is coming to trigger a sync.
  fake.fills.push(activity('d1', 'DRF', 'buy', 10, 20, clock - MIN));
  fake.positions = [position('DRF', 10, 20)];
  const before = count(FILLS);
  clock += 31000;
  await tick(referee);
  await waitFor('the missed fill', () => referee.state().snapshot.positions.some((p) => p.symbol === 'DRF'));
  assert.equal(count(FILLS), before + 1, 'one drift sync');
  // A position no fill will ever explain: one sync a minute, not one per tick.
  fake.positions = [position('DRF', 10, 20), position('DRG', 5, 10)];
  clock += 6000;
  await tick(referee);
  await idle();
  assert.equal(count(FILLS), before + 1, 'rate limited');
  // Alpaca shows DRF flat (its exit was missed too): a minute later, the sync finds the exit.
  fake.fills.push(activity('d2', 'DRF', 'sell', 10, 21, clock));
  fake.positions = [position('DRG', 5, 10)];
  clock += 60000;
  await tick(referee);
  await waitFor('the missed exit', () => !referee.state().snapshot.positions.some((p) => p.symbol === 'DRF'));
  assert.equal(count(FILLS), before + 2);
  await referee.stop();
});

test('fix 10: a sync asked for while one runs is not dropped: it runs after it, and the promise covers it', async () => {
  const home = reset('2026-10-12T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  let release!: () => void;
  fake.holdFills = new Promise((r) => (release = r));
  const before = count(FILLS);
  const first = referee.reconcile('first');
  await waitFor('the first fills request', () => count(FILLS) > before);
  // A fill the running sync asked too early to see.
  fake.fills.push(activity('co1', 'COA', 'buy', 10, 20, clock));
  fake.positions = [position('COA', 10, 20)];
  const second = referee.reconcile('second');
  fake.holdFills = null;
  release();
  await second;
  await first;
  assert.ok(referee.state().snapshot.positions.some((p) => p.symbol === 'COA'), 'the second sync ran');
  await referee.stop();
});

// ---------------------------------------------------------------- 8: imports

test('fix 8: re-importing a CSV does not recount today, and a restart keeps the imported count and the live trade numbers', async () => {
  const home = reset('2026-10-14T15:00:00Z');
  // Yesterday's trade on the account: replaying it rolled the day and dropped today's imported count.
  fake.fills.push(activity('y1', 'YYY', 'buy', 10, 10, clock - 86400000), activity('y2', 'YYY', 'sell', 10, 11, clock - 86400000 + MIN));
  const csv = 'Symbol,Side,Qty,Price,Time\nIMA,Buy,10,10,2026-10-14 09:35\nIMA,Sell,10,11,2026-10-14 09:45\nIMB,Buy,10,10,2026-10-14 10:00\nIMB,Sell,10,9,2026-10-14 10:10\n';
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  referee.importCsv({ fileName: 'today.csv', text: csv, timeZone: 'America/New_York' });
  assert.equal(referee.state().snapshot.day.tradesOpened, 2);
  const again = referee.importCsv({ fileName: 'today.csv', text: csv, timeZone: 'America/New_York' });
  assert.equal(again.duplicates, 2);
  assert.equal(referee.state().snapshot.day.tradesOpened, 2, 'not counted twice');
  const stream = FakeStream.current!;
  stream.push(fillUpdate(clock, 'liv1', 'LIV', 'buy', 10, 20));
  stream.push(fillUpdate(clock + 1000, 'liv2', 'LIV', 'sell', 10, 21));
  assert.equal(referee.state().todayTrades.find((t) => t.symbol === 'LIV')?.tradeOfDay, 3);
  assert.equal(referee.state().snapshot.nextTrade.number, 4);
  await referee.stop();

  const { referee: restarted } = await makeReferee(home, { rules: NO_STOP_RULE });
  const st = restarted.state();
  assert.equal(st.snapshot.day.tradesOpened, 3, 'two imported plus one live survive a restart');
  assert.equal(st.snapshot.nextTrade.number, 4);
  assert.equal(st.todayTrades.find((t) => t.symbol === 'LIV')?.tradeOfDay, 3, 'the number recorded live is kept');
  await restarted.stop();
});

// ---------------------------------------------------------------- 9: failing writes

test('fix 9: a failing database does not stop a flatten or block the service, and a failing config write does not stop the kill switch', async () => {
  const home = reset('2026-10-15T15:00:00Z');
  const { referee, config, events } = await makeReferee(home, { rules: NO_STOP_RULE });
  const store = (referee as unknown as { store: Record<string, unknown> }).store;
  let attempts = 0;
  const fail = () => {
    attempts++;
    throw new Error('SQLITE_FULL: database or disk is full');
  };
  const methods = ['insertBreach', 'insertAction', 'insertFill', 'setKv', 'upsertOrder', 'setTradeMeta', 'consumeDeclaration'];
  for (const m of methods) store[m] = fail;
  fake.positions = [position('DSK', 300, 50)];
  FakeStream.current!.push(fillUpdate(clock, 'dsk', 'DSK', 'buy', 300, 50));
  await waitFor('the close', () => events.some((e) => e.type === 'action' && e.action.kind === 'flatten' && e.action.symbol === 'DSK' && e.action.id < 0));
  assert.ok(fake.calls.includes('DELETE /v2/positions/DSK'));
  assert.equal(attempts, 1, 'after one failed write the rest are skipped for a while, not each made to fail');
  assert.ok(events.some((e) => e.type === 'breach' && e.breach.symbol === 'DSK' && e.breach.id < 0), 'the UI still hears of the breach');
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'DSK')?.qty, 300, 'the unsaved fill was applied');

  // A sync while the disk still fails: the backfill sees the same fill and must not apply it again.
  fake.positions = [position('DSK', 300, 50)];
  fake.fills.push(activity('dsk', 'DSK', 'buy', 300, 50, clock));
  clock += 11000;
  await referee.reconcile('still failing');
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'DSK')?.qty, 300, 'not applied twice');
  assert.equal(referee.state().status.counts.fills, 0);

  // The disk recovers: the next sync writes the fill once.
  for (const m of methods) delete store[m];
  clock += 11000;
  await referee.reconcile('recovered');
  assert.equal(referee.state().status.counts.fills, 1, 'stored');
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'DSK')?.qty, 300);

  // Config folder read-only: the kill switch still turns enforcement off, and says the setting was not saved.
  (config as unknown as { write: () => void }).write = fail;
  const killed = referee.kill();
  assert.equal(killed.enabled, false);
  assert.equal(config.get().enforcement.enabled, false, 'off in memory');
  assert.ok(referee.state().recentActions.some((a) => a.kind === 'error' && /saving config.json failed/.test(a.detail)));
  fake.calls = [];
  fake.positions = [position('DSK', 300, 50), position('DSL', 300, 50)];
  FakeStream.current!.push(fillUpdate(clock, 'dsl', 'DSL', 'buy', 300, 50));
  await idle();
  assert.ok(!fake.calls.some((c) => c.startsWith('DELETE')), 'killed means nothing is sent');
  await referee.stop();
});

// ---------------------------------------------------------------- 10: switching accounts

test('fix 10: switching paper to live during a sync does not write paper fills into the live database, and the live sync still runs', async () => {
  const home = reset('2026-10-16T15:00:00Z');
  const { referee } = await makeReferee(home);
  let release!: () => void;
  fake.holdFills = new Promise((r) => (release = r));
  fake.fills = [activity('pp1', 'PPR', 'buy', 10, 20, clock - MIN)]; // on the paper account
  const before = count(FILLS);
  const sync = referee.reconcile('test');
  await waitFor('the held fills request', () => count(FILLS) > before);
  const switching = referee.updateSettings({ alpaca: { ...CREDS, mode: 'live' } });
  fake.fills = []; // the live account has none
  fake.holdFills = null;
  release();
  await switching;
  await sync;
  assert.equal(referee.state().status.mode, 'live');
  assert.equal(referee.state().status.counts.fills, 0, 'no paper fill in the live database');
  assert.equal(count(FILLS), before + 2, 'the superseded sync ran again against the live account');
  assert.equal(referee.state().snapshot.positions.length, 0);
  await referee.stop();
});

test('fix 10 (review): a paper fill the database refused is not carried into the live account', async () => {
  const home = reset('2026-10-16T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  (referee as unknown as { store: Record<string, unknown> }).store.insertFill = () => {
    throw new Error('SQLITE_BUSY: database is locked');
  };
  FakeStream.current!.push(fillUpdate(clock, 'pap', 'PAP', 'buy', 10, 20));
  assert.equal(referee.state().snapshot.positions.length, 1, 'refereed from memory on paper');
  clock += 11000;
  await referee.updateSettings({ alpaca: { ...CREDS, mode: 'live' } });
  assert.equal(referee.state().status.counts.fills, 0, 'not in the live database');
  assert.equal(referee.state().snapshot.positions.length, 0, 'not in the live engine');
  await referee.stop();
});

test('fix 10 (review): a close queued on paper never runs against the live account', async () => {
  const home = reset('2026-10-16T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  fake.rateLimit = { method: 'DELETE', path: '/v2/positions/PXA', seconds: 90, times: 1 };
  fake.positions = [position('PXA', 300, 50)];
  FakeStream.current!.push(fillUpdate(clock, 'pxa', 'PXA', 'buy', 300, 50)); // breaks the size rule on paper
  await waitFor('the queued retry', () => referee.state().recentActions.some((a) => a.kind === 'error' && /Retrying in 90 s/.test(a.detail)));
  // Live holds a small, compliant PXA position.
  fake.fills = [activity('lpx', 'PXA', 'buy', 10, 50, clock)];
  fake.positions = [position('PXA', 10, 50)];
  await referee.updateSettings({ alpaca: { ...CREDS, mode: 'live' } });
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'PXA')?.qty, 10);
  const closes = count('DELETE /v2/positions/PXA');
  clock += 91000;
  await tick(referee);
  await idle();
  assert.equal(count('DELETE /v2/positions/PXA'), closes, 'live PXA untouched');
  assert.ok(fake.positions.some((p) => p.symbol === 'PXA'));
  await referee.stop();
});

test('fix 10 (review): two quick account changes leave exactly one stream running, and stop() stops it', async () => {
  const home = reset('2026-10-16T15:00:00Z');
  const { referee } = await makeReferee(home);
  FakeStream.all = [];
  const a = referee.updateSettings({ alpaca: { ...CREDS, secretKey: 'SECRETSECRET2' } });
  const b = referee.updateSettings({ alpaca: { ...CREDS, mode: 'live' } });
  await Promise.all([a, b]);
  assert.equal(FakeStream.all.filter((s) => s.status !== 'stopped').length, 1, FakeStream.all.map((s) => s.status).join(','));
  await referee.stop();
  assert.ok(FakeStream.all.every((s) => s.status === 'stopped'));
});

// ---------------------------------------------------------------- the close retry queue

test('review: a queued close never closes a newer trade in the same symbol', async () => {
  const home = reset('2026-10-19T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  const stream = FakeStream.current!;
  fake.rateLimit = { method: 'DELETE', path: '/v2/positions/RQA', seconds: 90, times: 1 };
  fake.positions = [position('RQA', 300, 50)];
  stream.push(fillUpdate(clock, 'rqa1', 'RQA', 'buy', 300, 50)); // T1 breaks the size rule; its close is refused
  await waitFor('the queued retry', () => referee.state().recentActions.some((a) => a.kind === 'error' && /Retrying in 90 s/.test(a.detail)));
  // The trader closes T1 and opens a small T2 with a stop.
  stream.push(fillUpdate(clock + 1000, 'rqa1x', 'RQA', 'sell', 300, 50.5)); // a win, so T2 breaks no re-entry rule
  const stop = order(clock, 'rqa-stop', 'RQA', 'sell', 'stop', 'new', { stop_price: '49' });
  fake.openOrders = [stop];
  fake.positions = [position('RQA', 10, 50)];
  stream.push(fillUpdate(clock + 2000, 'rqa2', 'RQA', 'buy', 10, 50));
  stream.push({ event: 'new', timestamp: new Date(clock + 3000).toISOString(), order: stop });
  clock += 91000;
  await tick(referee);
  await idle();
  assert.equal(count('DELETE /v2/positions/RQA'), 1, 'only the first, refused attempt');
  assert.ok(!fake.calls.includes('DELETE /v2/orders/rqa-stop'), "T2's stop kept");
  await referee.stop();
});

test('review: the kill switch also stops closes already queued', async () => {
  const home = reset('2026-10-19T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  fake.rateLimit = { method: 'DELETE', path: '/v2/positions/KQA', seconds: 90, times: 1 };
  fake.positions = [position('KQA', 300, 50)];
  FakeStream.current!.push(fillUpdate(clock, 'kqa', 'KQA', 'buy', 300, 50));
  await waitFor('the queued retry', () => referee.state().recentActions.some((a) => a.kind === 'error' && /Retrying in 90 s/.test(a.detail)));
  referee.kill();
  clock += 91000;
  await tick(referee);
  await idle();
  assert.equal(count('DELETE /v2/positions/KQA'), 1, 'nothing sent after the kill switch');
  await referee.stop();
});

test('review: a close-all refused as a whole is retried symbol by symbol, after Retry-After', async () => {
  const home = reset('2026-10-19T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE }); // daily loss limit $500, flatten
  fake.positions = [position('DLA', 100, 50)];
  FakeStream.current!.push(fillUpdate(clock, 'dla', 'DLA', 'buy', 100, 50));
  fake.rateLimit = { method: 'DELETE', path: '/v2/positions', seconds: 20, times: 1 };
  fake.positions = [position('DLA', 100, 50, 44)]; // -$600
  clock += 6000;
  await tick(referee);
  await waitFor('the refused close-all', () => referee.state().recentActions.some((a) => a.kind === 'error' && /Retrying DLA one by one in 20 s/.test(a.detail)));
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'DLA')?.refereeClosed, false, 'not left marked as being closed');
  clock += 10000;
  await tick(referee);
  assert.equal(count('DELETE /v2/positions/DLA'), 0, 'not before Alpaca said');
  clock += 11000;
  await tick(referee);
  await waitFor('DLA closed', () => !fake.positions.some((p) => p.symbol === 'DLA'));
  assert.equal(count('DELETE /v2/positions/DLA'), 1);
  await referee.stop();
});

// ---------------------------------------------------------------- 11: rate limits

for (const style of ['retry-after', 'reset'] as const) {
  test(`fix 11 (${style}): a close refused with 429 waits it out in line, and a long wait schedules the retry no sooner`, async () => {
    const home = reset('2026-10-19T15:00:00Z');
    const sleeps: number[] = [];
    const { referee } = await makeReferee(home, { sleeps, rules: NO_STOP_RULE });
    const stream = FakeStream.current!;
    fake.rateLimit = { method: 'DELETE', path: '/v2/positions/RLA', seconds: 2, times: 1, style };
    fake.positions = [position('RLA', 300, 50)];
    stream.push(fillUpdate(clock, 'rla', 'RLA', 'buy', 300, 50));
    await waitFor('RLA closed', () => !fake.positions.some((p) => p.symbol === 'RLA'));
    assert.ok(sleeps.some((ms) => ms >= 1000 && ms <= 3000), `waited what Alpaca asked: ${sleeps.join(', ')}`);
    assert.equal(count('DELETE /v2/positions/RLA'), 2);

    fake.rateLimit = { method: 'DELETE', path: '/v2/positions/RLB', seconds: 90, times: 1, style };
    fake.positions = [position('RLB', 300, 50)];
    stream.push(fillUpdate(clock, 'rlb', 'RLB', 'buy', 300, 50));
    await waitFor('the queued retry', () => referee.state().recentActions.some((a) => a.kind === 'error' && /Retrying in (89|90|91) s/.test(a.detail)));
    assert.equal(count('DELETE /v2/positions/RLB'), 1, 'a 90 s wait is not taken in line');
    clock += 60000;
    await tick(referee);
    assert.equal(count('DELETE /v2/positions/RLB'), 1, 'not before Alpaca said');
    clock += 32000;
    await tick(referee);
    await waitFor('RLB closed', () => !fake.positions.some((p) => p.symbol === 'RLB'));
    await referee.stop();
  });
}

test('fix 11 (review): while Alpaca rate-limits us, polling waits instead of re-asking every tick', async () => {
  const home = reset('2026-10-19T15:00:00Z');
  const { referee } = await makeReferee(home, { rules: NO_STOP_RULE });
  fake.positions = [position('RPA', 10, 20)];
  FakeStream.current!.push(fillUpdate(clock, 'rpa', 'RPA', 'buy', 10, 20));
  fake.rateLimit = { method: 'GET', path: '/v2/positions', seconds: 60, times: 1 };
  const polls = () => count('GET /v2/positions');
  const before = polls();
  for (const step of [6000, 6000, 6000, 20000]) {
    clock += step;
    await tick(referee);
  }
  assert.equal(polls(), before + 1, 'one refused poll, then quiet');
  clock += 30000;
  await tick(referee);
  assert.equal(polls(), before + 2, 'polling again after the wait');
  await referee.stop();
});
