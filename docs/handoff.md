# MyTradePilot: handoff for Cezar

Written 2026-10-12 at the end of the first build session. Start a new Claude Code session in this repo and tell it: **"Read docs/handoff.md, docs/architecture.md and README.md, then work through the next steps in docs/handoff.md."**

## What this is

MyTradePilot has two products in one repo.

- **The website**, the public page at https://cezaraster.github.io/mytradepilot/ (GitHub Pages, deployed from `main`): the Referee website with the free trade analyzer built in. Drop in a CSV and see where you make money, where you give it back, and three draft rules. It came from the branch `claude/trading-app-website-examples-1sfic8` and is now merged into `main`. Its copy follows `docs/website-content-spec-referee.md`. A test greps the page for the phrases in `test/fixtures/forbidden-phrases.txt`.
- **The Referee**, a local app: it connects to an Alpaca account, watches every fill, and enforces the trader's own rules. Examples are max trades a day, no re-entry after a loss, a cooldown after losses, a stop within 60 seconds of entry, a size cap and a daily loss limit. When a fill breaks a rule it closes the position, notifies, and can ping an accountability partner. Before the next trade it shows what the trader's own record says about trades like it.

Background reading in this repo:

- `docs/strategy.md`: market research and the plan.
- `docs/architecture.md`: how the code fits together.
- `README.md`: setup and usage.

There is also a social media content brief as a Claude doc. It is private, so ask Dad to share the link.

## Decisions already made

| Topic | Decision |
| --- | --- |
| Broker | Alpaca (Dad has an account). US stocks, pullback momentum strategy. Paper first. |
| Where the engine runs | Locally on the trader's computer. Keys stay in `~/.mytradepilot/config.json`, or `%USERPROFILE%\.mytradepilot\config.json` on Windows. |
| Enforcement | On, in **dry run** by default: breaches are logged and shown as "would have closed". Live enforcement is a switch on the Today page. A kill switch turns it off. |
| AI | Through the MCP server in `src/mcp/main.ts`, so Claude Desktop or Claude Code reads the Referee on the trader's own Claude subscription. There is no Anthropic API key and no in-app LLM. |
| Wording | "Your rule says" and "your record shows". Never "signals", "AI coach", "verdict", or suggested stops or sizes for an instrument. No profit claims anywhere. |
| Launch | Late December 2026, stated on the website (it said April 2027 before). |
| Price | Not decided. The strategy suggested $19 a month or $169 a year for the Referee, with the analyzer free. |

## Run it on your PC

1. Install Node 24 LTS from https://nodejs.org and Git from https://git-scm.com.
2. Install Claude Code: `npm install -g @anthropic-ai/claude-code`, then `claude auth login`.
3. Clone and run:

```bash
git clone https://github.com/CezarAster/mytradepilot.git
cd mytradepilot
npm install
npm test
npm run build:app
npm start
```

4. Open http://127.0.0.1:4242. In **Settings**, paste Alpaca **paper** keys, choose Paper, then Test and Save.

On Windows, `npm install` builds `better-sqlite3`. It uses a prebuilt binary for Node 24. If it tries to compile instead, install the Visual Studio Build Tools ("Desktop development with C++") and rerun.

## What is done

- **Engine**, in `src/engine/`: a streaming fill matcher that produces the same trades as the CSV parser, every rule listed above, declarations ("I'm taking this"), locks, and the record book with Wilson intervals and the late-day give-back statistic.
- **Alpaca**, in `src/alpaca/`: a REST client, the trade_updates stream with reconnect, and converters.
- **Service**, in `src/server/`: SQLite store, backfill on start, live stream, marks, enforcement with dry run and a kill switch, an HTTP API with server-sent events bound to 127.0.0.1, and desktop plus Discord or Telegram notifications.
- **UI**, in `app/`: Today, Rules, Record (with CSV import), Setup (strategy and setup check), Settings, Log, and Ask Claude.
- **MCP server**, in `src/mcp/`: next-trade state, rules, record, today, trades, breaches, strategy, setup check, and declare.
- **Tests**: 38 tests (`npm test`) cover the engine, strategy, the service against a fake Alpaca, and an MCP round trip. A Playwright UI smoke test lives in `scripts/ui-smoke.cjs`.
- **Review fixes**: an adversarial review found 24 problems. These are fixed:
  - Saving settings no longer flattens protected positions or drops the lock.
  - Out-of-order backfill now rebuilds in time order.
  - Flatten cancels bracket legs, waits for cancels, and retries failed closes.
  - The flatten debounce is per trade.
  - Stale working orders are closed out on reconcile.
  - Replays keep the declared flag.

## Review findings 1 to 5: fixed (2026-10-13)

Each has a test that fails on the old code (`test/engine-live.test.ts` and `test/referee.test.ts`, the ones named "fix: ...").

