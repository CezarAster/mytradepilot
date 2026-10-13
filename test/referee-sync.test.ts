// Review findings 6 to 11: backfilled fills, drift, imports, failing writes, account switches, rate limits.
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
import { CREDS, FakeAlpaca, FakeStream, activity, fillUpdate, position } from './helpers/fake-alpaca.ts';

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
  Object.assign(fake, { fills: [], positions: [], openOrders: [], calls: [], hooks: [], failCloseAll: [], rateLimit: null, holdFills: null });
  return mkdtempSync(join(root, 'home-'));
}

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
  return { referee, config, events };
}

const tick = (r: Referee) => (r as unknown as { onTick(): Promise<void> }).onTick();
const settle = () => new Promise((r) => setTimeout(r, 60));
const count = (call: string) => fake.calls.filter((c) => c === call).length;
const FILLS = 'GET /v2/account/activities/FILL';

test('fix 6/7: a fill only the backfill found is stored, notified and enforced while its trade is still open', async () => {
  const home = reset('2026-10-12T15:00:00Z'); // Monday 11:00 ET
  const { referee } = await makeReferee(home);
  await settle(); // the stream's first-live sync
  // The stream never delivered this entry, ten minutes ago: 300 x $50 breaks the $10,000 size rule.
  fake.fills.push(activity('miss1', 'LLA', 'buy', 300, 50, clock - 10 * MIN));
  fake.positions = [position('LLA', 300, 50)];
  await referee.reconcile('test');
  await settle();
  const b = referee.state().todayBreaches.find((x) => x.rule === 'maxPositionDollars' && x.symbol === 'LLA');
  assert.ok(b, 'stored');
  assert.match(b.message, /^\(seen late\)/);
  assert.ok(fake.hooks.some((h) => /maxPositionDollars LLA/.test(h.title)), 'notified');
  assert.ok(fake.calls.includes('DELETE /v2/positions/LLA'), `enforced: ${fake.calls.join(', ')}`);
  await referee.stop();
});

test('fix 6/7: a backfilled breach whose trade already closed is stored but not enforced, and a newer trade in the symbol is left alone', async () => {
  const home = reset('2026-10-12T15:00:00Z');
  const { referee } = await makeReferee(home);
  await settle();
  // One batch: an oversized trade that opened and closed, then a small new trade in the same symbol, still open.
  fake.fills.push(activity('mb1', 'LLB', 'buy', 300, 50, clock - 20 * MIN), activity('mb2', 'LLB', 'sell', 300, 50.5, clock - 15 * MIN), activity('mb3', 'LLB', 'buy', 10, 50, clock - 5 * MIN));
  fake.positions = [position('LLB', 10, 50)];
  fake.calls = [];
  await referee.reconcile('test');
  await settle();
  assert.ok(referee.state().todayBreaches.some((x) => x.rule === 'maxPositionDollars' && x.symbol === 'LLB'), 'stored');
  assert.ok(!fake.calls.some((c) => c.startsWith('DELETE')), `nothing cancelled or closed: ${fake.calls.join(', ')}`);
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'LLB')?.qty, 10);
  assert.ok(referee.state().recentActions.every((a) => a.kind !== 'flatten'));
  await referee.stop();
});

test('fix 7: a backfilled fill older than one already applied is replayed in order, its breach stored, and the saved lock kept', async () => {
  const home = reset('2026-10-13T15:00:00Z'); // Tuesday 11:00 ET
  const rules: Partial<RuleSet> = { maxBreachesPerDay: { enabled: true, count: 2 } };
  const { referee } = await makeReferee(home, { dryRun: true, rules });
  const stream = FakeStream.current!;
  const t0 = clock;
  // Two missing-stop breaches (time-based: a replay of fills cannot re-derive them) lock the day.
  for (const sym of ['SSA', 'SSB']) {
    fake.positions = [position(sym, 10, 20)];
    stream.push(fillUpdate(clock, `${sym}-in`, sym, 'buy', 10, 20));
    clock += 61000;
    await tick(referee);
    clock += 1000;
    fake.positions = [];
    stream.push(fillUpdate(clock, `${sym}-out`, sym, 'sell', 10, 21)); // a win, so no re-entry rule fires
    clock += MIN;
  }
  await settle();
  assert.ok(referee.state().snapshot.lock, 'locked by two breaches');
  // The stream missed an oversized round trip between them; the backfill finds it.
  fake.fills.push(activity('rr1', 'RRR', 'buy', 300, 50, t0 + 30000), activity('rr2', 'RRR', 'sell', 300, 50, t0 + 40000));
  await referee.reconcile('test');
  await settle();
  const st = referee.state();
  const late = st.todayBreaches.find((x) => x.symbol === 'RRR');
  assert.equal(late?.rule, 'maxPositionDollars');
  assert.match(late!.message, /^\(seen late\)/);
  assert.ok(st.snapshot.lock, 'lock kept');
  assert.equal(st.snapshot.day.breaches, 3, 'two saved plus the late one');
  assert.equal(st.recentActions.filter((a) => a.kind === 'lock').length, 1, 'no second lock announcement');
  await referee.stop();
});

