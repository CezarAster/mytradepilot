import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseCsv, toNumber } from '../src/core/csv.ts';
import { parseFile } from '../src/core/parsers/index.ts';
import { endOfMarketDay, zonedTimeToUtc } from '../src/core/time.ts';
import { LiveEngine } from '../src/engine/live.ts';
import { Matcher } from '../src/engine/matcher.ts';
import { wilson } from '../src/engine/record.ts';
import { DEFAULT_RULES, type Fill, type OrderSnapshot, type RuleSet } from '../src/engine/types.ts';

const NY = 'America/New_York';
const at = (s: string) => zonedTimeToUtc(s, NY)!.getTime();

let n = 0;
function fill(symbol: string, side: 'buy' | 'sell', qty: number, price: number, time: string, orderId = `o${++n}`): Fill {
  return { key: `${orderId}|${qty}`, orderId, symbol, side, qty, price, time: at(time), fee: 0, source: 'alpaca' };
}
function stop(symbol: string, side: 'buy' | 'sell', stopPrice: number, time: string, status = 'new', id = `s${++n}`): OrderSnapshot {
  return { id, symbol, side, type: 'stop', status, qty: 100, stopPrice, limitPrice: null, updatedAt: at(time), parentId: null };
}
function rules(patch: Partial<{ [K in keyof RuleSet]: Partial<RuleSet[K]> }> = {}): RuleSet {
  const r = structuredClone(DEFAULT_RULES) as RuleSet;
  for (const [k, v] of Object.entries(patch)) Object.assign((r as unknown as Record<string, object>)[k], v);
  return r;
}
const breaches = (events: ReturnType<LiveEngine['applyFill']>) => events.filter((e) => e.type === 'breach').map((e) => (e.type === 'breach' ? e.breach.rule : ''));

test('matcher: streams the sample fills into the same trades as the batch parser', () => {
  const csv = readFileSync(new URL('../public/sample-trades.csv', import.meta.url), 'utf8');
  const batch = parseFile(csv, { timeZone: NY, fileName: 'sample.csv' }).trades.sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime() || a.symbol.localeCompare(b.symbol));
  const rows = parseCsv(csv).slice(1);
  const fills: Fill[] = rows.map((r, i) => ({
    key: `k${i}`,
    orderId: `o${i}`,
    symbol: r[0],
    side: /^(sell|short)/i.test(r[1]) ? 'sell' : 'buy',
    qty: toNumber(r[2]),
    price: toNumber(r[3]),
    time: at(r[4]),
    fee: toNumber(r[5]) || 0,
    source: 'import',
  }));
  fills.sort((a, b) => a.time - b.time);
  const m = new Matcher();
  const closed = [];
  for (const f of fills) {
    let res: ReturnType<Matcher['apply']> | null = m.apply(f);
    while (res) {
      if (res.closed) closed.push(res.closed);
      res = res.flippedInto;
    }
  }
  const all = [...closed, ...m.openTrades()].sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime() || a.symbol.localeCompare(b.symbol));
  assert.equal(all.length, batch.length);
  for (let i = 0; i < all.length; i++) {
    const a = all[i];
    const b = batch[i];
    assert.equal(a.symbol, b.symbol);
    assert.equal(a.direction, b.direction);
    assert.equal(a.entryTime.getTime(), b.entryTime.getTime());
    assert.equal(a.exitTime?.getTime() ?? null, b.exitTime?.getTime() ?? null);
    assert.ok(Math.abs(a.pnl - b.pnl) < 1e-9, `${a.symbol} pnl ${a.pnl} vs ${b.pnl}`);
    assert.ok(Math.abs(a.returnPct - b.returnPct) < 1e-9);
    assert.equal(a.qty, b.qty);
    assert.equal(a.fills, b.fills);
  }
});