1. The API checks Host and Origin against `127.0.0.1:<port>`, `localhost:<port>` and the Vite dev port 5174, and refuses non-GET requests without `content-type: application/json` (415). The UI and the MCP server always send it.
2. Close-all parses Alpaca's 207 answer. A symbol that failed gets an error action, a notification, a queued retry, and its `refereeClosed` mark removed.
3. Unrealized P&L is recomputed at the end of every fill.
4. Partial exits book realized P&L as they fill (`OpenPosition.bookedPnl`); the close trues the day up to the trade's own P&L.
5. A position the Referee is closing is skipped by the stop check and by `positionsAwaitingStop`.

Also fixed: `scripts/ui-smoke.cjs` never imported `chromium`. Run it in a cloud session with `CHROMIUM_PATH=/opt/pw-browsers/chromium`.

## Review findings 6 to 11: fixed (2026-10-13)

Tests: `test/referee-sync.test.ts` and `test/alpaca.test.ts`. Each fails on the old code.

6. A backfilled fill dated today runs as `late`. Its breaches are stored (marked "(seen late)"), notified, and enforced if that same trade is still open. The decision waits until the whole backfill batch is applied, so a later fill in the batch that closed the trade, or a newer trade in the same symbol, is never touched. When Alpaca's positions and our fills disagree, `reconcile('drift')` runs, at most once a minute. While live, the stream re-sends `listen` every 30 s as a heartbeat (Alpaca answers `listening`). After 75 s with no message at all, it drops the socket and reconnects, and the reconnect syncs.
7. Same mechanism, with no 5-minute cut-off. The out-of-order path that rebuilds the engine handles today's backfilled fills the same way. It doesn't save day state or announce a lock mid-replay; afterwards, today's breach count is the saved count plus the late ones.
8. `seed` counts only trades it didn't already hold, and `rebuildEngine` seeds after replaying fills.
9. Database writes on enforcement paths go through `safeWrite`, so a failure is logged once a minute, reported to the trader once an hour, and enforcement carries on. `onBreach` starts the flatten before it writes the breach. A fill the database refuses is still applied, kept in memory, and written on the next sync. The kill switch and the enforcement toggle change the setting in memory before writing `config.json`. If the write fails, an error action says the old setting returns after a restart.
10. `doReconcile` remembers the client, store and engine it started with, and stops if any change while it waits on Alpaca. `reconcile()` coalesces requests made during a run into one more run, and the promise it returns covers that run. A replaced stream's handlers are ignored.
11. The client reads `Retry-After` (seconds or a date) and Alpaca's `X-RateLimit-Reset`. GETs wait it out up to 10 s, or fail at once with `AlpacaError.retryAfterMs`. A close waits it out in line up to 5 s; the retry queue never retries sooner than Alpaca asked.

### The review of those fixes

A second review ran five reviewers, each paired with a skeptic who tried to refute every finding. 21 findings survived, and all are fixed, each with a test in the same two files plus one in `test/engine-live.test.ts`:

- **Account switches.** Changing keys or paper/live drops queued close retries and in-flight state. A close queued on paper can no longer close a live position. Fills the paper database refused are not written into the live one. Each retry remembers its account, and a flatten that sees the account change mid-way stops. Two quick Settings saves leave one stream, not two.
- **The retry queue** only retries the same trade. If that trade closed and a new one opened in the symbol, the new one is left alone. The kill switch and dry run now also drop closes already queued, which used to run anyway.
- **Close-all** (the daily loss limit) that Alpaca refuses as a whole is retried symbol by symbol, after `Retry-After`. The positions are no longer left marked as "being closed by the Referee", which used to hide them from the stop rule.
- **Out-of-order rebuild** replays in this order: earlier days, today's imports, the saved lock (which now records when it started), then today's fills. Every breach found from the earliest missed fill on that isn't already stored is handled as seen late, including one the missed fill pushes onto a later fill (trade 3 of 2 becomes trade 4). The trade number recorded live is kept.
- **The loss streak** is recounted in exit order after imports and replays, so seeding before or after replaying gives the same cooldowns.
- **A locked database** no longer stalls the service. SQLite's busy timeout is 100 ms (it was 5 s). After a failed write, writes pause for 10 s and fills wait in memory.
- **Rate limits.** A wait of 0 or a malformed header falls back to normal backoff. While Alpaca is rate-limiting us, the position and sync polling waits instead of asking every tick. The fake Alpaca can now answer the way Alpaca documents it (`X-RateLimit-Reset`).
- **Tests** poll for outcomes instead of sleeping a fixed time; `test/referee.test.ts` got the same treatment. 12 copies in parallel on a loaded 4-core machine all pass.

## The original review findings (all fixed)

