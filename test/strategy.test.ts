import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AlpacaBar } from '../src/alpaca/types.ts';
import { DEFAULT_STRATEGY } from '../src/server/api.ts';
import { atr, dayChangePct, ema, relativeVolume, sessionVwap, sma } from '../src/strategy/indicators.ts';
import { checkSetup } from '../src/strategy/setup.ts';
import type { SetupInput } from '../src/strategy/setup.ts';

// October 2026 is Eastern Daylight Time: 13:30Z is 9:30 New York.
const at = (day: number, bar: number) => new Date(Date.UTC(2026, 9, day, 13, 30 + 5 * bar)).toISOString();
const bar = (t: string, c: number, v = 1000, spread = 0.02): AlpacaBar => ({ t, o: c, h: c + spread, l: c - spread, c, v });

/** Two sessions (Oct 8 and 9) of 40 five-minute bars, closes rising by `step` per bar from `start`. */
function ramp(start: number, step: number, volume: number): AlpacaBar[] {
  const bars: AlpacaBar[] = [];
  for (const day of [8, 9]) for (let i = 0; i < 40; i++) bars.push(bar(at(day, i), start + step * bars.length, volume));
  return bars;
}
const dailyBars = (n: number, v: number): AlpacaBar[] => Array.from({ length: n }, (_, i) => bar(at(1, i), 100, v));
const byId = (lines: { id: string; pass: boolean | null }[]) => Object.fromEntries(lines.map((l) => [l.id, l.pass]));

test('ema: seeds with the first price and smooths with 2/(n+1)', () => {
  assert.deepEqual(ema([10, 11, 12, 13], 3), [10, 10.5, 11.25, 12.125]);
  assert.deepEqual(ema([], 3), []);
  assert.deepEqual(ema([1, 2], 0), [NaN, NaN]);
});

test('sma: NaN until the window is full', () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2), [NaN, 1.5, 2.5, 3.5]);
});

test('atr: Wilder smoothing after a plain average seed', () => {
  const bars: AlpacaBar[] = [
    { t: at(8, 0), o: 11, h: 12, l: 10, c: 11, v: 1 },
    { t: at(8, 1), o: 12, h: 13, l: 11, c: 12, v: 1 },
    { t: at(8, 2), o: 13, h: 14, l: 12, c: 13, v: 1 },
    { t: at(8, 3), o: 15, h: 16, l: 13, c: 15, v: 1 },
  ];
  const out = atr(bars, 3);
  assert.ok(Number.isNaN(out[0]) && Number.isNaN(out[1]));
  assert.equal(out[2], 2);
  assert.ok(Math.abs(out[3] - 7 / 3) < 1e-12);
});

test('sessionVwap: cumulative typical-price VWAP that resets at each New York date', () => {
  const bars = [bar(at(8, 0), 10, 100, 0), bar(at(8, 1), 20, 100, 0), bar(at(9, 0), 30, 100, 0), bar(at(9, 1), 40, 300, 0)];
  assert.deepEqual(sessionVwap(bars), [10, 15, 30, 37.5]);
  assert.deepEqual(sessionVwap([bar(at(8, 0), 10, 0, 0)]), [NaN]);
});

test('relativeVolume: today versus the 20-day average scaled by the session fraction elapsed', () => {
  const today = Array.from({ length: 5 }, (_, i) => bar(at(9, i), 10, 50));
  const daily = dailyBars(20, 1000);
  assert.equal(relativeVolume(today, daily, 570 + 39), 2.5); // 10% of the session
  assert.equal(relativeVolume(today, daily, 570), 5); // open: clamped to 5%
  assert.equal(relativeVolume(today, daily, 20 * 60), 0.25); // after close: a full day
  assert.equal(relativeVolume(today, [...dailyBars(5, 1e9), ...daily], 570 + 39), 2.5); // only the last 20 days count
  assert.equal(relativeVolume(today, dailyBars(4, 1000), 600), null);
  assert.equal(relativeVolume(today, dailyBars(5, 0), 600), null);
});

test('dayChangePct', () => {
  assert.equal(dayChangePct(105, 100), 5);
  assert.equal(dayChangePct(95, 100), -5);
  assert.equal(dayChangePct(95, 0), null);
});

const NOW = { date: '2026-10-09', minutes: 12 * 60 + 45 }; // half the session elapsed

