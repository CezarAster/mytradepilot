// Generic execution list (one row per fill), the shape most brokers can export.
// Fills are matched into round-trip trades: a trade opens when the position leaves
// zero and closes when it returns to zero; a fill that flips the position closes one
// trade and opens the next with the remainder.
import { contractFor } from '../contracts.ts';
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { Direction, ParseOptions, ParseResult, Trade } from '../types.ts';

const ALIASES: Record<string, string[]> = {
  symbol: ['symbol', 'ticker', 'instrument', 'underlying', 'contract'],
  side: ['side', 'action', 'buy/sell', 'b/s', 'type'],
  qty: ['qty', 'quantity', 'shares', 'filled qty', 'size', 'contracts'],
  price: ['price', 'fill price', 'avg price', 'execution price', 'filled price', 'tradeprice', 't. price', 'trade price'],
  time: ['time', 'date/time', 'datetime', 'date and time', 'execution time', 'filled time', 'timestamp', 'exec time'],
  date: ['date', 'trade date', 'tradedate'],
  fee: ['fee', 'fees', 'commission', 'commissions', 'comm', 'ibcommission', 'comm/fee'],
  multiplier: ['multiplier', 'mult'],
  orderType: ['order type', 'ordertype'],
};

function findColumns(header: string[]): Record<string, number> | null {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    cols[field] = names.map((n) => norm.indexOf(n)).find((i) => i >= 0) ?? -1;
  }
  // A "Time" column that holds only the time of day needs the "Date" column next to it.
  if (cols.time < 0 && cols.date >= 0) cols.time = cols.date;
  const required = ['symbol', 'qty', 'price', 'time'];
  return required.every((f) => cols[f] >= 0) ? cols : null;
}

export function isFillList(header: string[]): boolean {
  return findColumns(header) !== null;
}

export interface Fill {
  symbol: string;
  signedQty: number; // + buy, - sell
  price: number;
  fee: number;
  time: Date;
  rawTime: string;
  /** Dollars per 1.0 price move per unit (futures point value, 100 for options). */
  multiplier: number;
  /** Filled by a stop order. */
  stop: boolean;
}

export function readSide(s: string): 1 | -1 | 0 {
  const t = s.trim().toLowerCase();
  if (/^(b|buy|bot|bought|cover|btc|bto|long)\b/.test(t)) return 1;
  if (/^(s|sell|sld|sold|short|ss|stc|sto)\b/.test(t)) return -1;
  return 0;
}

export const isStopOrder = (s: string | undefined) => /\b(stp|stop|trstp|trail)/i.test(s ?? '');

export function parseFillList(rows: string[][], opts: ParseOptions): ParseResult {
  const cols = findColumns(rows[0])!;
  const warnings: string[] = [];
  const fills: Fill[] = [];

  rows.slice(1).forEach((r, i) => {
    const rawQty = toNumber(r[cols.qty]);
    const side = cols.side >= 0 ? readSide(r[cols.side] ?? '') : (Math.sign(rawQty) as 1 | -1 | 0);
    const qty = Math.abs(rawQty);
    const price = toNumber(r[cols.price]);
    let rawTime = (r[cols.time] ?? '').trim();
    if (cols.date >= 0 && cols.date !== cols.time && !/\d[-/]\d/.test(rawTime)) rawTime = `${r[cols.date].trim()} ${rawTime}`;
    const time = zonedTimeToUtc(rawTime, opts.timeZone);
    if (!side || !Number.isFinite(qty) || qty === 0 || !Number.isFinite(price) || !time) {
      warnings.push(`Row ${i + 2} couldn't be read; skipped.`);
      return;
    }
    const fee = cols.fee >= 0 ? Math.abs(toNumber(r[cols.fee])) || 0 : 0;
    const contract = contractFor(r[cols.symbol]);
    const mult = cols.multiplier >= 0 ? toNumber(r[cols.multiplier]) : NaN;
    fills.push({
      symbol: contract.symbol,
      signedQty: side * qty,
      price,
      fee,
      time,
      rawTime,
      multiplier: mult > 0 ? mult : contract.multiplier,
      stop: cols.orderType >= 0 && isStopOrder(r[cols.orderType]),
    });
  });

  return { format: 'Fill list', trades: buildTrades(fills, opts.fileName, warnings), warnings };
}

