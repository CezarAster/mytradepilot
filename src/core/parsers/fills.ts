// Generic execution list (one row per fill), the shape most brokers can export.
// Fills are matched into round-trip trades: a trade opens when the position leaves
// zero and closes when it returns to zero; a fill that flips the position closes one
// trade and opens the next with the remainder.
import { contractFor, optionExpiry } from '../contracts.ts';
import { toNumber } from '../csv.ts';
import { hasSlashedDates, zonedTimeToUtc } from '../time.ts';
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
  account: ['account', 'account id', 'accountid', 'clientaccountid', 'acct'],
  openClose: ['open/closeindicator', 'pos effect', 'position effect', 'open/close'],
  level: ['levelofdetail'],
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
  /** Name to show and group stats by (the root for futures). */
  symbol: string;
  /** What the position is tracked by, e.g. account + exact contract (MNQH6 and MNQM6 are separate). Defaults to symbol. */
  position?: string;
  signedQty: number; // + buy, - sell
  price: number;
  fee: number;
  time: Date;
  rawTime: string;
  /** Dollars per 1.0 price move per unit (futures point value, 100 for options). */
  multiplier: number;
  /** Filled by a stop order. */
  stop: boolean;
  /**
   * The broker marked this fill as closing. If there's nothing open for it to close, the
   * position was opened before the file starts, so the fill is left out.
   */
  closeOnly?: boolean;
  /** Option expiry, to explain a position that is still open after it. */
  expiry?: Date | null;
}

export function readSide(s: string): 1 | -1 | 0 {
  // BUY_TO_OPEN, SellShort, Buy-To-Cover -> "buy to open", "sell short", "buy to cover".
  const t = s.trim().replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
  if (/^(b|bc|buy\w*|bot|bought|cover|btc|bto|long)\b/.test(t)) return 1;
  if (/^(s|sell\w*|sld|sold|short\w*|ss|stc|sto)\b/.test(t)) return -1;
  return 0;
}

export const isStopOrder = (s: string | undefined) => /\b(stp|stop|trstp|trail)/i.test(s ?? '');

/** "C", "TO CLOSE", IBKR codes like "C;P": a closing fill (but not "C;O", a flip). */
export function isClosingFill(s: string | undefined): boolean {
  const v = (s ?? '').trim().toUpperCase();
  if (/^(C|CLOSE|CLOSING|TO CLOSE)$/.test(v)) return true;
  const codes = v.split(/[;,]/).map((c) => c.trim());
  return codes.includes('C') && !codes.includes('O');
}

export function parseFillList(rows: string[][], opts: ParseOptions): ParseResult {
  const cols = findColumns(rows[0])!;
  const warnings: string[] = [];
  const fills: Fill[] = [];
  const headerSymbol = rows[0][cols.symbol].toLowerCase();
  let data = rows.slice(1).map((r, i) => ({ r, line: i + 2 }));

  // Flex Queries can list each order, its executions and closed lots; keep one level.
  if (cols.level >= 0) {
    const level = (r: string[]) => (r[cols.level] ?? '').trim().toUpperCase();
    const keep = data.some(({ r }) => level(r) === 'EXECUTION') ? 'EXECUTION' : 'ORDER';
    data = data.filter(({ r }) => level(r) === keep || (r[cols.symbol] ?? '').toLowerCase() === headerSymbol);
  }
  if (cols.side < 0 && !data.some(({ r }) => toNumber(r[cols.qty]) < 0)) {
    return {
      format: 'unknown',
      trades: [],
      warnings: [`${opts.fileName}: no Buy/Sell column, and every quantity is positive, so buys and sells can't be told apart.`],
    };
  }

  for (const { r, line } of data) {
    // Exports that repeat the header (one block per account) aren't errors.
    if ((r[cols.symbol] ?? '').toLowerCase() === headerSymbol) continue;
    const rawQty = toNumber(r[cols.qty]);
    const side = cols.side >= 0 ? readSide(r[cols.side] ?? '') : (Math.sign(rawQty) as 1 | -1 | 0);
    const qty = Math.abs(rawQty);
    const price = toNumber(r[cols.price]);
    let rawTime = (r[cols.time] ?? '').trim();
    let time = zonedTimeToUtc(rawTime, opts.timeZone, opts.dayFirst);
    if (!time && cols.date >= 0 && cols.date !== cols.time) {
      rawTime = `${(r[cols.date] ?? '').trim()} ${rawTime}`;
      time = zonedTimeToUtc(rawTime, opts.timeZone, opts.dayFirst);
    }
    if (!side || !Number.isFinite(qty) || qty === 0 || !Number.isFinite(price) || !time) {
      warnings.push(`Row ${line} couldn't be read; skipped.`);
      continue;
    }
    const fee = cols.fee >= 0 ? Math.abs(toNumber(r[cols.fee])) || 0 : 0;
    const raw = (r[cols.symbol] ?? '').trim().toUpperCase();
    const contract = contractFor(raw);
    const mult = cols.multiplier >= 0 ? toNumber(r[cols.multiplier]) : NaN;
    fills.push({
      symbol: contract.symbol,
      position: `${cols.account >= 0 ? r[cols.account] : ''}|${raw}`,
      signedQty: side * qty,
      price,
      fee,
      time,
      rawTime,
      multiplier: mult > 0 ? mult : contract.multiplier,
      stop: cols.orderType >= 0 && isStopOrder(r[cols.orderType]),
      closeOnly: cols.openClose >= 0 && isClosingFill(r[cols.openClose]),
      expiry: optionExpiry(raw),
    });
  }

  // Month-first is the US convention; say so when a non-US user's file can't tell.
  if (opts.dayFirst === undefined && !opts.timeZone.startsWith('America/') && hasSlashedDates(fills.map((f) => f.rawTime))) {
    warnings.push(`Dates like 03/02 were read month first (March 2), since no date in the file settles it.`);
  }
  return { format: 'Fill list', trades: buildTrades(fills, opts.fileName, warnings), warnings };
}

