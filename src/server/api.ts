// The contract between the local service (src/server) and the browser UI (src/app) and the MCP server (src/mcp).
// Everything here is JSON-safe (times are epoch ms, no Date objects).
import type { Report } from '../core/analyze.ts';
import type { Breach, Declaration, LiveSnapshot, RuleSet } from '../engine/types.ts';
import type { StreamStatus } from '../alpaca/stream.ts';

export const DEFAULT_PORT = 4242;

export interface TradeDto {
  key: string;
  symbol: string;
  direction: 'long' | 'short';
  entryTime: number;
  exitTime: number | null;
  entryPrice: number;
  exitPrice: number | null;
  qty: number;
  pnl: number;
  returnPct: number;
  fills: number;
  source: string;
  /** Live-only annotations (null for imported history). */
  tradeOfDay: number | null;
  declared: boolean | null;
  refereeClosed: boolean;
}

export interface EnforcementState {
  /** Master switch. Off means breaches are logged and shown, nothing is sent to the broker. */
  enabled: boolean;
  /** On means every flatten is logged as "would have closed" instead of being sent. */
  dryRun: boolean;
  /** Set by the kill switch; clears only when the trader turns enforcement back on. */
  killedAt: number | null;
}

export interface StatusResponse {
  version: string;
  /** False until Alpaca keys are saved. */
  configured: boolean;
  mode: 'paper' | 'live';
  stream: StreamStatus;
  streamDetail: string | null;
  enforcement: EnforcementState;
  account: { equity: number; cash: number; buyingPower: number; status: string; daytradeCount: number } | null;
  clock: { isOpen: boolean; nextOpen: string; nextClose: string } | null;
  /** When the last successful REST reconciliation finished. */
  lastSync: number | null;
  /** Number of fills stored and closed trades known. */
  counts: { fills: number; trades: number; imports: number };
  startedAt: number;
  dataDir: string;
}

export interface ActionLog {
  id: number;
  time: number;
  kind: 'flatten' | 'flatten_all' | 'cancel_orders' | 'dry_run' | 'notify' | 'webhook' | 'lock' | 'error' | 'manual_flatten';
  symbol: string | null;
  breachId: number | null;
  detail: string;
  ok: boolean;
}

export interface DayPlan {
  date: string;
  confirmedAt: number;
  note: string | null;
  rules: RuleSet;
}

export interface StateResponse {
  status: StatusResponse;
  snapshot: LiveSnapshot;
  rules: RuleSet;
  plan: DayPlan | null;
  todayTrades: TradeDto[];
  todayBreaches: Breach[];
  recentActions: ActionLog[];
}

export interface ReportResponse {
  report: Report | null;
  trades: number;
  firstDay: string | null;
  lastDay: string | null;
}

export interface SettingsView {
  alpaca: { configured: boolean; mode: 'paper' | 'live'; keyIdPreview: string | null };
  feed: 'iex' | 'sip';
  port: number;
  webhook: { configured: boolean; kind: 'discord' | 'telegram' | 'generic' | null };
  notifications: { desktop: boolean; sound: boolean };
  declarationWindowMinutes: number;
  stopPct: number;
  importTimeZone: string;
}

export interface SettingsUpdate {
  alpaca?: { keyId: string; secretKey: string; mode: 'paper' | 'live' };
  feed?: 'iex' | 'sip';
  webhookUrl?: string | null;
  notifications?: { desktop?: boolean; sound?: boolean };
  declarationWindowMinutes?: number;
  stopPct?: number;
  importTimeZone?: string;
}

export interface ImportRequest {
  fileName: string;
  text: string;
  timeZone: string;
}

export interface ImportResponse {
  format: string;
  imported: number;
  duplicates: number;
  warnings: string[];
}

export interface DeclareRequest {
  symbol?: string | null;
  side?: 'long' | 'short' | null;
  qty?: number | null;
  stopPrice?: number | null;
  note?: string | null;
}

/** Plain-English strategy plus the numbers the setup checker uses. */
export interface StrategyDefinition {
  name: string;
  description: string;
  indicators: string;
  timeframe: '1Min' | '5Min' | '15Min';
  /** Fast and slow EMAs, e.g. 9 and 20. */
  emaFast: number;
  emaSlow: number;
  /** Trend: price above (long) or below (short) the slow EMA on the trading timeframe. */
  requireTrend: boolean;
  /** Pullback: within this % of the fast EMA. */
  pullbackMaxPct: number;
  /** Momentum: day change at least this % (absolute). */
  minDayChangePct: number;
  /** Relative volume today versus the 20-day average, at least this. */
  minRelativeVolume: number;
  /** Prefer stocks above this price. */
  minPrice: number;
  /** VWAP side: long above, short below. */
  requireVwapSide: boolean;
}

export const DEFAULT_STRATEGY: StrategyDefinition = {
  name: 'Pullback momentum',
  description: '',
  indicators: 'EMA 9, EMA 20, VWAP, relative volume',
  timeframe: '5Min',
  emaFast: 9,
  emaSlow: 20,
  requireTrend: true,
  pullbackMaxPct: 1,
  minDayChangePct: 3,
  minRelativeVolume: 1.5,
  minPrice: 5,
  requireVwapSide: true,
};

export interface SetupCheckLine {
  id: string;
  label: string;
  pass: boolean | null;
  value: string;
  target: string;
}

export interface SetupCheckResponse {
  symbol: string;
  side: 'long' | 'short';
  asOf: number;
  price: number | null;
  lines: SetupCheckLine[];
  /** How many of the applicable lines pass. */
  score: { pass: number; total: number };
  /** The engine's view of the next trade right now. */
  nextTrade: LiveSnapshot['nextTrade'];
  warnings: string[];
}

/** Server-sent events on /api/events. */
export type ServerEvent =
  | { type: 'snapshot'; snapshot: LiveSnapshot; status: StatusResponse }
  | { type: 'breach'; breach: Breach & { id: number } }
  | { type: 'trade'; trade: TradeDto }
  | { type: 'action'; action: ActionLog }
  | { type: 'declaration'; declaration: Declaration | null }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; time: number };