test('checkSetup: a clean long pullback passes every line', () => {
  // Steady uptrend: price sits just above EMA 9, which sits above EMA 20; today's volume runs 2x normal.
  const input: SetupInput = {
    symbol: 'TEST',
    side: 'long',
    price: null,
    prevClose: 100,
    intraday: ramp(100, 0.05, 25_000),
    daily: dailyBars(20, 1_000_000),
    nowNY: NOW,
  };
  const res = checkSetup(DEFAULT_STRATEGY, input);
  assert.deepEqual(
    res.lines.map((l) => l.id),
    ['price', 'dayChange', 'relVolume', 'trend', 'pullback', 'notExtended', 'vwap', 'emaSlope'],
  );
  assert.deepEqual(
    byId(res.lines),
    { price: true, dayChange: true, relVolume: true, trend: true, pullback: true, notExtended: true, vwap: true, emaSlope: true },
    JSON.stringify(res.lines),
  );
  assert.deepEqual(res.score, { pass: 8, total: 8 });
  assert.deepEqual(res.warnings, []);
  const value = (id: string) => res.lines.find((l) => l.id === id)!.value;
  assert.equal(value('price'), '$103.95');
  assert.equal(value('dayChange'), '+4.0%');
  assert.equal(value('relVolume'), 'RVOL 2.0x');
  assert.equal(value('pullback'), '0.2% above EMA 9');
  assert.equal(res.lines.find((l) => l.id === 'dayChange')!.target, 'at least +3.0%');
});

test('checkSetup: a short into a cheap, rising, thin stock that just dropped below EMA 9 fails every line', () => {
  // Rising EMAs and a session VWAP below price, but the latest print is 4% under the last close:
  // well below EMA 9 (a chase for a short) and still above VWAP.
  const intraday = ramp(1, 0.005, 10);
  const input: SetupInput = {
    symbol: 'TEST',
    side: 'short',
    price: intraday[intraday.length - 1].c * 0.96,
    prevClose: 1,
    intraday,
    daily: dailyBars(20, 1_000_000),
    nowNY: NOW,
  };
  const res = checkSetup(DEFAULT_STRATEGY, input);
  assert.deepEqual(
    byId(res.lines),
    { price: false, dayChange: false, relVolume: false, trend: false, pullback: false, notExtended: false, vwap: false, emaSlope: false },
    JSON.stringify(res.lines),
  );
  assert.deepEqual(res.score, { pass: 0, total: 8 });
  const target = (id: string) => res.lines.find((l) => l.id === id)!.target;
  assert.equal(target('dayChange'), 'at most -3.0%');
  assert.equal(target('notExtended'), 'no more than 2% below EMA 9');
  assert.equal(target('emaSlope'), 'falling');
});

test('checkSetup: missing data gives null lines that count in neither pass nor total', () => {
  const empty = checkSetup(DEFAULT_STRATEGY, {
    symbol: 'TEST',
    side: 'long',
    price: null,
    prevClose: null,
    intraday: [],
    daily: [],
    nowNY: NOW,
  });
  assert.equal(empty.lines.length, 8);
  assert.ok(empty.lines.every((l) => l.pass === null));
  assert.deepEqual(empty.score, { pass: 0, total: 0 });
  assert.ok(empty.warnings.some((w) => w.includes('No daily bars')));
  assert.ok(empty.warnings.some((w) => w.includes('No price')));

  // A price but no previous close, and too few bars for the EMAs: only the price line is judged.
  const thin = checkSetup(DEFAULT_STRATEGY, {
    symbol: 'TEST',
    side: 'long',
    price: 12,
    prevClose: null,
    intraday: ramp(10, 0.01, 100).slice(-5),
    daily: dailyBars(3, 1000),
    nowNY: NOW,
  });
  assert.deepEqual(byId(thin.lines), {
    price: true,
    dayChange: null,
    relVolume: null,
    trend: null,
    pullback: null,
    notExtended: null,
    vwap: true,
    emaSlope: null,
  });
  assert.deepEqual(thin.score, { pass: 2, total: 2 });
  assert.equal(thin.lines.find((l) => l.id === 'trend')!.value, 'only 5 bars');
  assert.ok(thin.warnings.some((w) => w.startsWith('Only 5 5Min bars')));
});

test('checkSetup: trend and VWAP lines are informational when the strategy does not require them', () => {
  const res = checkSetup(
    { ...DEFAULT_STRATEGY, requireTrend: false, requireVwapSide: false },
    { symbol: 'TEST', side: 'long', price: null, prevClose: 100, intraday: ramp(100, 0.05, 25_000), daily: dailyBars(20, 1_000_000), nowNY: NOW },
  );
  const trend = res.lines.find((l) => l.id === 'trend')!;
  assert.equal(trend.pass, null);
  assert.equal(trend.value, 'price above EMA 20, EMA 9 above EMA 20');
  assert.equal(trend.target, 'price and EMA 9 above EMA 20 (not required)');
  assert.equal(res.lines.find((l) => l.id === 'vwap')!.pass, null);
  assert.deepEqual(res.score, { pass: 6, total: 6 });
});
