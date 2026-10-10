# MyTradePilot

You write the rule while calm. The Referee holds it when you are not.

Two parts. The **free analyzer** reads a TradingView or broker export in the browser, uploads nothing, and shows the trader's record: where they make money, where they give it back, the stop check, and three draft rules written from that record. The **Referee** is the paid part, in pilot with Topstep Combine traders from April 2027: the rules the trader declares before a session are held on TopstepX through the ProjectX API; a fill against a declared rule is flattened about two seconds after it lands, the breach is logged, and a read-only partner is told. The flatten is after the fill. Nothing about the Referee's effect is proven yet; the pilot measures breaches per trader-week.

The site is `index.html` on the Equity River v2 visual system; its copy follows `docs/website-content-spec-referee.md`, and `docs/strategy-2026-10-10-referee.md` section 8 is law for every sentence on it.

## Run

```bash
npm install
npm run dev        # web page at http://localhost:5173
npm test           # engine tests, the site drift test, the phrasing and statement tests
npm run typecheck
npm run report -- --tz America/Los_Angeles path/to/trades.csv   # same report and the same three drafts in the terminal
npm run build      # static site in dist/, deployable anywhere (GitHub Pages, Netlify, Vercel, Cloudflare Pages)
```

## Layout

- `src/core/parsers/` turns CSV files into trades: the TradingView trade list (Bar Replay / Strategy Tester) and a generic broker fill list (matched into round trips FIFO). `parsers/index.ts` combines files, drops duplicates from overlapping exports, and merges partial fills.
- `src/core/analyze.ts` tags each trade (New York entry time, trade number of the day, what came before, hold time) and finds edges, leaks and weak spots. Small groups are shrunk toward the overall average so 3 lucky trades aren't called an edge.
- `src/core/stats.ts` is the 95% interval; `src/core/drafts.ts` writes the three draft rules. A draft cites a statistic only when its group is solid (15 trades or more) and the interval excludes the trader's average; otherwise it is the trader's rule with no number.
- `src/web/legal.ts` holds the hypothetical-results statement (NFA Compliance Rule 2-29(c), satisfying CFTC Rule 4.41(b)); it is rendered in full under every what-if figure in the report and in the page's `#legal` block.
- `src/web/main.ts` and `src/web/report.ts` are the analyzer and the report; `src/web/site/` is the marketing page (river, story, declaration card, counters, labs, band); `src/web/style.css` and `src/web/site.css` are the stylesheets.
- A fills export may carry optional `Worst %` / `Best %` columns on the closing fill (TradingView's `Adverse excursion %` is read automatically); they turn on the stop check.
- `public/sample-trades.csv` holds a fictional share trader's fills for the "Run the sample report" button and every sample number on the page (`python scripts/make-sample.py` regenerates it). Every sample figure on the page is bound with `data-sample` and drift-tested against the engine.

## The copy

The page uses the strategy's phrasing ("your rule says", "your record shows"), never compares the visitor with other traders, never claims a saving, and never prints a stop level or a size; the phrases it must never use are listed in `test/fixtures/forbidden-phrases.txt`. Third-party findings appear only in `#why` and FAQ 6, with their source and caveat. Invented numbers (the declaration card, the held panel, the partner pushes, the day card, the Record Card tile) are labelled "illustrative" in the same component. A test greps the page, the stylesheets and the rendered sample report for the forbidden phrases.

## Waitlist signup

The band and the mini form post to the provider set in `src/web/signup.ts` (Buttondown). Only the email address, the platform tag and the partner-in-mind tag are sent; trades and rules never leave the tab. The partner invite is copied or mailed by the trader; the site never collects anyone else's address.

## Deploy

Every push to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Adding a broker

Write a parser that returns `Trade[]` (see `src/core/types.ts`), add its detection to `parseFile`, and add a fixture plus a test.
