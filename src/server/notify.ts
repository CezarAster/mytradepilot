// Out-of-band alerts: a desktop notification on the machine running the referee, and an optional webhook
// (Discord, Telegram, or anything that accepts JSON) so an accountability partner sees breaches.
import { execFile } from 'node:child_process';
import { platform } from 'node:os';
import type { Logger } from './log.ts';

export type WebhookKind = 'discord' | 'telegram' | 'generic';

export function webhookKind(url: string): WebhookKind {
  try {
    const h = new URL(url).hostname;
    if (h.endsWith('discord.com') || h.endsWith('discordapp.com')) return 'discord';
    if (h === 'api.telegram.org') return 'telegram';
  } catch {
    // fall through
  }
  return 'generic';
}

export class Notifier {
  private readonly log: Logger;
  private webhookUrl: string | null;
  private desktop: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(log: Logger, opts: { webhookUrl: string | null; desktop: boolean; fetchImpl?: typeof fetch }) {
    this.log = log;
    this.webhookUrl = opts.webhookUrl;
    this.desktop = opts.desktop;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  configure(opts: { webhookUrl: string | null; desktop: boolean }): void {
    this.webhookUrl = opts.webhookUrl;
    this.desktop = opts.desktop;
  }

  /** Fire and forget; never throws. Returns what was attempted for the action log. */
  async send(title: string, body: string): Promise<{ desktop: boolean; webhook: boolean; error: string | null }> {
    const result = { desktop: false, webhook: false, error: null as string | null };
    if (this.desktop) {
      try {
        await desktopNotification(title, body);
        result.desktop = true;
      } catch (err) {
        result.error = `desktop: ${(err as Error).message}`;
        this.log.debug('desktop notification failed', err);
      }
    }
    if (this.webhookUrl) {
      try {
        await this.postWebhook(title, body);
        result.webhook = true;
      } catch (err) {
        result.error = `${result.error ? result.error + '; ' : ''}webhook: ${(err as Error).message}`;
        this.log.warn('webhook failed', err);
      }
    }
    return result;
  }

  private async postWebhook(title: string, body: string): Promise<void> {
    const url = this.webhookUrl!;
    const kind = webhookKind(url);
    const text = `${title}\n${body}`;
    const payload = kind === 'discord' ? { content: text.slice(0, 1900) } : kind === 'telegram' ? { text: text.slice(0, 4000) } : { title, body, text };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await this.fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: ctrl.signal });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout: 5000, windowsHide: true }, (err) => (err ? reject(err) : resolve()));
  });
}

const clean = (s: string) => s.replace(/["\\]/g, ' ').replace(/[\r\n]+/g, ' ').slice(0, 240);

export async function desktopNotification(title: string, body: string): Promise<void> {
  const t = clean(title);
  const b = clean(body);
  const os = platform();
  if (os === 'darwin') {
    await run('osascript', ['-e', `display notification "${b}" with title "${t}" sound name "Basso"`]);
  } else if (os === 'win32') {
    const ps = `[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null;
$x = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02);
$t = $x.GetElementsByTagName('text'); $t.Item(0).AppendChild($x.CreateTextNode('${t.replace(/'/g, '')}')) | Out-Null; $t.Item(1).AppendChild($x.CreateTextNode('${b.replace(/'/g, '')}')) | Out-Null;
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('MyTradePilot Referee').Show([Windows.UI.Notifications.ToastNotification]::new($x))`;
    await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps]);
  } else {
    await run('notify-send', ['-u', 'critical', t, b]);
  }
}
