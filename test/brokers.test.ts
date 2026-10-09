import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { contractFor } from '../src/core/contracts.ts';
import { toNumber } from '../src/core/csv.ts';
import { parseFile } from '../src/core/parsers/index.ts';
import { zonedTimeToUtc } from '../src/core/time.ts';

const NY = 'America/New_York';
const broker = (name: string, timeZone = NY) =>
  parseFile(readFileSync(new URL(`fixtures/brokers/${name}`, import.meta.url), 'utf8'), { timeZone, fileName: name });
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} ≈ ${b}`);

test('numbers: currency, parentheses for losses, signs and @ prices', () => {
  assert.equal(toNumber('$(20.00)'), -20);
  assert.equal(toNumber('($1,104.30)'), -1104.3);
  assert.equal(toNumber('-$25.50'), -25.5);
  assert.equal(toNumber('+100'), 100);
  assert.equal(toNumber('@182.50'), 182.5);
  assert.ok(Number.isNaN(toNumber('')));
});

test('time: US dates, AM/PM, IBKR formats, zone names and UTC offsets', () => {
  const at = (s: string, tz = NY) => zonedTimeToUtc(s, tz)?.toISOString();
  assert.equal(at('3/2/2026 1:05:00 PM'), '2026-03-02T18:05:00.000Z');
  assert.equal(at('3/2/2026 12:15:00 AM'), '2026-03-02T05:15:00.000Z');
  assert.equal(at('3/2/26 09:35:01'), '2026-03-02T14:35:01.000Z');
  assert.equal(at('2026-03-02, 09:40:00'), '2026-03-02T14:40:00.000Z');
  assert.equal(at('20260302;094000'), '2026-03-02T14:40:00.000Z');
  assert.equal(at('03/02/2026 09:35:01 EST', 'America/Los_Angeles'), '2026-03-02T14:35:01.000Z');
  assert.equal(at('03/02/2026 09:31:05 -05:00', 'America/Los_Angeles'), '2026-03-02T14:31:05.000Z');
  assert.equal(at('2026-03-02T14:31:05Z'), '2026-03-02T14:31:05.000Z');
  assert.equal(at('2026-03-02'), undefined);
});

test('contracts: futures roots in every platform spelling, options x100, stocks x1', () => {
  for (const s of ['MNQH6', 'MNQZ25', '/MNQH26', 'MNQ 03-26', 'CON.F.US.MNQ.H26']) {
    assert.deepEqual(contractFor(s), { symbol: 'MNQ', multiplier: 2, isFutures: true }, s);
  }
  assert.equal(contractFor('6EH6').multiplier, 125000);
  assert.equal(contractFor('M2KH6').symbol, 'M2K');
  assert.equal(contractFor('AAPL260320C00200000').multiplier, 100);
  assert.equal(contractFor('SPY 20 MAR 26 600 CALL').multiplier, 100);
  assert.equal(contractFor('ES').multiplier, 1); // Eversource, the stock
  assert.equal(contractFor('ES', true).multiplier, 50); // on a futures-only platform
  assert.equal(contractFor('AAPL').multiplier, 1);
});

test('tradovate: lots are rebuilt into trades with scale-ins, shorts, and inferred contract size', () => {
  const res = broker('tradovate-performance.csv');
  assert.equal(res.format, 'Tradovate performance');
  assert.deepEqual(res.warnings, []);
  const [a, b, c] = res.trades;
  assert.equal(a.symbol, 'MNQ');
  assert.equal(a.direction, 'long');
  assert.equal(a.qty, 2);
  assert.equal(a.entryPrice, 21001);
  assert.equal(a.pnl, 36);
  assert.equal(a.fills, 3);
  assert.equal(b.direction, 'short');
  assert.equal(b.exitPrice, 21022.5);
  assert.equal(b.pnl, -10);
  assert.equal(c.symbol, 'KEZ6');
  assert.equal(c.pnl, 100);
  near(c.returnPct, (100 / (600 * 50)) * 100);
});

test('ninjatrader: partial rows merge, commission comes out, stop exits and MAE/MFE are read', () => {
  const res = broker('ninjatrader-trades.csv');
  assert.equal(res.format, 'NinjaTrader trades');
  assert.equal(res.trades.length, 2);
  const [win, loss] = res.trades;
  assert.equal(win.symbol, 'ES');
  near(win.pnl, 195.7);
  assert.equal(win.stoppedOut, false);
  near(win.mfePct!, (212.5 / (6000 * 50)) * 100);
  assert.equal(loss.direction, 'short');
  assert.equal(loss.qty, 2);
  assert.equal(loss.fills, 2);
  near(loss.pnl, -208.6);
  assert.equal(loss.stoppedOut, true);
  near(loss.maePct!, -(250 / (6010 * 2 * 50)) * 100);
  assert.equal(loss.entryTime.toISOString(), '2026-03-02T18:05:00.000Z');
});

test('topstepx: offsets in the timestamps win over the chosen zone, fees come out of P&L', () => {
  const res = broker('topstepx-trades.csv', 'America/Los_Angeles');
  assert.equal(res.format, 'TopstepX trades');
  const [a, b] = res.trades;
  assert.equal(a.entryTime.toISOString(), '2026-03-02T14:31:05.000Z');
  near(a.pnl, 19.26);
  assert.equal(b.direction, 'short');
  near(b.pnl, -41.48);
  near(b.returnPct, (-41.48 / (21050 * 2 * 2)) * 100);
});

test('webull: unfilled orders are skipped, options count x100', () => {
  const res = broker('webull-orders.csv', 'America/Los_Angeles');
  assert.equal(res.format, 'Webull orders');
  assert.equal(res.trades.length, 2);
  const [stock, option] = res.trades;
  assert.equal(stock.pnl, 150);
  assert.equal(stock.entryTime.toISOString(), '2026-03-02T14:35:01.000Z');
  near(option.pnl, 120);
  near(option.returnPct, 40);
  assert.match(res.warnings.join(), /1 order with nothing filled/);
});

test('thinkorswim: finds the trade history section, spread legs, futures and stop exits', () => {
  const res = broker('thinkorswim-statement.csv');
  assert.equal(res.format, 'thinkorswim statement');
  assert.deepEqual(res.warnings, []);
  const by = (s: string) => res.trades.find((t) => t.symbol === s)!;
  near(by('AAPL').pnl, -130);
  assert.equal(by('AAPL').stoppedOut, true);
  assert.equal(by('MES').direction, 'short');
  near(by('MES').pnl, 23.75);
  near(by('SPY 20 MAR 26 600 CALL').pnl, 80);
  near(by('SPY 20 MAR 26 605 CALL').pnl, -40);
  assert.equal(by('SPY 20 MAR 26 605 CALL').entryTime.toISOString(), '2026-03-03T14:45:00.000Z');
});

test('ibkr: reads every asset section of an activity statement, skipping subtotals', () => {
  const res = broker('ibkr-activity.csv');
  assert.equal(res.format, 'Interactive Brokers statement');
  assert.deepEqual(res.warnings, []);
  const tsla = res.trades.find((t) => t.symbol === 'TSLA')!;
  const mnq = res.trades.find((t) => t.symbol === 'MNQ')!;
  near(tsla.pnl, 248);
  near(mnq.pnl, 48.76);
});

test('fill list: separate date and time columns, signed quantity, IBKR Flex multiplier and order type', () => {
  const csv = [
    'Symbol,Date,Time,Quantity,TradePrice,IBCommission,Multiplier,OrderType',
    'MNQ,2026-03-02,9:35:00 AM,2,21000,-1.24,2,LMT',
    'MNQ,2026-03-02,9:50:00 AM,-2,20990,-1.24,2,STP',
  ].join('\n');
  const res = parseFile(csv, { timeZone: NY, fileName: 'flex.csv' });
  assert.equal(res.format, 'Fill list');
  const [t] = res.trades;
  assert.equal(t.entryTime.toISOString(), '2026-03-02T14:35:00.000Z');
  near(t.pnl, -10 * 2 * 2 - 2.48);
  assert.equal(t.stoppedOut, true);
});

test('unknown files name every supported format', () => {
  const res = parseFile('a,b\n1,2', { timeZone: NY, fileName: 'x.csv' });
  assert.equal(res.format, 'unknown');
  assert.match(res.warnings[0], /Tradovate.*NinjaTrader.*Webull.*thinkorswim.*Interactive Brokers/);
});
