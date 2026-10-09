// Tradovate (also NinjaTrader's web/mobile app and many prop firms on Tradovate):
// Reports → Performance → download CSV. One row per matched lot, buy and sell side by
// side, P&L before commissions. Rows are turned back into fills so scale-ins and
// partial exits become one trade.
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { ParseOptions, ParseResult } from '../types.ts';
import { columns, hasColumns } from './columns.ts';
import { buildTrades, type Fill } from './fills.ts';
import { multipliers } from './roundTrips.ts';

const REQUIRED = ['symbol', 'qty', 'buyPrice', 'sellPrice', 'pnl', 'boughtTimestamp', 'soldTimestamp'];

export function isTradovatePerformance(header: string[]): boolean {
  return hasColumns(header, REQUIRED);
}

export function parseTradovatePerformance(rows: string[][], opts: ParseOptions): ParseResult {
  const col = columns(rows[0]);
  const c = Object.fromEntries([...REQUIRED, 'buyFillId', 'sellFillId'].map((n) => [n, col(n)]));
  const warnings: string[] = [];

  const lots = rows.slice(1).flatMap((r, i) => {
    const qty = toNumber(r[c.qty]);
    const buyPrice = toNumber(r[c.buyPrice]);
    const sellPrice = toNumber(r[c.sellPrice]);
    const bought = zonedTimeToUtc(r[c.boughtTimestamp] ?? '', opts.timeZone);
    const sold = zonedTimeToUtc(r[c.soldTimestamp] ?? '', opts.timeZone);
    if (!(qty > 0) || !Number.isFinite(buyPrice) || !Number.isFinite(sellPrice) || !bought || !sold) {
      warnings.push(`Row ${i + 2} couldn't be read; skipped.`);
      return [];
    }
    const long = bought <= sold;
    return [{
      r,
      rawSymbol: r[c.symbol].trim(),
      qty,
      bought,
      sold,
      buyPrice,
      sellPrice,
      direction: long ? ('long' as const) : ('short' as const),
      entryPrice: long ? buyPrice : sellPrice,
      exitPrice: long ? sellPrice : buyPrice,
      gross: toNumber(r[c.pnl]) || 0,
    }];
  });

  const sizes = multipliers(lots, warnings);
  // A fill matched against several lots shows up on several rows; count it once per row's qty.
  const fills = new Map<string, Fill>();
  const add = (id: string, f: Fill) => {
    const prev = fills.get(id);
    if (prev) prev.signedQty += f.signedQty;
    else fills.set(id, f);
  };
  lots.forEach((l, i) => {
    const { symbol, multiplier } = sizes.get(l.rawSymbol)!;
    const base = { symbol, fee: 0, multiplier, stop: false };
    const buyId = c.buyFillId >= 0 && l.r[c.buyFillId] ? `b${l.r[c.buyFillId]}` : `b-row${i}`;
    const sellId = c.sellFillId >= 0 && l.r[c.sellFillId] ? `s${l.r[c.sellFillId]}` : `s-row${i}`;
    add(buyId, { ...base, signedQty: l.qty, price: l.buyPrice, time: l.bought, rawTime: l.r[c.boughtTimestamp] });
    add(sellId, { ...base, signedQty: -l.qty, price: l.sellPrice, time: l.sold, rawTime: l.r[c.soldTimestamp] });
  });

  return { format: 'Tradovate performance', trades: buildTrades([...fills.values()], opts.fileName, warnings), warnings };
}