interface OpenTrade {
  direction: Direction;
  entryTime: Date;
  rawTime: string;
  position: number; // signed
  maxQty: number;
  entryQty: number;
  entryCost: number; // sum qty*price of entries
  exitQty: number;
  exitValue: number; // sum qty*price of exits
  fees: number;
  fills: number;
  multiplier: number;
  stop: boolean;
}

export function buildTrades(fills: Fill[], source: string, warnings: string[]): Trade[] {
  const sorted = [...fills].sort((a, b) => a.time.getTime() - b.time.getTime());
  const open = new Map<string, OpenTrade>();
  const trades: Trade[] = [];

  const start = (f: Fill, qty: number, fee: number): OpenTrade => ({
    direction: qty > 0 ? 'long' : 'short',
    entryTime: f.time,
    rawTime: f.rawTime,
    position: qty,
    maxQty: Math.abs(qty),
    entryQty: Math.abs(qty),
    entryCost: Math.abs(qty) * f.price,
    exitQty: 0,
    exitValue: 0,
    fees: fee,
    fills: 1,
    multiplier: f.multiplier,
    stop: false,
  });

  const finish = (symbol: string, t: OpenTrade, exitTime: Date | null): Trade => {
    const avgEntry = t.entryCost / t.entryQty;
    const avgExit = t.exitQty > 0 ? t.exitValue / t.exitQty : null;
    const sign = t.direction === 'long' ? 1 : -1;
    const gross = avgExit === null ? 0 : sign * (avgExit - avgEntry) * t.exitQty * t.multiplier;
    const pnl = gross - t.fees;
    return {
      key: `${symbol}|${t.rawTime}|${t.direction}|${t.entryQty}|${avgEntry}`,
      symbol,
      direction: t.direction,
      entryTime: t.entryTime,
      exitTime,
      entryPrice: avgEntry,
      exitPrice: avgExit,
      qty: t.maxQty,
      pnl,
      returnPct: (pnl / (avgEntry * t.maxQty * t.multiplier)) * 100,
      mfePct: null,
      maePct: null,
      stoppedOut: t.stop,
      fills: t.fills,
      source,
    };
  };

  for (const f of sorted) {
    const cur = open.get(f.symbol);
    if (!cur) {
      open.set(f.symbol, start(f, f.signedQty, f.fee));
      continue;
    }
    const sameWay = Math.sign(f.signedQty) === Math.sign(cur.position);
    if (sameWay) {
      cur.position += f.signedQty;
      cur.entryQty += Math.abs(f.signedQty);
      cur.entryCost += Math.abs(f.signedQty) * f.price;
      cur.maxQty = Math.max(cur.maxQty, Math.abs(cur.position));
      cur.fees += f.fee;
      cur.fills++;
      continue;
    }
    // Reducing, closing or flipping.
    const closing = Math.min(Math.abs(f.signedQty), Math.abs(cur.position));
    const feeShare = f.fee * (closing / Math.abs(f.signedQty));
    cur.exitQty += closing;
    cur.exitValue += closing * f.price;
    cur.fees += feeShare;
    cur.fills++;
    cur.position += Math.sign(f.signedQty) * closing;
    if (cur.position === 0) {
      cur.stop = f.stop;
      trades.push(finish(f.symbol, cur, f.time));
      open.delete(f.symbol);
      const remainder = f.signedQty - Math.sign(f.signedQty) * closing;
      if (remainder !== 0) open.set(f.symbol, start(f, remainder, f.fee - feeShare));
    }
  }

  for (const [symbol, t] of open) {
    warnings.push(`${symbol} still has an open ${t.direction} position; left out of the stats.`);
    trades.push(finish(symbol, t, null));
  }
  return trades;
}
