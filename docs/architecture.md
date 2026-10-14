# Architecture

MyTradePilot has two products in one repo.

1. **The free analyzer** (`index.html`, `src/web/`): a static page on GitHub Pages. Drop a CSV in, see edges and leaks. Runs entirely in the browser.
2. **The Referee** (`src/server/`, `app/`, `src/mcp/`): a local service that watches an Alpaca account in real time and enforces the trader's own rules. Runs on the trader's machine. Nothing leaves it except calls to Alpaca and, if configured, a webhook.

Both share the engine in `src/core/` (parsers, analysis) and `src/engine/` (live rules).

## Data flow

```
Alpaca trade_updates (WebSocket)  ─┐
Alpaca activities (REST backfill) ─┼─> fills table (SQLite) ─> LiveEngine (pure) ─> events
CSV import (TradingView, broker)  ─┘        │                        │
                                            │                        ├─ breach ─> enforcement (cancel orders, close position)
                                            │                        ├─ trade  ─> record book (analysis)
                                            │                        └─ lock   ─> notifications
                                            └─> replayed on every start
HTTP API + SSE (127.0.0.1:4242) <─ Referee service ─> browser UI (app/)
MCP stdio server (src/mcp) ──HTTP──> the same service   (Claude Desktop / Claude Code, on the subscription)
```

## Why fills are the source of truth

The engine (`src/engine/live.ts`) is deterministic: the same fills in the same order give the same trades, counters, cooldowns and breaches. The service never stores "the position is open" as a fact; it stores fills and rebuilds. A crash, a laptop sleep or a restart cannot leave it with a stale idea of the day. The only state a replay cannot rebuild (the lock, today's breach count, whether the daily loss limit fired) is persisted separately and restored for the same trading day.

Fills carry a stable key, `orderId|cumQty`, so the same execution seen on the stream and in the activities backfill is stored once.

Today's fills that only the backfill found (the stream missed them) are judged like live ones: their breaches are stored as "seen late" and notified, and enforced if the trade is still open once the whole backfill is in. Older days only rebuild history. A position Alpaca and the fills disagree on triggers a sync (at most once a minute). The stream reconnects after 10 minutes without a message, and at once when a sync finds fills it never delivered.

A database or config write that fails is logged and skipped: it never stops a flatten, a notification or the kill switch. The kill switch takes effect in memory even when `config.json` cannot be written (it then reverts on restart, and says so in the log).

## What "pre-trade" means here

No retail broker exposes a hook that lets a third party veto an order before it is accepted, and momentum entries are market orders that fill in milliseconds. So the Referee does two things:

- **Before the click**: the next-trade panel is computed the instant the previous trade closes (trade number, after-loss state, time window, cooldowns, the record for that context). The trader declares the trade ("I'm taking this") before entering.
- **After the fill**: when the fill breaks a rule, the Referee cancels the symbol's open orders and closes the position at market through Alpaca's close-position endpoint, which can only reduce. It never opens a position.

## Modes

- **Dry run** (default): breaches are logged, shown and notified; nothing is sent to the broker. Run a week like this first.
- **Live enforcement**: flattens on breach. One flatten per symbol per 10 seconds; a daily-loss or lock breach closes everything.
- **Kill switch**: turns enforcement off at once; stays off until the trader turns it back on.

## Modules

| Path | Role |
|---|---|
| `src/core/` | CSV parsers, trade matching, the edge/leak analysis, New York time helpers |
| `src/engine/matcher.ts` | Streaming version of the batch fill matcher; same trades out |
| `src/engine/live.ts` | Rules, counters, cooldowns, locks, declarations, stop tracking, next-trade state |
| `src/engine/record.ts` | "Your record" lines with Wilson intervals; late-day give-back |
| `src/alpaca/` | REST client, trade_updates stream with reconnect, JSON to engine types |
| `src/strategy/` | Indicators and the setup checker (pure) |
| `src/server/config.ts` | `~/.mytradepilot/config.json`, validated with zod, 0600 |
| `src/server/db.ts` | SQLite (better-sqlite3, WAL) |
| `src/server/referee.ts` | The service: sync, events, enforcement, read/write API |
| `src/server/http.ts` | Local HTTP server, SSE, static UI, origin check |
| `src/server/notify.ts` | Desktop notification (macOS, Windows, Linux) and webhook (Discord, Telegram, generic) |
| `src/mcp/main.ts` | MCP server for Claude Desktop and Claude Code |
| `app/` | The browser UI (vanilla TypeScript, Vite) |

## Security posture

- The service binds to 127.0.0.1 only. It answers only when Host is `127.0.0.1:<port>` or `localhost:<port>` (or the Vite dev server on `:5174`), which defeats DNS rebinding. A browser `Origin` must be one of those too, and every write must be `content-type: application/json` (415 otherwise), so a web page in the same browser, even one on another localhost port, cannot drive it.
- Alpaca keys live in `config.json` with owner-only permissions, or in environment variables. They never reach the browser (the settings API returns a preview only).
- The MCP server can read state and declare a trade. It cannot change rules, toggle enforcement or close positions.
- Enforcement only ever reduces: cancel orders and close positions. There is no order ticket.

## Testing

`npm test` runs: parser and analysis tests, engine scenarios for every rule, matcher parity against the batch parser, strategy indicators, an end-to-end service test against a fake Alpaca HTTP server and a hand-driven stream (backfill and late enforcement, live breach, flatten and close-all, restart replay, dry run, kill switch, HTTP API, SSE, Host and origin refusal, database failures, an account switch mid-sync, Retry-After), the stream's idle reconnect against a fake WebSocket, and an MCP client round-trip over stdio.