test('fix 6: a position Alpaca shows but our fills miss triggers a sync, at most once a minute', async () => {
  const home = reset('2026-10-12T15:00:00Z');
  const { referee } = await makeReferee(home);
  await settle(); // the stream's first-live sync
  // The stream dropped this fill and nothing else is coming to trigger a sync.
  fake.fills.push(activity('d1', 'DRF', 'buy', 10, 20, clock - MIN));
  fake.positions = [position('DRF', 10, 20)];
  const before = count(FILLS);
  clock += 31000;
  await tick(referee);
  await settle();
  assert.equal(count(FILLS), before + 1, 'drift synced');
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'DRF')?.qty, 10, 'the missed fill is in');
  // A position no fill will ever explain: one sync a minute, not one per tick.
  fake.positions = [position('DRF', 10, 20), position('DRG', 5, 10)];
  clock += 6000;
  await tick(referee);
  await settle();
  assert.equal(count(FILLS), before + 1, 'rate limited');
  clock += 60000;
  await tick(referee);
  await settle();
  assert.equal(count(FILLS), before + 2, 'synced again after a minute');
  await referee.stop();
});

test('fix 8: re-importing a CSV does not recount today, and a restart keeps the imported count', async () => {
  const home = reset('2026-10-14T15:00:00Z'); // Wednesday 11:00 ET
  // Yesterday's trade on the account: replaying it rolled the day and dropped today's imported count.
  fake.fills.push(activity('y1', 'YYY', 'buy', 10, 10, clock - 86400000), activity('y2', 'YYY', 'sell', 10, 11, clock - 86400000 + MIN));
  const csv = 'Symbol,Side,Qty,Price,Time\nIMA,Buy,10,10,2026-10-14 09:35\nIMA,Sell,10,11,2026-10-14 09:45\nIMB,Buy,10,10,2026-10-14 10:00\nIMB,Sell,10,9,2026-10-14 10:10\n';
  const { referee } = await makeReferee(home);
  referee.importCsv({ fileName: 'today.csv', text: csv, timeZone: 'America/New_York' });
  assert.equal(referee.state().snapshot.day.tradesOpened, 2);
  const again = referee.importCsv({ fileName: 'today.csv', text: csv, timeZone: 'America/New_York' });
  assert.equal(again.duplicates, 2);
  assert.equal(referee.state().snapshot.day.tradesOpened, 2, 'not counted twice');
  fake.positions = [position('LIV', 10, 20)];
  FakeStream.current!.push(fillUpdate(clock, 'liv', 'LIV', 'buy', 10, 20));
  assert.equal(referee.state().snapshot.nextTrade.number, 4);
  await referee.stop();

  const { referee: restarted } = await makeReferee(home);
  const st = restarted.state();
  assert.equal(st.snapshot.day.tradesOpened, 3, 'two imported plus one live survive a restart');
  assert.equal(st.snapshot.nextTrade.number, 4);
  await restarted.stop();
});

