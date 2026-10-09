// Helpers for platforms that export closed trades (entry + exit on one row) with their own P&L.
// They often write one row per lot or partial fill, so rows of one position (same account,
// contract and direction, each entered before the previous rows were all closed) are
// merged into one trade, the way a scale-in or partial exit shows up in a fill list.
import { contractFor } from '../contracts.ts';
import type { Direction, Trade } from '../types.ts';

export interface RoundTrip {
  /** Symbol as exported (MNQH6, MNQ 03-26, CON.F.US.MNQ.H26). */
  rawSymbol: string;
  account?: string;
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

/**
 * Contract size per symbol: our table first, then what the P&L implies, else 1 with a warning.
 * `futuresOnly` is for platforms that only trade futures, where a bare "ES" is the future;
 * elsewhere (NinjaTrader also trades stocks) it's the stock.
 */
export function multipliers(
  rows: { rawSymbol: string; entryPrice: number; exitPrice: number; qty: number; gross: number; direction: Direction }[],
  warnings: string[],
  futuresOnly: boolean,
): Map<string, { symbol: string; multiplier: number }> {
  const out = new Map<string, { symbol: string; multiplier: number }>();
  for (const raw of new Set(rows.map((r) => r.rawSymbol))) {
    const c = contractFor(raw, futuresOnly);
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

export function groupRoundTrips(rows: RoundTrip[], source: string, warnings: string[], futuresOnly: boolean): Trade[] {
  const sizes = multipliers(rows, warnings, futuresOnly);
  const groups: RoundTrip[][] = [];
  const current = new Map<string, { rows: RoundTrip[]; start: number; until: number }>();
  for (const r of [...rows].sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime())) {
    const k = `${r.account ?? ''}|${r.rawSymbol}|${r.direction}`;
    const entry = r.entryTime.getTime();
    const g = current.get(k);
    if (g && (entry < g.until || entry === g.start)) {
      g.rows.push(r);
      g.until = Math.max(g.until, r.exitTime.getTime());
    } else {
      const fresh = { rows: [r], start: entry, until: r.exitTime.getTime() };
      current.set(k, fresh);
      groups.push(fresh.rows);
    }
  }

  const trades: Trade[] = [];
  for (const g of groups) {
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
