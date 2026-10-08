// TradingView "List of trades" export (Bar Replay / Strategy Tester):
// two rows per trade (Entry / Exit) sharing a "Trade number".
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult, Trade } from '../types.ts';

const REQUIRED = ['Trade number', 'Type', 'Date and time'];

export function isTradingViewTrades(header: string[]): boolean {
  return REQUIRED.every((h) => header.includes(h));
}

/** Replay_Trading_NASDAQ_AAPL_2026-09-19 (1).csv -> AAPL */
export function symbolFromFileName(fileName: string): string | null {
  const m = /Replay_Trading_[A-Z0-9]+_([A-Z0-9.\-]+?)_\d{4}-\d{2}-\d{2}/i.exec(fileName);
  return m ? m[1].toUpperCase() : null;
}

export function parseTradingViewTrades(rows: string[][], opts: ParseOptions): ParseResult {
  const header = rows[0];
  const col = (name: string) => header.indexOf(name);
  const c = {
    num: col('Trade number'),
    type: col('Type'),
    time: col('Date and time'),
    signal: col('Signal'),
    price: header.findIndex((h) => h.startsWith('Price')),
    qty: col('Size (qty)'),
    pnl: header.findIndex((h) => h.startsWith('Net PnL') || h.startsWith('Net P&L')),
    ret: col('Return %') >= 0 ? col('Return %') : col('Net PnL %'),
    mfe: col('Favorable excursion %'),
    mae: col('Adverse excursion %'),
  };

  const warnings: string[] = [];
  const symbol = symbolFromFileName(opts.fileName);
  if (!symbol) warnings.push(`Couldn't read a ticker from "${opts.fileName}"; trades are labelled UNKNOWN.`);

  const byNumber = new Map<string, { entry?: string[]; exit?: string[] }>();
  for (const r of rows.slice(1)) {
    const n = r[c.num];
    const pair = byNumber.get(n) ?? {};
    if (r[c.type]?.startsWith('Entry')) pair.entry = r;
    else if (r[c.type]?.startsWith('Exit')) pair.exit = r;
    byNumber.set(n, pair);
  }

  const trades: Trade[] = [];
  for (const [num, { entry, exit }] of byNumber) {
    if (!entry || !exit) {
      warnings.push(`Trade ${num} is missing its entry or exit row; skipped.`);
      continue;
    }
    const entryTime = zonedTimeToUtc(entry[c.time], opts.timeZone);
    if (!entryTime) {
      warnings.push(`Trade ${num} has an unreadable time "${entry[c.time]}"; skipped.`);
      continue;
    }
    const isOpen = exit[c.time].trim() === 'Open';
    const qty = toNumber(entry[c.qty]);
    const entryPrice = toNumber(entry[c.price]);
    const mfe = c.mfe >= 0 ? toNumber(exit[c.mfe]) : NaN;
    const mae = c.mae >= 0 ? toNumber(exit[c.mae]) : NaN;

    trades.push({
      key: `${symbol ?? 'UNKNOWN'}|${num}|${entry[c.time]}|${qty}`,
      symbol: symbol ?? 'UNKNOWN',
      direction: entry[c.type].toLowerCase().includes('short') ? 'short' : 'long',
      entryTime,
      exitTime: isOpen ? null : zonedTimeToUtc(exit[c.time], opts.timeZone),
      entryPrice,
      exitPrice: isOpen ? null : toNumber(exit[c.price]),
      qty,
      pnl: toNumber(exit[c.pnl]) || 0,
      returnPct: toNumber(exit[c.ret]) || 0,
      mfePct: Number.isFinite(mfe) ? mfe : null,
      maePct: Number.isFinite(mae) ? -Math.abs(mae) : null,
      stoppedOut: c.signal >= 0 && /stop/i.test(exit[c.signal] ?? ''),
      fills: 1,
      source: opts.fileName,
    });
  }
  return { format: 'TradingView trade list', trades, warnings };
}
