// The report renderer (pure HTML strings, no DOM): stats, edges and leaks with the hypothetical-results statement
// under every what-if figure, the stop check, the breakdowns, the three draft rules and the footer line.
// main.ts writes the result into #report; test/site.test.ts renders the sample through it.
import { tagTrades, type Dimension, type Insight, type Report } from '../core/analyze.ts';
import { draftRules, type Draft, type DraftResult } from '../core/drafts.ts';
import { insightSentence, money, pct } from '../core/format.ts';
import type { Trade } from '../core/types.ts';
import { cftcBlock } from './legal.ts';

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tone = (x: number) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');

export const REPORT_FOOTER = "Educational tool, not investment advice. The analyzer reads your record; it never picks a trade for you, for or against. Past results don't predict future results.";

function stat(label: string, value: string, cls = '', note = '') {
  return `<div class="stat"><span class="label">${label}</span><span class="value ${cls}">${value}</span>${note ? `<span class="note">${note}</span>` : ''}</div>`;
}

function insightCard(i: Insight, r: Report) {
  const cls = i.kind === 'edge' ? 'edge' : i.kind === 'leak' ? 'leak' : 'weak';
  const tag = i.kind === 'edge' ? 'Edge' : i.kind === 'leak' ? 'Leak' : 'Weak spot';
  return `<li class="insight ${cls}">
    <span class="tag">${tag}</span>
    <p>${esc(insightSentence(i, r))}</p>
    <span class="conf conf-${i.group.confidence.replace(' ', '-')}">${i.group.confidence}</span>
  </li>`;
}

