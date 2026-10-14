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
- **Tests**: 69 tests (`npm test`) cover the engine, strategy, the service against a fake Alpaca, and an MCP round trip. A Playwright UI smoke test lives in `scripts/ui-smoke.cjs`.
- **Review fixes**: an adversarial review found 24 problems. These are fixed:
  - Saving settings no longer flattens protected positions or drops the lock.
  - Out-of-order backfill now rebuilds in time order.
  - Flatten cancels bracket legs, waits for cancels, and retries failed closes.
  - The flatten debounce is per trade.
  - Stale working orders are closed out on reconcile.
  - Replays keep the declared flag.
- **Findings 1 to 5** (fixed 2026-10-14, one test each, marked `fix:` in `test/engine-live.test.ts` and `test/referee.test.ts`):
  - The HTTP API answers only to `127.0.0.1:<port>` and `localhost:<port>` (plus the Vite dev server on `:5174`) as Host and Origin, and refuses non-JSON writes with 415.
  - Close-all reads Alpaca's 207 per symbol. A refused symbol gets an error action and a notification, and its close is retried from the tick loop. If the whole request fails, every open position is retried.
  - Unrealized P&L is recomputed after every fill, so a losing exit no longer counts twice against the daily loss limit.
  - Partial exits book their P&L (fees included) at once. The close books only the rest.
  - A position the Referee is closing gets no stopRequired breach. If the Referee gives up closing it, the check applies again.
- **Findings 6 to 11** (fixed 2026-10-14, tests marked `fix:` in `test/engine-live.test.ts`, `test/referee.test.ts` and `test/stream.test.ts`):
  - 6 and 7: every backfilled fill from today runs as `late`, whatever its age. Its breaches are stored as "(seen late)" and notified. A flatten breach is enforced if its trade is still open after the whole backfill is applied. Position drift (a symbol or share count that Alpaca and the fills disagree on) triggers `reconcile('drift')`, at most once a minute. The stream reconnects after 10 minutes without a message, and at once when a sync finds fills older than 30 seconds that it never delivered.
  - 8: a re-import counts only trades not seen before, and the rebuild seeds imports after the fill replay.
  - 9: database writes on the enforcement path are wrapped, so a failed write is logged and the flatten goes ahead. A fill the database refuses is still refereed. Enforcement switches take effect in memory before `config.json` is written.
  - 10: a sync that sees the account change mid-flight stops without writing and runs again for the new account. A sync asked for while one runs now runs after it instead of being dropped.
  - 11: reads wait out Retry-After (capped at 30 seconds). A close waits in-line only up to 5 seconds; a longer Retry-After goes to the tick-loop retry, scheduled no sooner than Alpaca asked.

## Open review findings

All 11 findings from the review are fixed (see above). Live enforcement still waits on step 2 below: a paper session in dry run.

## One thing to reconcile

The website describes the Referee as a Topstep Combine pilot that holds rules on TopstepX through the ProjectX API, priced at $19 a month. The app built in this repo connects to **Alpaca for US stocks**, not Topstep. Dad chose to change only the dates on the site for now. Decide which way it goes, then align the other: either rewrite the site copy (and `docs/website-content-spec-referee.md`) for Alpaca, or add a ProjectX/TopstepX connection to the app.

## Next steps, in order

1. ~~Fix findings 1 to 5 and add a test for each.~~ Done 2026-10-14.
2. Run a paper session with Dad in dry run. Read the breaches and the log at `~/.mytradepilot/logs/`, and fix what looks wrong.
3. Check Windows end to end: desktop notifications (a PowerShell toast, untested), the `better-sqlite3` install, and `npm start` from a fresh clone.
4. ~~Fix findings 6 to 11.~~ Done 2026-10-14.
5. Put Dad's written strategy into the Setup page and tune `DEFAULT_STRATEGY` in `src/server/api.ts` if the defaults are wrong.
6. Before the late December launch, decide how waitlist users install it: a signed Windows and Mac installer, or the npm steps above.

## Rules when changing this code

- Never weaken or delete a test to get green. The engine must stay deterministic: same fills in, same state out.
- Keep dry run as the default and keep the kill switch.
- Enforcement only ever reduces positions. It cancels orders and closes positions; there is no order ticket.
- Before every push, run `npm test`, `npm run typecheck`, `npm run build` and `npm run build:app`.
- For UI changes, also run `npm install --no-save playwright-core && node scripts/ui-smoke.cjs`. It uses installed Chrome; set `CHROMIUM_PATH` to use another Chromium.