test('matcher: partial fills, scale-in, reduce and a flip', () => {
  const m = new Matcher();
  assert.equal(m.apply(fill('ABC', 'buy', 100, 10, '2026-03-02 09:35')).kind, 'open');
  assert.equal(m.apply(fill('ABC', 'buy', 100, 10.5, '2026-03-02 09:40')).kind, 'add');
  const red = m.apply(fill('ABC', 'sell', 50, 11, '2026-03-02 09:50'));
  assert.equal(red.kind, 'reduce');
  assert.equal(red.position!.qty, 150);
  const flip = m.apply(fill('ABC', 'sell', 250, 11, '2026-03-02 10:00'));
  assert.equal(flip.kind, 'close');
  assert.equal(flip.closed!.qty, 200);
  assert.equal(flip.closed!.pnl, 200 * 0.75);
  assert.equal(flip.flippedInto!.kind, 'open');
  assert.equal(flip.flippedInto!.position!.direction, 'short');
  assert.equal(flip.flippedInto!.position!.qty, -100);
});

test('engine: trade counting, max trades a day, next-trade number and blockers', () => {
  const e = new LiveEngine({ rules: rules({ maxTradesPerDay: { count: 2 }, stopRequired: { enabled: false } }) });
  assert.deepEqual(breaches(e.applyFill(fill('AAA', 'buy', 10, 100, '2026-03-02 09:40'))), []);
  e.applyFill(fill('AAA', 'sell', 10, 101, '2026-03-02 09:45'));
  e.applyFill(fill('BBB', 'buy', 10, 50, '2026-03-02 10:00'));
  e.applyFill(fill('BBB', 'sell', 10, 51, '2026-03-02 10:05'));
  const snap = e.snapshot(at('2026-03-02 10:06'));
  assert.equal(snap.day.tradesOpened, 2);
  assert.equal(snap.day.wins, 2);
  assert.equal(snap.nextTrade.number, 3);
  assert.equal(snap.nextTrade.allowed, false);
  assert.deepEqual(snap.nextTrade.blockers.map((b) => b.rule), ['maxTradesPerDay']);
  assert.deepEqual(breaches(e.applyFill(fill('CCC', 'buy', 10, 20, '2026-03-02 10:10'))), ['maxTradesPerDay']);
  // A new day resets the count.
  const next = e.snapshot(at('2026-03-03 09:31'));
  assert.equal(next.day.tradesOpened, 0);
  assert.equal(next.nextTrade.number, 1);
});

test('engine: losing exit arms no-re-entry; two losses arm the cooldown; both clear with time', () => {
  const e = new LiveEngine({ rules: rules({ stopRequired: { enabled: false }, maxTradesPerDay: { count: 10 } }) });
  e.applyFill(fill('AAA', 'buy', 10, 100, '2026-03-02 09:40'));
  e.applyFill(fill('AAA', 'sell', 10, 99, '2026-03-02 09:45')); // loss 1
  let s = e.snapshot(at('2026-03-02 09:46'));
  assert.equal(s.noReentryUntil, at('2026-03-02 09:55'));
  assert.equal(s.cooldownUntil, null);
  assert.equal(s.nextTrade.context.afterPrev, '< 10 min after a loss');
  assert.equal(s.nextTrade.context.minutesSinceLastLoss, 1);
  assert.deepEqual(breaches(e.applyFill(fill('BBB', 'buy', 10, 50, '2026-03-02 09:47'))), ['noReentryAfterLoss']);
  e.applyFill(fill('BBB', 'sell', 10, 49, '2026-03-02 09:50')); // loss 2 -> cooldown 20 min
  s = e.snapshot(at('2026-03-02 09:51'));
  assert.equal(s.day.consecutiveLosses, 2);
  assert.equal(s.cooldownUntil, at('2026-03-02 10:10'));
  assert.deepEqual(s.nextTrade.blockers.map((b) => b.rule).sort(), ['cooldownAfterLosses', 'noReentryAfterLoss']);
  s = e.snapshot(at('2026-03-02 10:11'));
  assert.equal(s.nextTrade.allowed, true);
  assert.equal(s.nextTrade.context.afterPrev, 'After a loss');
  // A win resets the streak.
  e.applyFill(fill('CCC', 'buy', 10, 20, '2026-03-02 10:12'));
  e.applyFill(fill('CCC', 'sell', 10, 21, '2026-03-02 10:15'));
  assert.equal(e.snapshot(at('2026-03-02 10:16')).day.consecutiveLosses, 0);
});

