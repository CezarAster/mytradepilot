// Settings: Alpaca keys and mode, webhook, alerts, preferences, and the service's own details.
import type { SettingsView, SettingsUpdate } from '../../src/server/api.ts';
import { api, SERVICE_ADDRESS } from '../api.ts';
import { dateTimeET, money2, timeET } from '../format.ts';
import { errorText, esc, field, notify, refreshState, reportError, setHtml, store, subscribe, toast, type View } from '../main.ts';
import { zoneOptions } from './record.ts';

export const view: View = { title: 'Settings', render };

function permissionText(): string {
  if (!('Notification' in window)) return 'This browser does not support notifications.';
  switch (Notification.permission) {
    case 'granted':
      return 'Browser permission: granted.';
    case 'denied':
      return 'Browser permission: denied. Allow notifications for this site in your browser settings.';
    default:
      return 'Browser permission: not asked yet.';
  }
}

function serviceHtml(): string {
  const st = store.state?.status ?? null;
  const settings = store.settings;
  const port = settings?.port ?? null;
  if (!st) {
    return `<h2>Service</h2><p class="muted">${store.connection === 'down' ? `Service not reachable at ${esc(SERVICE_ADDRESS)}.` : 'Connecting to the service.'}</p>`;
  }
  return `<h2>Service</h2>
    <dl class="kv">
      <div><dt>Version</dt><dd>${esc(st.version)}</dd></div>
      <div><dt>Address</dt><dd>127.0.0.1:${esc(port ?? SERVICE_ADDRESS.split(':')[1])}</dd></div>
      <div><dt>Data folder</dt><dd class="small">${esc(st.dataDir)}</dd></div>
      <div><dt>Started</dt><dd>${esc(dateTimeET(st.startedAt))}</dd></div>
      <div><dt>Last sync</dt><dd>${st.lastSync ? esc(timeET(st.lastSync)) : 'never'}</dd></div>
      <div><dt>Stored</dt><dd>${st.counts.fills} fills, ${st.counts.trades} trades, ${st.counts.imports} imports</dd></div>
      <div><dt>Alpaca stream</dt><dd>${esc(st.stream)}${st.streamDetail ? ` <span class="muted">(${esc(st.streamDetail)})</span>` : ''}</dd></div>
    </dl>`;
}

