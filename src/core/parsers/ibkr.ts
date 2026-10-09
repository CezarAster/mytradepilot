// Interactive Brokers activity statement (Performance & Reports → Statements → Activity,
// format CSV). Every row starts with its section name; the "Trades" section has a header
// row per asset class and one "Order" row per execution, with a signed quantity.
// (Flex Query CSVs are plain fill lists and go through the generic fill parser.)
import { contractFor, optionExpiry } from '../contracts.ts';
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns } from './columns.ts';
import { buildTrades, isClosingFill, type Fill } from './fills.ts';

export function isIbkrStatement(rows: string[][]): boolean {
  return rows.some((r) => r[0] === 'Trades' && r[1] === 'Header');
}

export function parseIbkrStatement(rows: string[][], opts: ParseOptions): ParseResult {
  const warnings: string[] = [];
  const fills: Fill[] = [];
  const unknownSize = new Set<string>();
  let col: ((name: string) => number) | null = null;

  rows.forEach((r, i) => {
    if (r[0] !== 'Trades') return;
    if (r[1] === 'Header') {
      col = columns(r);
      return;
    }
    if (r[1] !== 'Data' || !col || !/^(order|trade|execution)$/i.test(r[col('DataDiscriminator')] ?? 'Order')) return;
    const feeCol = col('Comm/Fee') >= 0 ? col('Comm/Fee') : col('Comm in USD');
    const category = r[col('Asset Category')] ?? '';
    const qty = toNumber(r[col('Quantity')]);
    const price = toNumber(r[col('T. Price')]);
    const proceeds = toNumber(r[col('Proceeds')]);
    const rawTime = r[col('Date/Time')] ?? '';
    const time = zonedTimeToUtc(rawTime, opts.timeZone, opts.dayFirst);
    if (!qty || !Number.isFinite(price) || !time) {
      warnings.push(`Line ${i + 1} couldn't be read; skipped.`);
      return;
    }
    const raw = (r[col('Symbol')] ?? '').toUpperCase();
    const isFutures = /futur/i.test(category);
    const contract = contractFor(raw, isFutures && !/option/i.test(category));
    // Proceeds = quantity x price x contract size, which covers futures and options on
    // futures we have no table entry for.
    const implied = Number.isFinite(proceeds) && proceeds !== 0 && price !== 0 ? Math.abs(proceeds / (qty * price)) : NaN;
    let multiplier: number;
    if (Number.isFinite(implied)) {
      multiplier = Number(implied.toPrecision(4));
    } else if (isFutures) {
      // A future, or an option on one ("ES 20MAR26 6000 C"): the underlying's point value.
      const underlying = contractFor(raw.split(' ')[0], true);
      multiplier = underlying.isFutures ? underlying.multiplier : 1;
      if (!underlying.isFutures) unknownSize.add(raw);
    } else {
      multiplier = /option/i.test(category) ? 100 : contract.multiplier;
    }
    fills.push({
      symbol: contract.symbol,
      position: `${r[col('Account')] ?? ''}|${raw}`,
      signedQty: qty,
      price,
      fee: feeCol >= 0 ? Math.abs(toNumber(r[feeCol])) || 0 : 0,
      time,
      rawTime,
      multiplier,
      stop: false,
      closeOnly: isClosingFill(r[col('Code')]),
      expiry: optionExpiry(raw),
    });
  });

  for (const s of unknownSize) warnings.push(`Couldn't tell the contract size of ${s}; returns for it may be off.`);
  return { format: 'Interactive Brokers statement', trades: buildTrades(fills, opts.fileName, warnings), warnings };
}
