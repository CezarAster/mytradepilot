// "Does this symbol look like my setup right now?" Pure: bars and "now" in, check lines out.
import type { AlpacaBar } from '../alpaca/types.ts';
import type { SetupCheckLine, StrategyDefinition } from '../server/api.ts';
import { barDate, dayChangePct, ema, relativeVolume, sessionVwap } from './indicators.ts';

export interface SetupInput {
  symbol: string;
  side: 'long' | 'short';
  /** Latest price, or null to use the last intraday bar's close. */
  price: number | null;
  /** Previous session's close, for the day change. */
  prevClose: number | null;
  /** Trading-timeframe bars, several days, oldest first. */
  intraday: AlpacaBar[];
  /** Previous daily bars, oldest first, not including today. */
  daily: AlpacaBar[];
  /** New York trading date (YYYY-MM-DD) and minutes since midnight (9:30 = 570). */
  nowNY: { date: string; minutes: number };
}

export interface SetupCheckResult {
  lines: SetupCheckLine[];
  /** How many of the applicable lines pass; lines with pass null count in neither. */
  score: { pass: number; total: number };
  warnings: string[];
}

/**
 * Check one symbol against the strategy. Every line is one requirement in plain words with
 * what was measured and what the strategy wants; pass is null when the data to judge it is missing
 * (or the requirement is switched off), and such lines are left out of the score.
 */
