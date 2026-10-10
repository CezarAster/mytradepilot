// The referee's live state machine. Pure: no I/O, no timers, no clock of its own.
// Feed it fills, order updates, marks and ticks; it returns events (trades, breaches, locks).
// Because it is deterministic, the server rebuilds it from stored fills on every start.
import { QUICK_REENTRY_MINUTES } from '../core/analyze.ts';
import { endOfMarketDay, marketClock, parseClock } from '../core/time.ts';
import type { Trade } from '../core/types.ts';
import { Matcher } from './matcher.ts';
import { RecordBook, labels } from './record.ts';
import type {
  Blocker,
  Breach,
  DayState,
  Declaration,
  EngineEvent,
  Fill,
  LiveSnapshot,
  NextTrade,
  OpenPosition,
  OrderSnapshot,
  RuleAction,
  RuleId,
  RuleSet,
} from './types.ts';

export interface EngineOptions {
  rules: RuleSet;
  /** A declaration counts for the next entry within this many minutes. */
  declarationWindowMinutes?: number;
  /** After a working stop is cancelled, how long the trader has to replace it. */
  stopGraceSeconds?: number;
  /** Stop distance (%) used for the R column of the record report. */
  stopPct?: number;
}

export const WORKING = new Set(['new', 'accepted', 'held', 'pending_new', 'partially_filled', 'accepted_for_bidding', 'calculated', 'pending_replace']);
const STOP_TYPES = new Set(['stop', 'stop_limit', 'trailing_stop']);

function freshDay(date: string): DayState {
  return {
    date,
    tradesOpened: 0,
    tradesClosed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    consecutiveLosses: 0,
    lastLossExitAt: null,
    breaches: 0,
    undeclared: 0,
    declaredEntries: 0,
    dailyLossBreached: false,
  };
}

export const fmtTime = (ts: number) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));
const money = (x: number) => `${x < 0 ? '-' : ''}$${Math.abs(x).toFixed(0)}`;

export class LiveEngine {
  private rules: RuleSet;
  private readonly declarationWindowMs: number;
  private readonly stopGraceMs: number;
  private matcher = new Matcher();
  private positions = new Map<string, OpenPosition>();
  private history: Trade[] = [];
  private historyDirty = true;
  private record: RecordBook;
  private day: DayState;
  private lock: { until: number; reason: string } | null = null;
  private cooldownUntil: number | null = null;
  private noReentryUntil: number | null = null;
  private noReentrySymbol: string | null = null;
  private pending: Declaration | null = null;
  private orders = new Map<string, OrderSnapshot>();
  /** Order id -> type, kept after the order is done so a closing fill can be labelled a stop-out. */
  private orderTypes = new Map<string, OrderSnapshot['type']>();
  private dailyLossBreached = false;
  private lastTodayTrade: Trade | null = null;
  private lastSeen = 0;

  constructor(opts: EngineOptions) {
    this.rules = structuredClone(opts.rules);
    this.declarationWindowMs = (opts.declarationWindowMinutes ?? 10) * 60000;
    this.stopGraceMs = (opts.stopGraceSeconds ?? 15) * 1000;
    this.record = new RecordBook(opts.stopPct ?? 2);
    this.day = freshDay('');
  }

  getRules(): RuleSet {
    return structuredClone(this.rules);
  }

  setRules(rules: RuleSet): void {
    this.rules = structuredClone(rules);
  }

  /** Closed trades from other sources (CSV imports). Today's ones also count toward today's limits. */
  seed(trades: Trade[], now: number): void {
    const closed = trades.filter((t) => t.exitTime !== null).sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
    const known = new Set(this.history.map((t) => t.key));
    for (const t of closed) {
      if (known.has(t.key)) continue;
      this.history.push(t);
      known.add(t.key);
    }
    this.historyDirty = true;
    this.rollDay(now);
    const today = marketClock(new Date(now)).date;
    for (const t of closed) {
      if (marketClock(t.entryTime).date !== today) continue;
      this.day.tradesOpened++;
      this.countClosed(t);
    }
  }

  /** All closed trades, imports and live, sorted by entry time. */
  closedTrades(): Trade[] {
    return [...this.history].sort((a, b) => a.entryTime.getTime() - b.entryTime.getTime());
  }

