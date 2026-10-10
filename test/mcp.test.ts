import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ConfigStore } from '../src/server/config.ts';
import { RefereeHttp } from '../src/server/http.ts';
import { Logger } from '../src/server/log.ts';
import { Referee } from '../src/server/referee.ts';

test('mcp: the stdio server lists its tools and reads the referee over HTTP', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-'));
  const config = new ConfigStore(dir);
  const referee = new Referee({ config, log: new Logger(null, 'error'), timers: false, now: () => Date.parse('2026-10-12T14:00:00Z'), dbFile: (m) => join(dir, `${m}.sqlite`) });
  await referee.start();
  const http = new RefereeHttp(referee, { port: 0, staticDir: null, log: new Logger(null, 'error') });
  const port = await http.listen();

  const transport = new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'src/mcp/main.ts')], env: { ...process.env, MYTRADEPILOT_URL: `http://127.0.0.1:${port}` } });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort();
    assert.deepEqual(tools, ['check_setup', 'declare_trade', 'get_breaches', 'get_next_trade', 'get_record', 'get_rules', 'get_strategy', 'get_today', 'get_trades']);
    const next = await client.callTool({ name: 'get_next_trade', arguments: {} });
    const body = (next.content as { type: string; text: string }[])[0].text;
    assert.match(body, /Next trade would be trade 1 of the day: ALLOWED/);
    assert.match(body, /enforcement on \(dry run/);
    const record = await client.callTool({ name: 'get_record', arguments: {} });
    assert.match((record.content as { text: string }[])[0].text, /No closed trades on record yet/);
    const decl = await client.callTool({ name: 'declare_trade', arguments: { symbol: 'aapl', side: 'long', qty: 10 } });
    assert.match((decl.content as { text: string }[])[0].text, /Declared at .* for AAPL/);
    assert.equal(referee.state().snapshot.pendingDeclaration?.symbol, 'AAPL');
    const setup = await client.callTool({ name: 'check_setup', arguments: { symbol: 'AAPL', side: 'long' } });
    assert.equal(setup.isError, true, 'not connected to Alpaca yet');
    assert.match((setup.content as { text: string }[])[0].text, /Not connected/);
  } finally {
    await client.close();
    await http.close();
    await referee.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
