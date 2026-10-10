# Handoff: finishing the Referee

State on branch `claude/practical-gates-e6xxx6` (draft PR https://github.com/CezarAster/mytradepilot/pull/4):

- Done and tested: engine, Alpaca client and stream, SQLite store, service with enforcement, HTTP API and SSE, MCP server, strategy checker, README, architecture notes. `npm test` is 34 for 34; `npm run typecheck`, `npm run build` and `npm run build:app` pass.
- The browser UI in `app/` is written and builds, but was never opened in a browser. The agent writing it was stopped before it could run its own checks.

## Remaining work, in order

1. **UI smoke test.** `npm install --no-save playwright-core && node scripts/ui-smoke.cjs`. Fix anything it reports (console errors, empty pages, missing buttons on Today: "I'm taking this", "Confirm today's plan", kill switch).
2. **Walk the UI by hand** against the real service: `npm start`, open http://127.0.0.1:4242. Settings: paste paper keys, Test connection, Save. Today: next-trade panel, declaration, plan, enforcement toggles. Rules: edit and save. Record: import a CSV. Setup: check a symbol. Log. Ask: fill the two placeholders (`<!-- MCP_SETUP -->`, `<!-- MCP_TOOLS -->`) in `app/views/ask.ts` with the README's MCP section and the tool list from `src/mcp/main.ts`.
3. **Trade on paper with dry run on** for a session and read the breaches. Watch `~/.mytradepilot/logs/`.
4. **Adversarial review** of `src/engine/live.ts`, `src/alpaca/*`, `src/server/referee.ts`, `src/server/http.ts`: wrong flatten, missed flatten, double flatten, state drifting from the broker, Alpaca payload fidelity, origin-check bypasses, shell injection in `src/server/notify.ts` (symbols and notes reach osascript/PowerShell arguments; they are cleaned, verify).
5. **The strategy description.** The founder will describe their pullback-momentum strategy; put it in Setup, tune the thresholds in `src/server/api.ts` `DEFAULT_STRATEGY` if the defaults are wrong for stocks.
6. Update the PR body checklist and mark the PR ready.

## Known gaps

- Desktop notifications on Windows use a PowerShell toast; untested on a real Windows machine.
- `better-sqlite3` needs a prebuilt binary for the Node version in use (22.18+ or 24); if `npm install` builds from source on Windows, install the Node build tools or use Node 24.
- The analyzer's `hasExcursions` stop check needs MAE data that live fills do not carry; the Referee enforces the trader's stop rules instead of suggesting stops.