  openPositions(): OpenPosition[] {
    return [...this.positions.values()].map((p) => structuredClone(p));
  }

  report() {
    this.refreshRecord();
    return this.record.get();
  }

  private refreshRecord(): void {
    if (!this.historyDirty) return;
    this.record.set(this.history);
    this.historyDirty = false;
  }

  private rollDay(now: number): EngineEvent[] {
    const date = marketClock(new Date(now)).date;
    if (date === this.day.date) return [];
    const events: EngineEvent[] = [];
    this.day = freshDay(date);
    this.cooldownUntil = null;
    this.noReentryUntil = null;
    this.noReentrySymbol = null;
    this.dailyLossBreached = false;
    this.lastTodayTrade = null;
    if (this.lock && this.lock.until <= now) this.lock = null;
    return events;
  }

  private countClosed(t: Trade): void {
    this.day.tradesClosed++;
    this.day.realizedPnl += t.pnl;
    if (t.pnl > 0) {
      this.day.wins++;
      this.day.consecutiveLosses = 0;
    } else {
      this.day.losses++;
      this.day.consecutiveLosses++;
      this.day.lastLossExitAt = t.exitTime!.getTime();
    }
    this.lastTodayTrade = t;
  }

  private breach(events: EngineEvent[], time: number, rule: RuleId | 'locked', symbol: string | null, tradeKey: string | null, message: string, action: RuleAction): void {
    const b: Breach = { time, rule, symbol, tradeKey, message, action };
    events.push({ type: 'breach', breach: b });
    this.day.breaches++;
    const cap = this.rules.maxBreachesPerDay;
    if (cap.enabled && this.day.breaches >= cap.count && !this.lock) {
      this.lock = { until: endOfMarketDay(time), reason: `${this.day.breaches} rule breaches today (your limit is ${cap.count})` };
      events.push({ type: 'lock', until: this.lock.until, reason: this.lock.reason });
    }
  }

  private inSession(ts: number): boolean {
    const r = this.rules.sessionWindow;
    const start = parseClock(r.start);
    const end = parseClock(r.end);
    if (start === null || end === null) return true;
    const m = marketClock(new Date(ts)).minutes;
    return m >= start && m < end;
  }

  declare(d: Omit<Declaration, 'consumedBy'>): Declaration {
    this.pending = { ...d, symbol: d.symbol ? d.symbol.toUpperCase() : null, consumedBy: null };
    return structuredClone(this.pending);
  }

  cancelDeclaration(): void {
    this.pending = null;
  }

  private takeDeclaration(fill: Fill): Declaration | null {
    const d = this.pending;
    if (!d) return null;
    if (fill.time - d.time > this.declarationWindowMs || fill.time < d.time - 5000) return null;
    if (d.symbol && d.symbol !== fill.symbol) return null;
    this.pending = null;
    return d;
  }

  /** A fill from the broker. Must be applied in time order. */
  applyFill(fill: Fill): EngineEvent[] {
    const events: EngineEvent[] = [];
    this.lastSeen = Math.max(this.lastSeen, fill.time);
    events.push(...this.rollDay(fill.time));
    let result: ReturnType<Matcher['apply']> | null = this.matcher.apply(fill);
    while (result) {
      if (result.kind === 'open') this.onOpen(events, fill, result.position!);
      else if (result.kind === 'add') this.onAdd(events, fill, result.position!);
      else if (result.kind === 'reduce') {
        const p = this.positions.get(fill.symbol)!;
        p.qty = result.position!.qty;
        p.avgEntry = result.position!.avgEntry;
        p.mark = fill.price;
        events.push({ type: 'trade_reduced', position: structuredClone(p), fill });
      } else if (result.kind === 'close') this.onClose(events, fill, result.closed!);
      result = result.flippedInto;
    }
    return events;
  }

