// MCP server (stdio) so Claude Desktop or Claude Code can read the referee on the trader's own Claude
// subscription: no API key, no credits. It talks to the running local service over HTTP, so there is one
// engine and one source of truth. Read-mostly: Claude can look and declare, it can never loosen a rule or
// turn enforcement off.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { Report } from '../core/analyze.ts';
import { insightSentence, money, pct } from '../core/format.ts';
import type { ReportResponse, SetupCheckResponse, StateResponse, StrategyDefinition, TradeDto } from '../server/api.ts';

const BASE = (process.env.MYTRADEPILOT_URL ?? 'http://127.0.0.1:4242').replace(/\/$/, '');

async function api<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(BASE + path, { method, headers: method === 'GET' ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (err) {
    throw new Error(`The referee service is not reachable at ${BASE}. Start it with "npm start" in the MyTradePilot folder. (${(err as Error).message})`);
  }
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(json?.error ?? `${res.status} from the referee`);
  return json as T;
}

const et = (ms: number) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) + ' ET';
const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const fail = (err: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true });

function tradeLine(t: TradeDto): string {
  return `${et(t.entryTime)} ${t.symbol} ${t.direction} ${t.qty} @ ${t.entryPrice.toFixed(2)} -> ${t.exitPrice === null ? 'open' : t.exitPrice.toFixed(2)} P&L ${t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)} (${pct(t.returnPct)})${t.tradeOfDay ? `, trade ${t.tradeOfDay} of the day` : ''}${t.declared === false ? ', undeclared' : ''}${t.refereeClosed ? ', closed by the referee' : ''}`;
}

function describeState(s: StateResponse): string {
  const n = s.snapshot.nextTrade;
  const d = s.snapshot.day;
  const lines = [
    `Mode: ${s.status.mode}, stream ${s.status.stream}, enforcement ${s.status.enforcement.enabled ? (s.status.enforcement.dryRun ? 'on (dry run: nothing is sent to the broker)' : 'ON, live') : 'off'}.`,
    `Today (${d.date}): ${d.tradesOpened} trade(s) opened, ${d.wins} won, ${d.losses} lost, realized ${money(d.realizedPnl)}, open ${money(d.unrealizedPnl)}, ${d.breaches} rule breach(es), ${d.declaredEntries} declared and ${d.undeclared} undeclared entries.`,
    s.snapshot.lock ? `LOCKED until ${et(s.snapshot.lock.until)}: ${s.snapshot.lock.reason}.` : '',
    `Next trade would be trade ${n.number} of the day: ${n.allowed ? 'ALLOWED by your rules' : 'BLOCKED by your rules'}.`,
    ...n.blockers.map((b) => `  - ${b.message}`),
    `Context: ${n.context.tradeOfDay} trade of the day, ${n.context.afterPrev.toLowerCase()}, ${n.context.timeBucket} window, ${n.context.consecutiveLosses} loss(es) in a row${n.context.minutesSinceLastLoss !== null ? `, ${n.context.minutesSinceLastLoss} min since the last loss` : ''}.`,
    'Your record for trades like the next one:',
    ...(n.record.length
      ? n.record.map((r) => `  - ${r.label}: ${r.n} trades, win ${Math.round(r.winRate * 100)}% (95% interval ${Math.round(r.winLow * 100)} to ${Math.round(r.winHigh * 100)}%), avg ${pct(r.avgReturn)} a trade, total ${money(r.totalPnl)} [${r.confidence}]`)
      : ['  - no history yet']),
    n.lateDayGiveBack && n.lateDayGiveBack.share !== null
      ? `Late-day give-back: on ${n.lateDayGiveBack.days} day(s) with 4+ trades you held ${money(n.lateDayGiveBack.profitAtTrade3)} after trade 3 and gave back ${money(n.lateDayGiveBack.givenBack)} (${Math.round(n.lateDayGiveBack.share * 100)}%) on trades 4 and later.`
      : '',
    s.snapshot.positions.length ? 'Open positions:' : 'No open positions.',
    ...s.snapshot.positions.map((p) => `  - ${p.symbol} ${p.direction} ${Math.abs(p.qty)} @ ${p.avgEntry.toFixed(2)}, mark ${p.mark?.toFixed(2) ?? '?'}, stop ${p.stop ? (p.stop.price?.toFixed(2) ?? 'working') : p.stopDeadline ? `MISSING (${Math.max(0, Math.round((p.stopDeadline - s.snapshot.now) / 1000))} s left)` : 'missing'}${p.declared ? '' : ', undeclared'}`),
    s.snapshot.pendingDeclaration ? `Pending declaration: ${s.snapshot.pendingDeclaration.symbol ?? 'any symbol'} ${s.snapshot.pendingDeclaration.side ?? ''} ${s.snapshot.pendingDeclaration.qty ?? ''}`.trim() : '',
    s.plan ? `Today's plan confirmed at ${et(s.plan.confirmedAt)}${s.plan.note ? `: ${s.plan.note}` : ''}.` : 'Today\'s plan is not confirmed yet.',
  ];
  return lines.filter(Boolean).join('\n');
}

