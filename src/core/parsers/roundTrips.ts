// Helpers for platforms that export closed trades (entry + exit on one row) with their own P&L.
// They often write one row per lot or partial fill, so rows that share a symbol,
// direction and entry time are merged into one trade.
import { contractFor } from '../contracts.ts';
import type { Direction, Trade } from '../types.ts';

export interface RoundTrip {
  /** Symbol as exported (MNQH6, MNQ 03-26, CON.F.US.MNQ.H26). */
  rawSymbol: string;
  direction: Direction;
  entryTime: Date;
  exitTime: Date;
  /** Entry time as written, for the duplicate-detection key. */
  rawEntryTime: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  /** P&L before fees, used to work out contract size when the symbol isn't known. */
  gross: number;
  fees: number;
  /** Worst and best open P&L in dollars, when the platform reports them. */
  maeCash: number | null;
  mfeCash: number | null;
  stoppedOut: boolean;
}

/**
 * Dollars per 1.0 price move, from rows that report both prices and P&L.
 * Used when a futures symbol isn't in our table.
 */
export function inferMultiplier(rows: { entryPrice: number; exitPrice: number; qty: number; gross: number; direction: Direction }[]): number | null {
  const seen = rows
    .map((r) => {
      const move = (r.direction === 'long' ? 1 : -1) * (r.exitPrice - r.entryPrice) * r.qty;
      return Math.abs(move) > 1e-9 ? r.gross / move : NaN;
    })
    .filter((m) => Number.isFinite(m) && m > 0)
    .sort((a, b) => a - b);
  if (!seen.length) return null;
  const median = seen[Math.floor(seen.length / 2)];
  return Number(median.toPrecision(4));
}

/** Contract size per symbol: our table first, then what the P&L implies, else 1 with a warning. */
export function multipliers(
  rows: { rawSymbol: string; entryPrice: number; exitPrice: number; qty: number; gross: number; direction: Direction }[],
  warnings: string[],
): Map<string, { symbol: string; multiplier: number }> {
  const out = new Map<string, { symbol: string; multiplier: number }>();
  for (const raw of new Set(rows.map((r) => r.rawSymbol))) {
    const c = contractFor(raw, true);
    if (c.isFutures || c.multiplier !== 1) {
      out.set(raw, { symbol: c.symbol, multiplier: c.multiplier });
      continue;
    }
    const inferred = inferMultiplier(rows.filter((r) => r.rawSymbol === raw));
    if (inferred === null) warnings.push(`Couldn't tell the contract size of ${raw}; returns for it may be off.`);
    out.set(raw, { symbol: c.symbol, multiplier: inferred ?? 1 });
  }
  return out;
}

export function groupRoundTrips(rows: RoundTrip[], source: string, warnings: string[]): Trade[] {
  const sizes = multipliers(rows, warnings);
  const groups = new Map<string, RoundTrip[]>();
  for (const r of rows) {
    const k = `${r.rawSymbol}|${r.direction}|${r.entryTime.getTime()}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  const trades: Trade[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const { symbol, multiplier } = sizes.get(first.rawSymbol)!;
    const qty = g.reduce((s, r) => s + r.qty, 0);
    const entryPrice = g.reduce((s, r) => s + r.entryPrice * r.qty, 0) / qty;
    const exitPrice = g.reduce((s, r) => s + r.exitPrice * r.qty, 0) / qty;
    const last = g.reduce((a, b) => (b.exitTime > a.exitTime ? b : a));
    const pnl = g.reduce((s, r) => s + r.gross - r.fees, 0);
    const value = entryPrice * qty * multiplier;
    const cash = (pick: (r: RoundTrip) => number | null) =>
      g.every((r) => pick(r) !== null) ? g.reduce((s, r) => s + Math.abs(pick(r)!), 0) : null;
    const mae = cash((r) => r.maeCash);
    const mfe = cash((r) => r.mfeCash);
    trades.push({
      key: `${first.rawSymbol}|${first.rawEntryTime}|${first.direction}|${qty}|${entryPrice}`,
      symbol,
      direction: first.direction,
      entryTime: first.entryTime,
      exitTime: last.exitTime,
      entryPrice,
      exitPrice,
      qty,
      pnl,
      returnPct: (pnl / value) * 100,
      mfePct: mfe === null ? null : (mfe / value) * 100,
      maePct: mae === null ? null : -(mae / value) * 100,
      stoppedOut: last.stoppedOut,
      fills: g.length,
      source,
    });
  }
  return trades;
}