  private onOpen(events: EngineEvent[], fill: Fill, pos: NonNullable<ReturnType<Matcher['position']>>): void {
    this.day.tradesOpened++;
    const number = this.day.tradesOpened;
    const decl = this.takeDeclaration(fill);
    const p: OpenPosition = {
      symbol: fill.symbol,
      direction: pos.direction,
      qty: pos.qty,
      avgEntry: pos.avgEntry,
      entryTime: pos.entryTime,
      tradeKey: pos.tradeKey,
      tradeOfDay: number,
      declared: decl !== null,
      stop: null,
      firstStopPrice: null,
      stopDeadline: null,
      mark: fill.price,
      refereeClosed: false,
    };
    this.positions.set(fill.symbol, p);
    if (decl) {
      decl.consumedBy = p.tradeKey;
      this.day.declaredEntries++;
    } else {
      this.day.undeclared++;
    }

    const r = this.rules;
    const t = fill.time;
    if (this.lock && t < this.lock.until) {
      this.breach(events, t, 'locked', fill.symbol, p.tradeKey, `You are locked out until ${fmtTime(this.lock.until)} ET (${this.lock.reason}). You entered ${fill.symbol} at ${fmtTime(t)}.`, 'flatten');
    }
    if (r.maxTradesPerDay.enabled && number > r.maxTradesPerDay.count) {
      this.breach(events, t, 'maxTradesPerDay', fill.symbol, p.tradeKey, `Your rule: max ${r.maxTradesPerDay.count} trades a day. This is trade ${number}.`, r.maxTradesPerDay.action);
    }
    if (r.sessionWindow.enabled && !this.inSession(t)) {
      this.breach(events, t, 'sessionWindow', fill.symbol, p.tradeKey, `Your rule: entries only ${r.sessionWindow.start} to ${r.sessionWindow.end} ET. You entered at ${fmtTime(t)}.`, r.sessionWindow.action);
    }
    if (r.noReentryAfterLoss.enabled && this.noReentryUntil !== null && t < this.noReentryUntil && (!r.noReentryAfterLoss.sameSymbolOnly || this.noReentrySymbol === fill.symbol)) {
      const since = this.day.lastLossExitAt === null ? '' : ` ${Math.round((t - this.day.lastLossExitAt) / 60000)} min after your loss`;
      this.breach(events, t, 'noReentryAfterLoss', fill.symbol, p.tradeKey, `Your rule: no entry within ${r.noReentryAfterLoss.minutes} min of a losing exit (clear at ${fmtTime(this.noReentryUntil)} ET). You entered${since}.`, r.noReentryAfterLoss.action);
    }
    if (r.cooldownAfterLosses.enabled && this.cooldownUntil !== null && t < this.cooldownUntil) {
      this.breach(events, t, 'cooldownAfterLosses', fill.symbol, p.tradeKey, `Your rule: ${r.cooldownAfterLosses.minutes} min cooldown after ${r.cooldownAfterLosses.losses} losses in a row (clear at ${fmtTime(this.cooldownUntil)} ET). You entered at ${fmtTime(t)}.`, r.cooldownAfterLosses.action);
    }
    if (r.maxOpenPositions.enabled && this.positions.size > r.maxOpenPositions.count) {
      this.breach(events, t, 'maxOpenPositions', fill.symbol, p.tradeKey, `Your rule: at most ${r.maxOpenPositions.count} open position${r.maxOpenPositions.count === 1 ? '' : 's'}. You now hold ${this.positions.size}.`, r.maxOpenPositions.action);
    }
    this.checkSize(events, fill, p);
    if (decl && r.sizeMatchesDeclaration.enabled && decl.qty && Math.abs(p.qty) > decl.qty * (1 + r.sizeMatchesDeclaration.tolerancePct / 100)) {
      this.breach(events, t, 'sizeMatchesDeclaration', fill.symbol, p.tradeKey, `You declared ${decl.qty} shares and filled ${Math.abs(p.qty)}.`, r.sizeMatchesDeclaration.action);
    }

    events.push({ type: 'trade_opened', position: structuredClone(p), fill, declared: p.declared });
    if (!decl) events.push({ type: 'undeclared_entry', position: structuredClone(p), fill });

    // A stop placed before the fill (bracket leg, or a stop entered first) counts immediately.
    const existing = this.findWorkingStop(p);
    if (existing) {
      p.firstStopPrice = existing.stopPrice;
      p.stop = { orderId: existing.id, price: existing.stopPrice, firstPrice: existing.stopPrice, seenAt: t };
      events.push({ type: 'stop_attached', symbol: p.symbol, orderId: existing.id, price: existing.stopPrice });
    } else if (r.stopRequired.enabled) {
      p.stopDeadline = t + r.stopRequired.withinSeconds * 1000;
    }
  }

