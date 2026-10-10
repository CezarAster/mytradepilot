// Pure indicator math for the setup checker. No I/O and no clocks: callers pass bars and "now".
import type { AlpacaBar } from '../alpaca/types.ts';
import { marketClock } from '../core/time.ts';

/** Regular session bounds, minutes since New York midnight. */
export const SESSION_OPEN_MINUTES = 9 * 60 + 30;
export const SESSION_CLOSE_MINUTES = 16 * 60;

/** The New York trading date (YYYY-MM-DD) a bar belongs to. */
export function barDate(bar: AlpacaBar): string {
  return marketClock(new Date(bar.t)).date;
}

/**
 * Exponential moving average. The first output is the first input (the seed); after that
 * each value is prev + k * (price - prev) with k = 2 / (period + 1).
 * Same length as the input. Every entry is NaN when the period is not at least 1.
 */
export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (!(period >= 1) || values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;
  for (let i = 1; i < values.length; i++) {
    prev = prev + k * (values[i] - prev);
    out[i] = prev;
  }
  return out;
}

/** Simple moving average. NaN until a full window of `period` values is available. */
export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (!(period >= 1)) return out;
  const n = Math.floor(period);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/**
 * Session VWAP: cumulative sum(typical price x volume) / sum(volume), with typical price
 * (high + low + close) / 3. Resets whenever the New York trading date changes, so one array
 * can span several days. NaN while a session has no volume yet.
 */
export function sessionVwap(bars: AlpacaBar[]): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  let date = '';
  let pv = 0;
  let vol = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const d = barDate(bar);
    if (d !== date) {
      date = d;
      pv = 0;
      vol = 0;
    }
    pv += ((bar.h + bar.l + bar.c) / 3) * bar.v;
    vol += bar.v;
    out[i] = vol > 0 ? pv / vol : NaN;
  }
  return out;
}

/**
 * Average true range with Wilder's smoothing. The first value, at index period - 1, is the plain
 * average of the first `period` true ranges; after that atr = (prev x (period - 1) + tr) / period.
 * NaN before the first value. The first bar's true range is high minus low (no previous close).
 */
export function atr(bars: AlpacaBar[], period: number): number[] {
  const out = new Array<number>(bars.length).fill(NaN);
  if (!(period >= 1)) return out;
  const n = Math.floor(period);
  let sum = 0;
  let prev = NaN;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    const tr =
      i === 0
        ? b.h - b.l
        : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1].c), Math.abs(b.l - bars[i - 1].c));
    if (i < n) {
      sum += tr;
      if (i === n - 1) {
        prev = sum / n;
        out[i] = prev;
      }
    } else {
      prev = (prev * (n - 1) + tr) / n;
      out[i] = prev;
    }
  }
  return out;
}

/**
 * Today's volume so far against what a normal day would have done by now:
 * cumulative volume of `todayBars` / (20-day average daily volume x fraction of the regular
 * session elapsed at `nowMinutesNY`). The fraction is clamped to 0.05..1 so the opening minutes
 * do not divide by nearly nothing and after-hours reads as a full day.
 * `dailyBars` are previous full days (today excluded); only the last 20 are used.
 * Null with fewer than 5 daily bars or no daily volume.
 */
export function relativeVolume(todayBars: AlpacaBar[], dailyBars: AlpacaBar[], nowMinutesNY: number): number | null {
  if (dailyBars.length < 5) return null;
  const recent = dailyBars.slice(-20);
  const avg = recent.reduce((s, b) => s + b.v, 0) / recent.length;
  if (!(avg > 0)) return null;
  const elapsed = (nowMinutesNY - SESSION_OPEN_MINUTES) / (SESSION_CLOSE_MINUTES - SESSION_OPEN_MINUTES);
  const fraction = Math.min(1, Math.max(0.05, elapsed));
  const today = todayBars.reduce((s, b) => s + b.v, 0);
  return today / (avg * fraction);
}

/** Percent change from the previous close (+4.2 means up 4.2%). Null without a usable previous close. */
export function dayChangePct(price: number, prevClose: number): number | null {
  if (!Number.isFinite(price) || !(prevClose > 0)) return null;
  return ((price - prevClose) / prevClose) * 100;
}
