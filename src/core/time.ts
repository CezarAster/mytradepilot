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

// Zone abbreviations brokers append to timestamps ("03/02/2026 09:35:12 EST").
const ZONE_ABBR: Record<string, string> = {
  ET: 'America/New_York',
  EST: 'America/New_York',
  EDT: 'America/New_York',
  CT: 'America/Chicago',
  CST: 'America/Chicago',
  CDT: 'America/Chicago',
  MT: 'America/Denver',
  MST: 'America/Denver',
  MDT: 'America/Denver',
  PT: 'America/Los_Angeles',
  PST: 'America/Los_Angeles',
  PDT: 'America/Los_Angeles',
  UTC: 'UTC',
  GMT: 'UTC',
};

/**
 * A broker timestamp read as wall-clock time in `tz` -> the real instant.
 * Accepts "2026-08-21 06:30", "2026-08-21, 06:30:00", "20260821;063000",
 * "8/21/2026 6:30:00 AM", "8/21/26 06:30". A trailing zone ("EDT") or UTC offset
 * ("-04:00", "Z") overrides `tz`. Slashed dates are month first unless that can't be.
 */
export function zonedTimeToUtc(text: string, tz: string): Date | null {
  let t = text.trim();
  let offset: number | null = null;
  const off = /(?:\s*(Z)|\s*([+-])(\d{2}):?(\d{2}))$/.exec(t);
  if (off && /\d:\d{2}(:\d{2})?(\.\d+)?$/.test(t.slice(0, off.index))) {
    offset = off[1] ? 0 : (off[2] === '-' ? -1 : 1) * (+off[3] * 60 + +off[4]);
    t = t.slice(0, off.index);
  } else {
    const abbr = /\s+([A-Z]{2,4})$/.exec(t);
    if (abbr && ZONE_ABBR[abbr[1]]) {
      tz = ZONE_ABBR[abbr[1]];
      t = t.slice(0, abbr.index);
    }
  }

  let y: number, mo: number, d: number, rest: string;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T,]+|$)(.*)$/.exec(t);
  if (m) {
    [y, mo, d, rest] = [+m[1], +m[2], +m[3], m[4]];
  } else if ((m = /^(\d{4})(\d{2})(\d{2})[;\s]+(\d{2})(\d{2})(\d{2})?$/.exec(t))) {
    [y, mo, d, rest] = [+m[1], +m[2], +m[3], `${m[4]}:${m[5]}:${m[6] ?? '00'}`];
  } else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ T,]+|$)(.*)$/.exec(t))) {
    [mo, d, y, rest] = [+m[1], +m[2], +m[3], m[4]];
    if (mo > 12) [mo, d] = [d, mo];
    if (y < 100) y += 2000;
  } else {
    return null;
  }

  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?$/.exec(rest.trim());
  if (!tm || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let h = +tm[1];
  if (tm[4]) {
    const pm = tm[4].toLowerCase() === 'pm';
    if (h === 12) h = pm ? 12 : 0;
    else if (pm) h += 12;
  }
  const guess = Date.UTC(y, mo - 1, d, h, +tm[2], tm[3] ? +tm[3] : 0);
  if (offset !== null) return new Date(guess - offset * 60_000);
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
