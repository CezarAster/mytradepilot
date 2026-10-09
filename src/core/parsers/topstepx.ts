// TopstepX / ProjectX platforms (Topstep, and other prop firms on ProjectX):
// Trades → Export. One row per closed trade, times with a UTC offset, P&L before fees.
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns, hasColumns } from './columns.ts';
import { groupRoundTrips, type RoundTrip } from './roundTrips.ts';

const REQUIRED = ['ContractName', 'EnteredAt', 'ExitedAt', 'EntryPrice', 'ExitPrice', 'PnL', 'Size', 'Type'];

export function isTopstepXTrades(header: string[]): boolean {
  return hasColumns(header, REQUIRED);
}

export function parseTopstepXTrades(rows: string[][], opts: ParseOptions): ParseResult {
  const col = columns(rows[0]);
  const c = Object.fromEntries([...REQUIRED, 'Fees', 'Commissions'].map((n) => [n, col(n)]));
  const warnings: string[] = [];
  const trips: RoundTrip[] = [];

  rows.slice(1).forEach((r, i) => {
    const entryTime = zonedTimeToUtc(r[c.EnteredAt] ?? '', opts.timeZone, opts.dayFirst);
    const exitTime = zonedTimeToUtc(r[c.ExitedAt] ?? '', opts.timeZone, opts.dayFirst);
    const qty = toNumber(r[c.Size]);
    const entryPrice = toNumber(r[c.EntryPrice]);
    const exitPrice = toNumber(r[c.ExitPrice]);
    const gross = toNumber(r[c.PnL]);
    const type = (r[c.Type] ?? '').trim().toLowerCase();
    if (!entryTime || !exitTime || !(qty > 0) || !Number.isFinite(entryPrice) || !Number.isFinite(exitPrice) || !Number.isFinite(gross) || !/^(long|short)$/.test(type)) {
      warnings.push(`Row ${i + 2} couldn't be read; skipped.`);
      return;
    }
    const fee = (k: string) => (c[k] >= 0 ? Math.abs(toNumber(r[c[k]])) || 0 : 0);
    trips.push({
      rawSymbol: r[c.ContractName].trim(),
      direction: type as 'long' | 'short',
      entryTime,
      exitTime,
      rawEntryTime: r[c.EnteredAt],
      entryPrice,
      exitPrice,
      qty,
      gross,
      fees: fee('Fees') + fee('Commissions'),
      maeCash: null,
      mfeCash: null,
      stoppedOut: false,
    });
  });

  return { format: 'TopstepX trades', trades: groupRoundTrips(trips, opts.fileName, warnings, true), warnings };
}
