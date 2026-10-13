// Drift tests for the site (build spec 7.5; content spec 7.2 and 8): the typed numbers in index.html must equal the
// engine's output on public/sample-trades.csv, the sample must still carry the trades the copy talks about, the three
// drafts must read as typed, every what-if figure must carry the hypothetical-results statement directly beneath it,
// and the phrasing the strategy forbids must appear nowhere on the page or in the rendered report.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyze, tagTrades } from '../src/core/analyze.ts';
import { draftRules, medianTradesPerDay } from '../src/core/drafts.ts';
import { combineTrades, parseFile } from '../src/core/parsers/index.ts';
import { ci95, excludes } from '../src/core/stats.ts';
import { marketClock } from '../src/core/time.ts';
import { STATEMENT } from '../src/web/legal.ts';
import { REPORT_FOOTER, render } from '../src/web/report.ts';
import { INVITE_TEXT, SIGNUP } from '../src/web/signup.ts';
import { buildSampleData, sampleText, shrinkAdjusted, shrinkCall } from '../src/web/site/sample.ts';

const root = new URL('..', import.meta.url).pathname;
const csv = readFileSync(join(root, 'public/sample-trades.csv'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const data = buildSampleData(csv);
const norm = (s: string) => s.replace(/−/g, '-').replace(/\s+/g, ' ').trim();
const trades = combineTrades([parseFile(csv, { timeZone: 'America/New_York', fileName: 'sample.csv' }).trades]);
const report = analyze(trades, { stopPct: 2 });
const tagged = tagTrades(trades);
const rendered = render(report, [], trades);

/* ---------- tiny HTML helpers (no DOM in node): balanced outer HTML, text, adjacency ---------- */

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** The outer HTML of the element whose opening `<` is at `start`. */
function outerHtml(src: string, start: number): string {
  const open = /^<([a-zA-Z0-9]+)/.exec(src.slice(start));
  if (!open) throw new Error(`no tag at ${start}`);
  const name = open[1].toLowerCase();
  if (VOID.has(name)) return src.slice(start, src.indexOf('>', start) + 1);
  const re = new RegExp(`<(/?)${name}\\b[^>]*?(/?)>`, 'gi');
  re.lastIndex = start;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (m[1]) depth--;
    else if (!m[2]) depth++;
    if (depth === 0) return src.slice(start, m.index + m[0].length);
  }
  throw new Error(`unbalanced <${name}> at ${start}`);
}

/** The element carrying id="…", as outer HTML, or null. */
function byId(src: string, id: string): string | null {
  const at = src.indexOf(`id="${id}"`);
  if (at < 0) return null;
  return outerHtml(src, src.lastIndexOf('<', at));
}

const text = (fragment: string) =>
  norm(
    fragment
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      .replace(/&nbsp;/g, ' '),
  );

/** Every `[data-whatif]` element must be immediately followed (whitespace only) by a `.cftc-441` holding the full statement. */
function assertAdjacency(src: string, where: string): number {
  let count = 0;
  const re = /<[a-zA-Z0-9]+\b[^>]*\sdata-whatif(?:=|\s|>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const outer = outerHtml(src, m.index);
    const after = src.slice(m.index + outer.length).replace(/^\s+/, '');
    const next = /^<([a-zA-Z0-9]+)\b[^>]*class="([^"]*)"/.exec(after);
    assert.ok(next && /\bcftc-441\b/.test(next[2]), `${where}: a what-if figure is not followed by .cftc-441: ${outer.slice(0, 80)}…`);
    assert.ok(norm(text(outerHtml(after, 0))).includes(norm(STATEMENT)), `${where}: the statement under a what-if figure is not the full text`);
    count++;
  }
  return count;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/* ---------- the engine on the sample: tags, lanes, numbers ---------- */

test('site: tagTrades group counts equal the engine GroupStats.n for every dimension; lanes are 45/38/26/3', () => {
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
  const heads = new Set<string>();
  for (const m of html.matchAll(re)) {
    const attrs = `${m[2]} ${m[4]}`;
    const fmt = /data-format="([^"]+)"/.exec(attrs)?.[1] ?? 'text';
    const expected = sampleText(data, m[3], fmt);
    assert.notEqual(expected, null, `no engine value for ${m[3]}`);
    assert.equal(norm(m[5]), norm(expected!), `sample drift: ${m[3]}`);
    heads.add(m[3].split('.')[0]);
    count++;
  }
  assert.ok(count >= 60, `only ${count} data-sample bindings found`);
  for (const head of ['ci', 'trade', 'drafts']) assert.ok(heads.has(head), `no ${head}.* binding in index.html`);
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
  for (const [raw, n, adj, call] of cases) {
    assert.equal(shrinkAdjusted(n, raw, overall).toFixed(2), adj, `(${raw}, ${n})`);
    assert.equal(shrinkCall(n, raw, overall), call, `(${raw}, ${n})`);
  }
  assert.ok(byId(html, 'shrink-call'), '#shrink-call is missing');
});

