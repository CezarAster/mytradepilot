// Interactive Brokers activity statement (Performance & Reports → Statements → Activity,
// format CSV). Every row starts with its section name; the "Trades" section has a header
// row per asset class and one "Order" row per execution, with a signed quantity.
// (Flex Query CSVs are plain fill lists and go through the generic fill parser.)
import { contractFor } from '../contracts.ts';
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns } from './columns.ts';
import { buildTrades, type Fill } from './fills.ts';

export function isIbkrStatement(rows: string[][]): boolean {
  return rows.some((r) => r[0] === 'Trades' && r[1] === 'Header');
}

export function parseIbkrStatement(rows: string[][], opts: ParseOptions): ParseResult {
  const warnings: string[] = [];
  const fills: Fill[] = [];
  let col: ((name: string) => number) | null = null;

  rows.forEach((r, i) => {
    if (r[0] !== 'Trades') return;
    if (r[1] === 'Header') {
      col = columns(r);
      return;
    }
    if (r[1] !== 'Data' || !col || !/^(order|trade|execution)$/i.test(r[col('DataDiscriminator')] ?? 'Order')) return;
    const fee = col('Comm/Fee') >= 0 ? col('Comm/Fee') : col('Comm in USD');
    const category = r[col('Asset Category')] ?? '';
    const qty = toNumber(r[col('Quantity')]);
    const price = toNumber(r[col('T. Price')]);
    const rawTime = r[col('Date/Time')] ?? '';
    const time = zonedTimeToUtc(rawTime, opts.timeZone);
    if (!qty || !Number.isFinite(price) || !time) {
      warnings.push(`Line ${i + 1} couldn't be read; skipped.`);
      return;
    }
    const contract = contractFor(r[col('Symbol')], /futures/i.test(category));
    fills.push({
      symbol: contract.symbol,
      signedQty: qty,
      price,
      fee: fee >= 0 ? Math.abs(toNumber(r[fee])) || 0 : 0,
      time,
      rawTime,
      multiplier: /option/i.test(category) ? 100 : contract.multiplier,
      stop: false,
    });
  });

  return { format: 'Interactive Brokers statement', trades: buildTrades(fills, opts.fileName, warnings), warnings };
}
