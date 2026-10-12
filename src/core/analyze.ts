// Turns a list of trades into the edge/leak report.
// The unit is % return per trade, so results compare across account and position sizes.
import { marketClock } from './time.ts';
import type { Trade } from './types.ts';

/** How strongly small groups are pulled toward the overall average (in "phantom trades"). */
const SHRINK_K = 10;
/** Smallest group allowed to be called an edge or a leak. */
const MIN_INSIGHT_N = 5;
/** Re-entering this soon after a loss counts as a quick re-entry. */
const QUICK_REENTRY_MIN = 10;

export type Confidence = 'too few' | 'early signal' | 'solid';

export interface GroupStats {
  label: string;
  /** Reads naturally in a sentence: "Your 1st trade of the day". */
  phrase: string;
  n: number;
  winRate: number;
  avgReturn: number;
  /** avgReturn shrunk toward the overall average by sample size. */
  adjReturn: number;
  avgWin: number | null;
  avgLoss: number | null;
  totalPnl: number;
  totalReturn: number;
  confidence: Confidence;
}

export interface Dimension {
  id: string;
  title: string;
  groups: GroupStats[];
  /** Used for edge/leak detection (symbol and weekday are shown but too easy to overfit). */
  insights: boolean;
}

export interface Insight {
  /** edge: beats your average; leak: loses money; weak: profitable but well below your average. */
  kind: 'edge' | 'leak' | 'weak';
  dimension: string;
  group: GroupStats;
  /** Total P&L if this group had been skipped. */
  pnlWithout: number;
  /** Total return points if this group had been skipped. */
  returnWithout: number;
}

export interface Summary {
  trades: number;
  openTrades: number;
  wins: number;
  winRate: number;
  avgReturn: number;
  medianReturn: number;
  avgWin: number | null;
  avgLoss: number | null;
  /** Average R if every trade risked `stopPct`. */
  avgR: number;
  totalPnl: number;
  totalReturn: number;
  profitFactor: number | null;
  maxDrawdown: number;
  best: Trade | null;
  worst: Trade | null;
  firstDay: string | null;
  lastDay: string | null;
  days: number;
  symbols: string[];
}

export interface RiskStats {
  stopPct: number;
  /** Trades whose worst point went past -stopPct (needs excursion data). */
  pastStop: number;
  pastStopCameBack: number;
  pastStopReturn: number;
  /** Total return points if every trade past the stop had been closed at -stopPct. */
  returnWithStop: number;
  hasExcursions: boolean;
  /** Share of total profit from the 5 best trades. */
  top5Share: number | null;
  stopOrderRate: number;
}

export interface Report {
  summary: Summary;
  dimensions: Dimension[];
  edges: Insight[];
  /** Money-losing patterns first, then profitable-but-weak ones to fill up to 3. */
  leaks: Insight[];
  risk: RiskStats;
}

export interface AnalyzeOptions {
  /** Stop distance in % used for R and the "hard stop" what-if. */
  stopPct: number;
}

