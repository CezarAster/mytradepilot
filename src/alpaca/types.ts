// The slices of Alpaca's Trading API v2 and Market Data API v2 that the referee uses.
// Field names follow Alpaca's JSON exactly. https://docs.alpaca.markets/reference

export interface AlpacaCredentials {
  keyId: string;
  secretKey: string;
  /** 'paper' -> paper-api.alpaca.markets, 'live' -> api.alpaca.markets */
  mode: 'paper' | 'live';
}

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  cash: string;
  equity: string;
  last_equity: string;
  buying_power: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
}

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  created_at: string;
  updated_at: string | null;
  submitted_at: string | null;
  filled_at: string | null;
  canceled_at: string | null;
  replaced_at: string | null;
  replaced_by: string | null;
  replaces: string | null;
  symbol: string;
  qty: string | null;
  notional: string | null;
  filled_qty: string;
  filled_avg_price: string | null;
  order_class: string;
  order_type: string;
  type: string;
  side: 'buy' | 'sell';
  position_intent?: string;
  time_in_force: string;
  limit_price: string | null;
  stop_price: string | null;
  trail_price?: string | null;
  trail_percent?: string | null;
  hwm?: string | null;
  status: string;
  legs: AlpacaOrder[] | null;
}

export interface AlpacaPosition {
  symbol: string;
  qty: string;
  side: 'long' | 'short';
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  cost_basis: string;
}

/** GET /v2/account/activities/FILL */
export interface AlpacaFillActivity {
  id: string;
  activity_type: 'FILL';
  transaction_time: string;
  type: 'fill' | 'partial_fill';
  price: string;
  qty: string;
  side: 'buy' | 'sell' | 'sell_short';
  symbol: string;
  leaves_qty: string;
  order_id: string;
  cum_qty: string;
  order_status?: string;
}

/** One message on the trade_updates stream. */
export interface AlpacaTradeUpdate {
  event:
    | 'new'
    | 'fill'
    | 'partial_fill'
    | 'canceled'
    | 'expired'
    | 'done_for_day'
    | 'replaced'
    | 'rejected'
    | 'pending_new'
    | 'stopped'
    | 'pending_cancel'
    | 'pending_replace'
    | 'calculated'
    | 'suspended'
    | 'order_replace_rejected'
    | 'order_cancel_rejected'
    | 'held'
    | 'accepted'
    | string;
  execution_id?: string;
  timestamp?: string;
  price?: string;
  qty?: string;
  position_qty?: string;
  order: AlpacaOrder;
}

export interface AlpacaClock {
  timestamp: string;
  is_open: boolean;
  next_open: string;
  next_close: string;
}

export interface AlpacaBar {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n?: number;
  vw?: number;
}

export interface AlpacaSnapshot {
  latestTrade?: { t: string; p: number; s: number };
  latestQuote?: { t: string; bp: number; ap: number; bs: number; as: number };
  minuteBar?: AlpacaBar;
  dailyBar?: AlpacaBar;
  prevDailyBar?: AlpacaBar;
}

export class AlpacaError extends Error {
  readonly status: number;
  readonly body: string;
  /** How long Alpaca asked us to wait (Retry-After, or the rate-limit reset) before trying again, when it said. */
  readonly retryAfterMs: number | null;
  constructor(status: number, body: string, message?: string, retryAfterMs: number | null = null) {
    super(message ?? `Alpaca ${status}: ${body.slice(0, 300)}`);
    this.name = 'AlpacaError';
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }
}
