// The Alpaca client's rate-limit handling and the stream's heartbeat (review findings 11 and 6).
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { AlpacaClient, retryAfterMs } from '../src/alpaca/client.ts';
import { TradeStream, type StreamStatus } from '../src/alpaca/stream.ts';
import { AlpacaError } from '../src/alpaca/types.ts';
import { CREDS, FakeAlpaca } from './helpers/fake-alpaca.ts';

let fake: FakeAlpaca;
before(async () => {
  fake = new FakeAlpaca();
  await fake.start();
});
after(() => fake.stop());

test('fix 11: Retry-After in seconds or as a date, and the rate-limit reset when the window is used up', () => {
  assert.equal(retryAfterMs(new Headers({ 'retry-after': '3' })), 3000);
  const date = 'Mon, 12 Oct 2026 15:00:05 GMT';
  assert.equal(retryAfterMs(new Headers({ 'retry-after': date }), Date.parse(date) - 5000), 5000);
  assert.equal(retryAfterMs(new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '10' }), 4000), 6000);
  assert.equal(retryAfterMs(new Headers({ 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': '10' }), 4000), null);
  assert.equal(retryAfterMs(new Headers()), null);
});

test('fix 11 (review): a malformed or past value says nothing, and does not hide a valid rate-limit reset', () => {
  for (const bad of ['-1', '.5', '5, 10', 'soon']) assert.equal(retryAfterMs(new Headers({ 'retry-after': bad }), 4000), null, bad);
  const date = 'Mon, 12 Oct 2026 15:00:05 GMT';
  assert.equal(retryAfterMs(new Headers({ 'retry-after': date }), Date.parse(date) + 1000), null, 'a date in the past');
  assert.equal(retryAfterMs(new Headers({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '3' }), 4000), null, 'a reset our clock has passed');
  assert.equal(retryAfterMs(new Headers({ 'retry-after': '-1', 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '34' }), 4000), 30000);
});

test('fix 11: a GET refused with 429 waits Retry-After and retries; a wait longer than the cap fails at once and says how long', async () => {
  const sleeps: number[] = [];
  const client = new AlpacaClient(CREDS, { tradingHost: `http://127.0.0.1:${fake.port}`, retries: 2, sleep: async (ms) => void sleeps.push(ms) });
  fake.rateLimit = { method: 'GET', path: '/v2/account', seconds: 2, times: 1 };
  assert.equal((await client.getAccount()).id, 'acct-1');
  assert.deepEqual(sleeps, [2000]);

  sleeps.length = 0;
  fake.calls = [];
  fake.rateLimit = { method: 'GET', path: '/v2/account', seconds: 30, times: 1 };
  await assert.rejects(client.getAccount(), (err: unknown) => err instanceof AlpacaError && err.status === 429 && err.retryAfterMs === 30000);
  assert.deepEqual(sleeps, [], 'no in-place wait');
  assert.equal(fake.calls.length, 1, 'no retry');
});

test('fix 11 (review): a 429 whose asked wait has already passed still backs off', async () => {
  const sleeps: number[] = [];
  const client = new AlpacaClient(CREDS, { tradingHost: `http://127.0.0.1:${fake.port}`, retries: 2, sleep: async (ms) => void sleeps.push(ms) });
  fake.rateLimit = { method: 'GET', path: '/v2/account', seconds: -2, times: 2, style: 'reset' }; // our clock is ahead of Alpaca's
  assert.equal((await client.getAccount()).id, 'acct-1');
  assert.deepEqual(sleeps, [1000, 2000]);
});

/** A WebSocket stand-in that answers auth and listen like Alpaca, until told to go quiet. */
class FakeSocket {
  static all: FakeSocket[] = [];
  binaryType = '';
  quiet = false;
  sent: { action: string }[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
    FakeSocket.all.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  send(text: string): void {
    const m = JSON.parse(text);
    this.sent.push(m);
    if (this.quiet) return;
    const reply = (msg: unknown) => setTimeout(() => this.onmessage?.({ data: JSON.stringify(msg) }), 0);
    if (m.action === 'auth') reply({ stream: 'authorization', data: { status: 'authorized', action: 'authenticate' } });
    if (m.action === 'listen') reply({ stream: 'listening', data: { streams: ['trade_updates'] } });
  }
  close(): void {
    this.closed = true;
  }
}

async function waitFor(what: string, ok: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!ok()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

test('fix 6: the stream heartbeats while live, and reconnects when the socket goes quiet without closing', async () => {
  FakeSocket.all = [];
  const statuses: StreamStatus[] = [];
  let lives = 0;
  // An idle timeout far above the heartbeat, so a slow machine never drops a socket that is answering.
  const stream = new TradeStream(CREDS, { onUpdate: () => undefined, onStatus: (s) => void statuses.push(s), onLive: () => void lives++ }, { WebSocketImpl: FakeSocket as unknown as typeof WebSocket, heartbeatMs: 20, idleTimeoutMs: 600, minBackoffMs: 5, maxBackoffMs: 10 });
  stream.start();
  await waitFor('live', () => stream.getStatus() === 'live');
  const first = FakeSocket.all[0];
  // Well past the idle timeout with answers flowing: an answered heartbeat must keep the socket alive.
  const liveAt = Date.now();
  await waitFor('two idle timeouts of heartbeats', () => Date.now() - liveAt >= 1300 && first.sent.filter((m) => m.action === 'listen').length >= 10);
  assert.equal(lives, 1, 'a heartbeat answer is not a reconnect');
  assert.equal(FakeSocket.all.length, 1, 'an answering socket is kept');

  first.quiet = true; // the connection dies silently: no close event, no messages
  await waitFor('a reconnect', () => FakeSocket.all.length >= 2 && stream.getStatus() === 'live');
  assert.ok(first.closed, 'the quiet socket is dropped');
  assert.ok(statuses.includes('reconnecting'));
  assert.equal(lives, 2, 'the new connection syncs');
  stream.stop();
});
