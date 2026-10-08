// Generic execution list (one row per fill), the shape most brokers can export.
// Fills are matched into round-trip trades: a trade opens when the position leaves
// zero and closes when it returns to zero; a fill that flips the position closes one
// trade and opens the next with the remainder.
import { toNumber } from '../csv.ts';
import { zonedTimeToUtc } from '../time.ts';
import type { Direction, ParseOptions, ParseResult, Trade } from '../types.ts';

const ALIASES: Record<string, string[]> = {
  symbol: ['symbol', 'ticker', 'instrument', 'underlying'],
  side: ['side', 'action', 'buy/sell', 'b/s', 'type'],
  qty: ['qty', 'quantity', 'shares', 'filled qty', 'size'],
  price: ['price', 'fill price', 'avg price', 'execution price', 'filled price'],
  time: ['time', 'date/time', 'datetime', 'date and time', 'execution time', 'filled time', 'timestamp'],
  fee: ['fee', 'fees', 'commission', 'comm'],
};

function findColumns(header: string[]): Record<string, number> | null {
  const norm = header.map((h) => h.trim().toLowerCase());
  const cols: Record<string, number> = {};
  for (const [field, names] of Object.entries(ALIASES)) {
    cols[field] = norm.findIndex((h) => names.includes(h));
  }
  const required = ['symbol', 'side', 'qty', 'price', 'time'];
  return required.every((f) => cols[f] >= 0) ? cols : null;
}

export function isFillList(header: string[]): boolean {
  return findColumns(header) !== null;
}

interface Fill {
  symbol: string;
  signedQty: number; // + buy, - sell
  price: number;
  fee: number;
  time: Date;
  rawTime: string;
}

function readSide(s: string): 1 | -1 | 0 {
  const t = s.trim().toLowerCase();
  if (/^(b|buy|bot|bought|buy to cover|cover|btc|bto|long)/.test(t)) return 1;
  if (/^(s|sell|sld|sold|short|sell short|ss|stc|sto)/.test(t)) return -1;
  return 0;
}

export function parseFillList(rows: string[][], opts: ParseOptions): ParseResult {
  const cols = findColumns(rows[0])!;
  const warnings: string[] = [];
  const fills: Fill[] = [];

  rows.slice(1).forEach((r, i) => {
    const side = readSide(r[cols.side] ?? '');
    const qty = Math.abs(toNumber(r[cols.qty]));
    const price = toNumber(r[cols.price]);
    const time = zonedTimeToUtc(r[cols.time] ?? '', opts.timeZone);
    if (!side || !Number.isFinite(qty) || qty === 0 || !Number.isFinite(price) || !time) {
      warnings.push(`Row ${i + 2} couldn't be read; skipped.`);
      return;
    }
    const fee = cols.fee >= 0 ? Math.abs(toNumber(r[cols.fee])) || 0 : 0;
    fills.push({ symbol: r[cols.symbol].trim().toUpperCase(), signedQty: side * qty, price, fee, time, rawTime: r[cols.time] });
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
  });

  const finish = (symbol: string, t: OpenTrade, exitTime: Date | null): Trade => {
    const avgEntry = t.entryCost / t.entryQty;
    const avgExit = t.exitQty > 0 ? t.exitValue / t.exitQty : null;
    const sign = t.direction === 'long' ? 1 : -1;
    const gross = avgExit === null ? 0 : sign * (avgExit - avgEntry) * t.exitQty;
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
      returnPct: (pnl / (avgEntry * t.maxQty)) * 100,
      mfePct: null,
      maePct: null,
      stoppedOut: false,
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
