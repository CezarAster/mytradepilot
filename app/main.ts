// The Referee's browser UI: bootstrap, hash router, SSE client, the store, toasts and small DOM helpers.
// Views live in ./views and import what they need from here; they only use these exports inside functions.
import type { ServerEvent, SettingsView, StateResponse, StatusResponse } from '../src/server/api.ts';
import { api, ApiError, NOT_REACHABLE } from './api.ts';
import { countdown, secondsLeft } from './format.ts';
import { initNotifications } from './notify.ts';
import { view as askView } from './views/ask.ts';
import { view as logView } from './views/log.ts';
import { view as recordView } from './views/record.ts';
import { view as rulesView } from './views/rules.ts';
import { view as settingsView } from './views/settings.ts';
import { view as setupView } from './views/setup.ts';
import { view as todayView } from './views/today.ts';

export interface View {
  title: string;
  /** Renders into root and returns a cleanup that runs when the route changes. */
  render(root: HTMLElement): () => void;
}

export type Connection = 'connecting' | 'open' | 'down';

export interface Store {
  state: StateResponse | null;
  settings: SettingsView | null;
  connection: Connection;
  /** Server clock minus browser clock, so countdowns run from the server's timestamps. */
  serverOffset: number;
}

export const store: Store = { state: null, settings: null, connection: 'connecting', serverOffset: 0 };

// ---- store subscriptions ----

const listeners = new Set<() => void>();

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notify(): void {
  for (const fn of [...listeners]) fn();
}

export const serverNow = (): number => Date.now() + store.serverOffset;

const eventListeners = new Set<(e: ServerEvent) => void>();

/** Raw server events (breach, action, log...) for views and notifications that need more than the store. */
export function onServerEvent(fn: (e: ServerEvent) => void): () => void {
  eventListeners.add(fn);
  return () => {
    eventListeners.delete(fn);
  };
}

// ---- HTML and DOM helpers ----

/** Escapes anything for interpolation into HTML. Every piece of data rendered into HTML goes through this. */
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const htmlCache = new WeakMap<Element, string>();

/** Sets innerHTML only when it changed, so live updates do not disturb what the trader is clicking or typing. */
export function setHtml(el: Element, html: string): boolean {
  if (htmlCache.get(el) === html) return false;
  el.innerHTML = html;
  htmlCache.set(el, html);
  return true;
}

export function field(form: HTMLFormElement, name: string): HTMLInputElement {
  return form.elements.namedItem(name) as HTMLInputElement;
}

export function toast(message: string, kind: 'info' | 'ok' | 'error' = 'info'): void {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = message;
  host.appendChild(el);
  window.setTimeout(() => el.remove(), kind === 'error' ? 8000 : 4500);
}

export function errorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : 'Something went wrong';
}

/** Shows an error to the trader. A network failure also flips the offline banner on. */
export function reportError(err: unknown): void {
  if (err instanceof ApiError && err.network) setConnection('down');
  toast(errorText(err), 'error');
}

// ---- countdowns: elements with data-until tick once a second from the server clock ----

export function tickCountdowns(root: ParentNode): void {
  const now = serverNow();
  for (const el of root.querySelectorAll<HTMLElement>('[data-until]')) {
    const until = Number(el.dataset.until);
    const remaining = until - now;
    const tpl = el.dataset.tpl ?? '{t}';
    const text = remaining <= 0 ? (el.dataset.done ?? 'now') : tpl.replace('{t}', countdown(remaining)).replace('{s}', String(secondsLeft(remaining)));
    if (el.textContent !== text) el.textContent = text;
  }
}

export function startCountdowns(root: ParentNode): () => void {
  tickCountdowns(root);
  const id = window.setInterval(() => tickCountdowns(root), 1000);
  return () => window.clearInterval(id);
}

// ---- enforcement mode (shared by the chip and the Today banner) ----

export type Mode = 'on' | 'dry' | 'off' | 'killed';
export const MODE_LABEL: Record<Mode, string> = { on: 'ON', dry: 'DRY RUN', off: 'OFF', killed: 'KILLED' };

export function enforcementMode(status: StatusResponse): Mode {
  const e = status.enforcement;
  if (e.enabled) return e.dryRun ? 'dry' : 'on';
  return e.killedAt ? 'killed' : 'off';
}

// ---- state ----

function setConnection(c: Connection): void {
  if (store.connection === c) return;
  store.connection = c;
  notify();
}

let stateRequest: Promise<void> | null = null;

export function refreshState(): Promise<void> {
  if (stateRequest) return stateRequest;
  stateRequest = (async () => {
    try {
      const s = await api.getState();
      store.state = s;
      store.serverOffset = s.snapshot.now - Date.now();
      setConnection('open');
      notify();
    } catch (err) {
      if (err instanceof ApiError && err.network) setConnection('down');
      else toast(errorText(err), 'error');
    } finally {
      stateRequest = null;
    }
  })();
  return stateRequest;
}

export async function refreshSettings(): Promise<void> {
  try {
    store.settings = await api.getSettings();
    notify();
  } catch {
    // The offline banner covers a dead service; the Settings page shows its own error.
  }
}

