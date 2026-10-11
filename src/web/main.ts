import { analyze, type Dimension, type Insight, type Report } from '../core/analyze.ts';
import { HYPOTHETICAL, insightSentence, money, pct } from '../core/format.ts';
import { combineTrades, parseFile } from '../core/parsers/index.ts';
import type { Trade } from '../core/types.ts';
import { setupSignup } from './signup.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const tzSelect = $<HTMLSelectElement>('tz');
const stopInput = $<HTMLInputElement>('stop');
const fileInput = $<HTMLInputElement>('files');
const drop = $<HTMLLabelElement>('drop');
const statusEl = $<HTMLParagraphElement>('status');
const reportEl = $<HTMLDivElement>('report');
setupSignup($('signup'));

const ZONES = [
  ['America/New_York', 'New York (ET)'],
  ['America/Chicago', 'Chicago (CT)'],
  ['America/Denver', 'Denver (MT)'],
  ['America/Phoenix', 'Phoenix (MST)'],
  ['America/Los_Angeles', 'Los Angeles (PT)'],
  ['Europe/London', 'London'],
  ['Europe/Berlin', 'Central Europe'],
  ['Asia/Kolkata', 'India'],
  ['Asia/Singapore', 'Singapore'],
  ['Australia/Sydney', 'Sydney'],
  ['UTC', 'UTC'],
];

function store(key: string, value?: string): string | null {
  try {
    if (value !== undefined) localStorage.setItem(key, value);
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = ZONES.some(([z]) => z === browserTz) ? ZONES : [[browserTz, `${browserTz} (this computer)`], ...ZONES];
tzSelect.innerHTML = zones.map(([z, label]) => `<option value="${z}">${label}</option>`).join('');
tzSelect.value = store('tz') ?? browserTz;
stopInput.value = store('stop') ?? '2';

let loaded: { name: string; text: string }[] = [];

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tone = (x: number) => (x > 0 ? 'pos' : x < 0 ? 'neg' : '');

function run() {
  if (!loaded.length) return;
  const timeZone = tzSelect.value;
  const stopPct = Number(stopInput.value) > 0 ? Number(stopInput.value) : 2;
  const warnings: string[] = [];
  const lists: Trade[][] = [];
  for (const f of loaded) {
    const res = parseFile(f.text, { timeZone, fileName: f.name });
    warnings.push(...res.warnings);
    lists.push(res.trades);
  }
  const trades = combineTrades(lists);
  const closed = trades.filter((t) => t.exitTime).length;
  if (!closed) {
    statusEl.textContent = warnings[0] ?? 'No closed trades found in those files.';
    reportEl.innerHTML = '';
    return;
  }
  statusEl.textContent = `${loaded.length} file${loaded.length > 1 ? 's' : ''} loaded.`;
  reportEl.innerHTML = render(analyze(trades, { stopPct }), warnings);
}

async function load(files: FileList | File[]) {
  const list = [...files].filter((f) => f.name.toLowerCase().endsWith('.csv') || f.type === 'text/csv');
  if (!list.length) {
    statusEl.textContent = 'Please choose .csv files.';
    return;
  }
  loaded = await Promise.all(list.map(async (f) => ({ name: f.name, text: await f.text() })));
  run();
  reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

fileInput.addEventListener('change', () => fileInput.files && load(fileInput.files));
drop.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('over');
});
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  if (e.dataTransfer?.files) load(e.dataTransfer.files);
});
tzSelect.addEventListener('change', () => {
  store('tz', tzSelect.value);
  run();
});
stopInput.addEventListener('change', () => {
  store('stop', stopInput.value);
  run();
});
$('demo').addEventListener('click', async () => {
  const res = await fetch(`${import.meta.env.BASE_URL}sample-trades.csv`);
  tzSelect.value = 'America/New_York';
  loaded = [{ name: 'Sample trades (fills).csv', text: await res.text() }];
  run();
  reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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

function render(r: Report, warnings: string[]): string {
  const s = r.summary;
  const k = r.risk;
  const small = s.trades < 30;

  const risk = k.hasExcursions
    ? `<p>${k.pastStop} of ${s.trades} trades went more than ${k.stopPct}% against you at some point; ${k.pastStopCameBack} of them came back green.
       Closing every one of them at −${k.stopPct}% would have made your total <b class="${tone(k.returnWithStop)}">${pct(k.returnWithStop, 1)}</b> instead of <b class="${tone(s.totalReturn)}">${pct(s.totalReturn, 1)}</b>
       <span class="muted">(estimate from each trade's worst point; sum of trade %).</span></p>
       <p class="muted">${HYPOTHETICAL}</p>`
    : `<p class="muted">This export has no worst-point (excursion) data, so the stop check is skipped.</p>`;

  const concentration =
    k.top5Share !== null
      ? `<p>Your 5 best trades made <b>${Math.round(k.top5Share * 100)}%</b> of your total. ${k.top5Share > 0.8 ? 'Your results depend on a few big winners.' : ''}</p>`
      : '';

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
        ${r.leaks.length ? `<ul>${r.leaks.map((i) => insightCard(i, r)).join('')}</ul>` : '<p class="muted">No group of 5+ trades loses money or clearly drags your average. Nice.</p>'}
        ${r.leaks.some((i) => i.kind === 'leak') ? `<p class="muted">${HYPOTHETICAL}</p>` : ''}
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

    ${s.openTrades ? `<p class="muted">${s.openTrades} open trade(s) left out.</p>` : ''}
    ${warnings.length ? `<details class="help"><summary>${warnings.length} note(s) from reading your files</summary><ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
  `;
}
