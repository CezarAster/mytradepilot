import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyze } from '../src/core/analyze.ts';
import { parseCsv } from '../src/core/csv.ts';
import { combineTrades, parseFile } from '../src/core/parsers/index.ts';
import { marketClock, zonedTimeToUtc } from '../src/core/time.ts';

const PT = 'America/Los_Angeles';
const fixture = (name: string) => {
  const fileName = `Replay_Trading_${name}.csv`;
  return parseFile(readFileSync(new URL(`fixtures/${fileName}`, import.meta.url), 'utf8'), { timeZone: PT, fileName });
};

test('csv: quotes, escaped quotes, CRLF and BOM', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,2');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"'], ['1', '2']]);
});

test('time: Pacific wall clock converts to New York market time, across DST', () => {
  const summer = zonedTimeToUtc('2026-08-21 06:30', PT)!;
  assert.equal(summer.toISOString(), '2026-08-21T13:30:00.000Z');
  assert.deepEqual(marketClock(summer), { date: '2026-08-21', minutes: 9 * 60 + 30, weekday: 'Fri' });
  const winter = zonedTimeToUtc('2026-02-03 06:30', PT)!;
  assert.equal(winter.toISOString(), '2026-02-03T14:30:00.000Z');
  assert.equal(marketClock(winter).minutes, 9 * 60 + 30);
});

const DEMO = 'NASDAQ_DEMO_2026-03-02';

test('tradingview: reads every trade with symbol, side, excursions and stop exits', () => {
  const res = fixture(DEMO);
  assert.equal(res.format, 'TradingView trade list');
  assert.equal(res.trades.length, 7);
  const first = res.trades.find((t) => t.key.startsWith('DEMO|1|'))!;
  assert.equal(first.symbol, 'DEMO');
  assert.equal(first.direction, 'short');
  assert.equal(first.returnPct, -6.9);
  assert.equal(first.maePct, -6.9);
  assert.equal(first.stoppedOut, true);
});

test('tradingview: open trades are kept but excluded from stats', () => {
  const res = fixture(DEMO);
  assert.equal(res.trades.filter((t) => t.exitTime === null).length, 1);
  const report = analyze(combineTrades([res.trades]), { stopPct: 2 });
  assert.equal(report.summary.trades, 5);
  assert.equal(report.summary.openTrades, 1);
});

test('combine: partial fills merge into one trade, duplicates across files are dropped', () => {
  const demo = fixture(DEMO);
  const once = combineTrades([demo.trades]);
  const twice = combineTrades([demo.trades, demo.trades]);
  assert.equal(once.length, 6);
  assert.equal(twice.length, 6);
  const mar4 = once.filter((t) => marketClock(t.entryTime).date === '2026-03-04');
  assert.equal(mar4.length, 1);
  assert.equal(mar4[0].qty, 320);
  assert.equal(mar4[0].fills, 2);
  assert.equal(mar4[0].pnl, 320);
});

test('fills: FIFO matching builds round trips, including a flip', () => {
  const csv = [
    'Symbol,Side,Qty,Price,Time,Commission',
    'ABC,Buy,100,10.00,2026-03-02 09:35,1',
    'ABC,Buy,100,10.50,2026-03-02 09:40,1',
    'ABC,Sell,200,11.00,2026-03-02 10:00,2',
    'ABC,Sell,150,11.00,2026-03-02 10:30,1',
    'ABC,Buy,250,10.00,2026-03-02 11:00,2',
  ].join('\n');
  const res = parseFile(csv, { timeZone: 'America/New_York', fileName: 'fills.csv' });
  assert.equal(res.format, 'Fill list');
  const [a, b, c] = res.trades;
  assert.equal(a.direction, 'long');
  assert.equal(a.entryPrice, 10.25);
  assert.equal(a.pnl, 200 * 0.75 - 4);
  assert.equal(b.direction, 'short');
  assert.equal(b.qty, 150);
  assert.ok(Math.abs(b.pnl - (150 * 1 - 1 - 2 * (150 / 250))) < 1e-9);
  assert.equal(c.direction, 'long');
  assert.equal(c.qty, 100);
  assert.equal(c.exitTime, null);
  assert.equal(res.warnings.length, 1);
});

test('analyze: summary, New York time buckets, trade of the day and the stop check', () => {
  const report = analyze(combineTrades([fixture(DEMO).trades]), { stopPct: 2 });
  const s = report.summary;
  assert.equal(s.trades, 5);
  assert.equal(s.wins, 3);
  assert.ok(Math.abs(s.totalReturn - -0.9) < 1e-9);
  assert.equal(s.totalPnl, -690 + 500 + 320 + 120 - 248);
  const time = report.dimensions.find((d) => d.id === 'time')!;
  assert.equal(time.groups.find((g) => g.label === '9:30–9:45')!.n, 3);
  const tod = report.dimensions.find((d) => d.id === 'tradeOfDay')!;
  assert.equal(tod.groups.find((g) => g.label === '2nd')!.n, 1);
  const prev = report.dimensions.find((d) => d.id === 'afterPrev')!;
  assert.equal(prev.groups.find((g) => g.label === 'After a win')!.n, 1);
  assert.equal(report.risk.pastStop, 3);
  assert.equal(report.risk.pastStopCameBack, 1);
  assert.ok(Math.abs(report.risk.returnWithStop - (-0.9 - (-6.9 + 5 - 2) - 3 * 2)) < 1e-9);
});

test('analyze: a group that loses money is a leak, one that is profitable never is', () => {
  const csv = readFileSync(new URL('../public/sample-trades.csv', import.meta.url), 'utf8');
  const trades = parseFile(csv, { timeZone: 'America/New_York', fileName: 'sample.csv' }).trades;
  const report = analyze(combineTrades([trades]), { stopPct: 2 });
  assert.ok(report.edges.length > 0 && report.leaks.length > 0);
  for (const l of report.leaks) {
    if (l.kind === 'leak') assert.ok(l.group.avgReturn < 0);
    else assert.equal(l.kind, 'weak');
  }
  for (const e of report.edges) assert.ok(e.group.avgReturn > report.summary.avgReturn);
});

test('fills: optional Worst %/Best % columns become maePct/mfePct and turn on the stop check', () => {
  const csv = ['Symbol,Side,Qty,Price,Time,Commission,Worst %,Best %', 'ABC,Buy,100,10,2026-03-02 09:35,1,,', 'ABC,Sell,100,11,2026-03-02 10:00,1,-3.1,12'].join('\n');
  const res = parseFile(csv, { timeZone: 'America/New_York', fileName: 'fills.csv' });
  const trades = combineTrades([res.trades]);
  assert.equal(trades.length, 1);
  assert.equal(trades[0].maePct, -3.1);
  assert.equal(trades[0].mfePct, 12);
  assert.equal(analyze(trades, { stopPct: 2 }).risk.hasExcursions, true);
});
