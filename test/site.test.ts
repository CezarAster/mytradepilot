// Drift checks for the marketing page: every number typed into index.html must equal what the engine
// computes from public/sample-trades.csv, the story's lanes must hold the engine's group counts, the
// shrink lab must reproduce the rule, and the waitlist markup must post where signup.ts posts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { analyze, tagTrades } from '../src/core/analyze.ts';
import { combineTrades, parseFile } from '../src/core/parsers/index.ts';
import { SIGNUP } from '../src/web/signup.ts';
import { buildSample, formatSample, resolveSample, shrink } from '../src/web/site/sample.ts';

const csv = readFileSync(new URL('../public/sample-trades.csv', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const data = buildSample(csv);
const ascii = (s: string) => s.replace(/−/g, '-').replace(/\s+/g, ' ').trim();

test('site: tagTrades buckets every closed trade exactly like the report dimensions', () => {
  const trades = combineTrades([parseFile(csv, { timeZone: 'America/New_York', fileName: 'sample.csv' }).trades]);
  const report = analyze(trades, { stopPct: 2 });
  const tagged = tagTrades(trades);
  assert.equal(tagged.length, report.summary.trades);
  for (const dim of report.dimensions) {
    for (const g of dim.groups) {
      const n = tagged.filter((t) => {
        if (dim.id === 'weekday') return t.weekday === g.label;
        if (dim.id === 'symbol') return t.trade.symbol === g.label;
        return t.labels[dim.id as keyof typeof t.labels] === g.label;
      }).length;
      assert.equal(n, g.n, `${dim.id} / ${g.label}`);
    }
  }
  const lanes = [0, 0, 0, 0];
  for (const t of tagged) lanes[Math.min(4, t.tradeOfDay) - 1]++;
  assert.deepEqual(lanes, [45, 38, 26, 3]);
  assert.equal(data.dots.length, 112);
  assert.equal(data.equity.length, 113);
});

test('site: every data-sample in index.html equals the engine value after formatting', () => {
  const tagRe = /<(\w+)\b([^>]*?)\bdata-sample="([^"]+)"([^>]*)>([^<]*)</g;
  let count = 0;
  for (const m of html.matchAll(tagRe)) {
    const attrs = `${m[2]} ${m[4]}`;
    const path = m[3];
    const fmt = /data-format="([^"]+)"/.exec(attrs)?.[1];
    const value = resolveSample(data, path);
    assert.notEqual(value, undefined, `unknown data-sample path ${path}`);
    assert.equal(ascii(m[5]), ascii(formatSample(value, fmt)), `data-sample="${path}"`);
    count++;
  }
  assert.ok(count >= 60, `found only ${count} data-sample bindings`);
  const rawRe = /data-raw="([^"]+)"[^>]*data-raw-sample="([^"]+)"/g;
  let raws = 0;
  for (const m of html.matchAll(rawRe)) {
    const value = resolveSample(data, m[2]);
    assert.equal(typeof value, 'number', m[2]);
    assert.equal(Number(m[1]).toFixed(2), (value as number).toFixed(2), `data-raw for ${m[2]}`);
    raws++;
  }
  assert.equal(raws, 4);
});

test('site: the shrink lab reproduces the engine rule on the reference values', () => {
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
  for (const [raw, n, adj, label] of cases) {
    const r = shrink(raw, n, overall);
    assert.equal(r.adjusted.toFixed(2), adj, `${raw} / ${n}`);
    assert.equal(r.label, label, `${raw} / ${n}`);
  }
  // the group's own adjusted value matches the engine's adjReturn
  const g = data.report.dimensions.find((d) => d.id === 'tradeOfDay')!.groups.find((x) => x.label === '1st')!;
  assert.ok(Math.abs(shrink(g.avgReturn, g.n, overall).adjusted - g.adjReturn) < 1e-9);
});

test('site: the waitlist band posts to the same endpoint signup.ts posts to', () => {
  assert.equal(SIGNUP.provider, 'buttondown');
  const url = `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(SIGNUP.id.trim())}`;
  const form = /<form class="signup-form" id="signup-form"[^>]*action="([^"]+)"[^>]*method="post"[^>]*target="_blank"/.exec(html);
  assert.ok(form, 'band form markup');
  assert.equal(form![1], url);
  assert.ok(/id="signup-email" name="email"/.test(html));
  assert.ok(/id="signup-email-2"/.test(html));
});

test('site: the three trades quoted in the copy exist with the contexts the page claims', () => {
  const find = (sym: string, date: string, entry: string) => data.dots.find((d) => d.sym === sym && d.date === date && d.entry === entry);
  const orbx = find('ORBX', '2026-04-09', '11:15')!;
  assert.ok(orbx, 'ORBX short Apr 9');
  assert.equal(orbx.dir, 'short');
  assert.equal(orbx.tradeOfDay, 3);
  assert.equal(orbx.prev, 'quick-after-loss');
  const lumn = find('LUMN', '2026-03-05', '9:42')!;
  assert.ok(lumn, 'LUMN long Mar 5');
  assert.equal(lumn.dir, 'long');
  assert.equal(lumn.tradeOfDay, 1);
  assert.ok(lumn.ret > 0);
  const six = find('LUMN', '2026-03-03', '9:31')!;
  assert.ok(six, 'LUMN long Mar 3');
  assert.equal(six.dir, 'long');
  assert.equal(six.fills, 6);
  assert.equal(six.overnight, true);
  // the page names these labels for the ORBX row
  const t = data.tagged.find((x) => x.trade.symbol === 'ORBX' && x.date === '2026-04-09' && x.tradeOfDay === 3)!;
  assert.deepEqual([t.labels.tradeOfDay, t.labels.afterPrev, t.labels.direction, t.labels.time], ['3rd', '< 10 min after a loss', 'Short', '10:15–11:30']);
});

test('site: Step 0 gives the stop check its numbers (33 past -2%, 7 came back, +13.2%)', () => {
  const r = data.report.risk;
  assert.equal(r.hasExcursions, true);
  assert.equal(r.pastStop, 33);
  assert.equal(r.pastStopCameBack, 7);
  assert.equal(r.returnWithStop.toFixed(1), '13.2');
  assert.equal(data.stopAt['1.5'].returnWithStop.toFixed(1), '18.0');
  assert.equal(data.stopAt['3'].returnWithStop.toFixed(1), '35.5');
  assert.equal(data.neverNear, 79);
  assert.equal(data.stayedRed, 26);
  // 12,334 bytes as make-sample.py writes it (CRLF); 12,101 after git's eol=lf normalisation on checkout
  assert.ok([12334, 12101].includes(data.bytes), `sample is ${data.bytes} bytes`);
  assert.equal(resolveSample(data, 'fills.rows'), 232);
  assert.equal(resolveSample(data, 'fills.kb'), 12);
});