test('engine: stop required within the window, bracket legs count, cancelling re-arms the clock, widening is caught', () => {
  const e = new LiveEngine({ rules: rules({ stopRequired: { withinSeconds: 60 } }), stopGraceSeconds: 15 });
  // Stop leg arrives before the fill (bracket): attached immediately, no deadline.
  e.applyOrder(stop('AAA', 'sell', 98, '2026-03-02 09:39:50', 'held', 'leg1'));
  let ev = e.applyFill(fill('AAA', 'buy', 10, 100, '2026-03-02 09:40:00'));
  assert.ok(ev.some((x) => x.type === 'stop_attached'));
  assert.deepEqual(breaches(e.tick(at('2026-03-02 09:41:30'))), []);
  // Widen the stop: replaced by a lower one.
  e.applyOrder(stop('AAA', 'sell', 98, '2026-03-02 09:42:00', 'replaced', 'leg1'));
  ev = e.applyOrder(stop('AAA', 'sell', 95, '2026-03-02 09:42:00', 'new', 'leg2'));
  assert.deepEqual(breaches(ev), ['stopNotWidened']);
  // Cancel it with nothing behind: 15 s grace, then a breach.
  ev = e.applyOrder(stop('AAA', 'sell', 95, '2026-03-02 09:43:00', 'canceled', 'leg2'));
  assert.ok(ev.some((x) => x.type === 'stop_removed'));
  assert.deepEqual(breaches(e.tick(at('2026-03-02 09:43:10'))), []);
  assert.deepEqual(breaches(e.tick(at('2026-03-02 09:43:20'))), ['stopRequired']);
  assert.deepEqual(breaches(e.tick(at('2026-03-02 09:44:20'))), [], 'one breach per deadline');

  // A naked entry with no stop at all.
  const f = new LiveEngine({ rules: rules({ stopRequired: { withinSeconds: 60 } }) });
  f.applyFill(fill('BBB', 'buy', 10, 50, '2026-03-02 10:00:00'));
  assert.deepEqual(f.positionsAwaitingStop(), ['BBB']);
  assert.deepEqual(breaches(f.tick(at('2026-03-02 10:00:59'))), []);
  assert.deepEqual(breaches(f.tick(at('2026-03-02 10:01:00'))), ['stopRequired']);
  // A stop on the wrong side (a buy stop on a long) does not count.
  const g = new LiveEngine({ rules: rules({ stopRequired: { withinSeconds: 60 } }) });
  g.applyFill(fill('CCC', 'buy', 10, 50, '2026-03-02 10:00:00'));
  g.applyOrder(stop('CCC', 'buy', 55, '2026-03-02 10:00:10'));
  assert.deepEqual(breaches(g.tick(at('2026-03-02 10:01:00'))), ['stopRequired']);
});

test('engine: an exit through the stop order is labelled a stop-out; a referee close is not', () => {
  const e = new LiveEngine({ rules: rules() });
  e.applyOrder(stop('AAA', 'sell', 98, '2026-03-02 09:39:50', 'held', 'stopA'));
  e.applyFill(fill('AAA', 'buy', 10, 100, '2026-03-02 09:40:00'));
  e.applyOrder(stop('AAA', 'sell', 98, '2026-03-02 09:50:00', 'filled', 'stopA'));
  const closed = e.applyFill(fill('AAA', 'sell', 10, 98, '2026-03-02 09:50:00', 'stopA')).find((x) => x.type === 'trade_closed');
  assert.ok(closed && closed.type === 'trade_closed' && closed.trade.stoppedOut === true);
  e.applyFill(fill('BBB', 'buy', 10, 50, '2026-03-02 10:00:00'));
  e.markRefereeClosed('BBB');
  const ref = e.applyFill(fill('BBB', 'sell', 10, 49, '2026-03-02 10:01:00')).find((x) => x.type === 'trade_closed');
  assert.ok(ref && ref.type === 'trade_closed' && ref.refereeClosed && ref.trade.stoppedOut === false);
});

