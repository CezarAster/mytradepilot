// Drift tests for the site (build spec 7.5): the typed numbers in index.html must equal the engine's output
// on public/sample-trades.csv, and the sample must still carry the trades the copy talks about.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyze, tagTrades } from '../src/core/analyze.ts';
import { combineTrades, parseFile } from '../src/core/parsers/index.ts';
import { marketClock } from '../src/core/time.ts';
import { SIGNUP } from '../src/web/signup.ts';
import { buildSampleData, sampleText, shrinkAdjusted, shrinkVerdict } from '../src/web/site/sample.ts';

const csv = readFileSync(new URL('../public/sample-trades.csv', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const data = buildSampleData(csv);
const norm = (s: string) => s.replace(/−/g, '-').replace(/\s+/g, ' ').trim();

test('site: tagTrades group counts equal the engine GroupStats.n for every dimension; lanes are 45/38/26/3', () => {
  const trades = combineTrades([parseFile(csv, { timeZone: 'America/New_York', fileName: 'sample.csv' }).trades]);
  const report = analyze(trades, { stopPct: 2 });
  const tagged = tagTrades(trades);
  assert.equal(tagged.length, report.summary.trades);
  for (const dim of ['time', 'tradeOfDay', 'afterPrev', 'direction', 'hold'] as const) {
    const d = report.dimensions.find((x) => x.id === dim)!;
    for (const g of d.groups) assert.equal(tagged.filter((t) => t.labels[dim] === g.label).length, g.n, `${dim} / ${g.label}`);
  }
  const lanes = [0, 0, 0, 0];
  for (const t of tagged) lanes[Math.min(4, t.tradeOfDay) - 1]++;
  assert.deepEqual(lanes, [45, 38, 26, 3]);
  assert.deepEqual(
    data.dots.map((d) => Math.min(4, d.tradeOfDay)).reduce((acc, l) => ((acc[l - 1] += 1), acc), [0, 0, 0, 0]),
    [45, 38, 26, 3],
  );
});

test('site: every data-sample in index.html equals the engine value after formatting', () => {
  const re = /<([a-z0-9]+)\b([^>]*?)\sdata-sample="([^"]+)"([^>]*)>([^<]*)<\/\1>/g;
  let count = 0;
  for (const m of html.matchAll(re)) {
    const attrs = `${m[2]} ${m[4]}`;
    const fmt = /data-format="([^"]+)"/.exec(attrs)?.[1] ?? 'text';
    const expected = sampleText(data, m[3], fmt);
    assert.notEqual(expected, null, `no engine value for ${m[3]}`);
    assert.equal(norm(m[5]), norm(expected!), `sample drift: ${m[3]}`);
    count++;
  }
  assert.ok(count >= 60, `only ${count} data-sample bindings found`);
  // The typed hero labels and the file card follow the same numbers.
  assert.equal(Math.round(data.bytes / 1024), 12);
  assert.equal(data.csvLines.length - 1, 232);
  const eq = data.equity;
  assert.equal(eq.length, 113);
  assert.equal(Math.round(Math.min(...eq)), -774);
  assert.equal(Math.round(Math.max(...eq)), 3441);
  assert.equal(Math.round(eq[eq.length - 1]), 3238);
  assert.ok(/−\$774 trough|−\$774, peak \$3,441, end \$3,238/.test(html));
});

test('site: the shrink lab reproduces the reference values of spec 6.4', () => {
  const overall = data.report.summary.avgReturn;
  const cases: [number, number, string, string][] = [
    [-1.17, 3, '-0.01', 'nothing, too few trades'],
    [-1.17, 5, '-0.17', 'a leak (early signal)'],
    [4, 3, '1.18', 'nothing, too few trades'],
    [4, 5, '1.56', 'an edge (early signal)'],
    [4, 15, '2.53', 'an edge (solid)'],
    [0.94, 45, '0.83', 'an edge (solid)'],
    [0.94, 1, '0.39', 'nothing, too few trades'],
    [3, 3, '0.95', 'nothing, too few trades'],
    [3, 20, '2.11', 'an edge (solid)'],
  ];
  for (const [raw, n, adj, verdict] of cases) {
    assert.equal(shrinkAdjusted(n, raw, overall).toFixed(2), adj, `(${raw}, ${n})`);
    assert.equal(shrinkVerdict(n, raw, overall), verdict, `(${raw}, ${n})`);
  }
});

test('site: the waitlist band posts to the URL built from SIGNUP.id', () => {
  const action = /<form[^>]*id="signup-form"[^>]*action="([^"]+)"/.exec(html)?.[1];
  assert.equal(SIGNUP.provider, 'buttondown');
  assert.equal(action, `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(SIGNUP.id.trim())}`);
  assert.ok(/<form[^>]*id="signup-form"[^>]*method="post"/.test(html));
  assert.ok(/<input[^>]*id="signup-email"[^>]*name="email"/.test(html));
});

test('site: the three trades used in the copy exist with their contexts', () => {
  const find = (sym: string, date: string, hm: string) =>
    data.tagged.find((t) => {
      const c = marketClock(t.trade.entryTime);
      return t.trade.symbol === sym && c.date === date && `${Math.floor(c.minutes / 60)}:${String(c.minutes % 60).padStart(2, '0')}` === hm;
    });
  const orbx = find('ORBX', '2026-04-09', '11:15')!;
  assert.ok(orbx);
  assert.equal(orbx.trade.direction, 'short');
  assert.equal(orbx.tradeOfDay, 3);
  assert.equal(orbx.prev, 'quick-after-loss');
  assert.equal(orbx.labels.time, '10:15–11:30');
  const lumn = find('LUMN', '2026-03-05', '9:42')!;
  assert.ok(lumn);
  assert.equal(lumn.trade.direction, 'long');
  assert.equal(lumn.tradeOfDay, 1);
  assert.equal(lumn.labels.time, '9:30–9:45');
  const overnight = find('LUMN', '2026-03-03', '9:31')!;
  assert.ok(overnight);
  assert.equal(overnight.trade.direction, 'long');
  assert.equal(overnight.trade.fills, 6);
  assert.equal(overnight.overnight, true);
});

test('site: Step 0 turned on the stop check with 33 past, 7 back, +13.2%', () => {
  const r = data.report.risk;
  assert.equal(r.hasExcursions, true);
  assert.equal(r.pastStop, 33);
  assert.equal(r.pastStopCameBack, 7);
  assert.equal(r.returnWithStop.toFixed(1), '13.2');
  assert.equal(data.stopAt['1.5'].returnWithStop.toFixed(1), '18.0');
  assert.equal(data.stopAt['3'].returnWithStop.toFixed(1), '35.5');
  assert.equal(data.neverNear, 79);
  assert.equal(data.stayedRed, 26);
  assert.equal(data.cameBackPoints.toFixed(2), '16.25');
  assert.equal(data.stayedRedPoints.toFixed(2), '-58.12');
});
