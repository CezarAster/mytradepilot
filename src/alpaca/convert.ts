// Alpaca JSON -> engine types. Kept separate so it can be unit-tested against recorded payloads.
import type { Fill, OrderSnapshot, OrderType } from '../engine/types.ts';
import type { AlpacaFillActivity, AlpacaOrder, AlpacaTradeUpdate } from './types.ts';

const num = (s: string | null | undefined): number | null => {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function orderType(t: string): OrderType {
  return t === 'market' || t === 'limit' || t === 'stop' || t === 'stop_limit' || t === 'trailing_stop' ? t : 'other';
}

/** Stable key for one execution: the same fill seen on the stream and in the activities backfill matches. */
export function fillKey(orderId: string, cumQty: number): string {
  return `${orderId}|${cumQty}`;
}

export function fillFromActivity(a: AlpacaFillActivity): Fill | null {
  const qty = num(a.qty);
  const price = num(a.price);
  const cum = num(a.cum_qty);
  const time = Date.parse(a.transaction_time);
  if (qty === null || price === null || cum === null || !Number.isFinite(time) || qty <= 0) return null;
  return {
    key: fillKey(a.order_id, cum),
    orderId: a.order_id,
    symbol: a.symbol.toUpperCase(),
    side: a.side === 'buy' ? 'buy' : 'sell',
    qty,
    price,
    time,
    fee: 0,
    source: 'alpaca',
  };
}

/** A fill or partial_fill stream event. Returns null for other events. */
export function fillFromUpdate(u: AlpacaTradeUpdate): Fill | null {
  if (u.event !== 'fill' && u.event !== 'partial_fill') return null;
  const qty = num(u.qty);
  const price = num(u.price);
  const cum = num(u.order?.filled_qty);
  const time = Date.parse(u.timestamp ?? u.order?.filled_at ?? '');
  if (qty === null || price === null || cum === null || !Number.isFinite(time) || qty <= 0) return null;
  return {
    key: fillKey(u.order.id, cum),
    orderId: u.order.id,
    symbol: u.order.symbol.toUpperCase(),
    side: u.order.side === 'buy' ? 'buy' : 'sell',
    qty,
    price,
    time,
    fee: 0,
    source: 'alpaca',
  };
}

export function orderSnapshot(o: AlpacaOrder, at?: number): OrderSnapshot {
  const updated = at ?? Date.parse(o.updated_at ?? o.submitted_at ?? o.created_at);
  // Trailing stops report their live trigger in stop_price (hwm is the high-water mark).
  return {
    id: o.id,
    symbol: o.symbol.toUpperCase(),
    side: o.side,
    type: orderType(o.type ?? o.order_type),
    status: o.status,
    qty: num(o.qty) ?? num(o.filled_qty) ?? 0,
    stopPrice: num(o.stop_price),
    limitPrice: num(o.limit_price),
    updatedAt: Number.isFinite(updated) ? updated : Date.now(),
    parentId: o.replaces ?? null,
  };
}

/** An order and all its legs (bracket stop/target), flattened. */
export function orderSnapshots(o: AlpacaOrder, at?: number): OrderSnapshot[] {
  const out = [orderSnapshot(o, at)];
  for (const leg of o.legs ?? []) out.push({ ...orderSnapshot(leg, at), parentId: o.id });
  return out;
}
