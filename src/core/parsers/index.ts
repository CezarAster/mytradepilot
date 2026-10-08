import { parseCsv } from '../csv.ts';
import type { ParseOptions, ParseResult, Trade } from '../types.ts';
import { isFillList, parseFillList } from './fills.ts';
import { isTradingViewTrades, parseTradingViewTrades } from './tradingviewReplay.ts';

export function parseFile(text: string, opts: ParseOptions): ParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { format: 'unknown', trades: [], warnings: [`${opts.fileName}: no rows found.`] };
  const header = rows[0].map((h) => h.trim());
  rows[0] = header;

  if (isTradingViewTrades(header)) return parseTradingViewTrades(rows, opts);
  if (isFillList(header)) return parseFillList(rows, opts);
  return {
    format: 'unknown',
    trades: [],
    warnings: [
      `${opts.fileName}: unrecognized format. Supported: TradingView trade list, or a fill list with symbol, side, qty, price and time columns.`,
    ],
  };
}

/**
 * Combine trades from several files:
 * - drops exact duplicates (overlapping exports of the same account),
 * - merges partial fills (same symbol, direction, entry/exit time and price) into one trade,
 * - sorts by entry time.
 */
export function combineTrades(lists: Trade[][]): Trade[] {
  const seen = new Set<string>();
  const unique: Trade[] = [];
  for (const t of lists.flat()) {
    if (seen.has(t.key)) continue;
    seen.add(t.key);
    unique.push(t);
  }

  const merged = new Map<string, Trade>();
  for (const t of unique) {
    const k = [t.symbol, t.direction, t.entryTime.getTime(), t.exitTime?.getTime() ?? 'open', t.entryPrice, t.exitPrice].join('|');
    const m = merged.get(k);
    if (!m) {
      merged.set(k, { ...t });
      continue;
    }
    const value = m.qty * m.entryPrice + t.qty * t.entryPrice;
    m.returnPct = (m.returnPct * m.qty * m.entryPrice + t.returnPct * t.qty * t.entryPrice) / value;
    m.qty += t.qty;
    m.pnl += t.pnl;
    m.fills += t.fills;
    m.stoppedOut ||= t.stoppedOut;
  }
  return [...merged.values()].sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
}