  private onAdd(events: EngineEvent[], fill: Fill, pos: NonNullable<ReturnType<Matcher['position']>>): void {
    const p = this.positions.get(fill.symbol)!;
    p.qty = pos.qty;
    p.avgEntry = pos.avgEntry;
    p.mark = fill.price;
    this.checkSize(events, fill, p);
    events.push({ type: 'trade_added', position: structuredClone(p), fill });
  }

  private checkSize(events: EngineEvent[], fill: Fill, p: OpenPosition): void {
    const r = this.rules.maxPositionDollars;
    const value = Math.abs(p.qty) * p.avgEntry;
    if (r.enabled && value > r.dollars) {
      this.breach(events, fill.time, 'maxPositionDollars', fill.symbol, p.tradeKey, `Your rule: max ${money(r.dollars)} per position. ${fill.symbol} is now ${money(value)} (${Math.abs(p.qty)} shares).`, r.action);
    }
  }

  private onClose(events: EngineEvent[], fill: Fill, trade: Trade): void {
    const p = this.positions.get(fill.symbol);
    const refereeClosed = p?.refereeClosed ?? false;
    trade.stoppedOut = !refereeClosed && STOP_TYPES.has(this.orderTypes.get(fill.orderId) ?? 'other');
    this.positions.delete(fill.symbol);
    this.history.push(trade);
    this.historyDirty = true;
    this.countClosed(trade);
    const r = this.rules;
    if (trade.pnl <= 0) {
      if (r.noReentryAfterLoss.enabled) {
        this.noReentryUntil = fill.time + r.noReentryAfterLoss.minutes * 60000;
        this.noReentrySymbol = fill.symbol;
      }
      if (r.cooldownAfterLosses.enabled && this.day.consecutiveLosses >= r.cooldownAfterLosses.losses) {
        this.cooldownUntil = fill.time + r.cooldownAfterLosses.minutes * 60000;
      }
    }
    events.push({ type: 'trade_closed', trade, fill, refereeClosed });
  }

  private findWorkingStop(p: OpenPosition): OrderSnapshot | null {
    const reducing: 'buy' | 'sell' = p.direction === 'long' ? 'sell' : 'buy';
    let best: OrderSnapshot | null = null;
    for (const o of this.orders.values()) {
      if (o.symbol !== p.symbol || o.side !== reducing || !STOP_TYPES.has(o.type) || !WORKING.has(o.status)) continue;
      if (!best || o.updatedAt > best.updatedAt) best = o;
    }
    return best;
  }

  /** An order update from the broker (any order; only stops matter). */
  applyOrder(o: OrderSnapshot): EngineEvent[] {
    const events: EngineEvent[] = [];
    this.lastSeen = Math.max(this.lastSeen, o.updatedAt);
    const terminal = !WORKING.has(o.status);
    if (terminal) this.orders.delete(o.id);
    else this.orders.set(o.id, o);
    this.orderTypes.set(o.id, o.type);
    if (this.orderTypes.size > 5000) this.orderTypes.delete(this.orderTypes.keys().next().value!);
    if (!STOP_TYPES.has(o.type)) return events;

    const p = this.positions.get(o.symbol);
    if (!p) return events;
    const reducing = p.direction === 'long' ? 'sell' : 'buy';
    if (o.side !== reducing) return events;
    const r = this.rules;

    if (!terminal) {
      const isNew = !p.stop || p.stop.orderId !== o.id;
      if (p.firstStopPrice === null) p.firstStopPrice = o.stopPrice;
      const first = p.firstStopPrice;
      if (isNew && r.stopNotWidened.enabled && first !== null && o.stopPrice !== null) {
        const wider = p.direction === 'long' ? o.stopPrice < first - 1e-9 : o.stopPrice > first + 1e-9;
        if (wider) {
          this.breach(events, o.updatedAt, 'stopNotWidened', o.symbol, p.tradeKey, `Your rule: never widen a stop. ${o.symbol} stop moved from ${first.toFixed(2)} to ${o.stopPrice.toFixed(2)}.`, r.stopNotWidened.action);
        }
      }
      p.stop = { orderId: o.id, price: o.stopPrice, firstPrice: first, seenAt: o.updatedAt };
      p.stopDeadline = null;
      if (isNew) events.push({ type: 'stop_attached', symbol: o.symbol, orderId: o.id, price: o.stopPrice });
      return events;
    }

    // Terminal: the stop we were counting on is gone (cancelled or replaced; filled means the position closes next).
    if (p.stop && p.stop.orderId === o.id && o.status !== 'filled') {
      p.stop = null;
      const replacement = this.findWorkingStop(p);
      if (replacement) {
        p.stop = { orderId: replacement.id, price: replacement.stopPrice, firstPrice: p.firstStopPrice, seenAt: o.updatedAt };
      } else {
        events.push({ type: 'stop_removed', symbol: o.symbol, orderId: o.id });
        if (r.stopRequired.enabled) p.stopDeadline = o.updatedAt + this.stopGraceMs;
      }
    }
    return events;
  }

