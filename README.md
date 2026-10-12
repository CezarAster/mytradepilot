# MyTradePilot

Two things in one repo:

1. **Free trade analyzer** (the public page): drop in a trade export and see where you make money, where you give it back, and what your stop is doing. Runs entirely in the browser; trades are never uploaded.
2. **The Referee** (the local app): connects to your Alpaca account, watches every fill in real time, and enforces the rules you wrote while you were calm. Trade 4 when your rule says 3, a re-entry two minutes after a loss, a position with no stop after 60 seconds: the Referee closes it, tells you, and tells your accountability partner. Before you click, it shows what your own record says about the trade you are about to take.
You write the rule while calm. The Referee holds it when you are not.

Two parts. The **free analyzer** reads a TradingView or broker export in the browser, uploads nothing, and shows the trader's record: where they make money, where they give it back, the stop check, and three draft rules written from that record. The **Referee** is the paid part, in pilot with Topstep Combine traders from late December 2026: the rules the trader declares before a session are held on TopstepX through the ProjectX API; a fill against a declared rule is flattened about two seconds after it lands, the breach is logged, and a read-only partner is told. The flatten is after the fill. Nothing about the Referee's effect is proven yet; the pilot measures breaches per trader-week.

The site is `index.html` on the Equity River v2 visual system; its copy follows `docs/website-content-spec-referee.md`, and `docs/strategy-2026-10-10-referee.md` section 8 is law for every sentence on it.

The strategy behind the product, with sources, is in [docs/strategy.md](docs/strategy.md). How it is built is in [docs/architecture.md](docs/architecture.md).

## Requirements

- Node 22.18 or newer (24 recommended). The code runs as TypeScript directly, no build step for the service.
- An Alpaca account. Paper trading is the default and the right place to start. Create paper API keys at https://app.alpaca.markets (Paper Trading, "View API keys").
- macOS, Windows or Linux.

## Quick start

```bash
git clone https://github.com/cezaraster/mytradepilot.git
cd mytradepilot
npm install
npm run build:app      # builds the Referee's browser UI once
npm start              # starts the Referee on http://127.0.0.1:4242
npm run dev        # web page at http://localhost:5173
npm test           # engine tests, the site drift test, the phrasing and statement tests
npm run typecheck
npm run report -- --tz America/Los_Angeles path/to/trades.csv   # same report and the same three drafts in the terminal
npm run build      # static site in dist/, deployable anywhere (GitHub Pages, Netlify, Vercel, Cloudflare Pages)
```

Open http://127.0.0.1:4242, go to **Settings**, paste your paper key id and secret, choose **Paper**, press **Test connection**, then **Save**. The Referee backfills every fill on the account, rebuilds your trades, and starts listening.

