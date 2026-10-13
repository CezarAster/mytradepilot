// The service: owns the engine, the Alpaca connection, persistence and enforcement.
// Fills reach the engine from three places, in this order of trust: the stored history (replayed on start),
// the Alpaca activities backfill (what we missed while offline), and the live stream.
import { join } from 'node:path';
import { AlpacaClient } from '../alpaca/client.ts';
import { fillFromActivity, fillFromUpdate, orderSnapshots } from '../alpaca/convert.ts';
import { TradeStream, type StreamStatus } from '../alpaca/stream.ts';
import type { AlpacaCredentials, AlpacaOrder, AlpacaSnapshot, AlpacaTradeUpdate } from '../alpaca/types.ts';
import { AlpacaError } from '../alpaca/types.ts';
import { marketClock } from '../core/time.ts';
import type { Trade } from '../core/types.ts';
import { combineTrades, parseFile } from '../core/parsers/index.ts';
import { isValidTimeZone } from '../core/time.ts';
import { LiveEngine, WORKING, fmtTime } from '../engine/live.ts';
import type { Breach, Declaration, EngineEvent, Fill, LiveSnapshot, RuleSet } from '../engine/types.ts';
import { checkSetup } from '../strategy/setup.ts';
import type {
  ActionLog,
  DayPlan,
  DeclareRequest,
  EnforcementState,
  ImportRequest,
  ImportResponse,
  ReportResponse,
  ServerEvent,
  SettingsUpdate,
  SettingsView,
  SetupCheckResponse,
  StateResponse,
  StatusResponse,
  StrategyDefinition,
  TradeDto,
} from './api.ts';
import { AlpacaCredsSchema, RuleSetSchema, StrategySchema, validationMessage, type Config, type ConfigStore } from './config.ts';
import { Store } from './db.ts';
import type { Logger } from './log.ts';
import { Notifier, webhookKind } from './notify.ts';

export const VERSION = '0.2.0';

type Mode = 'live' | 'late' | 'history';

export interface RefereeDeps {
  config: ConfigStore;
  log: Logger;
  now?: () => number;
  clientFactory?: (creds: AlpacaCredentials) => AlpacaClient;
  streamFactory?: (creds: AlpacaCredentials, handlers: ConstructorParameters<typeof TradeStream>[1]) => TradeStream;
  fetchImpl?: typeof fetch;
  /** Test hook: skip timers. */
  timers?: boolean;
  dbFile?: (mode: 'paper' | 'live') => string;
  sleep?: (ms: number) => Promise<void>;
}

/** The stored breach a flatten answers. Its id is filled in once the breach is written, which happens after the flatten starts. */
interface BreachRef {
  id: number | null;
}

interface FlattenRetry {
  symbol: string;
  tradeKey: string | null;
  breach: BreachRef;
  rule: string;
  attempts: number;
  nextAt: number;
}