test('fix 9: a failing database does not stop a flatten, and a failing config write does not stop the kill switch', async () => {
  const home = reset('2026-10-15T15:00:00Z');
  const { referee, config, events } = await makeReferee(home);
  const store = (referee as unknown as { store: Record<string, unknown> }).store;
  const fail = () => {
    throw new Error('SQLITE_FULL: database or disk is full');
  };
  const methods = ['insertBreach', 'insertAction', 'insertFill', 'setKv', 'upsertOrder', 'setTradeMeta', 'consumeDeclaration'];
  for (const m of methods) store[m] = fail;
  fake.positions = [position('DSK', 300, 50)];
  FakeStream.current!.push(fillUpdate(clock, 'dsk', 'DSK', 'buy', 300, 50));
  await settle();
  assert.ok(fake.calls.includes('DELETE /v2/positions/DSK'), 'flattened anyway');
  assert.ok(events.some((e) => e.type === 'breach' && e.breach.symbol === 'DSK' && e.breach.id < 0), 'the UI still hears of the breach');
  assert.ok(events.some((e) => e.type === 'action' && e.action.kind === 'flatten' && e.action.symbol === 'DSK'));
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'DSK')?.qty, 300, 'the unsaved fill was applied');

  // The disk recovers: the next sync writes the fill once and does not apply it twice.
  for (const m of methods) delete store[m];
  fake.positions = [position('DSK', 300, 50)];
  fake.fills.push(activity('dsk', 'DSK', 'buy', 300, 50, clock));
  await referee.reconcile('test');
  assert.equal(referee.state().status.counts.fills, 1, 'stored');
  assert.equal(referee.state().snapshot.positions.find((p) => p.symbol === 'DSK')?.qty, 300, 'not applied twice');

  // Config folder read-only: the kill switch still turns enforcement off, and says the setting was not saved.
  (config as unknown as { write: () => void }).write = fail;
  const killed = referee.kill();
  assert.equal(killed.enabled, false);
  assert.equal(config.get().enforcement.enabled, false, 'off in memory');
  assert.ok(referee.state().recentActions.some((a) => a.kind === 'error' && /saving config.json failed/.test(a.detail)));
  fake.calls = [];
  fake.positions = [position('DSL', 300, 50)];
  FakeStream.current!.push(fillUpdate(clock, 'dsl', 'DSL', 'buy', 300, 50));
  await settle();
  assert.ok(!fake.calls.some((c) => c.startsWith('DELETE')), 'killed means nothing is sent');
  await referee.stop();
});

test('fix 10: switching paper to live during a sync does not write paper fills into the live database, and the live sync still runs', async () => {
  const home = reset('2026-10-16T15:00:00Z');
  const { referee } = await makeReferee(home);
  let release!: () => void;
  fake.holdFills = new Promise((r) => (release = r));
  fake.fills = [activity('pp1', 'PPR', 'buy', 10, 20, clock - MIN)]; // on the paper account
  const before = count(FILLS);
  const sync = referee.reconcile('test');
  while (count(FILLS) === before) await new Promise((r) => setTimeout(r, 5));
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

test('fix 11: a close refused with 429 waits Retry-After in line, and a long Retry-After schedules the retry no sooner', async () => {
  const home = reset('2026-10-19T15:00:00Z');
  const sleeps: number[] = [];
  const { referee } = await makeReferee(home, { sleeps });
  const stream = FakeStream.current!;
  fake.rateLimit = { method: 'DELETE', path: '/v2/positions/RLA', retryAfter: '2', times: 1 };
  fake.positions = [position('RLA', 300, 50)];
  stream.push(fillUpdate(clock, 'rla', 'RLA', 'buy', 300, 50));
  await settle();
  assert.ok(sleeps.includes(2000), `waited Retry-After: ${sleeps.join(', ')}`);
  assert.equal(count('DELETE /v2/positions/RLA'), 2);
  assert.ok(!fake.positions.some((p) => p.symbol === 'RLA'), 'closed on the second try');

  fake.rateLimit = { method: 'DELETE', path: '/v2/positions/RLB', retryAfter: '90', times: 1 };
  fake.positions = [position('RLB', 300, 50)];
  stream.push(fillUpdate(clock, 'rlb', 'RLB', 'buy', 300, 50));
  await settle();
  assert.equal(count('DELETE /v2/positions/RLB'), 1, 'a 90 s wait is not taken in line');
  assert.ok(referee.state().recentActions.some((a) => a.kind === 'error' && /Retrying in 90 s/.test(a.detail)));
  clock += 60000;
  await tick(referee);
  assert.equal(count('DELETE /v2/positions/RLB'), 1, 'not before Alpaca said');
  clock += 31000;
  await tick(referee);
  assert.equal(count('DELETE /v2/positions/RLB'), 2);
  assert.ok(!fake.positions.some((p) => p.symbol === 'RLB'));
  await referee.stop();
});
