// "Your record" lines for the trade you are about to take, computed from closed trades
// with the same buckets, shrinkage and confidence labels as the report.
import { afterPrevLabel, analyze, timeBucketLabel, tradeOfDayLabel, type Report } from '../core/analyze.ts';
import { marketClock } from '../core/time.ts';
import type { Trade } from '../core/types.ts';
import type { NextTrade, RecordLine } from './types.ts';

/** 95% Wilson score interval for a proportion. */
export function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

export class RecordBook {
  private report: Report | null = null;
  private trades: Trade[] = [];

  private readonly stopPct: number;

  constructor(stopPct = 2) {
    this.stopPct = stopPct;
  }

  set(trades: Trade[]): void {
    this.trades = trades.filter((t) => t.exitTime !== null);
    this.report = this.trades.length ? analyze(this.trades, { stopPct: this.stopPct }) : null;
  }

  get(): Report | null {
    return this.report;
  }

  size(): number {
    return this.trades.length;
  }

  private line(dimensionId: string, label: string): RecordLine | null {
    const d = this.report?.dimensions.find((x) => x.id === dimensionId);
    const g = d?.groups.find((x) => x.label === label);
    if (!g) return null;
    const wins = Math.round(g.winRate * g.n);
    const [winLow, winHigh] = wilson(wins, g.n);
    return { label: g.phrase, n: g.n, winRate: g.winRate, avgReturn: g.avgReturn, totalPnl: g.totalPnl, confidence: g.confidence, winLow, winHigh };
  }

  linesFor(ctx: NextTrade['context']): RecordLine[] {
    return [this.line('tradeOfDay', ctx.tradeOfDay), this.line('afterPrev', ctx.afterPrev), this.line('time', ctx.timeBucket)].filter(
      (l): l is RecordLine => l !== null,
    );
  }

  /**
   * Across every day with 4+ trades: of the profit you held after trade 3, how much did trades 4+ give back?
   * Days that were negative after trade 3 do not count (there was nothing to give back).
   */
  lateDayGiveBack(): NextTrade['lateDayGiveBack'] {
    const byDay = new Map<string, Trade[]>();
    for (const t of [...this.trades].sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime())) {
      const d = marketClock(t.entryTime).date;
      byDay.set(d, [...(byDay.get(d) ?? []), t]);
    }
    let days = 0;
    let profitAtTrade3 = 0;
    let givenBack = 0;
    for (const trades of byDay.values()) {
      if (trades.length < 4) continue;
      const first = trades.slice(0, 3).reduce((s, t) => s + t.pnl, 0);
      if (first <= 0) continue;
      const later = trades.slice(3).reduce((s, t) => s + t.pnl, 0);
      days++;
      profitAtTrade3 += first;
      if (later < 0) givenBack += Math.min(-later, first);
    }
    if (!days) return null;
    return { days, profitAtTrade3, givenBack, share: profitAtTrade3 > 0 ? givenBack / profitAtTrade3 : null };
  }
}

export const labels = { tradeOfDayLabel, afterPrevLabel, timeBucketLabel };
