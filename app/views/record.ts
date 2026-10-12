// Record: the edge/leak report over every closed trade the service knows, plus CSV import.
import type { ImportResponse } from '../../src/server/api.ts';
import { renderReport } from '../report.ts';
import { api } from '../api.ts';
import { TIME_ZONES } from '../format.ts';
import { errorText, esc, field, refreshState, reportError, store, toast, type View } from '../main.ts';

export const view: View = { title: 'Record', render };

/** Option tags for the time zone select, with this computer's zone first when it is not in the list. */
export function zoneOptions(selected: string): string {
  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones: [string, string][] = TIME_ZONES.some(([z]) => z === browserTz) ? TIME_ZONES : [[browserTz, `${browserTz} (this computer)`], ...TIME_ZONES];
  return zones.map(([z, label]) => `<option value="${esc(z)}"${z === selected ? ' selected' : ''}>${esc(label)}</option>`).join('');
}

function importSummary(results: { name: string; res: ImportResponse }[]): string {
  const imported = results.reduce((s, r) => s + r.res.imported, 0);
  const duplicates = results.reduce((s, r) => s + r.res.duplicates, 0);
  const formats = [...new Set(results.map((r) => r.res.format))].join(', ');
  const warnings = results.flatMap((r) => r.res.warnings.map((w) => `${r.name}: ${w}`));
  return `<p>Imported <b>${imported}</b> ${imported === 1 ? 'trade' : 'trades'}${duplicates ? `, skipped ${duplicates} already known` : ''}${
    formats ? ` (${esc(formats)})` : ''
  }.</p>${warnings.length ? `<ul class="warnings">${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}

function render(root: HTMLElement): () => void {
  const tz = store.settings?.importTimeZone ?? 'America/New_York';
  root.innerHTML = `
    <section class="page-head">
      <h1>Your record</h1>
      <p class="lede">Every closed trade the Referee has seen or you have imported. The next-trade panel on Today reads its "your record shows" lines from here.</p>
    </section>
    <section class="panel">
      <h2>Import trades</h2>
      <p class="muted">A TradingView trade list (Bar Replay or Strategy Tester export) or any broker fill list with symbol, side, quantity, price and time. Fills are matched into round trips; duplicates are skipped.</p>
      <form data-form="import" class="form-row" novalidate>
        <label class="field">CSV files<input type="file" name="files" accept=".csv,text/csv" multiple required /></label>
        <label class="field">Time zone of the export<select name="timeZone">${zoneOptions(tz)}</select></label>
        <button type="submit" class="btn primary">Import</button>
      </form>
      <div class="status" role="status" data-section="import-status"></div>
    </section>
    <p class="status" role="status" data-section="status"></p>
    <div data-section="report"></div>`;

  const form = root.querySelector<HTMLFormElement>('form[data-form="import"]') as HTMLFormElement;
  const importStatus = root.querySelector<HTMLElement>('[data-section="import-status"]') as HTMLElement;
  const status = root.querySelector<HTMLElement>('[data-section="status"]') as HTMLElement;
  const reportEl = root.querySelector<HTMLElement>('[data-section="report"]') as HTMLElement;
  let alive = true;

  const load = async (): Promise<void> => {
    status.textContent = 'Loading your record.';
    status.classList.remove('error');
    try {
      const res = await api.getReport();
      if (!alive) return;
      if (!res.report) {
        status.textContent = 'No closed trades in your record yet. Import a CSV above, or let the Referee record your trades as they close.';
        reportEl.innerHTML = '';
        return;
      }
      const span = res.firstDay && res.lastDay ? (res.firstDay === res.lastDay ? ` on ${res.firstDay}` : ` from ${res.firstDay} to ${res.lastDay}`) : '';
      status.textContent = `${res.trades} closed ${res.trades === 1 ? 'trade' : 'trades'}${span}. Stop for the R column: ${res.report.risk.stopPct}% (change it in Settings).`;
      reportEl.innerHTML = renderReport(res.report, []);
    } catch (err) {
      if (!alive) return;
      status.textContent = errorText(err);
      status.classList.add('error');
    }
  };

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const input = field(form, 'files');
    const files = [...(input.files ?? [])];
    if (!files.length) {
      importStatus.textContent = 'Choose one or more .csv files first.';
      return;
    }
    const timeZone = field(form, 'timeZone').value;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    importStatus.textContent = `Importing ${files.length} ${files.length === 1 ? 'file' : 'files'}.`;
    const results: { name: string; res: ImportResponse }[] = [];
    try {
      for (const f of files) {
        const text = await f.text();
        results.push({ name: f.name, res: await api.importCsv({ fileName: f.name, text, timeZone }) });
      }
      importStatus.innerHTML = importSummary(results);
      form.reset();
      field(form, 'timeZone').value = timeZone;
      toast('Import finished. Your record is updated.', 'ok');
      await load();
      void refreshState();
    } catch (err) {
      importStatus.innerHTML = `${results.length ? importSummary(results) : ''}<p class="error neg">${esc(errorText(err))}</p>`;
      reportError(err);
    } finally {
      if (button) button.disabled = false;
    }
  });

  void load();
  return () => {
    alive = false;
  };
}