  /** Latest prices for open symbols, for unrealized P&L and the daily loss limit. */
  setMarks(marks: Record<string, number>, now: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    let unrealized = 0;
    for (const p of this.positions.values()) {
      const m = marks[p.symbol];
      if (m !== undefined && Number.isFinite(m)) p.mark = m;
      if (p.mark !== null) unrealized += (p.mark - p.avgEntry) * p.qty;
    }
    this.day.unrealizedPnl = unrealized;
    this.checkDailyLoss(events, now);
    return events;
  }

  private checkDailyLoss(events: EngineEvent[], now: number): void {
    const r = this.rules.dailyLossLimit;
    if (!r.enabled || this.dailyLossBreached) return;
    const total = this.day.realizedPnl + this.day.unrealizedPnl;
    if (total <= -r.dollars) {
      this.dailyLossBreached = true;
      this.day.dailyLossBreached = true;
      this.breach(events, now, 'dailyLossLimit', null, null, `Your rule: stop at ${money(-r.dollars)} for the day. You are at ${money(total)} (realized ${money(this.day.realizedPnl)}, open ${money(this.day.unrealizedPnl)}).`, r.action);
      if (r.lockRestOfDay && !this.lock) {
        this.lock = { until: endOfMarketDay(now), reason: 'daily loss limit hit' };
        events.push({ type: 'lock', until: this.lock.until, reason: this.lock.reason });
      }
    }
  }

  /** Time passing: stop deadlines, lock expiry, day rollover. Call every few seconds. */
  tick(now: number): EngineEvent[] {
    const events: EngineEvent[] = [];
    this.lastSeen = Math.max(this.lastSeen, now);
    events.push(...this.rollDay(now));
    if (this.lock && this.lock.until <= now) this.lock = null;
    const r = this.rules.stopRequired;
    for (const p of this.positions.values()) {
      if (p.stopDeadline !== null && now >= p.stopDeadline && !p.stop) {
        p.stopDeadline = null;
        this.breach(events, now, 'stopRequired', p.symbol, p.tradeKey, `Your rule: a stop order within ${r.withinSeconds} s of entry. ${p.symbol} has been open ${Math.round((now - p.entryTime) / 1000)} s with no stop.`, r.action);
      }
    }
    this.checkDailyLoss(events, now);
    return events;
  }

  /**
   * Bring back what a replay of fills cannot rebuild: the lock, today's breach count (time-based breaches
   * such as a missing stop are not re-derived) and whether the daily loss limit already fired.
   */
  restore(state: { date: string; lock: { until: number; reason: string } | null; breaches: number; dailyLossBreached: boolean }, now: number): void {
    this.rollDay(now);
    if (state.date !== this.day.date) return;
    if (state.lock && state.lock.until > now) this.lock = { ...state.lock };
    this.day.breaches = Math.max(this.day.breaches, state.breaches);
    if (state.dailyLossBreached) {
      this.dailyLossBreached = true;
      this.day.dailyLossBreached = true;
    }
  }

  /** Mark a position as closed by the referee so its exit is labelled, not counted as a stop-out. */
  markRefereeClosed(symbol: string): void {
    const p = this.positions.get(symbol);
    if (p) p.refereeClosed = true;
  }

  /** Who is still open and the next fill would be their stop check: for the server to poll open orders. */
  positionsAwaitingStop(): string[] {
    return [...this.positions.values()].filter((p) => p.stopDeadline !== null && !p.stop).map((p) => p.symbol);
  }