Prefer environment variables? Set `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` (Alpaca's own names) before `npm start`; `ALPACA_MODE=live` switches to the live account.
- `src/core/parsers/` turns CSV files into trades: the TradingView trade list (Bar Replay / Strategy Tester) and a generic broker fill list (matched into round trips FIFO). `parsers/index.ts` combines files, drops duplicates from overlapping exports, and merges partial fills.
- `src/core/analyze.ts` tags each trade (New York entry time, trade number of the day, what came before, hold time) and finds edges, leaks and weak spots. Small groups are shrunk toward the overall average so 3 lucky trades aren't called an edge.
- `src/core/stats.ts` is the 95% interval; `src/core/drafts.ts` writes the three draft rules. A draft cites a statistic only when its group is solid (15 trades or more) and the interval excludes the trader's average; otherwise it is the trader's rule with no number.
- `src/web/legal.ts` holds the hypothetical-results statement (NFA Compliance Rule 2-29(c), satisfying CFTC Rule 4.41(b)); it is rendered in full under every what-if figure in the report and in the page's `#legal` block.
- `src/web/main.ts` and `src/web/report.ts` are the analyzer and the report; `src/web/site/` is the marketing page (river, story, declaration card, counters, labs, band); `src/web/style.css` and `src/web/site.css` are the stylesheets.
- A fills export may carry optional `Worst %` / `Best %` columns on the closing fill (TradingView's `Adverse excursion %` is read automatically); they turn on the stop check.
- `public/sample-trades.csv` holds a fictional share trader's fills for the "Run the sample report" button and every sample number on the page (`python scripts/make-sample.py` regenerates it). Every sample figure on the page is bound with `data-sample` and drift-tested against the engine.

## The copy

The page uses the strategy's phrasing ("your rule says", "your record shows"), never compares the visitor with other traders, never claims a saving, and never prints a stop level or a size; the phrases it must never use are listed in `test/fixtures/forbidden-phrases.txt`. Third-party findings appear only in `#why` and FAQ 6, with their source and caveat. Invented numbers (the declaration card, the held panel, the partner pushes, the day card, the Record Card tile) are labelled "illustrative" in the same component. A test greps the page, the stylesheets and the rendered sample report for the forbidden phrases.

## The first week: dry run

Enforcement starts in **dry run**. Every breach is logged, shown in the UI and notified, but nothing is sent to the broker. Trade a week like that, read the breaches, and adjust the rules. When the rules match what you actually mean, open **Today** and switch dry run off. The red **KILL SWITCH** turns enforcement off at once, at any time.
The band and the mini form post to the provider set in `src/web/signup.ts` (Buttondown). Only the email address, the platform tag and the partner-in-mind tag are sent; trades and rules never leave the tab. The partner invite is copied or mailed by the trader; the site never collects anyone else's address.

## Rules

Defaults, all editable on the **Rules** page:

| Rule | Default | On breach |
|---|---|---|
| Max trades a day | 3 | flatten |
| No re-entry after a losing exit | 10 min | flatten |
| Cooldown after consecutive losses | 2 losses, 20 min | flatten |
| Stop order required after entry | within 60 s | flatten |
| Stop never widened | on | warn |
| Max position size | $10,000 | flatten |
| Daily loss limit (realized plus open) | $500, locks the rest of the day | flatten everything |
| Session window | 09:30 to 15:55 ET | warn |
| Max open positions | 2 | warn |
| Size matches the declared size | 10% tolerance | warn |
| Breaches a day before a lock-out | 3 | lock |

"Flatten" means: cancel the symbol's open orders, then close the position at market through Alpaca's close-position call. The Referee can only ever reduce a position; it never opens one.

## Declare before you click

On **Today**, press **I'm taking this** (optionally with symbol, side, size and stop) before you enter. The next matching fill within ten minutes is marked declared. Undeclared entries are counted, not punished: the number is there so you can see how often you trade on impulse. Confirm the day's plan once before the open so the rules you are trading under are on record.

## Your record

The Referee rebuilds every round trip from the account's fills and shows, for the trade you are about to take: trade number of the day, what came before (after a win, after a loss, a quick re-entry), the time window, and what your record says for each of those with a confidence label and a 95% interval. The late-day give-back line answers the question that started this project: of the profit you held after trade 3, how much did trades 4 and later give back?

Older history from TradingView (Bar Replay or Strategy Tester "List of trades") or any broker's fill export can be imported on the **Record** page; the public analyzer's parsers are the same code.

## Setup check

On **Setup**, type a symbol and side. The Referee pulls bars from Alpaca and checks the stock against your strategy's thresholds (price, day change, relative volume, trend on the fast and slow EMA, pullback distance, not extended, VWAP side, EMA slope) and shows what your rules say about taking a trade right now. Describe your strategy in plain English and set the thresholds on the same page; Claude reads that description through the MCP server.

## Ask Claude, on your subscription

The Referee ships an MCP server. Claude Desktop and Claude Code can read your rules, live state, record and setup checks, and the conversation runs on your Claude subscription: no API key, no credits.

Claude Code:

```bash
claude mcp add mytradepilot -- node /full/path/to/mytradepilot/src/mcp/main.ts
```

Claude Desktop: add to `claude_desktop_config.json` (Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "mytradepilot": {
      "command": "node",
      "args": ["/full/path/to/mytradepilot/src/mcp/main.ts"]
    }
  }
}
```

The Referee must be running (`npm start`). Then ask things like "what does my record say about a 4th trade right now?", "check NVDA long against my setup", or "what rules did I break this week?". Claude can look and, if you ask it to, declare a trade. It cannot change rules or turn enforcement off.

## Notifications and a partner

Desktop notifications fire on the machine running the Referee (macOS, Windows, Linux) and in the browser tab when you allow them. Paste a Discord or Telegram webhook URL in **Settings** and every breach and every flatten is posted there, so someone else sees it too.

- Discord: Server Settings, Integrations, Webhooks, New Webhook, Copy URL.
- Telegram: `https://api.telegram.org/bot<token>/sendMessage?chat_id=<chat id>`.

## Where things live

- Config and keys: `~/.mytradepilot/config.json` (owner-only permissions). Override the folder with `MYTRADEPILOT_HOME`.
- Data: `~/.mytradepilot/referee-paper.sqlite` (and `referee-live.sqlite`).
- Logs: `~/.mytradepilot/logs/referee-YYYY-MM-DD.log`.
- Port: `--port 4343` or `PORT=4343`.

## Development

```bash
npm run dev            # the public analyzer at http://localhost:5173
npm run dev:app        # the Referee UI with hot reload at http://127.0.0.1:5174 (proxies /api to :4242)
npm start              # the Referee service
npm test               # engine, strategy, service (fake Alpaca) and MCP tests
npm run typecheck
npm run build && npm run build:app
npm run report -- --tz America/Los_Angeles path/to/trades.csv   # the analyzer in the terminal
```

Every push to `main` runs the tests, typechecks, builds both pages and deploys the public analyzer to GitHub Pages.

## A note on what this is

The Referee measures your own trades against your own rules and shows your own statistics. It does not recommend trades, stops or sizes for any instrument, and nothing in it predicts future results. What-if figures are computed from past trades and do not represent actual trading. You remain responsible for every order on your account, including the ones the Referee closes.
