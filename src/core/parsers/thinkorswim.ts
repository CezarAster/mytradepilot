// thinkorswim (Schwab): Monitor → Account Statement → Export to file. The file has many
// sections; the "Account Trade History" section lists fills. Legs of a spread follow
// their first row with a blank time. Commissions and fees are in the "Cash Balance"
// section, on the TRD row with the same date and time.
import { contractFor, optionExpiry } from '../contracts.ts';
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns } from './columns.ts';
import { buildTrades, isClosingFill, isStopOrder, readSide, type Fill } from './fills.ts';

const isHeader = (r: string[]) => {
  const col = columns(r);
  return ['Exec Time', 'Side', 'Qty', 'Pos Effect', 'Symbol', 'Price'].every((n) => col(n) >= 0);
};

export function isThinkorswimStatement(rows: string[][]): boolean {
  return rows.some(isHeader);
}

/** Commissions + fees per trade time (ms), from the Cash Balance section. Null if there isn't one. */
function cashBalanceFees(rows: string[][], opts: ParseOptions): Map<number, number> | null {
  const start = rows.findIndex((r) => {
    const col = columns(r);
    return col('DATE') >= 0 && col('TIME') >= 0 && col('TYPE') >= 0 && col('Commissions & Fees') >= 0;
  });
  if (start < 0) return null;
  const col = columns(rows[start]);
  const c = { date: col('DATE'), time: col('TIME'), type: col('TYPE'), misc: col('Misc Fees'), comm: col('Commissions & Fees') };
  const fees = new Map<number, number>();
  for (const r of rows.slice(start + 1)) {
    if (!/\d/.test(r[c.date] ?? '')) break;
    if ((r[c.type] ?? '').toUpperCase() !== 'TRD') continue;
    const at = zonedTimeToUtc(`${r[c.date]} ${r[c.time]}`, opts.timeZone, opts.dayFirst);
    const fee = Math.abs(toNumber(r[c.comm]) || 0) + (c.misc >= 0 ? Math.abs(toNumber(r[c.misc]) || 0) : 0);
    if (at && fee) fees.set(at.getTime(), (fees.get(at.getTime()) ?? 0) + fee);
  }
  return fees;
}

export function parseThinkorswimStatement(rows: string[][], opts: ParseOptions): ParseResult {
  const start = rows.findIndex(isHeader);
  const col = columns(rows[start]);
  const c = {
    time: col('Exec Time'),
    side: col('Side'),
    qty: col('Qty'),
    posEffect: col('Pos Effect'),
    symbol: col('Symbol'),
    exp: col('Exp'),
    strike: col('Strike'),
    type: col('Type'),
    price: col('Price'),
    orderType: col('Order Type'),
  };
  const warnings: string[] = [];
  const fills: Fill[] = [];
  const fees = cashBalanceFees(rows, opts);
  // The section normally has a blank first column; it ends at the next section's title row.
  const leadingBlank = rows[start][0] === '';
  let lastTime = '';
  let futures = false;

  for (let i = start + 1; i < rows.length; i++) {
    const r = rows[i];
    if (leadingBlank ? r[0] !== '' : r.length < 3) break;
    const rawTime = r[c.time] || lastTime;
    lastTime = rawTime;
    const qty = toNumber(r[c.qty]);
    const side = readSide(r[c.side] ?? '') || (Math.sign(qty) as 1 | -1 | 0);
    const price = toNumber(r[c.price]);
    const time = zonedTimeToUtc(rawTime, opts.timeZone, opts.dayFirst);
    if (!side || !qty || !Number.isFinite(price) || !time) {
      warnings.push(`Trade history row ${i - start} couldn't be read; skipped.`);
      continue;
    }
    const type = (r[c.type] ?? '').toUpperCase();
    const option = type === 'CALL' || type === 'PUT';
    const symbol = (r[c.symbol] ?? '').replace(/^\./, '');
    const raw = option ? `${symbol} ${r[c.exp]} ${r[c.strike]} ${type}` : symbol;
    const contract = contractFor(raw);
    // Options on futures (/ES...) move by the future's point value, not x100.
    const underlying = contractFor(symbol);
    if (underlying.isFutures) futures = true;
    const fee = fees?.get(time.getTime()) ?? 0;
    fees?.delete(time.getTime());
    fills.push({
      symbol: contract.symbol,
      position: raw.toUpperCase(),
      signedQty: side * Math.abs(qty),
      price,
      fee,
      time,
      rawTime,
      multiplier: option ? (underlying.isFutures ? underlying.multiplier : 100) : contract.multiplier,
      stop: c.orderType >= 0 && isStopOrder(r[c.orderType]),
      closeOnly: isClosingFill(r[c.posEffect]),
      expiry: option ? optionExpiry(raw) : null,
    });
  }

  if (!fees) warnings.push('No Cash Balance section, so P&L here is before commissions and fees.');
  else if (futures) warnings.push('Futures fees are listed in a separate section that isn’t read yet; futures P&L is before fees.');
  return { format: 'thinkorswim statement', trades: buildTrades(fills, opts.fileName, warnings), warnings };
}