function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="page-head">
      <h1>Settings</h1>
      <p class="lede">Keys and preferences stay on this computer, in the service's data folder. Nothing here is uploaded anywhere.</p>
    </section>

    <section class="panel">
      <h2>Alpaca</h2>
      <p class="muted" data-section="alpaca-status">Loading.</p>
      <form data-form="alpaca" class="form-grid" novalidate>
        <label class="field">API key ID<input name="keyId" type="text" autocomplete="off" spellcheck="false" /></label>
        <label class="field">Secret key<input name="secretKey" type="password" autocomplete="new-password" /></label>
        <fieldset class="radios wide">
          <legend>Mode</legend>
          <label><input type="radio" name="mode" value="paper" checked /> Paper</label>
          <label><input type="radio" name="mode" value="live" /> Live</label>
        </fieldset>
        <p class="warn-box wide" data-section="live-warning" hidden>Live mode: when a rule says flatten and enforcement is on, the Referee sends real orders to your real account. Run a dry-run week on paper first.</p>
        <div class="actions wide">
          <button type="submit" class="btn primary">Save keys</button>
          <button type="button" class="btn" data-action="test">Test saved connection</button>
          <span class="status" role="status" data-section="alpaca-msg"></span>
        </div>
      </form>
    </section>

    <section class="panel">
      <h2>Webhook</h2>
      <p class="muted">A Discord or Telegram webhook URL gets a message on every breach and referee action. Save it blank to remove it.</p>
      <form data-form="webhook" class="form-row" novalidate>
        <label class="field">Webhook URL<input name="webhookUrl" type="url" autocomplete="off" spellcheck="false" placeholder="https://discord.com/api/webhooks/..." /></label>
        <button type="submit" class="btn">Save webhook</button>
      </form>
      <p class="status" role="status" data-section="webhook-status"></p>
    </section>

    <section class="panel">
      <h2>Alerts and preferences</h2>
      <form data-form="prefs" class="form-grid" novalidate>
        <div class="actions wide">
          <label class="switch"><input type="checkbox" name="desktop" /> Desktop notifications</label>
          <label class="switch"><input type="checkbox" name="sound" /> Sound</label>
          <button type="button" class="btn small" data-action="notif-permission">Enable browser notifications</button>
          <span class="muted" data-section="perm">${esc(permissionText())}</span>
        </div>
        <label class="field">Declaration window (minutes)<input name="declarationWindowMinutes" type="number" min="1" max="240" step="1" /><span class="hint">A declaration counts for the next entry fill inside this window.</span></label>
        <label class="field">Stop % for the record report<input name="stopPct" type="number" min="0.1" max="50" step="0.1" /><span class="hint">Used for the R column and the hard-stop what-if.</span></label>
        <label class="field">Import time zone<select name="importTimeZone"></select><span class="hint">Default for CSV imports on the Record page.</span></label>
        <label class="field">Market data feed<select name="feed"><option value="iex">IEX (free)</option><option value="sip">SIP (paid Alpaca data plan)</option></select><span class="hint">Used for marks and the setup check.</span></label>
        <div class="actions wide">
          <button type="submit" class="btn primary">Save preferences</button>
          <span class="status" role="status" data-section="prefs-msg"></span>
        </div>
      </form>
    </section>

    <section class="panel" data-section="service"></section>`;

  const sec = (name: string): HTMLElement => root.querySelector<HTMLElement>(`[data-section="${name}"]`) as HTMLElement;
  const alpacaForm = root.querySelector<HTMLFormElement>('form[data-form="alpaca"]') as HTMLFormElement;
  const webhookForm = root.querySelector<HTMLFormElement>('form[data-form="webhook"]') as HTMLFormElement;
  const prefsForm = root.querySelector<HTMLFormElement>('form[data-form="prefs"]') as HTMLFormElement;
  let alive = true;

  const say = (el: HTMLElement, text: string, error = false): void => {
    el.textContent = text;
    el.classList.toggle('error', error);
  };

  const applySettings = (s: SettingsView): void => {
    store.settings = s;
    say(
      sec('alpaca-status'),
      s.alpaca.configured
        ? `Keys saved${s.alpaca.keyIdPreview ? ` (key ID ${s.alpaca.keyIdPreview})` : ''}, ${s.alpaca.mode} mode. To change them or switch mode, enter both keys again and save.`
        : 'No keys saved yet. Paste the API key ID and secret key from your Alpaca dashboard. Paper keys come from the paper trading view.',
    );
    for (const radio of alpacaForm.querySelectorAll<HTMLInputElement>('input[name="mode"]')) radio.checked = radio.value === s.alpaca.mode;
    sec('live-warning').hidden = s.alpaca.mode !== 'live';
    say(sec('webhook-status'), s.webhook.configured ? `A ${s.webhook.kind ?? 'webhook'} webhook is set.` : 'No webhook set.');
    field(prefsForm, 'desktop').checked = s.notifications.desktop;
    field(prefsForm, 'sound').checked = s.notifications.sound;
    field(prefsForm, 'declarationWindowMinutes').value = String(s.declarationWindowMinutes);
    field(prefsForm, 'stopPct').value = String(s.stopPct);
    field(prefsForm, 'importTimeZone').innerHTML = zoneOptions(s.importTimeZone);
    field(prefsForm, 'importTimeZone').value = s.importTimeZone;
    field(prefsForm, 'feed').value = s.feed;
    notify();
  };

  const updateService = (): void => {
    setHtml(sec('service'), serviceHtml());
  };

  field(prefsForm, 'importTimeZone').innerHTML = zoneOptions(store.settings?.importTimeZone ?? 'America/New_York');
  if (store.settings) applySettings(store.settings);
  api
    .getSettings()
    .then((s) => {
      if (alive) applySettings(s);
    })
    .catch((err: unknown) => {
      if (alive) say(sec('alpaca-status'), errorText(err), true);
    });

  alpacaForm.addEventListener('change', () => {
    sec('live-warning').hidden = field(alpacaForm, 'mode').value !== 'live';
  });
  alpacaForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const keyId = field(alpacaForm, 'keyId').value.trim();
    const secretKey = field(alpacaForm, 'secretKey').value.trim();
    const mode = field(alpacaForm, 'mode').value === 'live' ? 'live' : 'paper';
    if (!keyId || !secretKey) {
      say(sec('alpaca-msg'), 'Enter both the key ID and the secret key.', true);
      return;
    }
    if (mode === 'live' && !window.confirm('Save LIVE keys? With enforcement on, flatten rules send real orders to your real account.')) return;
    const button = alpacaForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const s = await api.putSettings({ alpaca: { keyId, secretKey, mode } });
      if (!alive) return;
      applySettings(s);
      field(alpacaForm, 'secretKey').value = '';
      field(alpacaForm, 'keyId').value = '';
      say(sec('alpaca-msg'), 'Keys saved. The service is connecting.');
      toast('Alpaca keys saved.', 'ok');
      void refreshState();
    } catch (err) {
      if (!alive) return;
      say(sec('alpaca-msg'), errorText(err), true);
      reportError(err);
    } finally {
      if (button) button.disabled = false;
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="test"]')?.addEventListener('click', async (ev) => {
    const button = ev.currentTarget as HTMLButtonElement;
    button.disabled = true;
    say(sec('alpaca-msg'), 'Testing the saved keys.');
    try {
      const r = await api.testSettings();
      if (!alive) return;
      const a = r.account ?? {};
      const parts: string[] = [];
      if (typeof a.equity === 'number') parts.push(`equity ${money2(a.equity)}`);
      if (typeof a.cash === 'number') parts.push(`cash ${money2(a.cash)}`);
      if (typeof a.buyingPower === 'number') parts.push(`buying power ${money2(a.buyingPower)}`);
      if (typeof a.status === 'string') parts.push(`status ${a.status}`);
      say(sec('alpaca-msg'), `${r.detail}${parts.length ? ` (${parts.join(', ')})` : ''}`, !r.ok);
    } catch (err) {
      if (!alive) return;
      say(sec('alpaca-msg'), errorText(err), true);
      reportError(err);
    } finally {
      button.disabled = false;
    }
  });

  webhookForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const url = field(webhookForm, 'webhookUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) {
      say(sec('webhook-status'), 'The webhook URL must start with http:// or https://.', true);
      return;
    }
    const button = webhookForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const s = await api.putSettings({ webhookUrl: url || null });
      if (!alive) return;
      applySettings(s);
      field(webhookForm, 'webhookUrl').value = '';
      toast(url ? 'Webhook saved.' : 'Webhook removed.', 'ok');
    } catch (err) {
      if (!alive) return;
      say(sec('webhook-status'), errorText(err), true);
      reportError(err);
    } finally {
      if (button) button.disabled = false;
    }
  });

  prefsForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const windowMinutes = Number(field(prefsForm, 'declarationWindowMinutes').value);
    const stopPct = Number(field(prefsForm, 'stopPct').value);
    if (!Number.isInteger(windowMinutes) || windowMinutes < 1) {
      say(sec('prefs-msg'), 'Declaration window must be a whole number of minutes, at least 1.', true);
      return;
    }
    if (!Number.isFinite(stopPct) || stopPct <= 0) {
      say(sec('prefs-msg'), 'Stop % must be a number above zero.', true);
      return;
    }
    const body: SettingsUpdate = {
      notifications: { desktop: field(prefsForm, 'desktop').checked, sound: field(prefsForm, 'sound').checked },
      declarationWindowMinutes: windowMinutes,
      stopPct,
      importTimeZone: field(prefsForm, 'importTimeZone').value,
      feed: field(prefsForm, 'feed').value === 'sip' ? 'sip' : 'iex',
    };
    const button = prefsForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const s = await api.putSettings(body);
      if (!alive) return;
      applySettings(s);
      say(sec('prefs-msg'), 'Saved.');
      toast('Preferences saved.', 'ok');
      if (s.notifications.desktop && 'Notification' in window && Notification.permission === 'default') {
        say(sec('prefs-msg'), 'Saved. Press "Enable browser notifications" so this browser is allowed to show them.');
      }
    } catch (err) {
      if (!alive) return;
      say(sec('prefs-msg'), errorText(err), true);
      reportError(err);
    } finally {
      if (button) button.disabled = false;
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="notif-permission"]')?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      say(sec('perm'), permissionText());
      return;
    }
    try {
      await Notification.requestPermission();
    } catch {
      // Older browsers take a callback instead; the text below reads the result either way.
    }
    if (alive) say(sec('perm'), permissionText());
  });

  const unsubscribe = subscribe(updateService);
  updateService();
  return () => {
    alive = false;
    unsubscribe();
  };
}