function describeReport(r: ReportResponse): string {
  if (!r.report) return 'No closed trades on record yet. Import a CSV or trade on the connected account.';
  const rep: Report = r.report;
  const s = rep.summary;
  const out = [
    `Record: ${s.trades} closed trades over ${s.days} days (${s.firstDay} to ${s.lastDay}), symbols ${s.symbols.slice(0, 12).join(', ')}${s.symbols.length > 12 ? '...' : ''}.`,
    `Win rate ${Math.round(s.winRate * 100)}%, avg ${pct(s.avgReturn)} a trade (median ${pct(s.medianReturn)}), avg win ${pct(s.avgWin ?? 0)}, avg loss ${pct(s.avgLoss ?? 0)}, total ${money(s.totalPnl)}, profit factor ${s.profitFactor?.toFixed(2) ?? 'n/a'}, max drawdown ${money(s.maxDrawdown)}.`,
    'Where you make money:',
    ...(rep.edges.length ? rep.edges.map((e) => `  + ${insightSentence(e, rep)} [${e.group.confidence}]`) : ['  (no group of 5+ trades clearly beats your average yet)']),
    'Where you give it back:',
    ...(rep.leaks.length ? rep.leaks.map((l) => `  - ${insightSentence(l, rep)} [${l.group.confidence}]`) : ['  (no group of 5+ trades loses money or clearly drags your average)']),
  ];
  for (const d of rep.dimensions) {
    out.push(`${d.title}:`);
    for (const g of d.groups) out.push(`  ${g.label}: n=${g.n}, win ${Math.round(g.winRate * 100)}%, avg ${pct(g.avgReturn)}, total ${money(g.totalPnl)} [${g.confidence}]`);
  }
  if (rep.risk.hasExcursions) out.push(`Stop check at ${rep.risk.stopPct}%: ${rep.risk.pastStop} trades went past the stop, ${rep.risk.pastStopCameBack} came back; with a hard stop the total would have been ${pct(rep.risk.returnWithStop, 1)} instead of ${pct(s.totalReturn, 1)} (sum of trade %).`);
  if (rep.risk.top5Share !== null) out.push(`Your 5 best trades made ${Math.round(rep.risk.top5Share * 100)}% of the total.`);
  out.push('Hypothetical performance statement: what-if figures are computed from past trades and do not represent actual trading; past results do not predict future results.');
  return out.join('\n');
}

function describeSetup(r: SetupCheckResponse): string {
  const lines = [`${r.symbol} ${r.side} at ${et(r.asOf)}${r.price !== null ? `, price ${r.price.toFixed(2)}` : ''}: ${r.score.pass} of ${r.score.total} checks pass.`];
  for (const l of r.lines) lines.push(`  ${l.pass === null ? '?' : l.pass ? 'PASS' : 'FAIL'} ${l.label}: ${l.value} (wants ${l.target})`);
  for (const w of r.warnings) lines.push(`  note: ${w}`);
  lines.push(`Rules right now: the next trade is ${r.nextTrade.allowed ? 'allowed' : 'blocked'}${r.nextTrade.blockers.length ? ': ' + r.nextTrade.blockers.map((b) => b.message).join(' ') : '.'}`);
  return lines.join('\n');
}

const server = new McpServer(
  { name: 'mytradepilot-referee', version: '0.2.0' },
  {
    instructions: [
      'You are reading a trader\'s own rulebook, live state and trade record from the MyTradePilot Referee running on their machine.',
      'Speak in the form "your rule says" and "your record shows". Describe the trader\'s own statistics; do not tell them to take or skip a trade, do not suggest stop prices or position sizes for a specific instrument, and never present past results as a prediction.',
      'When a number comes from fewer than 15 trades, say so (the confidence label is "too few" or "early signal").',
      'Start with get_next_trade when they ask about a trade they are about to take; use check_setup for a specific symbol; use get_record for patterns over their history.',
    ].join(' '),
  },
);

