# MyTradePilot

Free trade analyzer: drop in a trade export and see where you make money, where you give it back, and what your stop is doing. Everything runs in the browser; trades are never uploaded.

This is step 1 of the full app (journal → edge analysis → pre-trade check). The engine in `src/core` has no browser or Node dependencies, so the same code will run on the server later.

## Run

```bash
npm install
npm run dev        # web page at http://localhost:5173
npm test           # engine tests (fictional TradingView export in test/fixtures)
npm run report -- --tz America/Los_Angeles path/to/trades.csv   # same report in the terminal
npm run build      # static site in dist/, deployable anywhere (Netlify, Vercel, Cloudflare Pages)
```

## Layout

- `src/core/parsers/` turns CSV files into trades: the TradingView trade list (Bar Replay / Strategy Tester) and a generic broker fill list (matched into round trips FIFO).
- `src/core/parsers/index.ts` combines files, drops duplicates from overlapping exports, and merges partial fills.
- `src/core/analyze.ts` tags each trade (New York entry time, trade # of the day, what came before, hold time) and finds edges, leaks and weak spots. Small groups are shrunk toward the overall average so 3 lucky trades aren't called an edge.
- `src/web/` is the page: `main.ts` is the analyzer, `site/` the marketing page's motion system (gsap + Lenis, loaded after the analyzer; `sample.ts` runs the engine on the sample so every number on the page is computed, and `test/site.test.ts` fails the build if the typed HTML drifts from it).
- `public/sample-trades.csv` holds fictional fills for the "Try it with sample trades" button (`python scripts/make-sample.py` regenerates it).
- A fills export may carry optional `Worst %` / `Best %` columns on the closing fill (TradingView's `Adverse excursion %` is read automatically); they turn on the stop check.

## Waitlist signup

The signup box under the report is hidden until an email provider is set in `src/web/signup.ts` (Buttondown username or Kit form ID). Only the email address is sent.

## Deploy

Every push to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/deploy.yml`).

## Adding a broker

Write a parser that returns `Trade[]` (see `src/core/types.ts`), add its detection to `parseFile`, and add a fixture plus a test.
