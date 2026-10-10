// Browser notifications and a short beep on breaches and referee actions.
// Both are opt-in through Settings (notifications.desktop / notifications.sound, cached in the store).
import type { ActionLog, ServerEvent } from '../src/server/api.ts';
import { onServerEvent, store } from './main.ts';
import { ruleLabel } from './views/rules.ts';

let audio: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') audio.resume().catch(() => undefined);
    return audio;
  } catch {
    return null;
  }
}

/** Browsers only let audio start after a gesture, so the first click or key press warms the context up. */
function unlockAudio(): void {
  if (!store.settings?.notifications.sound) return;
  if (context()) {
    window.removeEventListener('pointerdown', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  }
}

export function beep(times = 1): void {
  const ctx = context();
  if (!ctx) return;
  try {
    for (let i = 0; i < times; i++) {
      const t = ctx.currentTime + i * 0.22;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  } catch {
    // No audio on this device.
  }
}

export function desktopNotify(title: string, body: string): void {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(title, { body });
    window.setTimeout(() => n.close(), 15000);
  } catch {
    // Some browsers refuse page-created notifications; nothing to do.
  }
}

const NOTIFY_KINDS = new Set<ActionLog['kind']>(['flatten', 'flatten_all', 'manual_flatten', 'dry_run', 'lock', 'error', 'cancel_orders']);

function actionTitle(a: ActionLog): string {
  const sym = a.symbol ? ` ${a.symbol}` : '';
  switch (a.kind) {
    case 'flatten':
      return `Referee closed${sym}`;
    case 'flatten_all':
      return 'Referee closed every position';
    case 'manual_flatten':
      return `Flattened${sym}`;
    case 'dry_run':
      return `Dry run: would have closed${sym}`;
    case 'lock':
      return 'Locked for the rest of the day';
    case 'cancel_orders':
      return `Orders cancelled${sym}`;
    case 'error':
      return 'Referee error';
    default:
      return 'Referee action';
  }
}

function onEvent(e: ServerEvent): void {
  const prefs = store.settings?.notifications ?? { desktop: false, sound: false };
  if (!prefs.desktop && !prefs.sound) return;
  let title: string | null = null;
  let body = '';
  if (e.type === 'breach') {
    title = `Rule breach: ${ruleLabel(e.breach.rule)}`;
    body = e.breach.message;
  } else if (e.type === 'action' && NOTIFY_KINDS.has(e.action.kind)) {
    title = actionTitle(e.action);
    body = e.action.detail;
  }
  if (title === null) return;
  if (prefs.desktop) desktopNotify(title, body);
  if (prefs.sound) beep(e.type === 'breach' ? 2 : 1);
}

export function initNotifications(): void {
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  onServerEvent(onEvent);
}