test('engine: size, open positions, session window and declarations', () => {
  const e = new LiveEngine({ rules: rules({ stopRequired: { enabled: false }, maxPositionDollars: { dollars: 5000 }, maxOpenPositions: { count: 1 } }) });
  assert.deepEqual(breaches(e.applyFill(fill('AAA', 'buy', 100, 60, '2026-03-02 09:20'))).sort(), ['maxPositionDollars', 'sessionWindow']);
  assert.deepEqual(breaches(e.applyFill(fill('BBB', 'buy', 10, 10, '2026-03-02 09:35'))), ['maxOpenPositions']);
  // Declare, then fill within the window: declared and size-checked.
  e.declare({ time: at('2026-03-02 09:40'), symbol: 'CCC', side: 'long', qty: 10, stopPrice: null, note: null });
  const ev = e.applyFill(fill('CCC', 'buy', 12, 10, '2026-03-02 09:41'));
  const opened = ev.find((x) => x.type === 'trade_opened');
  assert.ok(opened && opened.type === 'trade_opened' && opened.declared);
  assert.ok(breaches(ev).includes('sizeMatchesDeclaration'));
  assert.ok(!ev.some((x) => x.type === 'undeclared_entry'));
  // The next one is undeclared.
  const ev2 = e.applyFill(fill('DDD', 'buy', 1, 10, '2026-03-02 09:42'));
  assert.ok(ev2.some((x) => x.type === 'undeclared_entry'));
  const s = e.snapshot(at('2026-03-02 09:43'));
  assert.equal(s.day.declaredEntries, 1);
  assert.equal(s.day.undeclared, 3);
  // A stale declaration does not count.
  e.declare({ time: at('2026-03-02 09:45'), symbol: null, side: null, qty: null, stopPrice: null, note: null });
  const ev3 = e.applyFill(fill('EEE', 'buy', 1, 10, '2026-03-02 09:56'));
  assert.ok(ev3.some((x) => x.type === 'undeclared_entry'));
});

test('engine: daily loss limit counts open P&L, fires once, and locks the rest of the day', () => {
  const e = new LiveEngine({ rules: rules({ stopRequired: { enabled: false }, dailyLossLimit: { dollars: 300 } }) });
  e.applyFill(fill('AAA', 'buy', 100, 50, '2026-03-02 09:40'));
  e.applyFill(fill('AAA', 'sell', 100, 48, '2026-03-02 09:50')); // -200 realized
  e.applyFill(fill('BBB', 'buy', 100, 20, '2026-03-02 10:00'));
  assert.deepEqual(breaches(e.setMarks({ BBB: 19.5 }, at('2026-03-02 10:01'))), []); // -250 total
  const ev = e.setMarks({ BBB: 18.9 }, at('2026-03-02 10:02')); // -310 total
  assert.deepEqual(breaches(ev), ['dailyLossLimit']);
  assert.ok(ev.some((x) => x.type === 'lock'));
  assert.deepEqual(breaches(e.setMarks({ BBB: 18 }, at('2026-03-02 10:03'))), [], 'fires once');
  const s = e.snapshot(at('2026-03-02 10:04'));
  assert.ok(s.lock && s.lock.until === endOfMarketDay(at('2026-03-02 10:02')));
  assert.deepEqual(breaches(e.applyFill(fill('CCC', 'buy', 1, 10, '2026-03-02 10:05'))), ['locked']);
  assert.equal(e.snapshot(at('2026-03-03 09:30')).lock, null, 'lock expires with the day');
});

