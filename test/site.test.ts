// Drift tests for the marketing page: every number typed into index.html must equal what the
// engine computes from public/sample-trades.csv, and the site's own rules must mirror the engine.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyze, tagTrades } from '../src/core/analyze.ts';
import { combineTrades, parseFile } from '../src/core/parsers/index.ts';
import { marketClock } from '../src/core/time.ts';
import { SIGNUP } from '../src/web/signup.ts';
import { buildSample, formatSample, lookup } from '../src/web/site/sample.ts';
import { adjusted, badge, verdict } from '../src/web/site/shrink.ts';

const csv = readFileSync(new URL('../public/sample-trades.csv', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const data = buildSample(csv);
const report = data.report;
const ascii = (s: string) => s.replace(/−/g, '-').replace(/\s+/g, ' ').trim();

test('site: tagTrades group counts equal the engine GroupStats.n for every dimension, lanes are 45/38/26/3', () => {
  const trades = combineTrades([parseFile(csv, { timeZone: 'America/New_York', fileName: 'sample.csv' }).trades]);
  const tagged = tagTrades(trades);
  assert.equal(tagged.length, report.summary.trades);
  for (const dim of ['time', 'tradeOfDay', 'afterPrev', 'direction', 'hold'] as const) {
    const d = report.dimensions.find((x) => x.id === dim)!;
    for (const g of d.groups) {
      const n = tagged.filter((t) => t.labels[dim] === g.label).length;
      assert.equal(n, g.n, `${dim} / ${g.label}`);
    }
  }
  const lanes = [0, 0, 0, 0];
  for (const t of tagged) lanes[Math.min(4, t.tradeOfDay) - 1]++;
  assert.deepEqual(lanes, [45, 38, 26, 3]);
  const dots = [0, 0, 0, 0];
  for (const d of data.dots) dots[Math.min(4, d.tradeOfDay) - 1]++;
  assert.deepEqual(dots, [45, 38, 26, 3]);
  assert.equal(data.equity.length, 113);
});

test('site: every data-sample in index.html equals the engine value after formatting', () => {
  const re = /<(\w+)([^>]*)\sdata-sample="([^"]+)"([^>]*)>([^<]*)</g;
  let m: RegExpExecArray | null;
  let checked = 0;
  const bad: string[] = [];
  while ((m = re.exec(html))) {
    const attrs = `${m[2]} ${m[4]}`;
    const path = m[3];
    const fmt = /data-format="([^"]+)"/.exec(attrs)?.[1];
    const typed = ascii(m[5]);
    const value = lookup(data, path);
    assert.notEqual(value, undefined, `unknown sample path ${path}`);
    const engine = ascii(formatSample(value, fmt));
    if (typed !== engine) bad.push(`${path}: html="${typed}" engine="${engine}"`);
    checked++;
  }
  assert.ok(checked >= 60, `only ${checked} bindings found`);
  assert.deepEqual(bad, []);
});

test('site: shrink-lab reference values match the spec', () => {
  const overall = report.summary.avgReturn;
  const cases: [number, number, string, string, string][] = [
    [-1.17, 3, '-0.01', 'few', 'nothing, too few trades'],
    [-1.17, 5, '-0.17', 'early', 'a leak (early signal)'],
    [4, 3, '1.18', 'few', 'nothing, too few trades'],
    [4, 5, '1.56', 'early', 'an edge (early signal)'],
    [4, 15, '2.53', 'solid', 'an edge (solid)'],
    [0.94, 45, '0.83', 'solid', 'an edge (solid)'],
    [0.94, 1, '0.39', 'few', 'nothing, too few trades'],
  ];
  for (const [raw, n, adj, b, v] of cases) {
    assert.equal(adjusted(n, raw, overall).toFixed(2), adj, `adjusted(${raw}, ${n})`);
    assert.equal(badge(n), b);
    assert.equal(verdict(n, raw, overall), v, `verdict(${raw}, ${n})`);
  }
});

test('site: the waitlist band posts to the same endpoint signup.ts builds', () => {
  const action = /<form class="signup-form" id="signup-form"[^>]*action="([^"]+)"/.exec(html)?.[1];
  assert.equal(SIGNUP.provider, 'buttondown');
  assert.equal(action, `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(SIGNUP.id.trim())}`);
  assert.match(html, /<input type="email" id="signup-email" name="email"/);
});

test('site: the three copy trades exist with the contexts the page quotes', () => {
  const find = (sym: string, dir: string, date: string) => data.tagged.find((t) => t.trade.symbol === sym && t.trade.direction === dir && marketClock(t.trade.entryTime).date === date)!;
  const orbx = find('ORBX', 'short', '2026-04-09');
  assert.ok(orbx);
  assert.equal(orbx.minutes, 11 * 60 + 15);
  assert.equal(orbx.tradeOfDay, 3);
  assert.equal(orbx.prev, 'quick-after-loss');
  assert.equal(orbx.labels.time, '10:15–11:30');
  const lumn5 = find('LUMN', 'long', '2026-03-05');
  assert.ok(lumn5);
  assert.equal(lumn5.minutes, 9 * 60 + 42);
  assert.equal(lumn5.tradeOfDay, 1);
  assert.equal(lumn5.labels.time, '9:30–9:45');
  const lumn3 = find('LUMN', 'long', '2026-03-03');
  assert.ok(lumn3);
  assert.equal(lumn3.trade.fills, 6);
  assert.equal(lumn3.overnight, true);
});

test('site: Step 0 risk numbers and the derived stop-lab counts', () => {
  assert.equal(report.risk.hasExcursions, true);
  assert.equal(report.risk.pastStop, 33);
  assert.equal(report.risk.pastStopCameBack, 7);
  assert.equal(report.risk.returnWithStop.toFixed(1), '13.2');
  assert.equal(data.neverNear + data.stayedRed + report.risk.pastStopCameBack, report.summary.trades);
  assert.equal(data.neverNear, 79);
  assert.equal(data.stayedRed, 26);
  assert.equal(data.stopAt['1.5'].returnWithStop.toFixed(1), '18.0');
  assert.equal(data.stopAt['3'].returnWithStop.toFixed(1), '35.5');
  assert.equal(analyze(data.tagged.map((t) => t.trade), { stopPct: 2 }).risk.pastStop, 33);
  assert.equal(lookup(data, 'fills.rows'), 232);
  assert.equal(lookup(data, 'fills.kb'), 12);
});