test('site: the waitlist band posts to the URL built from SIGNUP.id, with the platform and partner tags', () => {
  const form = byId(html, 'signup-form')!;
  assert.ok(form);
  const open = form.slice(0, form.indexOf('>') + 1);
  assert.equal(SIGNUP.provider, 'buttondown');
  assert.equal(/action="([^"]+)"/.exec(open)?.[1], `https://buttondown.com/api/emails/embed-subscribe/${encodeURIComponent(SIGNUP.id.trim())}`);
  assert.ok(/method="post"/.test(open));
  const field = (id: string) => {
    const el = byId(html, id);
    assert.ok(el, `#${id} is missing`);
    return el!.slice(0, el!.indexOf('>') + 1);
  };
  assert.ok(/name="email"/.test(field('signup-email')));
  assert.ok(/name="tag"/.test(field('signup-platform')));
  assert.ok(/name="tag"/.test(field('signup-partner')));
  assert.ok(/value="partner-in-mind"/.test(field('signup-partner')));
  const options = byId(html, 'signup-platform')!.match(/<option\b/g) ?? [];
  assert.equal(options.length, 8, 'seven platform options plus the empty first option');
  const invite = byId(html, 'signup-invite');
  assert.ok(invite, '#signup-invite is missing');
  const ta = /<textarea\b[^>]*>([\s\S]*?)<\/textarea>/.exec(invite!);
  assert.ok(ta, 'the invite textarea is missing');
  assert.equal(text(ta![1]), norm(INVITE_TEXT));
});

test('site: the trades used in the copy exist with their contexts', () => {
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
  const hydr = find('HYDR', '2026-04-09', '10:00')!;
  assert.ok(hydr);
  assert.equal(hydr.trade.direction, 'short');
  assert.ok(hydr.trade.pnl < 0);
  assert.equal(sampleText(data, 'trade.2026-04-09.HYDR.10:00.exit', 'text'), '11:12');
  assert.equal(sampleText(data, 'trade.2026-04-09.ORBX.11:15.entry', 'text'), '11:15');
  assert.equal(sampleText(data, 'trade.2026-04-09.ORBX.11:15.gapMin', 'int'), '3');
  assert.equal(sampleText(data, 'trade.2026-04-09.ORBX.11:15.tradeOfDay', 'int'), '3');
  const mar11 = find('ORBX', '2026-03-11', '11:29')!;
  assert.ok(mar11);
  assert.equal(mar11.prev, 'quick-after-loss');
  assert.ok(mar11.trade.pnl > 0);
});

test('site: the stop check on the sample is 33 past, 7 back, +13.2%', () => {
  const r = data.report.risk;
  assert.equal(r.hasExcursions, true);
  assert.equal(r.pastStop, 33);
  assert.equal(r.pastStopCameBack, 7);
  assert.equal(r.returnWithStop.toFixed(1), '13.2');
});

/* ---------- the draft rules and the interval rule ---------- */

test('site: ci95 on the 3rd-trade cell is [-1.53, -0.10] and excludes the mean; quick re-entries are 13; median day is 3', () => {
  const third = tagged.filter((t) => t.labels.tradeOfDay === '3rd').map((t) => t.trade.returnPct);
  const ci = ci95(third)!;
  assert.ok(ci);
  assert.deepEqual(ci.map((x) => x.toFixed(2)), ['-1.53', '-0.10']);
  assert.ok(excludes(ci, report.summary.avgReturn));
  assert.equal(sampleText(data, 'ci.tradeOfDay.3rd.lo', 'pct'), '−1.53%');
  assert.equal(sampleText(data, 'ci.tradeOfDay.3rd.hi', 'pct'), '−0.10%');
  const quick = report.dimensions.find((d) => d.id === 'afterPrev')!.groups.find((g) => g.label === '< 10 min after a loss')!;
  assert.equal(quick.n, 13);
  assert.equal(quick.confidence, 'early signal');
  assert.equal(medianTradesPerDay(tagged), 3);
});

test('site: draftRules on the sample returns the three typed cards and the one not-a-rule line', () => {
  const { drafts, notRules, notRuleLine } = draftRules(report, tagged);
  const cards = drafts.map((d) => [d.tag, d.sentence, norm(d.recordLine), norm(d.heldLine)]);
  assert.deepEqual(cards, [
    [
      'Draft 1 · cites your record',
      'I stop after 2 trades a day.',
      'Your record shows: 26 third trades of the day, 42% winners, -0.81% a trade, net -$2,346. Solid: n = 26, 95% interval -1.53% to -0.10%, which excludes your average of +0.33%.',
      'Held by: red once your 2nd trade is in; a 3rd fill is flattened.',
    ],
    [
      'Draft 2 · your rule, no number',
      "I don't enter within 10 minutes of a losing exit.",
      'Your record has 13 re-entries inside 10 minutes of a loss: an early signal, under the 15 trades a draft needs before it cites a number. This is your rule, not a statistic.',
      'Held by: red at the losing exit; a fill inside 10 minutes is flattened.',
    ],
    [
      'Draft 3 · your rule, no number',
      'A stop is on within 15 seconds of every fill. I never widen it.',
      "A fills export can't show whether a stop was attached or moved, so this draft never carries a number. The Referee's live feed can see both.",
      'Held by: a fill with no stop at 15 seconds, or a stop moved away from price, is flattened.',
    ],
  ]);
  assert.deepEqual(drafts.map((d) => d.kind), ['maxTrades', 'noReentry', 'stopAttached']);
  assert.deepEqual(notRules, ['your shorts, 33 trades, 52% win, -0.11% a trade (solid)']);
  assert.equal(notRuleLine, 'Also in your record, not a Referee rule: your shorts, 33 trades, 52% win, -0.11% a trade (solid). The Referee has no direction rule. Yours to hold by hand.');
  assert.equal(sampleText(data, 'drafts.0.sentence', 'text'), 'I stop after 2 trades a day.');
  assert.equal(sampleText(data, 'drafts.1.tag', 'text'), 'Draft 2 · your rule, no number');
});