test('engine: breach cap locks the day', () => {
  const e = new LiveEngine({ rules: rules({ stopRequired: { enabled: false }, maxTradesPerDay: { count: 1 }, maxBreachesPerDay: { count: 2 }, noReentryAfterLoss: { enabled: false }, cooldownAfterLosses: { enabled: false } }) });
  e.applyFill(fill('AAA', 'buy', 1, 10, '2026-03-02 09:40'));
  e.applyFill(fill('AAA', 'sell', 1, 11, '2026-03-02 09:41'));
  e.applyFill(fill('BBB', 'buy', 1, 10, '2026-03-02 09:42'));
  e.applyFill(fill('BBB', 'sell', 1, 11, '2026-03-02 09:43'));
  const ev = e.applyFill(fill('CCC', 'buy', 1, 10, '2026-03-02 09:44'));
  assert.ok(ev.some((x) => x.type === 'lock'));
  assert.equal(e.snapshot(at('2026-03-02 09:45')).day.breaches, 2);
});

test('engine: seeded history drives the record lines and late-day give-back', () => {
  const csv = readFileSync(new URL('../public/sample-trades.csv', import.meta.url), 'utf8');
  const trades = parseFile(csv, { timeZone: NY, fileName: 'sample.csv' }).trades;
  const e = new LiveEngine({ rules: rules() });
  e.seed(trades, at('2026-06-01 09:30'));
  const s = e.snapshot(at('2026-06-01 09:35'));
  assert.equal(s.day.tradesOpened, 0);
  assert.equal(s.nextTrade.context.tradeOfDay, '1st');
  assert.equal(s.nextTrade.context.timeBucket, '9:30–9:45');
  assert.ok(s.nextTrade.record.length >= 2);
  const first = s.nextTrade.record[0];
  assert.ok(first.n > 0 && first.winLow <= first.winRate && first.winRate <= first.winHigh);
  assert.ok(s.nextTrade.lateDayGiveBack === null || s.nextTrade.lateDayGiveBack.days > 0);
  assert.equal(e.closedTrades().length, trades.filter((t) => t.exitTime).length);
  // Seeding twice does not duplicate.
  e.seed(trades, at('2026-06-01 09:30'));
  assert.equal(e.closedTrades().length, trades.filter((t) => t.exitTime).length);
});

test('engine: replaying the same fills twice gives the same state (determinism)', () => {
  const fills = [
    fill('AAA', 'buy', 10, 100, '2026-03-02 09:40'),
    fill('AAA', 'sell', 10, 99, '2026-03-02 09:45'),
    fill('BBB', 'buy', 10, 50, '2026-03-02 09:47'),
    fill('BBB', 'sell', 10, 49, '2026-03-02 09:50'),
  ];
  const run = () => {
    const e = new LiveEngine({ rules: rules({ stopRequired: { enabled: false } }) });
    const all = fills.flatMap((f) => e.applyFill(f));
    return { breaches: breaches(all), snap: e.snapshot(at('2026-03-02 09:51')) };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a.breaches, ['noReentryAfterLoss']);
  assert.deepEqual(a.snap, b.snap);
});

test('wilson interval and end of market day', () => {
  const [lo, hi] = wilson(5, 10);
  assert.ok(lo > 0.2 && lo < 0.3 && hi > 0.7 && hi < 0.8);
  assert.deepEqual(wilson(0, 0), [0, 1]);
  const end = endOfMarketDay(at('2026-03-02 10:00'));
  assert.equal(end, at('2026-03-03 00:00'));
  // Across the spring DST change (2026-03-08).
  assert.equal(endOfMarketDay(at('2026-03-08 10:00')), at('2026-03-09 00:00'));
});
