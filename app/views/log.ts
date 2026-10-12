// Log: what the Referee did (actions) and said (log lines), newest first.
import type { ActionLog, ServerEvent } from '../../src/server/api.ts';
import { api } from '../api.ts';
import { dateClockET } from '../format.ts';
import { errorText, esc, field, onServerEvent, setHtml, type View } from '../main.ts';

export const view: View = { title: 'Log', render };

interface Entry {
  id: string;
  time: number;
  kind: string;
  symbol: string | null;
  detail: string;
  ok: boolean;
  level: 'info' | 'warn' | 'error' | null;
}

const ACTION_KINDS: ActionLog['kind'][] = ['flatten', 'flatten_all', 'cancel_orders', 'dry_run', 'manual_flatten', 'lock', 'notify', 'webhook', 'error'];

const KIND_LABEL: Record<string, string> = {
  flatten: 'flatten',
  flatten_all: 'flatten all',
  cancel_orders: 'cancel orders',
  dry_run: 'dry run',
  manual_flatten: 'manual flatten',
  lock: 'lock',
  notify: 'notification',
  webhook: 'webhook',
  error: 'error',
  log: 'log',
};

const MAX_ENTRIES = 500;

function fromAction(a: ActionLog): Entry {
  return { id: `a${a.id}`, time: a.time, kind: a.kind, symbol: a.symbol, detail: a.detail, ok: a.ok, level: null };
}

let logSeq = 0;

function fromLog(e: Extract<ServerEvent, { type: 'log' }>): Entry {
  logSeq++;
  return { id: `l${e.time}-${logSeq}`, time: e.time, kind: 'log', symbol: null, detail: e.message, ok: e.level !== 'error', level: e.level };
}

function listHtml(entries: Entry[], filter: string): string {
  const shown = filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
  if (!shown.length) return `<p class="muted">${entries.length ? 'Nothing matches this filter.' : 'Nothing logged yet.'}</p>`;
  return `<ul class="log">${shown
    .map(
      (e) => `<li class="${e.ok ? '' : 'failed'}${e.level ? ` level-${e.level}` : ''}">
      <span class="time">${esc(dateClockET(e.time))}</span>
      <span><span class="tag ${e.kind === 'error' || !e.ok ? 'bad' : e.kind === 'dry_run' || e.kind === 'lock' ? 'warn' : e.kind === 'log' ? '' : 'ok'}">${esc(
        KIND_LABEL[e.kind] ?? e.kind,
      )}</span>${e.symbol ? ` <b>${esc(e.symbol)}</b>` : ''}</span>
      <span class="detail">${esc(e.detail)}${e.ok ? '' : ' <span class="muted">(failed)</span>'}</span>
    </li>`,
    )
    .join('')}</ul>`;
}

function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="page-head">
      <h1>Log</h1>
      <p class="lede">Every order the Referee sent or would have sent, every notification, and the service's own messages. Live entries appear at the top.</p>
    </section>
    <section class="panel">
      <form class="form-row" data-form="filter" novalidate>
        <label class="field" style="flex:0 1 240px">Show<select name="kind">
          <option value="all">everything</option>
          ${ACTION_KINDS.map((k) => `<option value="${k}">${esc(KIND_LABEL[k] ?? k)}</option>`).join('')}
          <option value="log">log messages</option>
        </select></label>
        <button type="button" class="btn" data-action="refresh">Refresh</button>
        <span class="status" role="status" data-section="status"></span>
      </form>
      <div data-section="list" style="margin-top:12px"></div>
    </section>`;

  const form = root.querySelector<HTMLFormElement>('form[data-form="filter"]') as HTMLFormElement;
  const status = root.querySelector<HTMLElement>('[data-section="status"]') as HTMLElement;
  const list = root.querySelector<HTMLElement>('[data-section="list"]') as HTMLElement;
  let entries: Entry[] = [];
  let alive = true;

  const draw = (): void => {
    setHtml(list, listHtml(entries, field(form, 'kind').value));
  };

  const load = async (): Promise<void> => {
    status.textContent = 'Loading.';
    status.classList.remove('error');
    try {
      const actions = await api.getActions(200);
      if (!alive) return;
      const live = entries.filter((e) => e.kind === 'log');
      const merged = [...actions.map(fromAction), ...live].sort((a, b) => b.time - a.time);
      entries = merged.slice(0, MAX_ENTRIES);
      status.textContent = `${actions.length} ${actions.length === 1 ? 'action' : 'actions'} stored.`;
      draw();
    } catch (err) {
      if (!alive) return;
      status.textContent = errorText(err);
      status.classList.add('error');
      draw();
    }
  };

  const stopEvents = onServerEvent((e) => {
    let entry: Entry | null = null;
    if (e.type === 'action') entry = fromAction(e.action);
    else if (e.type === 'log') entry = fromLog(e);
    if (!entry) return;
    if (entries.some((x) => x.id === entry.id)) return;
    entries.unshift(entry);
    if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
    draw();
  });

  form.addEventListener('change', draw);
  root.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.addEventListener('click', () => void load());
  void load();

  return () => {
    alive = false;
    stopEvents();
  };
}
