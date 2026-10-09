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
// Day and month in either order: 03/02/2026, 3-2-26 (not 2026-03-02).
const AMBIGUOUS_DATE = /^\s*(\d{1,2})[/-](\d{1,2})[/-](?:\d{4}|\d{2})(?!\d)/;
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * Whether a file's day/month dates are day first (13/03/2026), decided once for the whole
 * file so every row is read the same way: true if some date can only be day first,
 * false if some date can only be month first, undefined if every date is ambiguous.
 */
export function detectDayFirst(cells: Iterable<string>): boolean | undefined {
  let firstOver12 = false;
  let secondOver12 = false;
  for (const c of cells) {
    const m = AMBIGUOUS_DATE.exec(c);
    if (!m) continue;
    if (+m[1] > 12) firstOver12 = true;
    if (+m[2] > 12) secondOver12 = true;
  }
  if (firstOver12 !== secondOver12) return firstOver12;
  return undefined;
}

/** True if any cell holds a date like 03/02/2026 that could be read either way. */
export const hasSlashedDates = (cells: Iterable<string>) => {
  for (const c of cells) if (AMBIGUOUS_DATE.test(c)) return true;
  return false;
};

/** US time zones, where month-first dates are the norm. */
export function isUsTimeZone(tz: string): boolean {
  return (
    /^America\/(New_York|Chicago|Denver|Phoenix|Los_Angeles|Anchorage|Juneau|Sitka|Nome|Adak|Detroit|Boise|Menominee|Metlakatla|Yakutat)$/.test(tz) ||
    /^America\/(Indiana|Kentucky|North_Dakota)\//.test(tz) ||
    /^(US\/|Pacific\/Honolulu$)/.test(tz)
  );
}

/**
 * Date order for an export whose layout follows the user's computer settings, when no
 * date in it settles the question: "6/03/2026" (unpadded day, padded month) is day first;
 * otherwise go by the time zone, and say what was assumed outside the US.
 */
export function guessDayFirst(cells: string[], tz: string): { dayFirst: boolean; warning: string | null } {
  if (cells.some((c) => /^\s*\d[/-]0\d[/-]/.test(c))) return { dayFirst: true, warning: null };
  if (isUsTimeZone(tz)) return { dayFirst: false, warning: null };
  return { dayFirst: true, warning: 'Dates like 03/02 were read day first (3 February), since no date in the file settles it.' };
}

/** "2026-03-02", "2026/3/2", "20260302", "02/03/2026", "2.3.26", "02-Mar-26", "2 Mar 2026" -> [y, m, d, rest]. */
function readDate(t: string, dayFirst: boolean): [number, number, number, string] | null {
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)(.*)$/.exec(t);
  if (m) return [+m[1], +m[2], +m[3], m[4]];
  if ((m = /^(\d{4})(\d{2})(\d{2})(.*)$/.exec(t))) return [+m[1], +m[2], +m[3], m[4]];
  if ((m = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4}|\d{2})(?!\d)(.*)$/.exec(t))) {
    const y = +m[4] < 100 ? +m[4] + 2000 : +m[4];
    // Dotted dates (2.3.2026) are always day first.
    return m[2] === '.' || dayFirst ? [y, +m[3], +m[1], m[5]] : [y, +m[1], +m[3], m[5]];
  }
  if ((m = /^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s,]+(\d{4}|\d{2})(?!\d)(.*)$/.exec(t))) {
    const mo = MONTHS.indexOf(m[2].toUpperCase()) + 1;
    return mo ? [+m[3] < 100 ? +m[3] + 2000 : +m[3], mo, +m[1], m[4]] : null;
  }
  return null;
}

/**
 * A broker timestamp read as wall-clock time in `tz` -> the real instant.
 * Dates as in readDate; times "06:30", "6:30:00 PM", "063000" (IBKR), with any of
 * space, T, comma or semicolon between. A trailing zone we know ("EDT") or UTC offset
 * ("-04:00", "+00", "Z", "GMT-4") overrides `tz`; other zone names are ignored.
 * Day/month dates are month first unless `dayFirst` (see detectDayFirst).
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

  const date = readDate(t, dayFirst);
  if (!date) return null;
  const [y, mo, d] = date;
  const rest = date[3].replace(/^[\sT,;]*/, '');
  const tm =
    /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?\s*(?:([ap])\.?m\.?)?$/i.exec(rest) ?? /^(\d{2})(\d{2})(\d{2})?()$/.exec(rest);
  if (!tm || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  let h = +tm[1];
  if (tm[4] && h <= 12) {
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