interface OpenTrade {
  symbol: string;
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
  expiry: Date | null;
}

/** Quantities within this of zero are zero (fractional shares and crypto don't add up exactly). */
const isZero = (q: number, scale: number) => Math.abs(q) < 1e-9 * Math.max(1, scale);

export function buildTrades(fills: Fill[], source: string, warnings: string[]): Trade[] {
  // Stable sort: fills in the same second keep the order they were given in.
  const sorted = [...fills].sort((a, b) => a.time.getTime() - b.time.getTime());
  const open = new Map<string, OpenTrade>();
  const trades: Trade[] = [];
  let preexisting = 0;

  const start = (f: Fill, qty: number, fee: number): OpenTrade => ({
    symbol: f.symbol,
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
    expiry: f.expiry ?? null,
  });

  const finish = (t: OpenTrade, exitTime: Date | null): Trade => {
    const avgEntry = t.entryCost / t.entryQty;
    const avgExit = t.exitQty > 0 ? t.exitValue / t.exitQty : null;
    const sign = t.direction === 'long' ? 1 : -1;
    const gross = avgExit === null ? 0 : sign * (avgExit - avgEntry) * t.exitQty * t.multiplier;
    const pnl = gross - t.fees;
    return {
      key: `${t.symbol}|${t.rawTime}|${t.direction}|${t.entryQty}|${avgEntry}`,
      symbol: t.symbol,
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
    const key = f.position ?? f.symbol;
    const cur = open.get(key);
    const sameWay = cur !== undefined && Math.sign(f.signedQty) === Math.sign(cur.position);
    if (f.closeOnly && (!cur || sameWay)) {
      preexisting++;
      continue;
    }
    if (!cur) {
      open.set(key, start(f, f.signedQty, f.fee));
      continue;
    }
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
    if (isZero(cur.position, cur.maxQty)) {
      cur.stop = f.stop;
      trades.push(finish(cur, f.time));
      open.delete(key);
      const remainder = f.signedQty - Math.sign(f.signedQty) * closing;
      // A closing fill bigger than the position also closed shares bought before the file starts.
      if (isZero(remainder, cur.maxQty)) continue;
      if (f.closeOnly) preexisting++;
      else open.set(key, start(f, remainder, f.fee - feeShare));
    }
  }

  if (preexisting) {
    warnings.push(`${preexisting} closing fill${preexisting === 1 ? '' : 's'} for positions opened before this file starts left out.`);
  }
  const now = Date.now();
  for (const t of open.values()) {
    const expired = t.expiry && t.expiry.getTime() < now;
    warnings.push(
      expired
        ? `${t.symbol} is still open after its expiry (it likely expired or was exercised); left out of the stats.`
        : `${t.symbol} still has an open ${t.direction} position; left out of the stats.`,
    );
    trades.push(finish(t, null));
  }
  return trades;
}