export function checkSetup(def: StrategyDefinition, input: SetupInput): SetupCheckResult {
  const { intraday, daily, nowNY } = input;
  const long = input.side === 'long';
  const fast = `EMA ${def.emaFast}`;
  const slow = `EMA ${def.emaSlow}`;
  const last = intraday.length > 0 ? intraday[intraday.length - 1] : null;
  const price = usable(input.price) ?? (last ? usable(last.c) : null);
  const todayBars = intraday.filter((b) => barDate(b) === nowNY.date);

  const warnings: string[] = [];
  if (intraday.length < def.emaSlow * 3) {
    warnings.push(`Only ${intraday.length} ${def.timeframe} bars; ${slow} needs about ${def.emaSlow * 3} to settle.`);
  }
  if (daily.length === 0) warnings.push('No daily bars, so relative volume cannot be measured.');
  if (price === null) warnings.push('No price and no bars.');
  if (last && todayBars.length === 0) warnings.push(`Latest bar is from ${barDate(last)}, not today.`);

  const lines: SetupCheckLine[] = [];
  const line = (id: string, label: string, pass: boolean | null, value: string, target: string) => {
    lines.push({ id, label, pass, value, target });
  };

  line(
    'price',
    'Price',
    price === null ? null : price >= def.minPrice,
    price === null ? 'no price' : money(price),
    `at least ${money(def.minPrice)}`,
  );

  const change = price !== null && input.prevClose !== null ? dayChangePct(price, input.prevClose) : null;
  line(
    'dayChange',
    'Moving today',
    change === null ? null : long ? change >= def.minDayChangePct : change <= -def.minDayChangePct,
    change === null ? (price === null ? 'no price' : 'no previous close') : pct(change),
    long ? `at least ${pct(def.minDayChangePct)}` : `at most ${pct(-def.minDayChangePct)}`,
  );

  const rvol = relativeVolume(todayBars, daily, nowNY.minutes);
  line(
    'relVolume',
    'Relative volume',
    rvol === null ? null : rvol >= def.minRelativeVolume,
    rvol === null ? 'not enough daily bars' : `RVOL ${rvol.toFixed(1)}x`,
    `at least ${def.minRelativeVolume}x`,
  );

  // EMAs over the whole intraday series so they are warm; judged only with at least one slow period of bars.
  const closes = intraday.map((b) => b.c);
  const fastEma = ema(closes, def.emaFast);
  const slowEma = ema(closes, def.emaSlow);
  const n = intraday.length;
  const f = fastEma[n - 1];
  const s = slowEma[n - 1];
  const ready = price !== null && n >= def.emaSlow && Number.isFinite(f) && Number.isFinite(s);
  const thin = price === null ? 'no price' : `only ${n} bars`;
  const dir = long ? 'above' : 'below';

  const trendTarget = `price and ${fast} ${dir} ${slow}` + (def.requireTrend ? '' : ' (not required)');
  const pullbackTarget = `within ${def.pullbackMaxPct}% of ${fast}`;
  const extendedTarget = `no more than ${2 * def.pullbackMaxPct}% ${dir} ${fast}`;
  const slopeTarget = long ? 'rising' : 'falling';
  if (ready && price !== null) {
    const trendOk = long ? price > s && f > s : price < s && f < s;
    line(
      'trend',
      'Trend',
      def.requireTrend ? trendOk : null,
      `price ${rel(price, s)} ${slow}, ${fast} ${rel(f, s)} ${slow}`,
      trendTarget,
    );
    // Distance from price to the fast EMA as % of price: positive above, negative below.
    const dist = ((price - f) / price) * 100;
    line('pullback', `Pulled back to ${fast}`, Math.abs(dist) <= def.pullbackMaxPct, distText(dist, fast), pullbackTarget);
    // The far side for a long is above the fast EMA, for a short below: too far there is a chase.
    const chase = long ? dist : -dist;
    line('notExtended', 'Not extended', chase <= 2 * def.pullbackMaxPct, distText(dist, fast), extendedTarget);
  } else {
    line('trend', 'Trend', null, thin, trendTarget);
    line('pullback', `Pulled back to ${fast}`, null, thin, pullbackTarget);
    line('notExtended', 'Not extended', null, thin, extendedTarget);
  }

  const vwapSeries = sessionVwap(todayBars);
  const vwap = todayBars.length > 0 ? vwapSeries[vwapSeries.length - 1] : NaN;
  const vwapTarget = `${dir} VWAP` + (def.requireVwapSide ? '' : ' (not required)');
  if (price !== null && Number.isFinite(vwap)) {
    const sideOk = long ? price >= vwap : price <= vwap;
    line('vwap', 'VWAP side', def.requireVwapSide ? sideOk : null, distText(((price - vwap) / price) * 100, 'VWAP'), vwapTarget);
  } else {
    line('vwap', 'VWAP side', null, price === null ? 'no price' : 'no bars today', vwapTarget);
  }

  if (ready && n >= 3) {
    const from = fastEma[n - 3];
    line(
      'emaSlope',
      `${fast} direction`,
      long ? f > from : f < from,
      `${pct(((f - from) / from) * 100)} over 3 bars`,
      slopeTarget,
    );
  } else {
    line('emaSlope', `${fast} direction`, null, thin, slopeTarget);
  }

  const judged = lines.filter((l) => l.pass !== null);
  return {
    lines,
    score: { pass: judged.filter((l) => l.pass).length, total: judged.length },
    warnings,
  };
}

function usable(x: number | null): number | null {
  return x !== null && Number.isFinite(x) && x > 0 ? x : null;
}

function money(x: number): string {
  return `$${x.toFixed(2)}`;
}

/** "+4.2%", "-1.3%", "0.0%". */
function pct(x: number): string {
  const r = Math.round(x * 10) / 10;
  return `${r > 0 ? '+' : ''}${r.toFixed(1)}%`;
}

/** "0.6% above EMA 9", "1.2% below VWAP", "at EMA 9". */
function distText(distPct: number, ref: string): string {
  const r = Math.round(Math.abs(distPct) * 10) / 10;
  if (r === 0) return `at ${ref}`;
  return `${r.toFixed(1)}% ${distPct > 0 ? 'above' : 'below'} ${ref}`;
}

function rel(a: number, b: number): string {
  return a > b ? 'above' : a < b ? 'below' : 'at';
}
