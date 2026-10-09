// thinkorswim (Schwab): Monitor → Account Statement → Export to file. The file has many
// sections; the "Account Trade History" section lists fills. Legs of a spread follow
// their first row with a blank time.
import { contractFor } from '../contracts.ts';
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns } from './columns.ts';
import { buildTrades, isStopOrder, readSide, type Fill } from './fills.ts';

const isHeader = (r: string[]) => {
  const col = columns(r);
  return ['Exec Time', 'Side', 'Qty', 'Pos Effect', 'Symbol', 'Price'].every((n) => col(n) >= 0);
};

export function isThinkorswimStatement(rows: string[][]): boolean {
  return rows.some(isHeader);
}

export function parseThinkorswimStatement(rows: string[][], opts: ParseOptions): ParseResult {
  const start = rows.findIndex(isHeader);
  const col = columns(rows[start]);
  const c = {
    time: col('Exec Time'),
    side: col('Side'),
    qty: col('Qty'),
    symbol: col('Symbol'),
    exp: col('Exp'),
    strike: col('Strike'),
    type: col('Type'),
    price: col('Price'),
    orderType: col('Order Type'),
  };
  const warnings: string[] = [];
  const fills: Fill[] = [];
  let lastTime = '';

  for (let i = start + 1; i < rows.length; i++) {
    const r = rows[i];
    // The section ends at the next title row ("Profits and Losses", ...).
    if (r[0]?.trim()) break;
    const rawTime = r[c.time]?.trim() || lastTime;
    lastTime = rawTime;
    const qty = toNumber(r[c.qty]);
    const side = readSide(r[c.side] ?? '') || (Math.sign(qty) as 1 | -1 | 0);
    const price = toNumber(r[c.price]);
    const time = zonedTimeToUtc(rawTime, opts.timeZone);
    if (!side || !qty || !Number.isFinite(price) || !time) {
      warnings.push(`Trade history row ${i - start} couldn't be read; skipped.`);
      continue;
    }
    const type = (r[c.type] ?? '').trim().toUpperCase();
    const option = type === 'CALL' || type === 'PUT';
    const raw = option ? `${r[c.symbol].trim()} ${r[c.exp].trim()} ${r[c.strike].trim()} ${type}` : r[c.symbol];
    const contract = contractFor(raw);
    fills.push({
      symbol: contract.symbol,
      signedQty: side * Math.abs(qty),
      price,
      fee: 0,
      time,
      rawTime,
      multiplier: option ? 100 : contract.multiplier,
      stop: c.orderType >= 0 && isStopOrder(r[c.orderType]),
    });
  }

  return { format: 'thinkorswim statement', trades: buildTrades(fills, opts.fileName, warnings), warnings };
}