function table(d: Dimension, overall: number) {
  const maxAbs = Math.max(...d.groups.map((g) => Math.abs(g.avgReturn)), 0.01);
  const rows = d.groups
    .map((g) => {
      const w = (Math.abs(g.avgReturn) / maxAbs) * 50;
      const bar = g.avgReturn >= 0 ? `left:50%;width:${w}%` : `left:${50 - w}%;width:${w}%`;
      const dim = g.n < 5 ? ' class="few"' : '';
      return `<tr${dim}>
        <th scope="row">${esc(g.label)}</th>
        <td class="num">${g.n}</td>
        <td class="num">${Math.round(g.winRate * 100)}%</td>
        <td class="num ${tone(g.avgReturn)}">${pct(g.avgReturn)}</td>
        <td class="barcell" aria-hidden="true"><span class="axis"></span><span class="bar ${g.avgReturn >= overall ? 'above' : 'below'} ${tone(g.avgReturn)}" style="${bar}"></span></td>
        <td class="num ${tone(g.totalPnl)}">${money(g.totalPnl)}</td>
      </tr>`;
    })
    .join('');
  return `<section class="panel dim">
    <h3>${esc(d.title)}</h3>
    <table>
      <thead><tr><th></th><th class="num">Trades</th><th class="num">Win</th><th class="num">Avg</th><th class="barcell"></th><th class="num">P&amp;L</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function draftCard(d: Draft) {
  return `<li class="draft" data-draft-kind="${d.kind}">
      <span class="tag">${esc(d.tag)}</span>
      <p class="sentence" data-draft-sentence>${esc(d.sentence)}</p>
      <p class="record">${esc(d.recordLine)}</p>
      <p class="held">${esc(d.heldLine)}</p>
    </li>`;
}

/** The drafts block (content spec 2.2): three cards, the not-a-rule line, the two buttons. No what-if, so no statement. */
export function draftsBlock(dr: DraftResult): string {
  return `<section class="panel drafts" id="drafts" aria-label="Three draft rules">
  <p class="eyebrow">Your record, as rules</p>
  <h2>Three draft rules, written from your record.</h2>
  <p class="muted">A draft carries a number only when the group is solid (15 trades or more) and its 95% interval excludes your average. Otherwise it is your rule, with no number, and it binds from trade one. The Referee holds five kinds of rule; a draft is always one of the five.</p>
  <ol class="draft-list">
    ${dr.drafts.map(draftCard).join('\n    ')}
  </ol>
  ${dr.notRuleLine ? `<p class="not-rule">${esc(dr.notRuleLine)}</p>` : ''}
  <div class="cta-row">
    <button type="button" class="btn btn-primary" data-action="enforce">Have the Referee enforce these</button>
    <button type="button" class="btn btn-secondary" data-action="copy-rules">Copy my rules</button>
  </div>
  <p class="small muted">Your rules and your trades stay in this tab. Joining the waitlist sends your email, nothing else.</p>
</section>`;
}

export function render(r: Report, warnings: string[], trades: Trade[]): string {
  const s = r.summary;
  const k = r.risk;
  const small = s.trades < 30;
  const drafted = draftRules(r, tagTrades(trades));
  const hasWhatIfLeak = r.leaks.some((i) => i.kind === 'leak');

  const risk = k.hasExcursions
    ? `<p data-whatif>${k.pastStop} of ${s.trades} trades went more than ${k.stopPct}% against you at some point; ${k.pastStopCameBack} of them came back green.
       Closing every one of them at −${k.stopPct}% would have made your total <b class="${tone(k.returnWithStop)}">${pct(k.returnWithStop, 1)}</b> instead of <b class="${tone(s.totalReturn)}">${pct(s.totalReturn, 1)}</b>
       <span class="muted">(estimate from each trade's worst point; sum of trade %).</span></p>${cftcBlock()}`
    : `<p class="muted">This export has no worst-point (excursion) data, so the stop check is left out.</p>`;

  const concentration =
    k.top5Share !== null
      ? `<p>Your 5 best trades made <b>${Math.round(k.top5Share * 100)}%</b> of your total. ${k.top5Share > 0.8 ? 'Your results depend on a few big winners, so cutting winners early is the most expensive habit you could have.' : ''}</p>`
      : '';

  const leaks = r.leaks.length
    ? `<ul${hasWhatIfLeak ? ' data-whatif' : ''}>${r.leaks.map((i) => insightCard(i, r)).join('')}</ul>${hasWhatIfLeak ? cftcBlock() : ''}`
    : '<p class="muted">No group of 5+ trades loses money or clearly drags your average. Nice.</p>';

  return `
    ${small ? `<p class="banner">Only ${s.trades} trades: treat everything below as early signals. Patterns firm up around 30+ trades per group.</p>` : ''}
    <section class="stats">
      ${stat('Trades', String(s.trades), '', `${s.days} days · ${esc(s.symbols.slice(0, 4).join(', '))}${s.symbols.length > 4 ? '…' : ''}`)}
      ${stat('Win rate', `${Math.round(s.winRate * 100)}%`)}
      ${stat('Avg per trade', pct(s.avgReturn), tone(s.avgReturn), `${s.avgR.toFixed(2)}R at a ${k.stopPct}% stop`)}
      ${stat('Avg win', pct(s.avgWin ?? 0), 'pos', `avg loss ${pct(s.avgLoss ?? 0)}`)}
      ${stat('Total P&L', money(s.totalPnl), tone(s.totalPnl), s.profitFactor ? `profit factor ${s.profitFactor.toFixed(2)}` : '')}
      ${stat('Max drawdown', money(s.maxDrawdown), tone(s.maxDrawdown))}
    </section>

    <div class="insights">
      <section class="panel">
        <h2>Where you make money</h2>
        ${r.edges.length ? `<ul>${r.edges.map((i) => insightCard(i, r)).join('')}</ul>` : '<p class="muted">No group of 5+ trades clearly beats your average yet.</p>'}
      </section>
      <section class="panel">
        <h2>Where you give it back</h2>
        ${leaks}
      </section>
    </div>

    <section class="panel">
      <h2>Your stop and your winners</h2>
      ${risk}
      ${concentration}
    </section>

    <h2 class="section-title">Breakdowns</h2>
    <p class="muted">Times are New York market time. Faded rows have fewer than 5 trades.</p>
    <div class="dims">${r.dimensions.map((d) => table(d, s.avgReturn)).join('')}</div>

    ${draftsBlock(drafted)}

    ${s.openTrades ? `<p class="muted">${s.openTrades} open trade(s) left out.</p>` : ''}
    ${warnings.length ? `<details class="help"><summary>${warnings.length} note(s) from reading your files</summary><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
    <p class="report-foot muted">${REPORT_FOOTER}</p>
  `;
}
