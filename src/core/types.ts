export type Direction = 'long' | 'short';

/** One round trip: flat -> position -> flat. */
export interface Trade {
  /** Stable identity used to drop duplicates when overlapping exports are loaded. */
  key: string;
  symbol: string;
  direction: Direction;
  entryTime: Date;
  /** null while the trade is still open. */
  exitTime: Date | null;
  entryPrice: number;
  exitPrice: number | null;
  qty: number;
  /** Net P&L in account currency. */
  pnl: number;
  /** P&L as a % of the position's entry value. */
  returnPct: number;
  /** Best and worst unrealized move during the trade, in % (MAE is negative). Null if the source lacks it. */
  mfePct: number | null;
  maePct: number | null;
  /** True when the exit came from a stop order. */
  stoppedOut: boolean;
  /** Number of fills/rows merged into this trade. */
  fills: number;
  source: string;
}

export interface ParseResult {
  format: string;
  trades: Trade[];
  warnings: string[];
}

export interface ParseOptions {
  /** Time zone the export's timestamps are written in (TradingView uses your chart's zone). */
  timeZone: string;
  fileName: string;
}
