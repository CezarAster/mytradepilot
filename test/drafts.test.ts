// The draft-rules logic and the interval rule off the sample (content spec 4.1): the fill-to-three order, the
// cite / no-number decision, the typical-day fallback, the cooldown path, and ci95's edge cases.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, tagTrades, type GroupStats } from '../src/core/analyze.ts';
import { draftRules, medianTradesPerDay, recordFor } from '../src/core/drafts.ts';
import { parseFile } from '../src/core/parsers/index.ts';
import { ci95, excludes, median, sampleSd } from '../src/core/stats.ts';

const group = (n: number, avgReturn: number, confidence: GroupStats['confidence']): GroupStats => ({
  label: 'x',
  phrase: 'x',
  n,
  winRate: 0.5,
  avgReturn,
  adjReturn: avgReturn,
  avgWin: null,
  avgLoss: null,
  totalPnl: -100,
  totalReturn: n * avgReturn,
  confidence,
});

/**
 * A small fills file: `days` days, `perDay` round trips a day, the first a winner and the rest losers so the day's later
 * trades leak. Entry times drift 17 minutes a day so no time bucket holds exactly the same trades as a trade-of-day
 * group (the engine de-duplicates identical groups across dimensions, keeping the first dimension's).
 */
function fills(days: number, perDay: number, gapMin = 30): string {
  const rows = ['Symbol,Side,Qty,Price,Time,Commission'];
  for (let d = 0; d < days; d++) {
    const day = `2026-03-${String(2 + d).padStart(2, '0')}`;
    for (let k = 0; k < perDay; k++) {
      const start = 35 + d * 17 + k * (gapMin + 10);
      const h = 9 + Math.floor(start / 60);
      const m = start % 60;
      const entry = `${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const exitM = m + 10;
      const exit = `${day} ${String(h + Math.floor(exitM / 60)).padStart(2, '0')}:${String(exitM % 60).padStart(2, '0')}`;
      rows.push(`ABC,Buy,100,10.00,${entry},1`, `ABC,Sell,100,${k === 0 ? '10.20' : '9.90'},${exit},1`);
    }
  }
  return rows.join('\n');
}

test('stats: ci95 is the normal-approximation interval with the sample sd, null under two values', () => {
  assert.equal(ci95([]), null);
  assert.equal(ci95([1]), null);
  const xs = [1, 2, 3, 4, 5];
  assert.equal(sampleSd(xs)!.toFixed(4), '1.5811');
  const [lo, hi] = ci95(xs)!;
  assert.equal(((lo + hi) / 2).toFixed(6), '3.000000');
  assert.equal((hi - lo).toFixed(4), (2 * 1.96 * (1.5811388300841898 / Math.sqrt(5))).toFixed(4));
  assert.equal(excludes([lo, hi], 0), true);
  assert.equal(excludes([lo, hi], 3), false);
  assert.equal(excludes(null, 3), false);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
});

test('drafts: a record cites only when solid and the interval excludes the average', () => {
  const far = Array.from({ length: 20 }, (_, i) => -1 + (i % 2 ? 0.1 : -0.1));
  const cited = recordFor(group(20, -1, 'solid'), far, 0.33);
  assert.equal(cited.cited, true);
  const near = Array.from({ length: 20 }, (_, i) => (i % 2 ? 2 : -2));
  const includes = recordFor(group(20, 0, 'solid'), near, 0.33);
  assert.deepEqual(includes, { cited: false, reason: 'not clearly away from your average', n: 20 });
  assert.deepEqual(recordFor(group(13, -1, 'early signal'), far.slice(0, 13), 0.33), { cited: false, reason: 'early signal', n: 13 });
  assert.deepEqual(recordFor(group(4, -1, 'too few'), far.slice(0, 4), 0.33), { cited: false, reason: 'too few', n: 4 });
});

test('drafts: with no leaks the three are the typical day, the stop and the size, in that order', () => {
  const csv = fills(6, 1);
  const trades = parseFile(csv, { timeZone: 'America/New_York', fileName: 'f.csv' }).trades;
  const report = analyze(trades, { stopPct: 2 });
  const tagged = tagTrades(trades);
  assert.equal(report.leaks.length, 0);
  const { drafts, notRules, notRuleLine } = draftRules(report, tagged);
  assert.deepEqual(drafts.map((d) => d.kind), ['maxTrades', 'stopAttached', 'size']);
  assert.equal(medianTradesPerDay(tagged), 1);
  assert.equal(drafts[0].sentence, 'I stop after 1 trade a day.');
  assert.equal(drafts[0].tag, 'Draft 1 · from your typical day, not a statistic');
  assert.equal(drafts[1].tag, 'Draft 2 · your rule, no number');
  assert.equal(drafts[2].tag, 'Draft 3 · your rule, no number');
  assert.ok(drafts.every((d) => !d.record.cited));
  assert.deepEqual(notRules, []);
  assert.equal(notRuleLine, '');
});

test('drafts: a losing 2nd trade of the day drafts max 1 with no number under 15 trades', () => {
  const csv = fills(8, 2);
  const trades = parseFile(csv, { timeZone: 'America/New_York', fileName: 'f.csv' }).trades;
  const report = analyze(trades, { stopPct: 2 });
  const tagged = tagTrades(trades);
  const second = report.dimensions.find((d) => d.id === 'tradeOfDay')!.groups.find((g) => g.label === '2nd')!;
  assert.equal(second.n, 8);
  assert.ok(second.avgReturn < 0);
  const { drafts } = draftRules(report, tagged);
  assert.equal(drafts.length, 3);
  const max = drafts.find((d) => d.kind === 'maxTrades')!;
  assert.equal(max.sentence, 'I stop after 1 trade a day.');
  assert.equal(max.heldLine, 'Held by: red once your 1st trade is in; a 2nd fill is flattened.');
  assert.equal(max.record.cited, false, 'eight trades is an early signal, so no number');
  assert.ok(/early signal/.test(max.recordLine));
  // Every second trade here follows a win, so no re-entry or cooldown draft exists; the stop fills the third slot.
  assert.deepEqual(drafts.map((d) => d.kind), ['maxTrades', 'stopAttached', 'size']);
});

test('drafts: the engine order puts cited drafts first and never returns more than three', () => {
  const csv = fills(20, 3, 5);
  const trades = parseFile(csv, { timeZone: 'America/New_York', fileName: 'f.csv' }).trades;
  const report = analyze(trades, { stopPct: 2 });
  const { drafts } = draftRules(report, tagTrades(trades));
  assert.equal(drafts.length, 3);
  const firstUncited = drafts.findIndex((d) => !d.record.cited);
  const lastCited = drafts.map((d) => d.record.cited).lastIndexOf(true);
  assert.ok(firstUncited < 0 || lastCited < 0 || lastCited < firstUncited, 'cited drafts come first');
  drafts.forEach((d, i) => assert.ok(d.tag.startsWith(`Draft ${i + 1} · `)));
  for (const d of drafts) assert.ok(d.sentence.length <= 120);
});