/* ---------- the rendered sample report ---------- */

test('site: the rendered sample report carries the new leak sentence, the statement under both what-ifs, the drafts and the footer', () => {
  assert.ok(/Without them, your total would have been \+58\.5% instead of \+37\.3%/.test(rendered));
  assert.equal(assertAdjacency(rendered, 'report'), 2, 'two what-if figures: the leaks list and the stop paragraph');
  const drafts = byId(rendered, 'drafts')!;
  assert.ok(drafts, '#drafts is missing from the report');
  assert.equal((drafts.match(/class="draft"/g) ?? []).length, 3);
  assert.equal((drafts.match(/data-draft-sentence/g) ?? []).length, 3);
  assert.ok(!/data-whatif|cftc-441/.test(drafts), 'the drafts block carries no what-if and no statement');
  assert.ok(text(drafts).includes('I stop after 2 trades a day.'));
  assert.ok(text(drafts).includes('Also in your record, not a Referee rule: your shorts'));
  assert.ok(/data-action="enforce"/.test(drafts) && /data-action="copy-rules"/.test(drafts));
  assert.ok(rendered.trimEnd().endsWith(`${REPORT_FOOTER}</p>`), 'the footer line is rendered last');
  const afterDrafts = rendered.indexOf('id="drafts"') < rendered.indexOf(REPORT_FOOTER);
  assert.ok(afterDrafts);
  const noExcursions = render(analyze(trades.map((t) => ({ ...t, maePct: null })), { stopPct: 2 }), [], trades);
  assert.ok(/so the stop check is left out\./.test(noExcursions));
  assert.equal(assertAdjacency(noExcursions, 'report without excursions'), 1);
});

/* ---------- the page: statement adjacency, the legal block, the labels, the phrasing ---------- */

test('site: every [data-whatif] in index.html is followed by .cftc-441 and #legal carries the statement', () => {
  assertAdjacency(html, 'index.html');
  const legal = byId(html, 'legal');
  assert.ok(legal, '#legal is missing');
  assert.ok(text(legal!).includes(norm(STATEMENT)), '#legal does not carry the statement verbatim');
  const blocks = html.match(/<[a-zA-Z0-9]+\b[^>]*class="[^"]*\bcftc-441\b[^"]*"/g) ?? [];
  assert.ok(blocks.length >= 2, 'the day card and #legal each carry a .cftc-441');
  for (const b of blocks) {
    const at = html.indexOf(b);
    assert.ok(text(outerHtml(html, at)).includes(norm(STATEMENT)), 'a .cftc-441 on the page is not the full text');
  }
});

test('site: "illustrative" is labelled inside every invented component', () => {
  for (const id of ['declaration', 'story-held', 'day-card', 'partner']) {
    const el = byId(html, id);
    assert.ok(el, `#${id} is missing`);
    assert.ok(/illustrative/i.test(el!), `#${id} does not say "illustrative"`);
  }
  const features = byId(html, 'features')!;
  assert.ok(features, '#features is missing');
  const tiles = [...features.matchAll(/<[a-zA-Z0-9]+\b[^>]*class="[^"]*\btile\b[^"]*"/g)];
  assert.ok(tiles.length >= 6, 'six bento tiles');
  assert.ok(/illustrative/i.test(outerHtml(features, tiles[5].index)), 'the Record Card tile does not say "illustrative"');
});

test('site: the forbidden phrasing appears nowhere on the page, in the site modules, the stylesheets, this test or the report', () => {
  const phrases = readFileSync(join(root, 'test/fixtures/forbidden-phrases.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const files = [
    join(root, 'index.html'),
    ...walk(join(root, 'src/web')).filter((f) => /\.(ts|css)$/.test(f)),
    join(root, 'test/site.test.ts'),
  ];
  const sources = files.map((f) => ({ name: f.slice(root.length), body: readFileSync(f, 'utf8') }));
  sources.push({ name: 'rendered sample report', body: rendered });
  const hits: string[] = [];
  for (const { name, body } of sources) {
    for (const phrase of phrases) {
      const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      const m = re.exec(body);
      if (m) {
        const line = body.slice(0, m.index).split('\n').length;
        hits.push(`${name}:${line} "${phrase}"`);
      }
    }
  }
  assert.deepEqual(hits, [], `forbidden phrasing found:\n${hits.join('\n')}`);
});
