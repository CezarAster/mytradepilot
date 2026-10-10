// Runs the Referee against the fake Alpaca with a scripted trading day, serving the built UI, so the
// browser pages can be checked with real-looking data: positions, breaches, a flatten, a lock, a declaration.
// Usage: PORT=4312 node test/helpers/ui-scenario.ts   (prints READY when listening; Ctrl-C to stop)
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AlpacaClient } from '../../src/alpaca/client.ts';
import type { TradeStream } from '../../src/alpaca/stream.ts';
import { ConfigStore } from '../../src/server/config.ts';
import { RefereeHttp } from '../../src/server/http.ts';
import { Logger } from '../../src/server/log.ts';
import { Referee } from '../../src/server/referee.ts';
import { CREDS, FakeAlpaca, FakeStream, activity, fillUpdate, order, position } from './fake-alpaca.ts';

const PORT = Number(process.env.PORT ?? 4312);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fake = new FakeAlpaca();
await fake.start();
const dir = mkdtempSync(join(tmpdir(), 'ui-scenario-'));
const config = new ConfigStore(dir);
const base = config.get();
config.update({
  alpaca: CREDS,
  enforcement: { enabled: true, dryRun: false, killedAt: null },
  rules: { ...base.rules, sessionWindow: { ...base.rules.sessionWindow, enabled: false }, stopRequired: { enabled: true, withinSeconds: 30, action: 'flatten' }, maxTradesPerDay: { enabled: true, count: 2, action: 'flatten' } },
});
const now = Date.now();
const min = 60000;
// Last week: two closed trades, so the record has something to say.
fake.fills = [
  activity('h1', 'AAPL', 'buy', 10, 180, now - 5 * 86400000),
  activity('h2', 'AAPL', 'sell', 10, 182, now - 5 * 86400000 + 12 * min),
  activity('h3', 'TSLA', 'buy', 5, 250, now - 5 * 86400000 + 30 * min),
  activity('h4', 'TSLA', 'sell', 5, 247, now - 5 * 86400000 + 41 * min),
];
const log = new Logger(null, 'info');
const referee = new Referee({
  config,
  log,
  timers: false,
  clientFactory: (c) => new AlpacaClient(c, { tradingHost: `http://127.0.0.1:${fake.port}`, dataHost: `http://127.0.0.1:${fake.port}`, retries: 0 }),
  streamFactory: (_c, h) => new FakeStream(h) as unknown as TradeStream,
  dbFile: (m) => join(dir, `${m}.sqlite`),
});
await referee.start();
const http = new RefereeHttp(referee, { port: PORT, staticDir: join(process.cwd(), 'dist-app'), log });
await http.listen();
const stream = FakeStream.current!;
const tick = () => (referee as unknown as { onTick(): Promise<void> }).onTick();

// Trade 1: NVDA with a bracket stop, closed for a profit 9 minutes ago.
let t = now - 40 * min;
fake.positions = [position('NVDA', 10, 120)];
stream.push({ ...fillUpdate(t, 'e1', 'NVDA', 'buy', 10, 120), order: { ...fillUpdate(t, 'e1', 'NVDA', 'buy', 10, 120).order, order_class: 'bracket', legs: [order(t, 'stop1', 'NVDA', 'sell', 'stop', 'held', { stop_price: '118.5' })] } });
t = now - 31 * min;
fake.positions = [];
stream.push(fillUpdate(t, 'x1', 'NVDA', 'sell', 10, 121.2));
// Trade 2: AMD with no stop: the referee closes it after 30 s.
t = now - 20 * min;
fake.positions = [position('AMD', 10, 160)];
stream.push(fillUpdate(t, 'e2', 'AMD', 'buy', 10, 160));
await tick();
await sleep(100);
// The clock for the engine is real time, so wait out the 30 s deadline by replaying a tick later.
(referee as unknown as { now: () => number }).now = () => Date.now() + 40 * 1000; // pretend 40 s passed
await tick();
await sleep(200);
(referee as unknown as { now: () => number }).now = () => Date.now();
t = now - 19 * min;
stream.push(fillUpdate(t, 'close-AMD', 'AMD', 'sell', 10, 159.6));
// Trade 3: META, trade 3 of 2, three minutes after a losing exit: closed at once, day locked after 3 breaches.
t = now - 16 * min;
fake.positions = [position('META', 5, 500)];
stream.push(fillUpdate(t, 'e3', 'META', 'buy', 5, 500));
await sleep(200);
t = now - 15 * min;
stream.push(fillUpdate(t, 'close-META', 'META', 'sell', 5, 499));
// A declaration waiting for its fill, and an open position with a working stop and a mark.
referee.declare({ symbol: 'MSFT', side: 'long', qty: 10, stopPrice: 410, note: 'pullback to EMA 9 on the 5 min' });
t = now - 2 * min;
fake.positions = [position('MSFT', 10, 412, 413.4)];
stream.push({ ...fillUpdate(t, 'e4', 'MSFT', 'buy', 10, 412), order: { ...fillUpdate(t, 'e4', 'MSFT', 'buy', 10, 412).order, order_class: 'bracket', legs: [order(t, 'stop4', 'MSFT', 'sell', 'stop', 'held', { stop_price: '410' })] } });
await tick();
console.log(`READY http://127.0.0.1:${PORT}`);

const shutdown = async () => {
  await http.close();
  await referee.stop();
  await fake.stop();
  rmSync(dir, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
