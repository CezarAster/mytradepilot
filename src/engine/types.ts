// Types shared by the live engine, the server and the UI.
// Times are epoch milliseconds. Money is account currency (USD on Alpaca).
import type { Trade } from '../core/types.ts';

export type Side = 'buy' | 'sell';

/** One execution, from the Alpaca stream, the Alpaca activities backfill, or a CSV import. */
export interface Fill {
  /** Stable unique key so the same execution seen twice (stream + backfill) is counted once. */
  key: string;
  orderId: string;
  symbol: string;
  side: Side;
  /** Shares in this execution, always positive. */
  qty: number;
  price: number;
  time: number;
  fee: number;
  source: 'alpaca' | 'import';
}

export type OrderType = 'market' | 'limit' | 'stop' | 'stop_limit' | 'trailing_stop' | 'other';

/** The parts of a broker order the engine cares about (stop tracking). */
export interface OrderSnapshot {
  id: string;
  symbol: string;
  side: Side;
  type: OrderType;
  /** Alpaca status string: new, accepted, held, partially_filled, filled, canceled, expired, replaced, rejected... */
  status: string;
  qty: number;
  stopPrice: number | null;
  limitPrice: number | null;
  /** Trailing stops report their current trigger price in hwm/stop_price; we keep what we get. */
  updatedAt: number;
  /** For bracket/OCO legs: the parent order id. */
  parentId: string | null;
}

export type RuleAction = 'warn' | 'flatten';

export interface RuleSet {
  /** Opening more than `count` round trips in one New York trading day is a breach. */
  maxTradesPerDay: { enabled: boolean; count: number; action: RuleAction };
  /** No new entry within `minutes` of a losing exit. */
  noReentryAfterLoss: { enabled: boolean; minutes: number; sameSymbolOnly: boolean; action: RuleAction };
  /** After `losses` consecutive losing trades, no entry for `minutes`. */
  cooldownAfterLosses: { enabled: boolean; losses: number; minutes: number; action: RuleAction };
  /** A protective stop order must be working within `withinSeconds` of the entry fill, and stay there. */
  stopRequired: { enabled: boolean; withinSeconds: number; action: RuleAction };
  /** Moving the stop further from the entry than it was first placed is a breach. */
  stopNotWidened: { enabled: boolean; action: RuleAction };
  /** Position value (shares x average entry) above `dollars` is a breach. */
  maxPositionDollars: { enabled: boolean; dollars: number; action: RuleAction };
  /** Realized plus unrealized loss for the day beyond `dollars`. Flatten closes everything. */
  dailyLossLimit: { enabled: boolean; dollars: number; action: RuleAction; lockRestOfDay: boolean };
  /** Entries only between start and end, New York time, "HH:MM". */
  sessionWindow: { enabled: boolean; start: string; end: string; action: RuleAction };
  /** More than `count` symbols held at once. */
  maxOpenPositions: { enabled: boolean; count: number; action: RuleAction };
  /** A filled size more than `tolerancePct` above the declared size. Only applies to declared trades. */
  sizeMatchesDeclaration: { enabled: boolean; tolerancePct: number; action: RuleAction };
  /** After `count` breaches in a day, lock the rest of the day (every further entry is flattened). */
  maxBreachesPerDay: { enabled: boolean; count: number };
}

export type RuleId = keyof RuleSet;

export const DEFAULT_RULES: RuleSet = {
  maxTradesPerDay: { enabled: true, count: 3, action: 'flatten' },
  noReentryAfterLoss: { enabled: true, minutes: 10, sameSymbolOnly: false, action: 'flatten' },
  cooldownAfterLosses: { enabled: true, losses: 2, minutes: 20, action: 'flatten' },
  stopRequired: { enabled: true, withinSeconds: 60, action: 'flatten' },
  stopNotWidened: { enabled: true, action: 'warn' },
  maxPositionDollars: { enabled: true, dollars: 10000, action: 'flatten' },
  dailyLossLimit: { enabled: true, dollars: 500, action: 'flatten', lockRestOfDay: true },
  sessionWindow: { enabled: true, start: '09:30', end: '15:55', action: 'warn' },
  maxOpenPositions: { enabled: true, count: 2, action: 'warn' },
  sizeMatchesDeclaration: { enabled: true, tolerancePct: 10, action: 'warn' },
  maxBreachesPerDay: { enabled: true, count: 3 },
};

