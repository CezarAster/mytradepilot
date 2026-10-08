// Time zone helpers built on Intl, so they work the same in Node and the browser.

export const MARKET_TZ = 'America/New_York';

interface WallClock {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  weekday: string;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    formatters.set(tz, f);
  }
  return f;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

function wallClock(ts: number, tz: string): WallClock {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(ts))) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    h: Number(parts.hour) % 24,
    mi: Number(parts.minute),
    s: Number(parts.second),
    weekday: parts.weekday,
  };
}

function offsetMs(ts: number, tz: string): number {
  const w = wallClock(ts, tz);
  return Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - Math.floor(ts / 1000) * 1000;
}

/** "2026-08-21 06:30" read as wall-clock time in `tz` -> the real instant. */
export function zonedTimeToUtc(text: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text.trim());
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0);
  // Two passes settle the offset around DST changes.
  let ts = guess - offsetMs(guess, tz);
  ts = guess - offsetMs(ts, tz);
  return new Date(ts);
}

export interface MarketClock {
  /** Trading date in New York, YYYY-MM-DD. */
  date: string;
  /** Minutes since midnight New York time (9:30 = 570). */
  minutes: number;
  weekday: string;
}

export function marketClock(d: Date): MarketClock {
  const w = wallClock(d.getTime(), MARKET_TZ);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${w.y}-${pad(w.m)}-${pad(w.d)}`,
    minutes: w.h * 60 + w.mi,
    weekday: w.weekday,
  };
}
