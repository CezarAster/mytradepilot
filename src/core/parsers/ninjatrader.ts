// NinjaTrader 8: Trade Performance (or Account Performance) → Trades → right-click → Export.
// One row per trade (or per partial fill), with entry/exit, profit, MAE/MFE in dollars,
// and the exit order's name ("Stop loss", "Profit target", ...).
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns, hasColumns } from './columns.ts';
import { groupRoundTrips, type RoundTrip } from './roundTrips.ts';

const REQUIRED = ['Instrument', 'Market pos.', 'Qty', 'Entry price', 'Exit price', 'Entry time', 'Exit time', 'Profit'];

export function isNinjaTraderTrades(header: string[]): boolean {
  return hasColumns(header, REQUIRED);
}

export function parseNinjaTraderTrades(rows: string[][], opts: ParseOptions): ParseResult {
  const col = columns(rows[0]);
  const c = {
    symbol: col('Instrument'),
    pos: col('Market pos.'),
    qty: col('Qty'),
    entryPrice: col('Entry price'),
    exitPrice: col('Exit price'),
    entryTime: col('Entry time'),
    exitTime: col('Exit time'),
    exitName: col('Exit name'),
    profit: col('Profit'),
    commission: col('Commission'),
    mae: col('MAE'),
    mfe: col('MFE'),
  };
  const warnings: string[] = [];
  const trips: RoundTrip[] = [];

  rows.slice(1).forEach((r, i) => {
    const entryTime = zonedTimeToUtc(r[c.entryTime] ?? '', opts.timeZone);
    const exitTime = zonedTimeToUtc(r[c.exitTime] ?? '', opts.timeZone);
    const qty = toNumber(r[c.qty]);
    const entryPrice = toNumber(r[c.entryPrice]);
    const exitPrice = toNumber(r[c.exitPrice]);
    const profit = toNumber(r[c.profit]);
    const pos = (r[c.pos] ?? '').trim().toLowerCase();
    if (!entryTime || !exitTime || !(qty > 0) || !Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(profit) || !/^(long|short)$/.test(pos)) {
      warnings.push(`Row ${i + 2} couldn't be read; skipped.`);
      return;
    }
    // NinjaTrader's Profit already has commission taken out; add it back for the gross figure.
    const fees = c.commission >= 0 ? Math.abs(toNumber(r[c.commission])) || 0 : 0;
    const cash = (i: number) => (i >= 0 && Number.isFinite(toNumber(r[i])) ? toNumber(r[i]) : null);
    trips.push({
      rawSymbol: r[c.symbol].trim(),
      direction: pos as 'long' | 'short',
      entryTime,
      exitTime,
      rawEntryTime: r[c.entryTime],
      entryPrice,
      exitPrice,
      qty,
      gross: profit + fees,
      fees,
      maeCash: cash(c.mae),
      mfeCash: cash(c.mfe),
      stoppedOut: c.exitName >= 0 && /stop/i.test(r[c.exitName] ?? ''),
    });
  });

  return { format: 'NinjaTrader trades', trades: groupRoundTrips(trips, opts.fileName, warnings), warnings };
}