/** "I'm taking this": stamped before the click, matched to the next entry fill. */
export interface Declaration {
  id?: number;
  time: number;
  symbol: string | null;
  side: 'long' | 'short' | null;
  qty: number | null;
  stopPrice: number | null;
  note: string | null;
  /** Set once an entry fill consumed it. */
  consumedBy: string | null;
}

export interface Breach {
  id?: number;
  time: number;
  rule: RuleId | 'locked';
  symbol: string | null;
  tradeKey: string | null;
  /** Plain sentence in the "your rule says / you did" form. */
  message: string;
  /** What the rules ask for. The server decides what actually happens (enforcement on/off, dry run). */
  action: RuleAction;
}

/** A round trip that is still open. Mirrors Trade but with live fields. */
export interface OpenPosition {
  symbol: string;
  direction: 'long' | 'short';
  /** Signed share count, + long, - short. */
  qty: number;
  avgEntry: number;
  entryTime: number;
  tradeKey: string;
  /** Trade number of the day this position opened as. */
  tradeOfDay: number;
  declared: boolean;
  /** Working protective stop, if we have seen one. */
  stop: { orderId: string; price: number | null; firstPrice: number | null; seenAt: number } | null;
  /** Where the first stop of this trade sat; widening is measured from here even across replacements. */
  firstStopPrice: number | null;
  stopDeadline: number | null;
  /** Latest mark we know (last fill price or a quote), for unrealized P&L. */
  mark: number | null;
  /** Set when the referee itself closed it. */
  refereeClosed: boolean;
}

export type EngineEvent =
  | { type: 'trade_opened'; position: OpenPosition; fill: Fill; declared: boolean }
  | { type: 'trade_added'; position: OpenPosition; fill: Fill }
  | { type: 'trade_reduced'; position: OpenPosition; fill: Fill }
  | { type: 'trade_closed'; trade: Trade; fill: Fill }
  | { type: 'breach'; breach: Breach }
  | { type: 'undeclared_entry'; position: OpenPosition; fill: Fill }
  | { type: 'stop_attached'; symbol: string; orderId: string; price: number | null }
  | { type: 'stop_removed'; symbol: string; orderId: string }
  | { type: 'lock'; until: number; reason: string }
  | { type: 'state'; snapshot: LiveSnapshot };

export interface Blocker {
  rule: RuleId | 'locked';
  message: string;
  /** When this blocker clears, if time-based. */
  until: number | null;
}

/** What your record says about the trade you are about to take. */
export interface RecordLine {
  label: string;
  n: number;
  winRate: number;
  avgReturn: number;
  totalPnl: number;
  confidence: 'too few' | 'early signal' | 'solid';
  /** 95% Wilson interval on the win rate. */
  winLow: number;
  winHigh: number;
}

export interface NextTrade {
  /** Trade number the next entry would be. */
  number: number;
  allowed: boolean;
  blockers: Blocker[];
  context: {
    tradeOfDay: string;
    afterPrev: string;
    timeBucket: string;
    minutesSinceLastLoss: number | null;
    consecutiveLosses: number;
  };
  record: RecordLine[];
  /** Over the whole record: share of the profit held after trade 3 that was given back by trades 4+. */
  lateDayGiveBack: { days: number; profitAtTrade3: number; givenBack: number; share: number | null } | null;
}

export interface DayState {
  date: string;
  tradesOpened: number;
  tradesClosed: number;
  wins: number;
  losses: number;
  realizedPnl: number;
  unrealizedPnl: number;
  consecutiveLosses: number;
  lastLossExitAt: number | null;
  breaches: number;
  undeclared: number;
  declaredEntries: number;
}

export interface LiveSnapshot {
  now: number;
  day: DayState;
  positions: OpenPosition[];
  lock: { until: number; reason: string } | null;
  cooldownUntil: number | null;
  noReentryUntil: number | null;
  pendingDeclaration: Declaration | null;
  nextTrade: NextTrade;
}