  private prevContext(now: number): { label: string; minutesSinceLastLoss: number | null } {
    const last = this.lastTodayTrade;
    if (!last) return { label: labels.afterPrevLabel('first'), minutesSinceLastLoss: null };
    if (last.pnl > 0) return { label: labels.afterPrevLabel('win'), minutesSinceLastLoss: null };
    const gapMin = (now - last.exitTime!.getTime()) / 60000;
    return { label: labels.afterPrevLabel(gapMin < QUICK_REENTRY_MINUTES ? 'quick-after-loss' : 'loss'), minutesSinceLastLoss: Math.max(0, Math.round(gapMin)) };
  }

  nextTrade(now: number): NextTrade {
    this.refreshRecord();
    const r = this.rules;
    const number = this.day.tradesOpened + 1;
    const blockers: Blocker[] = [];
    if (this.lock && now < this.lock.until) blockers.push({ rule: 'locked', message: `Locked out until ${fmtTime(this.lock.until)} ET: ${this.lock.reason}.`, until: this.lock.until });
    if (r.maxTradesPerDay.enabled && number > r.maxTradesPerDay.count) blockers.push({ rule: 'maxTradesPerDay', message: `Your rule: max ${r.maxTradesPerDay.count} trades a day. The next one would be trade ${number}.`, until: null });
    if (r.sessionWindow.enabled && !this.inSession(now)) blockers.push({ rule: 'sessionWindow', message: `Your rule: entries only ${r.sessionWindow.start} to ${r.sessionWindow.end} ET.`, until: null });
    if (r.noReentryAfterLoss.enabled && this.noReentryUntil !== null && now < this.noReentryUntil) blockers.push({ rule: 'noReentryAfterLoss', message: `Your rule: no entry before ${fmtTime(this.noReentryUntil)} ET (${r.noReentryAfterLoss.minutes} min after a losing exit${r.noReentryAfterLoss.sameSymbolOnly && this.noReentrySymbol ? `, ${this.noReentrySymbol} only` : ''}).`, until: this.noReentryUntil });
    if (r.cooldownAfterLosses.enabled && this.cooldownUntil !== null && now < this.cooldownUntil) blockers.push({ rule: 'cooldownAfterLosses', message: `Your rule: cooldown until ${fmtTime(this.cooldownUntil)} ET after ${r.cooldownAfterLosses.losses} losses in a row.`, until: this.cooldownUntil });
    if (r.maxOpenPositions.enabled && this.positions.size >= r.maxOpenPositions.count) blockers.push({ rule: 'maxOpenPositions', message: `Your rule: at most ${r.maxOpenPositions.count} open position${r.maxOpenPositions.count === 1 ? '' : 's'}; you hold ${this.positions.size}.`, until: null });
    if (r.dailyLossLimit.enabled && this.dailyLossBreached) blockers.push({ rule: 'dailyLossLimit', message: `Your rule: stop at ${money(-r.dailyLossLimit.dollars)} for the day. You are there.`, until: null });

    const prev = this.prevContext(now);
    const context = {
      tradeOfDay: labels.tradeOfDayLabel(number),
      afterPrev: prev.label,
      timeBucket: labels.timeBucketLabel(marketClock(new Date(now)).minutes),
      minutesSinceLastLoss: prev.minutesSinceLastLoss,
      consecutiveLosses: this.day.consecutiveLosses,
    };
    return { number, allowed: blockers.length === 0, blockers, context, record: this.record.linesFor(context), lateDayGiveBack: this.record.lateDayGiveBack() };
  }

  snapshot(now: number): LiveSnapshot {
    this.rollDay(now);
    return {
      now,
      day: structuredClone(this.day),
      positions: this.openPositions(),
      lock: this.lock && now < this.lock.until ? { ...this.lock } : null,
      cooldownUntil: this.cooldownUntil !== null && now < this.cooldownUntil ? this.cooldownUntil : null,
      noReentryUntil: this.noReentryUntil !== null && now < this.noReentryUntil ? this.noReentryUntil : null,
      pendingDeclaration: this.pending && now - this.pending.time <= this.declarationWindowMs ? structuredClone(this.pending) : null,
      nextTrade: this.nextTrade(now),
    };
  }
}
