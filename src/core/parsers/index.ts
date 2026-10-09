import { parseCsv } from '../csv.ts';
import { detectDayFirst } from '../time.ts';
import type { ParseOptions, ParseResult, Trade } from '../types.ts';
import { isFillList, parseFillList } from './fills.ts';
import { isIbkrStatement, parseIbkrStatement } from './ibkr.ts';
import { isNinjaTraderTrades, parseNinjaTraderTrades } from './ninjatrader.ts';
import { isThinkorswimStatement, parseThinkorswimStatement } from './thinkorswim.ts';
import { isTopstepXTrades, parseTopstepXTrades } from './topstepx.ts';
import { isTradingViewTrades, parseTradingViewTrades } from './tradingviewReplay.ts';
import { isTradovatePerformance, parseTradovatePerformance } from './tradovate.ts';
import { isWebullOrders, parseWebullOrders } from './webull.ts';

export const SUPPORTED_FORMATS = [
  'TradingView trade list',
  'Tradovate performance report',
  'NinjaTrader 8 trades',
  'TopstepX trades',
  'Webull order history',
  'thinkorswim account statement',
  'Interactive Brokers activity statement or Flex Query',
  'any fill list with symbol, quantity, price and time columns',
];

export function parseFile(text: string, options: ParseOptions): ParseResult {
  const rows = parseCsv(text).map((r) => r.map((f) => f.trim()));
  if (rows.length < 2) return { format: 'unknown', trades: [], warnings: [`${options.fileName}: no rows found.`] };
  const opts = { ...options, dayFirst: options.dayFirst ?? detectDayFirst(rows.flat()) };
  try {
    return detect(rows, opts);
  } catch (e) {
    return { format: 'unknown', trades: [], warnings: [`${opts.fileName}: couldn't be read (${(e as Error).message}).`] };
  }
}

function detect(rows: string[][], opts: ParseOptions): ParseResult {
  // Sectioned statements first: their first row isn't the trade header.
  if (isIbkrStatement(rows)) return parseIbkrStatement(rows, opts);
  if (isThinkorswimStatement(rows)) return parseThinkorswimStatement(rows, opts);

  const header = rows[0];
  if (isTradingViewTrades(header)) return parseTradingViewTrades(rows, opts);
  if (isTradovatePerformance(header)) return parseTradovatePerformance(rows, opts);
  if (isNinjaTraderTrades(header)) return parseNinjaTraderTrades(rows, opts);
  if (isTopstepXTrades(header)) return parseTopstepXTrades(rows, opts);
  if (isWebullOrders(header)) return parseWebullOrders(rows, opts);
  if (isFillList(header)) return parseFillList(rows, opts);
  return {
    format: 'unknown',
    trades: [],
    warnings: [`${opts.fileName}: unrecognized format. Supported: ${SUPPORTED_FORMATS.join('; ')}.`],
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
