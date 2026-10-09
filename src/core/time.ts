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

const AM_PM = /^[ap]\.?m\.?$/i;
const SLASHED_DATE = /^\s*(\d{1,2})\/(\d{1,2})\/(?:\d{4}|\d{2})(?!\d)/;

/**
 * Whether a file's slashed dates are day first (13/03/2026), decided once for the whole
 * file so every row is read the same way: true if some date can only be day first,
 * false if some date can only be month first, undefined if every date is ambiguous.
 */
export function detectDayFirst(cells: Iterable<string>): boolean | undefined {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const c of cells) {
    const m = SLASHED_DATE.exec(c);
    if (!m) continue;
    if (+m[1] > 12) firstOver12 = true;
    if (+m[2] > 12) secondOver12 = true;
  }
  if (firstOver12 !== secondOver12) return firstOver12;
  return undefined;
}

/** True if any cell holds an ambiguous slashed date like 03/02/2026. */
export const hasSlashedDates = (cells: Iterable<string>) => {
  for (const c of cells) if (SLASHED_DATE.test(c)) return true;
  return false;
};

/**
 * A broker timestamp read as wall-clock time in `tz` -> the real instant.
 * Accepts "2026-08-21 06:30", "2026-08-21, 06:30:00", "20260821;063000",
 * "8/21/2026 6:30:00 AM", "8/21/26 06:30", "21.08.2026 06:30". A trailing zone we know
 * ("EDT") or UTC offset ("-04:00", "+00", "Z", "GMT-4") overrides `tz`; other zone names
 * are ignored. Slashed dates are month first unless `dayFirst` (see detectDayFirst).
 */
export function zonedTimeToUtc(text: string, tz: string, dayFirst = false): Date | null {
  let t = text.trim().replace(/\s*\(([A-Za-z]{2,5})\)$/, ' $1');
  const name = /\s+([A-Za-z]{2,5})$/.exec(t);
  if (name && !AM_PM.test(name[1])) {
    tz = ZONE_ABBR[name[1].toUpperCase()] ?? tz;
    t = t.slice(0, name.index);
  }
  let offset: number | null = null;
  const off = /\s*(?:(z)|(?:gmt|utc)?([+-])(\d{1,2})(?::?(\d{2}))?)$/i.exec(t);
  if (off && /\d:\d{2}(:\d{2})?([.,]\d+)?(\s*[ap]\.?m\.?)?$/i.test(t.slice(0, off.index))) {
    offset = off[1] ? 0 : (off[2] === '-' ? -1 : 1) * (+off[3] * 60 + +(off[4] ?? 0));
    t = t.slice(0, off.index);
  }

  let y: number, mo: number, d: number, rest: string;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T,;]+|$)(.*)$/.exec(t);
  if (m) {
    [y, mo, d, rest] = [+m[1], +m[2], +m[3], m[4]];
  } else if ((m = /^(\d{4})(\d{2})(\d{2})[;\s]+(\d{2})(\d{2})(\d{2})?$/.exec(t))) {
    [y, mo, d, rest] = [+m[1], +m[2], +m[3], `${m[4]}:${m[5]}:${m[6] ?? '00'}`];
  } else if ((m = /^(\d{1,2})([/.])(\d{1,2})\2(\d{4}|\d{2})(?:[ T,;]+|$)(.*)$/.exec(t))) {
    // Dotted dates (21.08.2026) are always day first.
    [mo, d] = m[2] === '.' || dayFirst ? [+m[3], +m[1]] : [+m[1], +m[3]];
    [y, rest] = [+m[4] < 100 ? +m[4] + 2000 : +m[4], m[5]];
  } else {
    return null;
  }

  const tm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*([ap])?\.?(?:m\.?)?$/i.exec(rest.trim());
  if (!tm || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let h = +tm[1];
  if (tm[4]) {
    const pm = tm[4].toLowerCase() === 'p';
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