Kept for reference.

| # | Problem | Where | Fix |
| --- | --- | --- | --- |
| 1 | The Origin check accepts any localhost port and plain-text POSTs, so a malicious page on localhost or a DNS-rebinding page could hit kill, flatten or enforcement | `src/server/http.ts` `sameOrigin`, `handle` | Allow only `127.0.0.1:<port>` and `localhost:<port>` as Host and Origin, plus the Vite dev origin `:5174`. Require `content-type: application/json` on non-GET requests. |
| 2 | Close-all (used by the daily loss limit) treats Alpaca's 207 multi-status as full success | `src/alpaca/client.ts` `closeAllPositions`, `src/server/referee.ts` `flatten(null)` | Parse the 207 array. Log an error action per failed symbol and queue `flattenRetries` for those symbols. Mark only the closed ones `refereeClosed`. |
| 3 | A losing exit counts twice against the daily loss limit for up to 5 seconds, because unrealized P&L is only recomputed in `setMarks` | `src/engine/live.ts` | Recompute unrealized P&L from the open positions at the end of `applyFill`. |
| 4 | Partial exits book no realized P&L until the last share sells | `src/engine/live.ts` `applyFill` reduce branch, `countClosed` | Book `sign * (price - avgEntry) * qty` on each reduce. Track it on the position and subtract it when the trade closes. |
| 5 | A position the Referee is closing can get a second stopRequired breach and a second flatten | `src/engine/live.ts` `tick`, `positionsAwaitingStop` | Skip positions with `refereeClosed`. |
| 6 | Fills found only by backfill are never enforced. Position drift is detected every 5 seconds but only logged. A stream that silently stops delivering still reads "live" | `src/server/referee.ts` `doReconcile`, `refreshPositions`; `src/alpaca/stream.ts` | Use mode `late` for every backfilled fill and enforce while the position is still open. On drift, call `reconcile('drift')`, rate-limited. Add an idle timeout so the stream reconnects. |
| 7 | Backfilled fills older than 5 minutes run as `history`: their breaches are counted toward the lock but never stored or notified | `src/server/referee.ts` `doReconcile` | Same fix as #6. |
| 8 | Re-importing a CSV recounts today's trades, and a restart loses the seeded count | `src/engine/live.ts` `seed`, `src/server/referee.ts` `rebuildEngine` | Count only newly added trades. Seed after the fill replay. |
| 9 | A SQLite or config write failure aborts the flatten and disables the kill switch | `src/server/referee.ts` `onBreach`, `kill`, `setEnforcement` | Wrap persistence in try/catch and flatten first. Update in-memory enforcement before the file write. |
| 10 | Switching paper to live during a reconcile can write paper fills into the live database | `src/server/referee.ts` `doReconcile`, `updateSettings` | Capture the store and engine at the start of `doReconcile` and bail out if they changed. Re-run a coalesced reconcile instead of dropping it. |
| 11 | Retries do not honour Retry-After on HTTP 429 | `src/alpaca/client.ts` `request` | Honour Retry-After, and give the flatten path its own bounded retry. |

## One thing to reconcile

The website describes the Referee as a Topstep Combine pilot that holds rules on TopstepX through the ProjectX API, priced at $19 a month. The app built in this repo connects to **Alpaca for US stocks**, not Topstep. Dad chose to change only the dates on the site for now. Decide which way it goes, then align the other: either rewrite the site copy (and `docs/website-content-spec-referee.md`) for Alpaca, or add a ProjectX/TopstepX connection to the app.

## Next steps, in order

1. ~~Fix findings 1 to 5 and add a test for each.~~ Done 2026-10-13.
2. Run a paper session with Dad in dry run. Read the breaches and the log at `~/.mytradepilot/logs/`, and fix what looks wrong.
3. Check Windows end to end: desktop notifications (a PowerShell toast, untested), the `better-sqlite3` install, and `npm start` from a fresh clone.
4. ~~Fix findings 6 to 11.~~ Done 2026-10-13.
5. Put Dad's written strategy into the Setup page and tune `DEFAULT_STRATEGY` in `src/server/api.ts` if the defaults are wrong.
6. Before the late December launch, decide how waitlist users install it: a signed Windows and Mac installer, or the npm steps above.

## Rules when changing this code

- Never weaken or delete a test to get green. The engine must stay deterministic: same fills in, same state out.
- Keep dry run as the default and keep the kill switch.
- Enforcement only ever reduces positions. It cancels orders and closes positions; there is no order ticket.
- Before every push, run `npm test`, `npm run typecheck`, `npm run build` and `npm run build:app`.
- For UI changes, also run `npm install --no-save playwright-core && node scripts/ui-smoke.cjs`. It uses installed Chrome; set `CHROMIUM_PATH` to use another Chromium.
