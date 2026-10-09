// Contract sizes, so fill lists of futures and options turn price moves into dollars.

/** Dollars per 1.0 move in price, by futures root symbol (CME/CBOT/NYMEX/COMEX/CFE/Eurex). */
const FUTURES_POINT_VALUE: Record<string, number> = {
  // Equity index
  ES: 50, MES: 5, NQ: 20, MNQ: 2, YM: 5, MYM: 0.5, RTY: 50, M2K: 5, EMD: 100, NKD: 5,
  FDAX: 25, FDXM: 5, FESX: 10, VX: 1000,
  // Energy
  CL: 1000, MCL: 100, QM: 500, NG: 10000, QG: 2500, RB: 42000, HO: 42000,
  // Metals
  GC: 100, MGC: 10, SI: 5000, SIL: 1000, HG: 25000, MHG: 2500, PL: 50, PA: 100,
  // Rates
  ZB: 1000, UB: 1000, ZN: 1000, TN: 1000, ZF: 1000, ZT: 2000,
  // Ags and livestock (grains quoted in cents)
  ZC: 50, ZS: 50, ZW: 50, ZL: 600, ZM: 100, LE: 400, HE: 400, GF: 500,
  // Currencies
  '6E': 125000, M6E: 12500, '6B': 62500, M6B: 6250, '6J': 12500000, '6A': 100000, M6A: 10000,
  '6C': 100000, '6S': 125000, '6N': 100000,
  // Crypto
  BTC: 5, MBT: 0.1, ETH: 50, MET: 0.1,
};

const MONTH = '[FGHJKMNQUVXZ]';
const FUTURES_PATTERNS = [
  new RegExp(`^/?([A-Z0-9]{1,4}?)${MONTH}\\d{1,2}$`), // MNQH6, MNQZ25, /MNQH26
  /^([A-Z0-9]{1,4}) \d{2}-\d{2}$/, // NinjaTrader: MNQ 03-26
  new RegExp(`^CON\\.F\\.[A-Z]+\\.([A-Z0-9]{1,4})\\.${MONTH}\\d{1,2}$`), // ProjectX: CON.F.US.MNQ.H26
];

export interface Contract {
  /** Name to show and group by: the futures root ("MNQ") or the symbol as given. */
  symbol: string;
  /** Dollars per 1.0 price move per unit of quantity. */
  multiplier: number;
  isFutures: boolean;
}

/** Futures root for a contract symbol, if it's one we know. `bare` also accepts a plain root ("MNQ"). */
export function futuresRoot(symbol: string, bare = false): string | null {
  const s = symbol.trim().toUpperCase();
  if (bare && FUTURES_POINT_VALUE[s.replace(/^\//, '')]) return s.replace(/^\//, '');
  for (const re of FUTURES_PATTERNS) {
    const m = re.exec(s);
    if (m && FUTURES_POINT_VALUE[m[1]]) return m[1];
  }
  return null;
}

/** OCC option symbol (AAPL260320C00200000) or a spelled-out one (AAPL 20MAR26 200 C). */
export function isOptionSymbol(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return /^[A-Z.]{1,6}\s*\d{6}[CP]\d{8}$/.test(s) || /^[A-Z.]{1,6} \d{1,2} ?[A-Z]{3} ?\d{2} [\d.]+ (C|P|CALL|PUT)$/.test(s);
}

/**
 * Contract details for a traded symbol. `futuresOnly` is for platforms that only trade
 * futures, where a bare root like "MNQ" is still a future.
 */
export function contractFor(symbol: string, futuresOnly = false): Contract {
  const s = symbol.trim().toUpperCase();
  const root = futuresRoot(s, futuresOnly);
  if (root) return { symbol: root, multiplier: FUTURES_POINT_VALUE[root], isFutures: true };
  if (isOptionSymbol(s)) return { symbol: s, multiplier: 100, isFutures: false };
  return { symbol: s, multiplier: 1, isFutures: false };
}