interface Ctx {
  t: Trade;
  date: string;
  minutes: number;
  weekday: string;
  tradeOfDay: number;
  prev: 'first' | 'win' | 'loss' | 'quick-after-loss';
  holdMin: number;
  overnight: boolean;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function withContext(closed: Trade[]): Ctx[] {
  const out: Ctx[] = [];
  const countByDay = new Map<string, number>();
  let prevSameDay: { date: string; t: Trade } | null = null;

  for (const t of closed) {
    const clock = marketClock(t.entryTime);
    const n = (countByDay.get(clock.date) ?? 0) + 1;
    countByDay.set(clock.date, n);

    let prev: Ctx['prev'] = 'first';
    if (prevSameDay && prevSameDay.date === clock.date) {
      const p = prevSameDay.t;
      if (p.pnl > 0) prev = 'win';
      else {
        const gap = p.exitTime ? (t.entryTime.getTime() - p.exitTime.getTime()) / 60000 : Infinity;
        prev = gap < QUICK_REENTRY_MIN ? 'quick-after-loss' : 'loss';
      }
    }

    const exit = t.exitTime!;
    out.push({
      t,
      date: clock.date,
      minutes: clock.minutes,
      weekday: clock.weekday,
      tradeOfDay: n,
      prev,
      holdMin: (exit.getTime() - t.entryTime.getTime()) / 60000,
      overnight: marketClock(exit).date !== clock.date,
    });
    prevSameDay = { date: clock.date, t };
  }
  return out;
}

function stats(label: string, phrase: string, rows: Ctx[], overallAvg: number): GroupStats {
  const rets = rows.map((r) => r.t.returnPct);
  const wins = rets.filter((r) => r > 0);
  const losses = rets.filter((r) => r <= 0);
  const n = rows.length;
  const avg = mean(rets);
  return {
    label,
    phrase,
    n,
    winRate: n ? wins.length / n : 0,
    avgReturn: avg,
    adjReturn: (n * avg + SHRINK_K * overallAvg) / (n + SHRINK_K),
    avgWin: wins.length ? mean(wins) : null,
    avgLoss: losses.length ? mean(losses) : null,
    totalPnl: sum(rows.map((r) => r.t.pnl)),
    totalReturn: sum(rets),
    confidence: n < MIN_INSIGHT_N ? 'too few' : n < 15 ? 'early signal' : 'solid',
  };
}

interface Bucket {
  label: string;
  phrase: string;
  test: (c: Ctx) => boolean;
}

const at = (h: number, m: number) => h * 60 + m;

const TIME_BUCKETS: Bucket[] = [
  { label: 'Pre-market', phrase: 'Pre-market entries', test: (c) => c.minutes < at(9, 30) },
  { label: '9:30–9:45', phrase: 'Entries 9:30–9:45 ET', test: (c) => c.minutes >= at(9, 30) && c.minutes < at(9, 45) },
  { label: '9:45–10:15', phrase: 'Entries 9:45–10:15 ET', test: (c) => c.minutes >= at(9, 45) && c.minutes < at(10, 15) },
  { label: '10:15–11:30', phrase: 'Entries 10:15–11:30 ET', test: (c) => c.minutes >= at(10, 15) && c.minutes < at(11, 30) },
  { label: '11:30–2:00', phrase: 'Midday entries (11:30–2:00 ET)', test: (c) => c.minutes >= at(11, 30) && c.minutes < at(14, 0) },
  { label: '2:00–4:00', phrase: 'Afternoon entries (2:00–4:00 ET)', test: (c) => c.minutes >= at(14, 0) && c.minutes < at(16, 0) },
  { label: 'After hours', phrase: 'After-hours entries', test: (c) => c.minutes >= at(16, 0) },
];

const TRADE_OF_DAY: Bucket[] = [
  { label: '1st', phrase: 'Your 1st trade of the day', test: (c) => c.tradeOfDay === 1 },
  { label: '2nd', phrase: 'Your 2nd trade of the day', test: (c) => c.tradeOfDay === 2 },
  { label: '3rd', phrase: 'Your 3rd trade of the day', test: (c) => c.tradeOfDay === 3 },
  { label: '4th or later', phrase: 'Trades after your 3rd of the day', test: (c) => c.tradeOfDay >= 4 },
];

const AFTER_PREV: Bucket[] = [
  { label: 'First of the day', phrase: 'Your first trade each day', test: (c) => c.prev === 'first' },
  { label: 'After a win', phrase: 'Trades right after a win', test: (c) => c.prev === 'win' },
  { label: 'After a loss', phrase: `Trades after a loss (${QUICK_REENTRY_MIN}+ min later)`, test: (c) => c.prev === 'loss' },
  {
    label: `< ${QUICK_REENTRY_MIN} min after a loss`,
    phrase: `Quick re-entries within ${QUICK_REENTRY_MIN} min of a loss`,
    test: (c) => c.prev === 'quick-after-loss',
  },
];

const DIRECTION: Bucket[] = [
  { label: 'Long', phrase: 'Your longs', test: (c) => c.t.direction === 'long' },
  { label: 'Short', phrase: 'Your shorts', test: (c) => c.t.direction === 'short' },
];

const HOLD: Bucket[] = [
  { label: 'Under 15 min', phrase: 'Trades held under 15 min', test: (c) => !c.overnight && c.holdMin < 15 },
  { label: '15–60 min', phrase: 'Trades held 15–60 min', test: (c) => !c.overnight && c.holdMin >= 15 && c.holdMin < 60 },
  { label: '1–3 hours', phrase: 'Trades held 1–3 hours', test: (c) => !c.overnight && c.holdMin >= 60 && c.holdMin < 180 },
  { label: '3+ hours', phrase: 'Trades held 3+ hours', test: (c) => !c.overnight && c.holdMin >= 180 },
  { label: 'Overnight', phrase: 'Trades held overnight', test: (c) => c.overnight },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

function dimension(id: string, title: string, buckets: Bucket[], ctx: Ctx[], overall: number, insights = true): Dimension {
  const groups = buckets
    .map((b) => {
      const rows = ctx.filter(b.test);
      return rows.length ? stats(b.label, b.phrase, rows, overall) : null;
    })
    .filter((g): g is GroupStats => g !== null);
  return { id, title, groups, insights };
}

function maxDrawdown(closed: Trade[]): number {
  let peak = 0;
  let equity = 0;
  let dd = 0;
  for (const t of [...closed].sort((a, b) => a.exitTime!.getTime() - b.exitTime!.getTime())) {
    equity += t.pnl;
    peak = Math.max(peak, equity);
    dd = Math.min(dd, equity - peak);
  }
  return dd;
}

export function analyze(trades: Trade[], opts: AnalyzeOptions): Report {
  const closed = trades.filter((t) => t.exitTime !== null);
  const ctx = withContext(closed);
  const rets = closed.map((t) => t.returnPct);
  const overall = mean(rets);
  const wins = closed.filter((t) => t.returnPct > 0);
  const losses = closed.filter((t) => t.returnPct <= 0);
  const grossWin = sum(closed.filter((t) => t.pnl > 0).map((t) => t.pnl));
  const grossLoss = -sum(closed.filter((t) => t.pnl < 0).map((t) => t.pnl));
  const days = [...new Set(ctx.map((c) => c.date))].sort();
  const byReturn = [...closed].sort((a, b) => b.returnPct - a.returnPct);
  const symbols = [...new Set(closed.map((t) => t.symbol))].sort();

  const summary: Summary = {
    trades: closed.length,
    openTrades: trades.length - closed.length,
    wins: wins.length,
    winRate: closed.length ? wins.length / closed.length : 0,
    avgReturn: overall,
    medianReturn: median(rets),
    avgWin: wins.length ? mean(wins.map((t) => t.returnPct)) : null,
    avgLoss: losses.length ? mean(losses.map((t) => t.returnPct)) : null,
    avgR: overall / opts.stopPct,
    totalPnl: sum(closed.map((t) => t.pnl)),
    totalReturn: sum(rets),
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    maxDrawdown: maxDrawdown(closed),
    best: byReturn[0] ?? null,
    worst: byReturn[byReturn.length - 1] ?? null,
    firstDay: days[0] ?? null,
    lastDay: days[days.length - 1] ?? null,
    days: days.length,
    symbols,
  };

  const dimensions: Dimension[] = [
    dimension('time', 'Entry time (New York)', TIME_BUCKETS, ctx, overall),
    dimension('tradeOfDay', 'Trade number of the day', TRADE_OF_DAY, ctx, overall),
    dimension('afterPrev', 'What came before', AFTER_PREV, ctx, overall),
    dimension('direction', 'Direction', DIRECTION, ctx, overall),
    // Hold time is shown but not mined: winners get held longer because they are winning.
    dimension('hold', 'How long you held', HOLD, ctx, overall, false),
    dimension(
      'weekday',
      'Day of the week',
      WEEKDAYS.map((d) => ({ label: d, phrase: `${d} trades`, test: (c: Ctx) => c.weekday === d })),
      ctx,
      overall,
      false,
    ),
    dimension(
      'symbol',
      'Ticker',
      symbols.map((s) => ({ label: s, phrase: `${s} trades`, test: (c: Ctx) => c.t.symbol === s })),
      ctx,
      overall,
      false,
    ),
  ];

  const candidates: Insight[] = [];
  const seenGroups = new Set<string>();
  for (const d of dimensions) {
    if (!d.insights || d.groups.length < 2) continue;
    for (const g of d.groups) {
      if (g.n < MIN_INSIGHT_N || g.n === closed.length) continue;
      // The same trades can appear under two dimensions (1st of the day = first of the day).
      const id = `${g.n}|${g.totalReturn}`;
      if (seenGroups.has(id)) continue;
      seenGroups.add(id);
      const kind = g.adjReturn > overall ? 'edge' : g.avgReturn < 0 ? 'leak' : 'weak';
      // Edges must clearly beat the average (mirror of the weak-spot rule below).
      if (kind === 'edge' && (g.avgReturn <= 0 || g.avgReturn < overall + Math.abs(overall) / 2)) continue;
      candidates.push({
        kind,
        dimension: d.title,
        group: g,
        pnlWithout: summary.totalPnl - g.totalPnl,
        returnWithout: summary.totalReturn - g.totalReturn,
      });
    }
  }
  // Impact = how far the (shrunk) average sits from overall, times how often it happens.
  const impact = (i: Insight) => (i.group.adjReturn - overall) * i.group.n;
  const byKind = (k: Insight['kind']) => candidates.filter((i) => i.kind === k);
  const edges = byKind('edge').sort((a, b) => impact(b) - impact(a)).slice(0, 3);
  const leaks = [
    ...byKind('leak').sort((a, b) => impact(a) - impact(b)),
    // Weak spots only count when clearly below average (under half of it).
    ...byKind('weak')
      .filter((i) => i.group.avgReturn < overall / 2)
      .sort((a, b) => impact(a) - impact(b)),
  ].slice(0, 3);

  const withMae = closed.filter((t) => t.maePct !== null);
  const pastStop = withMae.filter((t) => t.maePct! <= -opts.stopPct);
  const risk: RiskStats = {
    stopPct: opts.stopPct,
    hasExcursions: withMae.length === closed.length && closed.length > 0,
    pastStop: pastStop.length,
    pastStopCameBack: pastStop.filter((t) => t.returnPct > 0).length,
    pastStopReturn: sum(pastStop.map((t) => t.returnPct)),
    returnWithStop: summary.totalReturn - sum(pastStop.map((t) => t.returnPct)) - pastStop.length * opts.stopPct,
    top5Share: summary.totalReturn > 0 ? sum(byReturn.slice(0, 5).map((t) => t.returnPct)) / summary.totalReturn : null,
    stopOrderRate: closed.length ? closed.filter((t) => t.stoppedOut).length / closed.length : 0,
  };

  return { summary, dimensions, edges, leaks, risk };
}

// ---- Labels shared with the live engine, so "next trade" context matches the report's buckets. ----

export function tradeOfDayLabel(n: number): string {
  return TRADE_OF_DAY.find((b) => b.test({ tradeOfDay: n } as Ctx))?.label ?? '4th or later';
}

export function afterPrevLabel(prev: Ctx['prev']): string {
  return AFTER_PREV.find((b) => b.test({ prev } as Ctx))?.label ?? 'First of the day';
}

export function timeBucketLabel(minutes: number): string {
  return TIME_BUCKETS.find((b) => b.test({ minutes } as Ctx))?.label ?? 'After hours';
}

export const QUICK_REENTRY_MINUTES = QUICK_REENTRY_MIN;
export const SOLID_N = 15;
export const MIN_N = MIN_INSIGHT_N;
