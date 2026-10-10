// Incremental fill matcher: the streaming twin of core/parsers/fills.ts buildTrades().
// A trade opens when a symbol's position leaves zero and closes when it returns to zero;
// a fill that flips the position closes one trade and opens the next with the remainder.
// Given the same fills in the same order, both produce the same Trade objects.
import type { Trade } from '../core/types.ts';
import type { Fill } from './types.ts';

interface Open {
  direction: 'long' | 'short';
  entryTime: number;
  rawTime: string;
  position: number; // signed shares
  maxQty: number;
  entryQty: number;
  entryCost: number;
  exitQty: number;
  exitValue: number;
  fees: number;
  fills: number;
  firstFillKey: string;
}

export interface MatchResult {
  /** 'open' when the symbol went from flat to a position, 'add' when it grew, 'reduce' when it shrank but stayed open, 'close' when it went flat. */
  kind: 'open' | 'add' | 'reduce' | 'close';
  symbol: string;
  /** The closed round trip, for kind 'close'. */
  closed: Trade | null;
  /** The position after this fill (null when flat). */
  position: { direction: 'long' | 'short'; qty: number; avgEntry: number; entryTime: number; tradeKey: string } | null;
  /** When a fill flips the position, the remainder opens a new trade; reported as a second result. */
  flippedInto: MatchResult | null;
}

/** Stable for the life of the trade: it does not change when the position scales in. */
export function tradeKeyFor(symbol: string, direction: 'long' | 'short', entryTime: number, firstFillKey: string): string {
  return `${symbol}|${new Date(entryTime).toISOString()}|${direction}|${firstFillKey}`;
}

export class Matcher {
  private open = new Map<string, Open>();

  private start(f: Fill, signedQty: number, fee: number): Open {
    return {
      direction: signedQty > 0 ? 'long' : 'short',
      entryTime: f.time,
      rawTime: new Date(f.time).toISOString(),
      position: signedQty,
      maxQty: Math.abs(signedQty),
      entryQty: Math.abs(signedQty),
      entryCost: Math.abs(signedQty) * f.price,
      exitQty: 0,
      exitValue: 0,
      fees: fee,
      fills: 1,
      firstFillKey: f.key,
    };
  }

  private describe(symbol: string, o: Open) {
    const avgEntry = o.entryCost / o.entryQty;
    return {
      direction: o.direction,
      qty: o.position,
      avgEntry,
      entryTime: o.entryTime,
      tradeKey: tradeKeyFor(symbol, o.direction, o.entryTime, o.firstFillKey),
    };
  }

  private finish(symbol: string, o: Open, exitTime: number | null, source: string): Trade {
    const avgEntry = o.entryCost / o.entryQty;
    const avgExit = o.exitQty > 0 ? o.exitValue / o.exitQty : null;
    const sign = o.direction === 'long' ? 1 : -1;
    const gross = avgExit === null ? 0 : sign * (avgExit - avgEntry) * o.exitQty;
    const pnl = gross - o.fees;
    return {
      key: tradeKeyFor(symbol, o.direction, o.entryTime, o.firstFillKey),
      symbol,
      direction: o.direction,
      entryTime: new Date(o.entryTime),
      exitTime: exitTime === null ? null : new Date(exitTime),
      entryPrice: avgEntry,
      exitPrice: avgExit,
      qty: o.maxQty,
      pnl,
      returnPct: (pnl / (avgEntry * o.maxQty)) * 100,
      mfePct: null,
      maePct: null,
      stoppedOut: false,
      fills: o.fills,
      source,
    };
  }

  /** Apply one fill. Fills must arrive in time order per symbol. */
  apply(f: Fill): MatchResult {
    const signedQty = f.side === 'buy' ? f.qty : -f.qty;
    const cur = this.open.get(f.symbol);
    if (!cur) {
      const o = this.start(f, signedQty, f.fee);
      this.open.set(f.symbol, o);
      return { kind: 'open', symbol: f.symbol, closed: null, position: this.describe(f.symbol, o), flippedInto: null };
    }
    const sameWay = Math.sign(signedQty) === Math.sign(cur.position);
    if (sameWay) {
      cur.position += signedQty;
      cur.entryQty += Math.abs(signedQty);
      cur.entryCost += Math.abs(signedQty) * f.price;
      cur.maxQty = Math.max(cur.maxQty, Math.abs(cur.position));
      cur.fees += f.fee;
      cur.fills++;
      return { kind: 'add', symbol: f.symbol, closed: null, position: this.describe(f.symbol, cur), flippedInto: null };
    }
    const closing = Math.min(Math.abs(signedQty), Math.abs(cur.position));
    const feeShare = f.fee * (closing / Math.abs(signedQty));
    cur.exitQty += closing;
    cur.exitValue += closing * f.price;
    cur.fees += feeShare;
    cur.fills++;
    cur.position += Math.sign(signedQty) * closing;
    if (cur.position !== 0) {
      return { kind: 'reduce', symbol: f.symbol, closed: null, position: this.describe(f.symbol, cur), flippedInto: null };
    }
    const closed = this.finish(f.symbol, cur, f.time, f.source);
    this.open.delete(f.symbol);
    const remainder = signedQty - Math.sign(signedQty) * closing;
    let flippedInto: MatchResult | null = null;
    if (remainder !== 0) {
      const o = this.start(f, remainder, f.fee - feeShare);
      this.open.set(f.symbol, o);
      flippedInto = { kind: 'open', symbol: f.symbol, closed: null, position: this.describe(f.symbol, o), flippedInto: null };
    }
    return { kind: 'close', symbol: f.symbol, closed, position: null, flippedInto };
  }

  /** Open positions as not-yet-closed Trade objects (exitTime null), the shape the analyzer skips. */
  openTrades(): Trade[] {
    return [...this.open.entries()].map(([symbol, o]) => this.finish(symbol, o, null, 'live'));
  }

  position(symbol: string) {
    const o = this.open.get(symbol);
    return o ? this.describe(symbol, o) : null;
  }

  symbols(): string[] {
    return [...this.open.keys()];
  }
}
