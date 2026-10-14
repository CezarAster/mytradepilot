import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TradeStream, type StreamStatus } from '../src/alpaca/stream.ts';

// A WebSocket stand-in that authorizes and starts listening like Alpaca, then stays silent.
class FakeWS {
  static all: FakeWS[] = [];
  binaryType = 'arraybuffer';
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  constructor(_url: string) {
    FakeWS.all.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  emit(msg: unknown): void {
    if (!this.closed) this.onmessage?.({ data: JSON.stringify(msg) });
  }
  send(raw: string): void {
    const m = JSON.parse(raw);
    if (m.action === 'auth') setTimeout(() => this.emit({ stream: 'authorization', data: { status: 'authorized' } }), 0);
    if (m.action === 'listen') setTimeout(() => this.emit({ stream: 'listening', data: { streams: ['trade_updates'] } }), 0);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    setTimeout(() => this.onclose?.({ code: 1000, reason: '' }), 0);
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('fix: a stream that goes silent reconnects; one that keeps talking does not', async () => {
  FakeWS.all = [];
  let lives = 0;
  const statuses: StreamStatus[] = [];
  const s = new TradeStream(
    { keyId: 'K', secretKey: 'S', mode: 'paper' },
    { onUpdate: () => undefined, onStatus: (st) => statuses.push(st), onLive: () => lives++ },
    { WebSocketImpl: FakeWS as unknown as typeof WebSocket, idleTimeoutMs: 80, minBackoffMs: 5 },
  );
  s.start();
  await wait(40);
  assert.equal(lives, 1);
  assert.equal(s.getStatus(), 'live');

  // Keep it busy for longer than the idle timeout: no reconnect.
  for (let i = 0; i < 6; i++) {
    await wait(30);
    FakeWS.all[FakeWS.all.length - 1].emit({ stream: 'trade_updates', data: { event: 'noop' } });
  }
  assert.equal(FakeWS.all.length, 1, 'messages keep it alive');

  // Then silence: it drops the socket and connects again, and the owner hears onLive (and backfills).
  await wait(200);
  assert.ok(FakeWS.all.length >= 2, `reconnected (${FakeWS.all.length} sockets)`);
  assert.ok(FakeWS.all[0].closed);
  assert.ok(lives >= 2);
  assert.ok(statuses.includes('reconnecting'));

  s.stop();
  const n = FakeWS.all.length;
  await wait(200);
  assert.equal(FakeWS.all.length, n, 'no reconnect after stop');
});