// ---- server-sent events ----

let source: EventSource | null = null;
let backoff = 1000;
let reconnectTimer: number | null = null;

function handleEvent(e: ServerEvent): void {
  const s = store.state;
  switch (e.type) {
    case 'snapshot':
      store.serverOffset = e.snapshot.now - Date.now();
      if (s) {
        s.snapshot = e.snapshot;
        s.status = e.status;
      } else {
        void refreshState();
      }
      break;
    case 'breach':
      if (s && !s.todayBreaches.some((b) => b.id === e.breach.id)) s.todayBreaches.push(e.breach);
      break;
    case 'trade':
      if (s) {
        const i = s.todayTrades.findIndex((t) => t.key === e.trade.key);
        if (i >= 0) s.todayTrades[i] = e.trade;
        else s.todayTrades.push(e.trade);
      }
      break;
    case 'action':
      if (s && !s.recentActions.some((a) => a.id === e.action.id)) {
        s.recentActions.unshift(e.action);
        if (s.recentActions.length > 100) s.recentActions.length = 100;
      }
      break;
    case 'declaration':
      if (s) s.snapshot.pendingDeclaration = e.declaration;
      break;
    case 'log':
      break;
  }
  notify();
  for (const fn of [...eventListeners]) fn(e);
}

function scheduleReconnect(): void {
  if (reconnectTimer !== null) return;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, backoff);
  backoff = Math.min(backoff * 2, 30000);
}

function connect(): void {
  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  source?.close();
  const es = new EventSource('/api/events');
  source = es;
  es.onopen = () => {
    backoff = 1000;
    setConnection('open');
    void refreshState();
    void refreshSettings();
  };
  es.onmessage = (ev: MessageEvent<string>) => {
    let e: ServerEvent;
    try {
      e = JSON.parse(ev.data) as ServerEvent;
    } catch {
      return;
    }
    if (e && typeof e === 'object' && typeof e.type === 'string') handleEvent(e);
  };
  es.onerror = () => {
    if (source !== es) return;
    es.close();
    source = null;
    setConnection('down');
    scheduleReconnect();
  };
}

// ---- router ----

const routes: Record<string, View> = {
  '/': todayView,
  '/rules': rulesView,
  '/record': recordView,
  '/setup': setupView,
  '/settings': settingsView,
  '/log': logView,
  '/ask': askView,
};

let cleanup: (() => void) | null = null;
let currentPath = '';

function currentRoute(): string {
  const raw = location.hash.replace(/^#/, '') || '/';
  const path = raw.split('?')[0];
  return Object.hasOwn(routes, path) ? path : '/';
}

function route(): void {
  const path = currentRoute();
  if (path === currentPath) return;
  currentPath = path;
  const view = routes[path];
  if (cleanup) cleanup();
  cleanup = null;
  const stale = document.getElementById('view');
  if (!stale) return;
  // A fresh element per mount, so listeners a view attached to the root die with it instead of stacking up.
  const root = stale.cloneNode(false) as HTMLElement;
  stale.replaceWith(root);
  document.title = `${view.title} · MyTradePilot Referee`;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.nav a[data-route]')) {
    if (a.dataset.route === path) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  cleanup = view.render(root);
  window.scrollTo(0, 0);
}

// ---- top bar and offline banner ----

function setChip(el: HTMLElement, text: string, cls: 'ok' | 'warn' | 'bad' | 'muted'): void {
  if (el.textContent !== text) el.textContent = text;
  const className = `chip chip-${cls}`;
  if (el.className !== className) el.className = className;
}

function updateChrome(): void {
  const offline = document.getElementById('offline');
  if (offline) {
    const down = store.connection === 'down';
    if (offline.hidden === down) offline.hidden = !down;
    offline.textContent = `${NOT_REACHABLE}. The Referee is not watching your account until the service is back. Retrying.`;
  }
  const streamChip = document.getElementById('chip-stream');
  const enfChip = document.getElementById('chip-enf');
  if (!streamChip || !enfChip) return;
  const st = store.state?.status ?? null;
  if (store.connection === 'down') setChip(streamChip, 'service down', 'bad');
  else if (!st) setChip(streamChip, 'connecting', 'muted');
  else if (!st.configured) setChip(streamChip, 'no keys · not watching', 'warn');
  else {
    const cls = st.stream === 'live' ? 'ok' : st.stream === 'stopped' || st.stream === 'unauthorized' ? 'bad' : 'warn';
    setChip(streamChip, `${st.stream} · ${st.mode}`, cls);
  }
  if (!st) setChip(enfChip, 'enforcement', 'muted');
  else {
    const m = enforcementMode(st);
    setChip(enfChip, MODE_LABEL[m], m === 'on' ? 'ok' : m === 'dry' ? 'warn' : m === 'killed' ? 'bad' : 'muted');
  }
}

// ---- bootstrap ----

function boot(): void {
  initNotifications();
  subscribe(updateChrome);
  updateChrome();
  window.addEventListener('hashchange', route);
  route();
  connect();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && store.connection === 'down') {
      backoff = 1000;
      connect();
    }
  });
}

boot();
