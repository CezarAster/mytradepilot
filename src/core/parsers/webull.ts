// Webull: Orders → Order History → export (desktop app). One row per order; only the
// filled part counts. Times carry a zone abbreviation ("EST"/"EDT").
import { contractFor } from '../contracts.ts';
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns, hasColumns } from './columns.ts';
import { buildTrades, isStopOrder, readSide, type Fill } from './fills.ts';

const REQUIRED = ['Symbol', 'Side', 'Status', 'Filled', 'Avg Price', 'Filled Time'];

export function isWebullOrders(header: string[]): boolean {
  return hasColumns(header, REQUIRED);
}

export function parseWebullOrders(rows: string[][], opts: ParseOptions): ParseResult {
  const col = columns(rows[0]);
  const c = {
    symbol: col('Symbol'),
    side: col('Side'),
    status: col('Status'),
    filled: col('Filled'),
    price: col('Avg Price'),
    time: col('Filled Time'),
    type: col('Type') >= 0 ? col('Type') : col('Order Type'),
  };
  const warnings: string[] = [];
  const fills: Fill[] = [];
  let unfilled = 0;

  rows.slice(1).forEach((r, i) => {
    const qty = toNumber(r[c.filled]);
    if (!(qty > 0)) {
      unfilled++;
      return;
    }
    const side = readSide(r[c.side] ?? '');
    const price = toNumber(r[c.price]);
    const time = zonedTimeToUtc(r[c.time] ?? '', opts.timeZone);
    if (!side || !Number.isFinite(price) || !time) {
      warnings.push(`Row ${i + 2} couldn't be read; skipped.`);
      return;
    }
    const contract = contractFor(r[c.symbol]);
    fills.push({
      symbol: contract.symbol,
      signedQty: side * qty,
      price,
      fee: 0,
      time,
      rawTime: r[c.time],
      multiplier: contract.multiplier,
      stop: c.type >= 0 && isStopOrder(r[c.type]),
    });
  });

  if (unfilled) warnings.push(`${unfilled} order${unfilled === 1 ? '' : 's'} with nothing filled ignored.`);
  return { format: 'Webull orders', trades: buildTrades(fills, opts.fileName, warnings), warnings };
}
