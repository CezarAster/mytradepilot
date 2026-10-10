import { analyze } from '../core/analyze.ts';
import { combineTrades, parseFile } from '../core/parsers/index.ts';
import type { Trade } from '../core/types.ts';
import { renderReport } from './report.ts';
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
  reportEl.innerHTML = renderReport(analyze(trades, { stopPct }), warnings);
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