server.registerTool('get_next_trade', { title: 'Next trade state', description: 'What the trader\'s own rules and record say about the trade they would take right now: trade number of the day, blockers with clear-times, context, record lines with confidence, open positions and stops, lock status, today\'s totals.', inputSchema: {} }, async () => {
  try {
    return text(describeState(await api<StateResponse>('GET', '/api/state')));
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('get_rules', { title: 'Rulebook', description: 'The trader\'s rules (max trades a day, re-entry after a loss, cooldown, stop required, size, daily loss limit, session window...) and whether today\'s plan is confirmed.', inputSchema: {} }, async () => {
  try {
    const s = await api<StateResponse>('GET', '/api/state');
    return text(JSON.stringify({ rules: s.rules, plan: s.plan, enforcement: s.status.enforcement }, null, 2));
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('get_record', { title: 'Trade record report', description: 'Edges, leaks and breakdowns (entry time, trade number of the day, what came before, direction, hold time, weekday, ticker) over every closed trade on record, with confidence labels.', inputSchema: {} }, async () => {
  try {
    return text(describeReport(await api<ReportResponse>('GET', '/api/report')));
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('get_today', { title: 'Today', description: 'Today\'s trades, rule breaches and referee actions.', inputSchema: {} }, async () => {
  try {
    const s = await api<StateResponse>('GET', '/api/state');
    const out = [`Trades today (${s.todayTrades.length}):`, ...s.todayTrades.map(tradeLine)];
    out.push(`Breaches today (${s.todayBreaches.length}):`, ...s.todayBreaches.map((b) => `  ${et(b.time)} ${b.rule}${b.symbol ? ` ${b.symbol}` : ''}: ${b.message}`));
    out.push('Recent referee actions:', ...s.recentActions.slice(0, 20).map((a) => `  ${et(a.time)} ${a.kind}${a.symbol ? ` ${a.symbol}` : ''}: ${a.detail}${a.ok ? '' : ' (FAILED)'}`));
    return text(out.join('\n'));
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('get_trades', { title: 'Recent trades', description: 'Closed trades over the last N days (default 30, max 3650), oldest first.', inputSchema: { days: z.number().int().min(1).max(3650).optional() } }, async ({ days }) => {
  try {
    const trades = await api<TradeDto[]>('GET', `/api/trades?days=${days ?? 30}`);
    return text(trades.length ? trades.map(tradeLine).join('\n') : 'No closed trades in that window.');
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('get_breaches', { title: 'Rule breaches', description: 'Rule breaches over the last N days (default 30).', inputSchema: { days: z.number().int().min(1).max(3650).optional() } }, async ({ days }) => {
  try {
    const list = await api<{ time: number; rule: string; symbol: string | null; message: string; action: string }[]>('GET', `/api/breaches?days=${days ?? 30}`);
    return text(list.length ? list.map((b) => `${et(b.time)} ${b.rule}${b.symbol ? ` ${b.symbol}` : ''}: ${b.message}`).join('\n') : 'No breaches in that window.');
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('get_strategy', { title: 'Strategy', description: 'The trader\'s plain-English strategy description, indicators and the thresholds the setup checker uses.', inputSchema: {} }, async () => {
  try {
    return text(JSON.stringify(await api<StrategyDefinition>('GET', '/api/strategy'), null, 2));
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('check_setup', { title: 'Check a setup', description: 'Measure a symbol right now against the trader\'s strategy thresholds (price, day change, relative volume, trend, pullback to the fast EMA, not extended, VWAP side, EMA slope) using live Alpaca bars, and show what the rules say about the next trade.', inputSchema: { symbol: z.string().min(1).max(10), side: z.enum(['long', 'short']).default('long') } }, async ({ symbol, side }) => {
  try {
    return text(describeSetup(await api<SetupCheckResponse>('POST', '/api/setup-check', { symbol, side })));
  } catch (err) {
    return fail(err);
  }
});

server.registerTool('declare_trade', { title: 'Declare a trade', description: 'Stamp "I am taking this" on the trader\'s behalf, only when they explicitly ask you to declare. The next matching entry fill within the declaration window counts as declared.', inputSchema: { symbol: z.string().max(10).optional(), side: z.enum(['long', 'short']).optional(), qty: z.number().positive().optional(), stopPrice: z.number().positive().optional(), note: z.string().max(500).optional() } }, async (args) => {
  try {
    const d = await api<{ time: number; symbol: string | null }>('POST', '/api/declare', args);
    return text(`Declared at ${et(d.time)} for ${d.symbol ?? 'any symbol'}.`);
  } catch (err) {
    return fail(err);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
