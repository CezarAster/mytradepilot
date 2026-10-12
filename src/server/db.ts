// SQLite persistence. Fills are the source of truth; trades, positions and today's counters are rebuilt from
// them by the engine on every start, so a crash can never leave the referee with a wrong idea of the day.
import Database from 'better-sqlite3';
import type { Trade } from '../core/types.ts';
import type { Breach, Declaration, Fill, OrderSnapshot, RuleSet } from '../engine/types.ts';
import type { ActionLog, DayPlan } from './api.ts';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS fills (
  key TEXT PRIMARY KEY, order_id TEXT NOT NULL, symbol TEXT NOT NULL, side TEXT NOT NULL,
  qty REAL NOT NULL, price REAL NOT NULL, time INTEGER NOT NULL, fee REAL NOT NULL DEFAULT 0,
  source TEXT NOT NULL, inserted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS fills_time ON fills(time);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY, symbol TEXT NOT NULL, side TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
  qty REAL NOT NULL, stop_price REAL, limit_price REAL, updated_at INTEGER NOT NULL, parent_id TEXT
);
CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, file_name TEXT NOT NULL, format TEXT NOT NULL, time_zone TEXT NOT NULL,
  imported_at INTEGER NOT NULL, trades INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS import_trades (key TEXT PRIMARY KEY, import_id INTEGER NOT NULL, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS breaches (
  id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, rule TEXT NOT NULL, symbol TEXT, trade_key TEXT,
  message TEXT NOT NULL, action TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS breaches_time ON breaches(time);
CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, kind TEXT NOT NULL, symbol TEXT, breach_id INTEGER,
  detail TEXT NOT NULL, ok INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS actions_time ON actions(time);
CREATE TABLE IF NOT EXISTS declarations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, time INTEGER NOT NULL, symbol TEXT, side TEXT, qty REAL, stop_price REAL,
  note TEXT, consumed_by TEXT
);
CREATE TABLE IF NOT EXISTS plans (date TEXT PRIMARY KEY, confirmed_at INTEGER NOT NULL, note TEXT, rules TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trade_meta (
  trade_key TEXT PRIMARY KEY, trade_of_day INTEGER, declared INTEGER NOT NULL DEFAULT 0, referee_closed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

interface FillRow {
  key: string;
  order_id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  time: number;
  fee: number;
  source: 'alpaca' | 'import';
}

export interface TradeMeta {
  tradeOfDay: number | null;
  declared: boolean;
  refereeClosed: boolean;
}

export function serializeTrade(t: Trade): string {
  return JSON.stringify({ ...t, entryTime: t.entryTime.getTime(), exitTime: t.exitTime ? t.exitTime.getTime() : null });
}

export function deserializeTrade(json: string): Trade {
  const o = JSON.parse(json);
  return { ...o, entryTime: new Date(o.entryTime), exitTime: o.exitTime === null ? null : new Date(o.exitTime) };
}

export class Store {
  readonly db: Database.Database;

  constructor(file: string) {
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA);
  }

  close(): void {
    this.db.close();
  }

  // ---- fills ----

  /** Returns true when the fill was new. */
  insertFill(f: Fill): boolean {
    const r = this.db
      .prepare('INSERT OR IGNORE INTO fills (key, order_id, symbol, side, qty, price, time, fee, source, inserted_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(f.key, f.orderId, f.symbol, f.side, f.qty, f.price, f.time, f.fee, f.source, Date.now());
    return r.changes > 0;
  }

  hasFill(key: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM fills WHERE key = ?').get(key);
  }

  allFills(): Fill[] {
    return (this.db.prepare('SELECT * FROM fills ORDER BY time ASC, rowid ASC').all() as FillRow[]).map(rowToFill);
  }

  fillsSince(time: number): Fill[] {
    return (this.db.prepare('SELECT * FROM fills WHERE time >= ? ORDER BY time ASC, rowid ASC').all(time) as FillRow[]).map(rowToFill);
  }

  lastFillTime(): number | null {
    const r = this.db.prepare('SELECT MAX(time) t FROM fills').get() as { t: number | null };
    return r.t;
  }

  countFills(): number {
    return (this.db.prepare('SELECT COUNT(*) n FROM fills').get() as { n: number }).n;
  }

  // ---- orders (latest snapshot of each, for restart reconciliation) ----

  upsertOrder(o: OrderSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO orders (id, symbol, side, type, status, qty, stop_price, limit_price, updated_at, parent_id) VALUES (?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET status=excluded.status, qty=excluded.qty, stop_price=excluded.stop_price, limit_price=excluded.limit_price, updated_at=excluded.updated_at`,
      )
      .run(o.id, o.symbol, o.side, o.type, o.status, o.qty, o.stopPrice, o.limitPrice, o.updatedAt, o.parentId);
  }

  /** Orders last seen in a working status, oldest update first: replayed so a rebuild keeps open positions' stops. */
  workingOrders(statuses: string[]): OrderSnapshot[] {
    const marks = statuses.map(() => '?').join(',');
    return this.db
      .prepare(`SELECT id, symbol, side, type, status, qty, stop_price AS stopPrice, limit_price AS limitPrice, updated_at AS updatedAt, parent_id AS parentId FROM orders WHERE status IN (${marks}) ORDER BY updated_at ASC`)
      .all(...statuses) as OrderSnapshot[];
  }

  // ---- imports ----

  addImport(fileName: string, format: string, timeZone: string, trades: Trade[]): { imported: number; duplicates: number } {
    const tx = this.db.transaction(() => {
      const r = this.db.prepare('INSERT INTO imports (file_name, format, time_zone, imported_at, trades) VALUES (?,?,?,?,?)').run(fileName, format, timeZone, Date.now(), trades.length);
      const ins = this.db.prepare('INSERT OR IGNORE INTO import_trades (key, import_id, json) VALUES (?,?,?)');
      let imported = 0;
      for (const t of trades) imported += ins.run(t.key, r.lastInsertRowid, serializeTrade(t)).changes;
      return { imported, duplicates: trades.length - imported };
    });
    return tx();
  }

  importedTrades(): Trade[] {
    return (this.db.prepare('SELECT json FROM import_trades').all() as { json: string }[]).map((r) => deserializeTrade(r.json));
  }

  countImports(): number {
    return (this.db.prepare('SELECT COUNT(*) n FROM imports').get() as { n: number }).n;
  }

  // ---- breaches and actions ----

  insertBreach(b: Breach): number {
    const r = this.db.prepare('INSERT INTO breaches (time, rule, symbol, trade_key, message, action) VALUES (?,?,?,?,?,?)').run(b.time, b.rule, b.symbol, b.tradeKey, b.message, b.action);
    return Number(r.lastInsertRowid);
  }

  breachesSince(time: number): (Breach & { id: number })[] {
    return (this.db.prepare('SELECT id, time, rule, symbol, trade_key AS tradeKey, message, action FROM breaches WHERE time >= ? ORDER BY time DESC').all(time) as (Breach & { id: number })[]);
  }

  insertAction(a: Omit<ActionLog, 'id'>): ActionLog {
    const r = this.db.prepare('INSERT INTO actions (time, kind, symbol, breach_id, detail, ok) VALUES (?,?,?,?,?,?)').run(a.time, a.kind, a.symbol, a.breachId, a.detail, a.ok ? 1 : 0);
    return { ...a, id: Number(r.lastInsertRowid) };
  }

  recentActions(limit = 100): ActionLog[] {
    return (this.db.prepare('SELECT id, time, kind, symbol, breach_id AS breachId, detail, ok FROM actions ORDER BY time DESC, id DESC LIMIT ?').all(limit) as (Omit<ActionLog, 'ok'> & { ok: number })[]).map((r) => ({ ...r, ok: !!r.ok }));
  }

  // ---- declarations and plans ----

  insertDeclaration(d: Declaration): Declaration {
    const r = this.db.prepare('INSERT INTO declarations (time, symbol, side, qty, stop_price, note, consumed_by) VALUES (?,?,?,?,?,?,?)').run(d.time, d.symbol, d.side, d.qty, d.stopPrice, d.note, d.consumedBy);
    return { ...d, id: Number(r.lastInsertRowid) };
  }

  consumeDeclaration(id: number, tradeKey: string): void {
    this.db.prepare('UPDATE declarations SET consumed_by = ? WHERE id = ?').run(tradeKey, id);
  }

  savePlan(p: DayPlan): void {
    this.db.prepare('INSERT OR REPLACE INTO plans (date, confirmed_at, note, rules) VALUES (?,?,?,?)').run(p.date, p.confirmedAt, p.note, JSON.stringify(p.rules));
  }

  plan(date: string): DayPlan | null {
    const r = this.db.prepare('SELECT date, confirmed_at AS confirmedAt, note, rules FROM plans WHERE date = ?').get(date) as { date: string; confirmedAt: number; note: string | null; rules: string } | undefined;
    return r ? { date: r.date, confirmedAt: r.confirmedAt, note: r.note, rules: JSON.parse(r.rules) as RuleSet } : null;
  }

  // ---- trade annotations ----

  setTradeMeta(tradeKey: string, m: Partial<TradeMeta>): void {
    const cur = this.tradeMeta(tradeKey) ?? { tradeOfDay: null, declared: false, refereeClosed: false };
    const next = { ...cur, ...m };
    this.db.prepare('INSERT OR REPLACE INTO trade_meta (trade_key, trade_of_day, declared, referee_closed) VALUES (?,?,?,?)').run(tradeKey, next.tradeOfDay, next.declared ? 1 : 0, next.refereeClosed ? 1 : 0);
  }

  tradeMeta(tradeKey: string): TradeMeta | null {
    const r = this.db.prepare('SELECT trade_of_day AS tradeOfDay, declared, referee_closed AS refereeClosed FROM trade_meta WHERE trade_key = ?').get(tradeKey) as { tradeOfDay: number | null; declared: number; refereeClosed: number } | undefined;
    return r ? { tradeOfDay: r.tradeOfDay, declared: !!r.declared, refereeClosed: !!r.refereeClosed } : null;
  }

  allTradeMeta(): Map<string, TradeMeta> {
    const out = new Map<string, TradeMeta>();
    for (const r of this.db.prepare('SELECT trade_key AS k, trade_of_day AS tradeOfDay, declared, referee_closed AS refereeClosed FROM trade_meta').all() as { k: string; tradeOfDay: number | null; declared: number; refereeClosed: number }[]) {
      out.set(r.k, { tradeOfDay: r.tradeOfDay, declared: !!r.declared, refereeClosed: !!r.refereeClosed });
    }
    return out;
  }

  // ---- key/value ----

  getKv(key: string): string | null {
    const r = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return r ? r.value : null;
  }

  setKv(key: string, value: string): void {
    this.db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)').run(key, value);
  }
}

function rowToFill(r: FillRow): Fill {
  return { key: r.key, orderId: r.order_id, symbol: r.symbol, side: r.side, qty: r.qty, price: r.price, time: r.time, fee: r.fee, source: r.source };
}
