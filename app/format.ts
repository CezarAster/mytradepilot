// Formatting for the Referee UI. Every time is New York time and labelled "ET".
export const MARKET_TZ = 'America/New_York';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: MARKET_TZ, ...opts });
const CLOCK = fmt({ hour: 'numeric', minute: '2-digit', second: '2-digit' });
const SHORT_CLOCK = fmt({ hour: 'numeric', minute: '2-digit' });
const DATE_TIME = fmt({ month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const MONTH_DAY = fmt({ month: 'short', day: 'numeric' });
const LOCAL_DATE = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

const valid = (ts: number) => Number.isFinite(ts) && ts > 0;

/** "10:41:12 AM" (New York). Put "ET" in the column header when you use this in a table. */
export function clockET(ts: number, seconds = true): string {
  if (!valid(ts)) return '';
  return (seconds ? CLOCK : SHORT_CLOCK).format(new Date(ts));
}

/** "10:41:12 AM ET" */
export function timeET(ts: number, seconds = true): string {
  const s = clockET(ts, seconds);
  return s ? `${s} ET` : '';
}

/** "Oct 10, 10:41 AM ET" */
export function dateTimeET(ts: number): string {
  if (!valid(ts)) return '';
  return `${DATE_TIME.format(new Date(ts))} ET`;
}

/** "Oct 10, 10:41:12 AM ET" for log lines, where seconds matter. */
export function dateClockET(ts: number): string {
  if (!valid(ts)) return '';
  const d = new Date(ts);
  return `${MONTH_DAY.format(d)}, ${CLOCK.format(d)} ET`;
}

/** A "YYYY-MM-DD" trading date as "Fri, Oct 10, 2026". Falls back to the input. */
export function dateLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return LOCAL_DATE.format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Money with two decimals: "-$1,234.56". */
export function money2(x: number): string {
  if (!Number.isFinite(x)) return '';
  const abs = Math.abs(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${x < 0 ? '-' : ''}$${abs}`;
}

/** Prices: two decimals, four under a dollar. */
export function price(x: number): string {
  if (!Number.isFinite(x)) return '';
  const digits = Math.abs(x) < 1 ? 4 : 2;
  return x.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Share counts, unsigned. */
export function shares(x: number): string {
  return Number.isFinite(x) ? Math.abs(x).toLocaleString('en-US') : '';
}

/** 0.264 -> "26%" */
export const pctInt = (x: number) => `${Math.round(x * 100)}%`;

/** m:ss, or h:mm:ss past an hour. Never negative. */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export const secondsLeft = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/** Time zones offered for CSV imports (same list as the public analyzer). */
export const TIME_ZONES: [string, string][] = [
  ['America/New_York', 'New York (ET)'],
  ['America/Chicago', 'Chicago (CT)'],
  ['America/Denver', 'Denver (MT)'],
  ['America/Phoenix', 'Phoenix (MST)'],
  ['America/Los_Angeles', 'Los Angeles (PT)'],
  ['Europe/London', 'London'],
  ['Europe/Berlin', 'Central Europe'],
  ['Asia/Kolkata', 'India'],
  ['Asia/Singapore', 'Singapore'],
  ['Australia/Sydney', 'Sydney'],
  ['UTC', 'UTC'],
];