const MAX_FLATTEN_ATTEMPTS = 8;
/** Longest in-line wait for a Retry-After on a close; longer ones go to the retry queue. */
const MAX_INLINE_RETRY_WAIT = 5000;
/** At most one drift-triggered sync this often. */
const DRIFT_RESYNC_MS = 60000;

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export class Referee {
  private readonly config: ConfigStore;
  private readonly log: Logger;
  private readonly now: () => number;
  private readonly deps: RefereeDeps;
  private store!: Store;
  private engine!: LiveEngine;
  private client: AlpacaClient | null = null;
  private stream: TradeStream | null = null;
  private streamStatus: StreamStatus = 'stopped';
  private streamDetail: string | null = null;
  private everLive = false;
  private notifier: Notifier;
  private listeners = new Set<(e: ServerEvent) => void>();
  private timers: ReturnType<typeof setInterval>[] = [];
  private account: StatusResponse['account'] = null;
  private clock: StatusResponse['clock'] = null;
  private lastSync: number | null = null;
  private readonly startedAt: number;
  private lastFlatten = new Map<string, number>();
  private flattenRetries = new Map<string, FlattenRetry>();
  /** Newest fill time the engine has consumed; a backfilled fill older than this forces a rebuild in time order. */
  private lastAppliedFill = 0;
  private ticking = false;
  private readonly sleep: (ms: number) => Promise<void>;
  private syncing: Promise<void> | null = null;
  /** A sync asked for while one ran, or one that gave up because the account switched under it: run once more. */
  private resync: string | null = null;
  /** Breaches from backfilled fills, held until the whole batch is applied, then enforced if their trade is still open. */
  private lateBreaches: Breach[] = [];
  private lastDriftSyncAt = 0;
  private lastDrift = '';
  /** Bumped on every connect, so a replaced stream's handlers go quiet. */
  private streamGen = 0;
  /** Fills applied to the engine that the database refused; written on the next sync, replayed with the store. */
  private unstored = new Map<string, Fill>();
  private lastWriteErrorAt = 0;
  private lastWriteNoticeAt = 0;
  private unsavedId = 0;
  private replaying = false;
  private pendingDeclId: number | null = null;
  private lastMarksAt = 0;
  private lastReconcileAt = 0;
  private lastClockAt = 0;
  private stopped = false;

  constructor(deps: RefereeDeps) {
    this.deps = deps;
    this.config = deps.config;
    this.log = deps.log;
    this.now = deps.now ?? (() => Date.now());
    this.startedAt = this.now();
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    const cfg = this.config.get();
    this.notifier = new Notifier(this.log, { webhookUrl: cfg.webhookUrl, desktop: cfg.notifications.desktop, fetchImpl: deps.fetchImpl });
    this.log.onLog((level, message, time) => {
      if (level !== 'debug') this.emit({ type: 'log', level, message, time });
    });
  }

  // ---------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    const cfg = this.config.get();
    const mode = cfg.alpaca?.mode ?? 'paper';
    const file = this.deps.dbFile ? this.deps.dbFile(mode) : join(this.config.dir, `referee-${mode}.sqlite`);
    this.store = new Store(file);
    this.engine = new LiveEngine({ rules: cfg.rules, declarationWindowMinutes: cfg.declarationWindowMinutes, stopPct: cfg.stopPct });
    this.log.info(`data in ${file}`);
    this.rebuildEngine();
    if (cfg.alpaca) await this.connect(cfg.alpaca);
    else this.log.warn('Alpaca keys are not set. Open Settings in the UI (or export APCA_API_KEY_ID and APCA_API_SECRET_KEY) to connect.');
    if (this.deps.timers !== false) {
      this.timers.push(setInterval(() => void this.onTick().catch((e) => this.log.error('tick failed', e)), 2000));
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.timers = [];
    this.stream?.stop();
    this.stream = null;
    this.store?.close();
  }

  /**
   * Replay stored history into a fresh engine. Nothing here notifies or enforces, except fills in `lateKeys`
   * (just backfilled, today): their breaches are handled as seen late.
   */
  private rebuildEngine(lateKeys: Set<string> = new Set()): void {
    const cfg = this.config.get();
    const t0 = this.now();
    const before = this.engine ? this.engine.snapshot(t0) : null;
    const pending = before?.pendingDeclaration ?? null;
    const lockedBefore = before?.lock != null || this.savedLockActive();
    this.engine = new LiveEngine({ rules: cfg.rules, declarationWindowMinutes: cfg.declarationWindowMinutes, stopPct: cfg.stopPct });
    this.lateBreaches = [];
    this.flushUnstored();
    const fills = this.unstored.size ? [...this.store.allFills(), ...this.unstored.values()].sort((a, b) => a.time - b.time) : this.store.allFills();
    // Mid-replay the day state is incomplete: saving it, or announcing a lock, waits until it is restored below.
    this.replaying = true;
    try {
      for (const f of fills) this.handleEvents(this.engine.applyFill(f), lateKeys.has(f.key) ? 'late' : 'history');
    } finally {
      this.replaying = false;
    }
    this.lastAppliedFill = fills.length ? fills[fills.length - 1].time : 0;
    // Imports after the replay: replaying fills rolls the engine through past days, which would wipe today's count.
    const imported = this.store.importedTrades();
    if (imported.length) this.engine.seed(imported, this.now());
    // Working orders as last seen, so a rebuilt position keeps its stop instead of looking naked to the next tick.
    for (const o of this.store.workingOrders([...WORKING])) this.handleEvents(this.engine.applyOrder(o), 'history');
    this.restoreDayState(this.lateBreaches.length);
    if (this.lateBreaches.length) {
      this.persistDayState();
      const lock = this.engine.snapshot(this.now()).lock;
      if (lock && !lockedBefore) this.handleEvents([{ type: 'lock', until: lock.until, reason: lock.reason }], 'late');
    }
    if (pending) this.engine.declare(pending);
    else this.pendingDeclId = null;
    this.log.info(`engine rebuilt: ${fills.length} fills, ${imported.length} imported trades, ${this.engine.closedTrades().length} closed trades (${this.now() - t0} ms)`);
  }

  /** Locks and today's breach count survive a restart; fills alone cannot rebuild them. */
  private restoreDayState(newBreaches = 0): void {
    const raw = this.store.getKv('day_state');
    try {
      this.engine.restore(raw ? JSON.parse(raw) : { date: '', lock: null, breaches: 0, dailyLossBreached: false }, this.now(), newBreaches);
    } catch (err) {
      this.log.warn('could not restore day state', err);
    }
  }

  private savedLockActive(): boolean {
    try {
      const raw = this.store.getKv('day_state');
      const lock = raw ? (JSON.parse(raw) as { lock: { until: number } | null }).lock : null;
      return lock !== null && lock.until > this.now();
    } catch {
      return false;
    }
  }

  private persistDayState(): void {
    if (this.replaying) return;
    const s = this.engine.snapshot(this.now());
    this.safeWrite('day state', () => this.store.setKv('day_state', JSON.stringify({ date: s.day.date, lock: s.lock, breaches: s.day.breaches, dailyLossBreached: s.day.dailyLossBreached })));
  }

  /**
   * A database write that must not stop enforcement when it fails (disk full, file locked, read-only folder).
   * Logs at most once a minute and tells the trader at most once an hour. Returns null on failure.
   */
  private safeWrite<T>(what: string, fn: () => T): T | null {
    try {
      return fn();
    } catch (err) {
      const now = this.now();
      if (now - this.lastWriteErrorAt >= 60000) {
        this.lastWriteErrorAt = now;
        this.log.error(`could not save ${what} to the database; enforcement carries on from memory`, err);
      }
      if (now - this.lastWriteNoticeAt >= 3600000) {
        this.lastWriteNoticeAt = now;
        void this.notifier.send('Referee: cannot save to its data folder', `Writing ${what} failed: ${(err as Error).message}. Rules are still enforced, but history may be incomplete after a restart. Check disk space.`);
      }
      return null;
    }
  }

  /** Store an action and tell the UI. When the write fails the UI still hears about it, under a temporary negative id. */
  private recordAction(a: Omit<ActionLog, 'id'>): void {
    const saved = this.safeWrite('an action', () => this.store.insertAction(a));
    this.emit({ type: 'action', action: saved ?? { ...a, id: --this.unsavedId } });
  }

  /**
   * Store a fill; true when it is new and should be applied. A fill the database refuses is still applied (and
   * remembered) so a failing disk never lets a fill go unrefereed.
   */
  private storeFill(f: Fill): boolean {
    if (this.unstored.has(f.key)) return false;
    const r = this.safeWrite('a fill', () => this.store.insertFill(f));
    if (r !== null) return r;
    let dup = false;
    try {
      dup = this.store.hasFill(f.key);
    } catch {
      // reads failing too: treat as new
    }
    if (dup) return false;
    this.unstored.set(f.key, f);
    return true;
  }

  /** Retry writing fills the database refused earlier. */
  private flushUnstored(): void {
    for (const [k, f] of this.unstored) {
      if (this.safeWrite('a fill', () => this.store.insertFill(f)) === null) return;
      this.unstored.delete(k);
    }
  }

  private async connect(creds: AlpacaCredentials): Promise<void> {
    this.stream?.stop();
    this.client = this.deps.clientFactory ? this.deps.clientFactory(creds) : new AlpacaClient(creds, { fetchImpl: this.deps.fetchImpl });
    try {
      await this.reconcile('startup');
    } catch (err) {
      this.log.error('initial sync failed; will keep retrying', err);
    }
    const gen = ++this.streamGen;
    const current = () => gen === this.streamGen && !this.stopped;
    const handlers = {
      onUpdate: (u: AlpacaTradeUpdate) => {
        if (current()) this.onUpdate(u);
      },
      onStatus: (s: StreamStatus, detail?: string) => {
        if (!current()) return;
        this.streamStatus = s;
        this.streamDetail = detail ?? null;
        this.log.info(`stream ${s}${detail ? `: ${detail}` : ''}`);
        this.broadcastSnapshot();
      },
      onLive: () => {
        if (!current()) return;
        void this.reconcile(this.everLive ? 'reconnect' : 'first-live').catch((e) => {
          if (!this.stopped) this.log.error('sync after connect failed', e);
        });
        this.everLive = true;
      },
    };
    this.stream = this.deps.streamFactory ? this.deps.streamFactory(creds, handlers) : new TradeStream(creds, handlers);
    this.stream.start();
  }

  // ---------------------------------------------------------------- sync with Alpaca

  /**
   * Pull what the stream may have missed: fills, working orders, positions, account. Serialized: a request while one
   * runs is coalesced into one more run after it, and the returned promise covers that run too.
   */
  reconcile(reason: string): Promise<void> {
    if (this.syncing) {
      this.resync ??= reason;
      return this.syncing;
    }
    this.syncing = this.runReconciles(reason).finally(() => (this.syncing = null));
    return this.syncing;
  }

  private async runReconciles(reason: string): Promise<void> {
    let next: string | null = reason;
    let error: unknown = null;
    while (next !== null && !this.stopped) {
      this.resync = null;
      try {
        await this.doReconcile(next);
        error = null;
      } catch (err) {
        error = err;
      }
      next = this.resync;
    }
    if (error) throw error;
  }

  private async doReconcile(reason: string): Promise<void> {
    const client = this.client;
    if (!client || this.stopped) return;
    // Settings can switch the account (paper to live, new keys) or rebuild the engine while we wait on Alpaca.
    // Whatever we fetched then belongs to the old one: drop it and run again against the new one.
    const store = this.store;
    let engine = this.engine;
    const superseded = () => {
      if (this.stopped) return true;
      if (this.client === client && this.store === store && this.engine === engine) return false;
      this.log.info(`sync (${reason}) superseded by a settings change; running again`);
      this.resync ??= reason;
      return true;
    };
    const now = this.now();
    const acct = await client.getAccount();
    if (superseded()) return;
    this.account = { equity: Number(acct.equity), cash: Number(acct.cash), buyingPower: Number(acct.buying_power), status: acct.status, daytradeCount: acct.daytrade_count };
    const known = this.store.getKv('alpaca_account_id');
    if (known && known !== acct.id) this.log.warn(`this data file was built from account ${known.slice(0, 8)} but the keys belong to ${acct.id.slice(0, 8)}; set MYTRADEPILOT_HOME to a new folder for a new account`);
    if (!known) this.safeWrite('the account id', () => this.store.setKv('alpaca_account_id', acct.id));

    // Fills we have not stored yet. Look back two days past the last one so late-reported fills are caught.
    this.flushUnstored();
    const last = this.store.lastFillTime();
    const after = last === null ? undefined : new Date(last - 2 * 86400000).toISOString();
    const activities = await client.allFillsSince(after);
    if (superseded()) return;
    const fresh: Fill[] = [];
    for (const a of activities) {
      const f = fillFromActivity(a);
      if (f && !this.unstored.has(f.key) && !this.store.hasFill(f.key)) fresh.push(f);
    }
    fresh.sort((a, b) => a.time - b.time);
    // Today's backfilled fills were missed live (offline, or a stream that went quiet): their breaches are stored,
    // notified, and enforced while the trade is still open. Older ones are history.
    const today = marketClock(new Date(now)).date;
    const isLate = (f: Fill) => marketClock(new Date(f.time)).date === today;
    if (fresh.length && fresh[0].time < this.lastAppliedFill) {
      // The stream already gave the engine newer fills; applying these now would match them out of order.
      for (const f of fresh) this.storeFill(f);
      this.log.warn(`backfilled ${fresh.length} fill(s) older than fills already applied (${reason}); rebuilt from history in time order`);
      this.rebuildEngine(new Set(fresh.filter(isLate).map((f) => f.key)));
      engine = this.engine;
    } else {
      for (const f of fresh) {
        if (!this.storeFill(f)) continue;
        this.handleEvents(this.engine.applyFill(f), isLate(f) ? 'late' : 'history');
        this.lastAppliedFill = Math.max(this.lastAppliedFill, f.time);
      }
      if (fresh.length) this.log.info(`backfilled ${fresh.length} fill(s) (${reason})`);
    }
    this.enforceLate();

    // Working orders, so stops placed while we were away count.
    const open = await client.listOrders({ status: 'open', nested: true });
    if (superseded()) return;
    const openIds = new Set<string>();
    for (const o of open) {
      for (const snap of orderSnapshots(o)) {
        openIds.add(snap.id);
        this.safeWrite('an order', () => this.store.upsertOrder(snap));
        this.handleEvents(this.engine.applyOrder(snap), 'history');
      }
    }
    for (const snap of this.store.workingOrders([...WORKING])) {
      if (openIds.has(snap.id)) continue;
      const gone = { ...snap, status: 'canceled', updatedAt: now };
      this.safeWrite('an order', () => this.store.upsertOrder(gone));
      this.handleEvents(this.engine.applyOrder(gone), 'history');
    }

    await this.refreshPositions(client, true);
    if (superseded()) return;
    try {
      const clock = await client.getClock();
      if (superseded()) return;
      this.clock = { isOpen: clock.is_open, nextOpen: clock.next_open, nextClose: clock.next_close };
      this.lastClockAt = now;
    } catch (err) {
      this.log.debug('clock failed', err);
    }
    this.lastSync = this.now();
    this.lastReconcileAt = this.lastSync;
    this.broadcastSnapshot();
  }

  /**
   * Marks and unrealized P&L from Alpaca's positions list. A position Alpaca and our fills disagree on (a fill the
   * stream never delivered) triggers a sync, at most once a minute; `inSync` is set when called from a sync itself.
   */
  private async refreshPositions(client: AlpacaClient, inSync: boolean): Promise<void> {
    const engine = this.engine;
    const positions = await client.listPositions();
    if (this.stopped || this.client !== client || this.engine !== engine) return;
    const marks: Record<string, number> = {};
    const ours = new Map(this.engine.openPositions().map((p) => [p.symbol, p.qty]));
    const drift: string[] = [];
    for (const p of positions) {
      const sym = p.symbol.toUpperCase();
      marks[sym] = Number(p.current_price);
      const theirs = (p.side === 'short' ? -1 : 1) * Math.abs(Number(p.qty));
      const mine = ours.get(sym);
      if (mine === undefined) drift.push(`${sym}: Alpaca shows a ${p.side} position of ${Math.abs(theirs)} that our fills do not explain`);
      else if (Math.abs(mine - theirs) > 1e-9) drift.push(`${sym}: Alpaca shows ${theirs} shares, our fills say ${mine}`);
    }
    for (const sym of ours.keys()) {
      if (!positions.some((p) => p.symbol.toUpperCase() === sym)) drift.push(`${sym}: our fills say open, Alpaca shows it flat`);
    }
    this.handleEvents(this.engine.setMarks(marks, this.now()), 'live');
    this.lastMarksAt = this.now();
    const sig = drift.join('; ');
    if (sig && sig !== this.lastDrift) this.log.warn(`positions disagree with Alpaca (a fill was missed): ${sig}`);
    this.lastDrift = sig;
    if (sig && !inSync && this.now() - this.lastDriftSyncAt >= DRIFT_RESYNC_MS) {
      this.lastDriftSyncAt = this.now();
      void this.reconcile('drift').catch((e) => this.log.warn('drift sync failed', e));
    }
  }

  private onUpdate(u: AlpacaTradeUpdate): void {
    try {
      const at = u.timestamp ? Date.parse(u.timestamp) : this.now();
      for (const snap of orderSnapshots(u.order, Number.isFinite(at) ? at : this.now())) {
        this.safeWrite('an order', () => this.store.upsertOrder(snap));
        this.handleEvents(this.engine.applyOrder(snap), 'live');
      }
      const fill = fillFromUpdate(u);
      if (fill) {
        if (this.storeFill(fill)) {
          this.handleEvents(this.engine.applyFill(fill), 'live');
          this.lastAppliedFill = Math.max(this.lastAppliedFill, fill.time);
        } else this.log.debug(`duplicate fill ignored ${fill.key}`);
      }
      this.broadcastSnapshot();
    } catch (err) {
      this.log.error('trade update failed', err);
    }
  }

  private async onTick(): Promise<void> {
    if (this.stopped || this.ticking) return;
    this.ticking = true;
    try {
      await this.tickOnce();
    } finally {
      this.ticking = false;
    }
  }

  private async tickOnce(): Promise<void> {
    const now = this.now();
    const client = this.client;
    if (client) {
      // Ask Alpaca before any stop deadline can fire: a missed order event must never cost the trader a flatten.
      const engine = this.engine;
      const awaiting = new Set(engine.positionsAwaitingStop());
      for (const p of engine.openPositions()) {
        if (!awaiting.has(p.symbol) || p.stopDeadline === null || p.stopDeadline - now >= 12000) continue;
        try {
          const orders = await client.listOrders({ status: 'open', nested: true, symbols: p.symbol });
          if (this.client !== client || this.engine !== engine) return; // the account switched while we asked
          for (const o of orders) {
            for (const snap of orderSnapshots(o)) {
              this.safeWrite('an order', () => this.store.upsertOrder(snap));
              this.handleEvents(this.engine.applyOrder(snap), 'live');
            }
          }
        } catch (err) {
          this.log.warn(`could not check open orders for ${p.symbol}; its stop check waits for Alpaca`, err);
          return;
        }
      }
    }
    this.handleEvents(this.engine.tick(this.now()), 'live');
    if (!client) return;
    await this.drainFlattenRetries();
    const open = this.engine.openPositions();
    const marksEvery = open.length ? 5000 : 30000;
    if (now - this.lastMarksAt >= marksEvery) {
      try {
        await this.refreshPositions(client, false);
      } catch (err) {
        this.log.debug('positions refresh failed', err);
      }
    }
    if (this.syncing) {
      // one is running; it sets lastReconcileAt when done
    } else if (now - this.lastReconcileAt >= 120000 && this.streamStatus !== 'live') {
      void this.reconcile('stream down').catch((e) => this.log.warn('periodic sync failed', e));
    } else if (now - this.lastReconcileAt >= 600000) {
      void this.reconcile('periodic').catch((e) => this.log.warn('periodic sync failed', e));
    }
    if (now - this.lastClockAt >= 60000) {
      this.lastClockAt = now;
      client
        .getClock()
        .then((c) => (this.clock = { isOpen: c.is_open, nextOpen: c.next_open, nextClose: c.next_close }))
        .catch(() => undefined);
    }
    this.broadcastSnapshot();
  }

  // ---------------------------------------------------------------- events and enforcement

  private handleEvents(events: EngineEvent[], mode: Mode): void {
    // One event failing (a database write, say) must not drop the ones after it, a breach above all.
    for (const e of events) {
      try {
        this.handleEvent(e, mode);
      } catch (err) {
        this.log.error(`handling ${e.type} failed`, err);
      }
    }
  }

  private handleEvent(e: EngineEvent, mode: Mode): void {
    switch (e.type) {
      case 'trade_opened':
        this.safeWrite('trade details', () => this.store.setTradeMeta(e.position.tradeKey, mode === 'history' ? { tradeOfDay: e.position.tradeOfDay } : { tradeOfDay: e.position.tradeOfDay, declared: e.declared }));
        if (e.declared && this.pendingDeclId !== null) {
          const declId = this.pendingDeclId;
          this.safeWrite('a declaration', () => this.store.consumeDeclaration(declId, e.position.tradeKey));
          this.pendingDeclId = null;
          if (mode === 'live') this.emit({ type: 'declaration', declaration: null });
        }
        if (mode === 'live') this.log.info(`${e.position.symbol}: ${e.position.direction} ${Math.abs(e.position.qty)} @ ${e.position.avgEntry.toFixed(2)}, trade ${e.position.tradeOfDay} of the day${e.declared ? ', declared' : ', undeclared'}`);
        break;
      case 'trade_closed':
        if (e.refereeClosed) this.safeWrite('trade details', () => this.store.setTradeMeta(e.trade.key, { refereeClosed: true }));
        if (mode !== 'history') this.emit({ type: 'trade', trade: this.toDto(e.trade) });
        if (mode === 'live') this.log.info(`${e.trade.symbol}: closed ${e.trade.pnl >= 0 ? '+' : ''}${e.trade.pnl.toFixed(2)}`);
        break;
      case 'breach':
        if (mode === 'history') break;
        this.persistDayState();
        // A backfilled breach waits until the whole batch is applied: a later fill in it may have closed the trade.
        if (mode === 'late') this.lateBreaches.push(e.breach);
        else void this.onBreach(e.breach, mode);
        break;
      case 'lock':
        if (mode !== 'history' && !this.replaying) {
          this.persistDayState();
          this.recordAction({ time: this.now(), kind: 'lock', symbol: null, breachId: null, detail: `Locked until ${fmtTime(e.until)} ET: ${e.reason}`, ok: true });
          void this.notifier.send('Referee: locked out', e.reason);
        }
        break;
      case 'stop_removed':
        if (mode === 'live') this.log.warn(`${e.symbol}: protective stop ${e.orderId} is gone`);
        break;
      default:
        break;
    }
  }

  /** Handle the breaches backfilled fills produced, now that the batch is applied and positions are current. */
  private enforceLate(): void {
    const late = this.lateBreaches;
    this.lateBreaches = [];
    for (const b of late) void this.onBreach(b, 'late');
  }

  /** Is the trade a breach is about still open? Without a trade key: its symbol, or (daily loss, lock) anything. */
  private stillOpen(b: Breach): boolean {
    const open = this.engine.openPositions();
    if (b.tradeKey) return open.some((p) => p.tradeKey === b.tradeKey);
    if (b.symbol) return open.some((p) => p.symbol === b.symbol);
    return open.length > 0;
  }

  private async onBreach(b: Breach, mode: Mode): Promise<void> {
    try {
      const late = mode === 'late';
      const stored: Breach = late ? { ...b, message: `(seen late) ${b.message}` } : b;
      const enf = this.config.get().enforcement;
      const ref: BreachRef = { id: null };
      // Start the flatten before touching the disk: a failing or slow write must never cost the trader a close.
      let outcome: string | Promise<string> = '';
      let dryRun = false;
      if (b.action === 'flatten') {
        if (late && !this.stillOpen(b)) outcome = 'Seen after the fact; the trade is already closed.';
        else if (!enf.enabled) outcome = 'Enforcement is off: nothing sent.';
        else if (enf.dryRun) {
          dryRun = true;
          outcome = `DRY RUN: would have ${b.symbol ? `closed ${b.symbol}` : 'closed every position'}.`;
        } else outcome = this.flatten(b.symbol, ref, b.rule, b.tradeKey);
      }
      ref.id = this.safeWrite('a breach', () => this.store.insertBreach(stored));
      this.emit({ type: 'breach', breach: { ...stored, id: ref.id ?? --this.unsavedId } });
      this.log.warn(`BREACH ${b.rule}${b.symbol ? ` ${b.symbol}` : ''}: ${stored.message}`);
      if (dryRun) this.recordAction({ time: this.now(), kind: 'dry_run', symbol: b.symbol, breachId: ref.id, detail: outcome as string, ok: true });
      const text = await outcome;
      const sent = await this.notifier.send(`Referee: ${b.rule}${b.symbol ? ` ${b.symbol}` : ''}`, `${stored.message} ${text}`.trim());
      if (sent.webhook || sent.desktop) {
        this.recordAction({ time: this.now(), kind: sent.webhook ? 'webhook' : 'notify', symbol: b.symbol, breachId: ref.id, detail: `${sent.desktop ? 'desktop' : ''}${sent.desktop && sent.webhook ? ' + ' : ''}${sent.webhook ? 'webhook' : ''}${sent.error ? ` (${sent.error})` : ''}`, ok: !sent.error });
      }
      this.broadcastSnapshot();
    } catch (err) {
      this.log.error(`handling breach ${b.rule}${b.symbol ? ` ${b.symbol}` : ''} failed`, err);
    }
  }

  /**
   * Close one symbol (or everything) at market through Alpaca's close-position endpoint, which can only reduce.
   * Debounced per trade, so duplicate breaches of one trade send one close while a new trade in the same symbol is
   * still enforced. A close that fails is retried from the tick loop with backoff (or after Alpaca's Retry-After),
   * because the symbol's stop has already been cancelled by then.
   */
  private async flatten(symbol: string | null, breach: BreachRef, rule: string, tradeKey: string | null = null, retry = false): Promise<string> {
    const client = this.client;
    if (!client) return 'Not connected to Alpaca.';
    const key = symbol === null ? '*' : (tradeKey ?? symbol);
    const now = this.now();
    for (const [k, t] of this.lastFlatten) if (now - t > 60000) this.lastFlatten.delete(k);
    if (!retry && now - (this.lastFlatten.get(key) ?? 0) < 10000) return `Already closing ${symbol ?? 'everything'}.`;
    this.lastFlatten.set(key, now);
    try {
      let detail: string;
      if (symbol === null) {
        // Mark first so an exit fill that arrives before the response is labelled; unmarked again below on failure.
        const open = this.engine.openPositions();
        for (const p of open) this.engine.markRefereeClosed(p.symbol);
        const results = await client.closeAllPositions(true);
        const failed = results.filter((r) => !r.ok);
        for (const f of failed) {
          this.engine.markRefereeClosed(f.symbol, false);
          const tk = open.find((p) => p.symbol === f.symbol)?.tradeKey ?? null;
          if (!this.flattenRetries.has(f.symbol)) this.flattenRetries.set(f.symbol, { symbol: f.symbol, tradeKey: tk, breach, rule, attempts: 1, nextAt: this.now() + 5000 });
          const msg = `Close of ${f.symbol} failed during close-all (${f.status}: ${f.message}). Its open orders may already be cancelled, so it may have no stop. Retrying in 5 s.`;
          this.recordAction({ time: this.now(), kind: 'error', symbol: f.symbol, breachId: breach.id, detail: msg, ok: false });
          this.log.error(msg);
          void this.notifier.send(`Referee: could not close ${f.symbol}`, msg);
        }
        const closed = results.filter((r) => r.ok).map((r) => r.symbol);
        detail = failed.length
          ? `Closed ${closed.length ? closed.join(', ') : 'nothing'} and cancelled open orders (${rule}); ${failed.map((f) => f.symbol).join(', ')} failed and will be retried.`
          : `Closed every position and cancelled open orders (${rule}).`;
        this.recordAction({ time: this.now(), kind: 'flatten_all', symbol: null, breachId: breach.id, detail, ok: failed.length === 0 });
      } else {
        this.engine.markRefereeClosed(symbol);
        const cancelled = await client.cancelOrdersFor(symbol);
        if (cancelled) this.recordAction({ time: this.now(), kind: 'cancel_orders', symbol, breachId: breach.id, detail: `Cancelled ${cancelled} open order(s) on ${symbol} before closing.`, ok: true });
        const order = await this.closeWithRetry(client, symbol);
        detail = order ? `Closed ${symbol} at market (${rule}${retry ? ', retry' : ''}); order ${order.id}.` : `${symbol} was already flat (${rule}).`;
        this.flattenRetries.delete(symbol);
        this.recordAction({ time: this.now(), kind: 'flatten', symbol, breachId: breach.id, detail, ok: true });
      }
      this.log.warn(detail);
      return detail;
    } catch (err) {
      this.lastFlatten.delete(key);
      let msg = `Flatten of ${symbol ?? 'everything'} failed: ${(err as Error).message}`;
      if (symbol !== null) {
        const attempts = (this.flattenRetries.get(symbol)?.attempts ?? 0) + 1;
        if (attempts <= MAX_FLATTEN_ATTEMPTS) {
          // Never sooner than Alpaca asked us to wait.
          const asked = err instanceof AlpacaError ? (err.retryAfterMs ?? 0) : 0;
          const wait = Math.min(120000, Math.max(Math.min(60000, 5000 * 2 ** (attempts - 1)), asked));
          this.flattenRetries.set(symbol, { symbol, tradeKey, breach, rule, attempts, nextAt: this.now() + wait });
          msg += ` Its open orders may already be cancelled, so it may have no stop. Retrying in ${Math.round(wait / 1000)} s (attempt ${attempts} of ${MAX_FLATTEN_ATTEMPTS}).`;
        } else {
          this.flattenRetries.delete(symbol);
          msg += ` Gave up after ${MAX_FLATTEN_ATTEMPTS} attempts. Close ${symbol} yourself and check its stop.`;
        }
        void this.notifier.send(`Referee: could not close ${symbol}`, msg);
      }
      this.recordAction({ time: this.now(), kind: 'error', symbol, breachId: breach.id, detail: msg, ok: false });
      this.log.error(msg);
      return msg;
    }
  }

  /**
   * Close at market, retrying the refusals that clear on their own: shares still held by a cancelling order (403),
   * rate limit, 5xx, network. Bounded: three retries, each waiting Alpaca's Retry-After when it gives one, up to
   * MAX_INLINE_RETRY_WAIT; a longer wait is left to the retry queue.
   */
  private async closeWithRetry(client: AlpacaClient, symbol: string): Promise<AlpacaOrder | null> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.closePosition(symbol);
      } catch (err) {
        if (err instanceof AlpacaError && err.status === 404) return null;
        const transient = !(err instanceof AlpacaError) || err.status === 0 || err.status === 403 || err.status === 429 || err.status >= 500;
        const asked = err instanceof AlpacaError ? err.retryAfterMs : null;
        if (!transient || attempt >= 3 || (asked !== null && asked > MAX_INLINE_RETRY_WAIT)) throw err;
        await this.sleep(asked ?? 500 * 2 ** attempt);
      }
    }
  }

  private async drainFlattenRetries(): Promise<void> {
    for (const r of [...this.flattenRetries.values()]) {
      if (r.nextAt > this.now()) continue;
      if (!this.engine.openPositions().some((p) => p.symbol === r.symbol)) {
        this.flattenRetries.delete(r.symbol);
        continue;
      }
      await this.flatten(r.symbol, r.breach, r.rule, r.tradeKey, true);
    }
  }

  // ---------------------------------------------------------------- events out

  onEvent(cb: (e: ServerEvent) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(e: ServerEvent): void {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch {
        // a dead SSE client
      }
    }
  }

  private broadcastSnapshot(): void {
    if (!this.listeners.size || !this.engine) return;
    this.emit({ type: 'snapshot', snapshot: this.engine.snapshot(this.now()), status: this.status() });
  }

  // ---------------------------------------------------------------- read API

  status(): StatusResponse {
    const cfg = this.config.get();
    return {
      version: VERSION,
      configured: cfg.alpaca !== null,
      mode: cfg.alpaca?.mode ?? 'paper',
      stream: this.streamStatus,
      streamDetail: this.streamDetail,
      enforcement: { ...cfg.enforcement },
      account: this.account,
      clock: this.clock,
      lastSync: this.lastSync,
      counts: { fills: this.store.countFills(), trades: this.engine.closedTrades().length, imports: this.store.countImports() },
      startedAt: this.startedAt,
      dataDir: this.config.dir,
    };
  }

  snapshot(): LiveSnapshot {
    return this.engine.snapshot(this.now());
  }

  private toDto(t: Trade, meta = this.store.tradeMeta(t.key)): TradeDto {
    return {
      key: t.key,
      symbol: t.symbol,
      direction: t.direction,
      entryTime: t.entryTime.getTime(),
      exitTime: t.exitTime ? t.exitTime.getTime() : null,
      entryPrice: t.entryPrice,
      exitPrice: t.exitPrice,
      qty: t.qty,
      pnl: t.pnl,
      returnPct: t.returnPct,
      fills: t.fills,
      source: t.source,
      tradeOfDay: meta?.tradeOfDay ?? null,
      declared: meta ? meta.declared : null,
      refereeClosed: meta?.refereeClosed ?? false,
    };
  }

  state(): StateResponse {
    const now = this.now();
    const today = marketClock(new Date(now)).date;
    const dayStart = now - 36 * 3600000;
    const metas = this.store.allTradeMeta();
    const todayTrades = this.engine
      .closedTrades()
      .filter((t) => marketClock(t.entryTime).date === today)
      .map((t) => this.toDto(t, metas.get(t.key) ?? null));
    return {
      status: this.status(),
      snapshot: this.engine.snapshot(now),
      rules: this.engine.getRules(),
      plan: this.store.plan(today),
      todayTrades,
      todayBreaches: this.store.breachesSince(dayStart).filter((b) => marketClock(new Date(b.time)).date === today),
      recentActions: this.store.recentActions(50),
    };
  }

  report(): ReportResponse {
    const trades = this.engine.closedTrades();
    const report = this.engine.report();
    return { report, trades: trades.length, firstDay: report?.summary.firstDay ?? null, lastDay: report?.summary.lastDay ?? null };
  }

  trades(days: number): TradeDto[] {
    const since = this.now() - days * 86400000;
    const metas = this.store.allTradeMeta();
    return this.engine
      .closedTrades()
      .filter((t) => t.entryTime.getTime() >= since)
      .map((t) => this.toDto(t, metas.get(t.key) ?? null));
  }

  breaches(days: number): (Breach & { id: number })[] {
    return this.store.breachesSince(this.now() - days * 86400000);
  }

  actions(limit: number): ActionLog[] {
    return this.store.recentActions(limit);
  }

  // ---------------------------------------------------------------- write API

  setRules(input: unknown): RuleSet {
    const parsed = RuleSetSchema.safeParse(input);
    if (!parsed.success) throw new HttpError(400, validationMessage(parsed.error));
    this.config.update({ rules: parsed.data });
    this.engine.setRules(parsed.data);
    this.log.info('rules updated');
    this.broadcastSnapshot();
    return parsed.data;
  }

  declare(req: DeclareRequest): Declaration {
    const symbol = req.symbol?.trim().toUpperCase() || null;
    if (symbol && !/^[A-Z.\-]{1,10}$/.test(symbol)) throw new HttpError(400, 'symbol must be letters, dots or dashes');
    if (req.qty !== null && req.qty !== undefined && !(req.qty > 0)) throw new HttpError(400, 'qty must be positive');
    if (req.stopPrice !== null && req.stopPrice !== undefined && !(req.stopPrice > 0)) throw new HttpError(400, 'stop price must be positive');
    const d = this.engine.declare({ time: this.now(), symbol, side: req.side ?? null, qty: req.qty ?? null, stopPrice: req.stopPrice ?? null, note: req.note?.slice(0, 500) ?? null });
    const stored = this.store.insertDeclaration(d);
    this.pendingDeclId = stored.id ?? null;
    this.emit({ type: 'declaration', declaration: stored });
    this.broadcastSnapshot();
    return stored;
  }

  cancelDeclaration(): void {
    this.engine.cancelDeclaration();
    this.pendingDeclId = null;
    this.emit({ type: 'declaration', declaration: null });
    this.broadcastSnapshot();
  }

  confirmPlan(note: string | null): DayPlan {
    const plan: DayPlan = { date: marketClock(new Date(this.now())).date, confirmedAt: this.now(), note: note?.slice(0, 1000) ?? null, rules: this.engine.getRules() };
    this.store.savePlan(plan);
    this.log.info(`day plan confirmed for ${plan.date}`);
    this.broadcastSnapshot();
    return plan;
  }

  setEnforcement(patch: { enabled?: boolean; dryRun?: boolean }): EnforcementState {
    const cur = this.config.get().enforcement;
    const next: EnforcementState = {
      enabled: patch.enabled ?? cur.enabled,
      dryRun: patch.dryRun ?? cur.dryRun,
      killedAt: patch.enabled === true ? null : cur.killedAt,
    };
    this.applyEnforcement(next);
    this.log.info(`enforcement ${next.enabled ? (next.dryRun ? 'on (dry run)' : 'ON, live') : 'off'}`);
    this.broadcastSnapshot();
    return next;
  }

  kill(): EnforcementState {
    const next: EnforcementState = { ...this.config.get().enforcement, enabled: false, killedAt: this.now() };
    this.applyEnforcement(next);
    this.log.warn('KILL SWITCH: enforcement off');
    this.recordAction({ time: this.now(), kind: 'error', symbol: null, breachId: null, detail: 'Kill switch pressed: enforcement off until turned back on.', ok: true });
    this.broadcastSnapshot();
    return next;
  }

  /** Takes effect in memory first, so a config file that cannot be written never leaves the switch where it was. */
  private applyEnforcement(next: EnforcementState): void {
    const { writeError } = this.config.updateInMemoryFirst({ enforcement: next });
    if (!writeError) return;
    const detail = `Enforcement is now ${next.enabled ? (next.dryRun ? 'on (dry run)' : 'on, live') : 'off'} for this session, but saving config.json failed (${writeError.message}). After a restart the old setting comes back.`;
    this.log.error(detail);
    this.recordAction({ time: this.now(), kind: 'error', symbol: null, breachId: null, detail, ok: false });
    void this.notifier.send('Referee: could not save the enforcement setting', detail);
  }

  async manualFlatten(symbol: string | null): Promise<{ ok: boolean; detail: string }> {
    if (!this.client) throw new HttpError(409, 'Not connected to Alpaca.');
    const sym = symbol?.trim().toUpperCase() || null;
    this.recordAction({ time: this.now(), kind: 'manual_flatten', symbol: sym, breachId: null, detail: `Manual flatten requested for ${sym ?? 'everything'}.`, ok: true });
    const detail = await this.flatten(sym, { id: null }, 'manual', null, true);
    return { ok: !/failed/i.test(detail), detail };
  }

  settingsView(): SettingsView {
    const cfg = this.config.get();
    return {
      alpaca: { configured: cfg.alpaca !== null, mode: cfg.alpaca?.mode ?? 'paper', keyIdPreview: cfg.alpaca ? `${cfg.alpaca.keyId.slice(0, 4)}…${cfg.alpaca.keyId.slice(-4)}` : null },
      feed: cfg.feed,
      port: cfg.port,
      webhook: { configured: cfg.webhookUrl !== null, kind: cfg.webhookUrl ? webhookKind(cfg.webhookUrl) : null },
      notifications: { ...cfg.notifications },
      declarationWindowMinutes: cfg.declarationWindowMinutes,
      stopPct: cfg.stopPct,
      importTimeZone: cfg.importTimeZone,
    };
  }

  async updateSettings(input: SettingsUpdate): Promise<SettingsView> {
    const cfg = this.config.get();
    const patch: Partial<Config> = {};
    if (input.alpaca !== undefined) {
      const parsed = AlpacaCredsSchema.safeParse({ ...input.alpaca, keyId: input.alpaca.keyId.trim(), secretKey: input.alpaca.secretKey.trim() });
      if (!parsed.success) throw new HttpError(400, validationMessage(parsed.error));
      patch.alpaca = parsed.data;
    }
    if (input.feed !== undefined) patch.feed = input.feed;
    if (input.webhookUrl !== undefined) patch.webhookUrl = input.webhookUrl?.trim() ? input.webhookUrl.trim() : null;
    if (input.notifications) patch.notifications = { ...cfg.notifications, ...input.notifications };
    if (input.declarationWindowMinutes !== undefined) patch.declarationWindowMinutes = input.declarationWindowMinutes;
    if (input.stopPct !== undefined) patch.stopPct = input.stopPct;
    if (input.importTimeZone !== undefined) {
      if (!isValidTimeZone(input.importTimeZone)) throw new HttpError(400, 'unknown time zone');
      patch.importTimeZone = input.importTimeZone;
    }
    let next: Config;
    try {
      next = this.config.update(patch);
    } catch (err) {
      throw new HttpError(400, validationMessage(err));
    }
    this.notifier.configure({ webhookUrl: next.webhookUrl, desktop: next.notifications.desktop });
    const credsChanged = JSON.stringify(cfg.alpaca) !== JSON.stringify(next.alpaca);
    const modeChanged = (cfg.alpaca?.mode ?? 'paper') !== (next.alpaca?.mode ?? 'paper');
    if (modeChanged) {
      // A different account: switch data files and rebuild.
      this.store.close();
      const file = this.deps.dbFile ? this.deps.dbFile(next.alpaca!.mode) : join(this.config.dir, `referee-${next.alpaca!.mode}.sqlite`);
      this.store = new Store(file);
      this.rebuildEngine();
    } else if (input.declarationWindowMinutes !== undefined || input.stopPct !== undefined) {
      this.rebuildEngine();
    }
    if (credsChanged && next.alpaca) {
      this.everLive = false;
      await this.connect(next.alpaca);
    }
    this.broadcastSnapshot();
    return this.settingsView();
  }

  async testConnection(creds?: SettingsUpdate['alpaca']): Promise<{ ok: boolean; detail: string; account?: { equity: number; status: string; mode: string } }> {
    const c = creds ? AlpacaCredsSchema.safeParse({ ...creds, keyId: creds.keyId.trim(), secretKey: creds.secretKey.trim() }) : null;
    if (c && !c.success) return { ok: false, detail: validationMessage(c.error) };
    const use = c ? c.data : this.config.get().alpaca;
    if (!use) return { ok: false, detail: 'No Alpaca keys.' };
    const client = this.deps.clientFactory ? this.deps.clientFactory(use) : new AlpacaClient(use, { fetchImpl: this.deps.fetchImpl, retries: 0 });
    try {
      const a = await client.getAccount();
      return { ok: true, detail: `Connected to ${use.mode} account ${a.account_number} (${a.status}).`, account: { equity: Number(a.equity), status: a.status, mode: use.mode } };
    } catch (err) {
      return { ok: false, detail: err instanceof AlpacaError && (err.status === 401 || err.status === 403) ? 'Alpaca rejected the keys (401/403). Check key id, secret, and paper vs live.' : (err as Error).message };
    }
  }

  importCsv(req: ImportRequest): ImportResponse {
    if (typeof req.text !== 'string' || !req.text.trim()) throw new HttpError(400, 'empty file');
    if (req.text.length > 20_000_000) throw new HttpError(413, 'file too large');
    const tz = req.timeZone && isValidTimeZone(req.timeZone) ? req.timeZone : this.config.get().importTimeZone;
    const res = parseFile(req.text, { timeZone: tz, fileName: (req.fileName || 'import.csv').slice(0, 200) });
    const trades = combineTrades([res.trades]).map((t) => ({ ...t, source: `import:${req.fileName || 'import.csv'}` }));
    if (res.format === 'unknown') throw new HttpError(400, res.warnings[0] ?? 'unrecognized format');
    const { imported, duplicates } = this.store.addImport(req.fileName || 'import.csv', res.format, tz, trades);
    this.engine.seed(trades, this.now());
    this.log.info(`imported ${imported} trade(s) from ${req.fileName} (${duplicates} duplicates)`);
    this.broadcastSnapshot();
    return { format: res.format, imported, duplicates, warnings: res.warnings };
  }

  strategy(): StrategyDefinition {
    return this.config.get().strategy;
  }

  setStrategy(input: unknown): StrategyDefinition {
    const parsed = StrategySchema.safeParse(input);
    if (!parsed.success) throw new HttpError(400, validationMessage(parsed.error));
    if (parsed.data.emaFast >= parsed.data.emaSlow) throw new HttpError(400, 'emaFast must be smaller than emaSlow');
    this.config.update({ strategy: parsed.data });
    return parsed.data;
  }

  async setupCheck(symbolIn: string, side: 'long' | 'short'): Promise<SetupCheckResponse> {
    const symbol = (symbolIn ?? '').trim().toUpperCase();
    if (!/^[A-Z.\-]{1,10}$/.test(symbol)) throw new HttpError(400, 'symbol must be letters, dots or dashes');
    if (side !== 'long' && side !== 'short') throw new HttpError(400, 'side must be long or short');
    const client = this.client;
    if (!client) throw new HttpError(409, 'Not connected to Alpaca.');
    const cfg = this.config.get();
    const def = cfg.strategy;
    const now = this.now();
    const warnings: string[] = [];
    const [intraday, daily, snaps] = await Promise.all([
      client.getBars(symbol, def.timeframe, { start: new Date(now - 10 * 86400000).toISOString(), end: new Date(now).toISOString(), limit: 5000, feed: cfg.feed }),
      client.getBars(symbol, '1Day', { start: new Date(now - 45 * 86400000).toISOString(), end: new Date(now - 86400000).toISOString(), limit: 40, feed: cfg.feed }),
      client.getSnapshots([symbol], cfg.feed).catch((err): Record<string, AlpacaSnapshot> => {
        warnings.push(`snapshot: ${(err as Error).message}`);
        return {};
      }),
    ]);
    const snap = snaps[symbol];
    const price = snap?.latestTrade?.p ?? snap?.minuteBar?.c ?? null;
    const prevClose = snap?.prevDailyBar?.c ?? (daily.length ? daily[daily.length - 1].c : null);
    const today = marketClock(new Date(now)).date;
    const dailyPrev = daily.filter((b) => marketClock(new Date(b.t)).date !== today);
    const clock = marketClock(new Date(now));
    const result = checkSetup(def, { symbol, side, price, prevClose, intraday, daily: dailyPrev, nowNY: { date: clock.date, minutes: clock.minutes } });
    return { symbol, side, asOf: now, price, lines: result.lines, score: result.score, nextTrade: this.engine.nextTrade(now), warnings: [...warnings, ...result.warnings] };
  }
}
