# MyTradePilot website: final build spec

**Direction: "Same trades, sorted."** The real engine, running on the real (fictional, labelled) sample, is the hero and the spine of the page. Every set-piece is engine output drawn on canvas, so the animation is also the proof. Identity: **ink and ivory**, dark only, where the only chromatic colors on the page are the trader's own P&L. Three independent engineers each build the whole site from this document; it is prescriptive and complete. Where it says "exact", copy verbatim.

Repo: `/home/user/mytradepilot` (Vite 7, vanilla TypeScript, `base: './'`, deployed to GitHub Pages under a subpath). Libraries: GSAP 3.15 (installed: core, ScrollTrigger, SplitText), Lenis 1.3.26 (installed). No three.js. Google Fonts allowed.

### What was verified before writing (all in this repo, this session)

- `node src/cli.ts --tz America/New_York public/sample-trades.csv`: 112 closed trades, 45 days, 2026-03-02 → 2026-05-01, tickers HYDR, LUMN, NOVA, ORBX, QBIT, RKT. Win rate 61%, avg +0.33% (0.3333), median +0.44%, avg win +1.53%, avg loss −1.52%, total $3,238 (+37.3% summed), profit factor 1.45, max drawdown −$1,686, 0.17R at a 2% stop. 232 fill rows.
- Edges (all solid): 1st trade of the day 45 · 73% · +0.94%; entries 9:30–9:45 ET 46 · 72% · +0.88%; longs 79 · 65% · +0.52%. Leaks: 3rd trade of the day 26 · 42% · −0.81% → +58.5% instead of +37.3% (solid, $5,583 without them); shorts 33 · 52% · −0.11% → +41.0% (solid); quick re-entries within 10 min of a loss 13 · 38% · −0.83% → +48.1% (early signal). Top 5 trades = 65% of the total.
- Equity by exit time: trough −$774 at trade 43, peak $3,441 at trade 111, end $3,238. Top 5 by return: HYDR long Apr 14 +6.71% ($670), RKT long Mar 30 +5.03% ($502), LUMN long Mar 26 +4.78% ($476), LUMN long Apr 29 +4.17% ($416), LUMN long Apr 13 +3.64% ($363). Worst: ORBX long Mar 13 −5.12% (−$512). Returns range −5.12% … +6.71%; largest |P&L| $670.
- Shrinkage (engine formula `adj = (n·avg + 10·overall)/(n + 10)`): 9:45–10:15 ET 3 trades −1.17% → −0.01% (too few); held under 15 min 5 trades +1.07% → +0.58% (early signal); overnight 5 trades −2.55% → −0.63% (early signal); 1st trade of the day 45 trades +0.94% → +0.83% (solid); a hypothetical +4.00% group at n = 3 / 5 / 15 → +1.18% / +1.56% / +2.53%.
- Real trades used in copy: LUMN long 2026-03-03 09:31 ET, 6 fills, held overnight, −0.89%. ORBX short Thu 2026-04-09 11:15 ET: 3rd trade of the day, 3 min after a loss, −2.95%. LUMN long Thu 2026-03-05 09:42 ET: 1st trade of the day, +2.18%. Mar 4: RKT short 9:39 +2.64%, LUMN long 10:29 +1.67%, NOVA short 11:46 +2.23%.
- **Step 0 reproduced in a scratch copy** (section 0): first six CSV columns byte-identical, all 14 report lines unchanged, 8/8 tests pass, typecheck passes, CLI prints `RISK: 33 trades went past -2%; 7 came back green. With a hard 2% stop: +13.2% vs +37.3%.`; at 1.5% → 41 past, 11 back, +18.0%; at 3% → 15 past, 0 back, +35.5%; 79 trades never got within 2%; the 7 that came back made +16.25 points combined; the 26 that stayed red made −58.12; min worst point −6.46%.
- Parse + analyze of the sample: ~13 ms per run in Node. "Computed in milliseconds" is true.
- Gzipped vendor sizes from `node_modules`: gsap core 28.3 KB, ScrollTrigger 18.0 KB, SplitText 3.7 KB, Lenis 8.3 KB (58.3 KB total). Google Fonts latin woff2 sizes: Newsreader 400 + italic 63 + 57 KB, Schibsted Grotesk 400–600 one variable file 47 KB, DM Mono 400 + 500 8.7 + 8.7 KB (184 KB total).

### Decisions that resolve the judges' risks

| Risk raised | Decision in this spec |
|---|---|
| Stop check shown schematically, no numbers | **Step 0 adopted** (section 0): optional `Worst %`/`Best %` fill columns, regenerated sample. Story beat 4, hero lens 4, bento stop tile and the live `#stop` input all show real engine output. |
| Two GSAP pins below `#report` (refresh races) | **No pins anywhere.** Story = CSS `position: sticky` + one scrubbed ScrollTrigger on a fixed-height field. Honest math = one-shot sweep on enter, then the slider is manual. `ResizeObserver` on `#report` → debounced `ScrollTrigger.refresh()`. |
| Story sticky-vs-pin contradiction; five hand-built DOM frame layers | One dot-system module (`dots.ts`) with named layouts drives both the hero canvas and the story stage; overlays are static DOM. |
| Hero left column too tall at 1366×768 / 1280×720 | h1 capped at 76px with `max-width: 12ch`; works-with line moved into the help details; acceptance checked at 1280×720, 1366×768 and 1440×900. |
| Visual sameness (dark + Instrument Serif + Inter + JetBrains Mono + aurora) | Ink-and-ivory identity: Newsreader / Schibsted Grotesk / DM Mono, no chromatic accent (the UI is achromatic; green and red are the only colors and mean P&L), no aurora; stamps, highlighter, hatch and honest footnotes as the signature. |
| Honest-math copy drift vs `analyze.ts`; "0 requests" badge false at load | Rules worded exactly as the code (2.9, 3.4); badge reads "0 requests when you drop a file"; fine print lists every request the page makes. |
| Fiddly micro-techniques (`@property` counter, scrub-driven range input with user override, live motion toggle) | Bento loops are small GSAP timelines; honest-math sweep is a plain tween then manual; motion toggle: off = live teardown through each module's `destroy()`, on = reload (or "next load" when a report is on screen). |
| Budget lines optimistic | Budgets use the measured sizes above: motion vendor 58.3 KB gz, total JS ≤ 100 KB gz target / 110 hard cap; fonts 184 KB measured, cap 200 KB. |
| Hero auto-cycle fights the CTA | Intro + first sort, then at most one tour of the other three lenses (6 s holds), then rest on lens 1; paused while `#drop` has focus or `.over` or the pointer is over `#input`; stops on any interaction. |
| Lenis vs `main.ts`'s native `scrollIntoView` | `reportMotion.ts` calls `lenis.scrollTo(#report)` on the empty→filled mutation that follows a drop/pick/demo (after the native call, same task); native `scrollIntoView` wins in reduced motion (no Lenis). |
| Second signup form | `nav.ts` calls `setupSignup(#signup-roadmap)`; distinct ids and `.signup-msg`; a `signup:done` event marks the other form done. |
| `has-report` left on after `#report` is emptied | The MutationObserver clears `body.has-report` and hides `#report-followup` when `#report` has no children. |
| Count-ups parse rendered text (`$12.3k`, `-$1,686`) | Exact regex and formatter in 6.6; anything unparsed is left alone. |
| Mobile page length; `padding-bottom` on `body` toggling | One `#dock` component (desktop pill, mobile bar); `main` gets a fixed `padding-bottom` once at ≤ 767px. |
| Scope | Build order and cut list in section 11; everything cut ships as static HTML/SVG that is already in the page. |

---

## 0. Data prerequisite: the stop check needs worst-point data (Step 0, ~30 minutes, exact diff)

`public/sample-trades.csv` is a plain fill list, so `analyze()` returns `risk.hasExcursions = false` and the stop check is skipped for the sample. The page demos three verdicts; without this step it can only demo two. Apply this before any site work.

### 0.1 `src/core/parsers/fills.ts`

```diff
 const ALIASES: Record<string, string[]> = {
   ...
   fee: ['fee', 'fees', 'commission', 'comm'],
+  // Optional: worst and best unrealized move during the trade, in %, on the closing fill.
+  mae: ['worst %', 'mae %', 'mae', 'adverse excursion %', 'max adverse excursion %'],
+  mfe: ['best %', 'mfe %', 'mfe', 'favorable excursion %', 'max favorable excursion %'],
 };

 interface Fill {
   ...
   time: Date;
   rawTime: string;
+  mae: number | null;
+  mfe: number | null;
 }

 // in parseFillList, replacing the single fills.push line:
-    fills.push({ symbol: r[cols.symbol].trim().toUpperCase(), signedQty: side * qty, price, fee, time, rawTime: r[cols.time] });
+    const opt = (c: number) => (c >= 0 && Number.isFinite(toNumber(r[c])) ? toNumber(r[c]) : null);
+    const mae = opt(cols.mae);
+    const mfe = opt(cols.mfe);
+    fills.push({ symbol: r[cols.symbol].trim().toUpperCase(), signedQty: side * qty, price, fee, time, rawTime: r[cols.time], mae: mae === null ? null : -Math.abs(mae), mfe: mfe === null ? null : Math.abs(mfe) });

 interface OpenTrade {
   ...
   fees: number;
   fills: number;
+  mae: number | null;
+  mfe: number | null;
 }

 // in start():
     fees: fee,
     fills: 1,
+    mae: f.mae,
+    mfe: f.mfe,
   });

 // in finish():
-      mfePct: null,
-      maePct: null,
+      mfePct: t.mfe,
+      maePct: t.mae,

 // in buildTrades, right after `const sameWay = ...`:
+    const note = (c: OpenTrade, x: Fill) => {
+      if (x.mae !== null) c.mae = c.mae === null ? x.mae : Math.min(c.mae, x.mae);
+      if (x.mfe !== null) c.mfe = c.mfe === null ? x.mfe : Math.max(c.mfe, x.mfe);
+    };
+    note(cur, f);
```

`findColumns` is unchanged: `required` stays `symbol, side, qty, price, time`, so the two new keys are optional and every existing fill list still parses.

### 0.2 `scripts/make-sample.py`

Add `exc = random.Random(11)` on the line after `random.seed(7)` (a separate RNG, so the trade stream's draw order is untouched). Replace the two `rows.append(...)` lines with:

```python
        if ret > 0:
            worst = -abs(exc.gauss(0.7, 0.5)) if exc.random() > 0.12 else -abs(exc.gauss(2.4, 0.4))
            best = ret + abs(exc.gauss(0.4, 0.4))
        else:
            worst = ret - abs(exc.gauss(0.6, 0.5))
            best = abs(exc.gauss(0.3, 0.35)) if exc.random() < 0.6 else 0.0
        worst = min(worst, 0.0)
        rows.append([sym, 'Buy' if side > 0 else 'Sell short', qty, price, t.strftime('%Y-%m-%d %H:%M:%S'), 1.0, '', ''])
        rows.append([sym, 'Sell' if side > 0 else 'Buy to cover', qty, exit_price, exit_t.strftime('%Y-%m-%d %H:%M:%S'), 1.0, f'{worst:.2f}', f'{best:.2f}'])
```

Header row becomes `['Symbol', 'Side', 'Qty', 'Price', 'Time', 'Commission', 'Worst %', 'Best %']`. Extend the docstring with "Losers run well past a 2% stop; a few winners dip past it and come back." Keep the evaluation order exactly as written (the condition's `exc.random()` is drawn before the branch's `gauss`). Run `python3 scripts/make-sample.py` from the repo root.

### 0.3 Tests and docs

- `test/engine.test.ts`: add `test('fills: optional Worst %/Best % columns become maePct/mfePct and turn on the stop check')`: a 2-row CSV with header `Symbol,Side,Qty,Price,Time,Commission,Worst %,Best %`, `ABC,Buy,100,10,2026-03-02 09:35,1,,` and `ABC,Sell,100,11,2026-03-02 10:00,1,-3.1,12`; assert `maePct === -3.1`, `mfePct === 12`, and `analyze(trades, { stopPct: 2 }).risk.hasExcursions === true`.
- `README.md`: one line under Layout: "A fills export may carry optional `Worst %` / `Best %` columns on the closing fill (TradingView's `Adverse excursion %` is read automatically); they turn on the stop check."
- Hero help details gets a third bullet (3.2).

### 0.4 Acceptance for Step 0

`diff <(cut -d, -f1-6 public/sample-trades.csv) <(git show HEAD:public/sample-trades.csv | cut -d, -f1-6)` is empty; `node src/cli.ts --tz America/New_York public/sample-trades.csv` prints the same first 14 lines as before plus `RISK: 33 trades went past -2%; 7 came back green. With a hard 2% stop: +13.2% vs +37.3%.`; `--stop 1.5` → `+18.0%`, `--stop 3` → `+35.5%`; `npm test` 9/9; `npm run typecheck` clean. If any of these fail, stop and fix Step 0 before touching the site; do not type numbers that the CLI does not print.

---

## 1. Positioning, headline, subhead, CTAs

**Positioning line** (`<meta name="description">`, OG description, footer): "MyTradePilot is a free trade analyzer that runs entirely in your browser: drop in a TradingView or broker export and see where you make money, where you give it back, and what your stop is doing. Step one of the pre-trade check that keeps you inside your edge."

**`<title>`**: `MyTradePilot: free trade analyzer that finds your edge, in your browser`

**Hero headline (final, exact):** `Your edge is <em class="hl">already</em> in your trade log.` The italic word carries the highlighter swipe (2.7). Alternatives, for a later A/B only, not for this build: "Find out which of your trades actually make money." / "Drop your trades in. Get your edges, your leaks and your stop's verdict out."

**Eyebrow** (mono, uppercase): `FREE TRADE ANALYZER · 100% IN YOUR BROWSER`

**Subhead** (exact): "Drop in a TradingView or broker export. In seconds you'll see where you make money, where you give it back, and what your stop is doing. Free, no account, and your trades never leave this tab."

**CTA labels (exact):**

| Where | Label | Action |
|---|---|---|
| Hero, desktop primary | The drop zone itself: strong "Drop your CSV here", span "or click to choose. Several files at once are fine; duplicates removed, partial fills merged." | `#drop` is the `<label for="files">`: click opens the OS picker, drop loads files (`main.ts`, unchanged). |
| Hero, desktop secondary | "See the sample report" | `#demo` (unchanged handler). |
| Hero, mobile ≤ 767px primary | "See the sample report" (56px, full width, `#demo`) | |
| Hero, mobile secondary | `#drop` restyled as a 56px full-width secondary button reading "Choose my CSV files" | same label element; see 3.2 |
| Repeated analyzer CTA (story end, export, final band, dock) | "Analyze my trades" `data-action="pick"` | `files.click()` inside the click handler (user gesture), then scroll to `#input` (Lenis or native), then focus `#drop`. |
| Repeated sample CTA | "See the sample report" `data-action="demo"` | `document.getElementById('demo').click()` |
| Waitlist, nav | "Join the waitlist" (secondary) `data-action="waitlist"` | scroll to `#signup-roadmap`, focus `#signup-email-2` |
| Waitlist, contextual (under a rendered report) | button "Join the waitlist" (the existing `#signup` form) | `signup.ts`, unchanged |
| Waitlist, roadmap | button "Get early access" (`#signup-roadmap` form) | `signup.ts` via a second `setupSignup` call |

Conversion logic (read before building): the page answers a skeptical trader's objections in this order, and every section exists for one of them.

| # | Objection | Answered by | Proof (all true) |
|---|---|---|---|
| 1 | "Worth 30 seconds?" | Hero canvas: the same 112 trades sort themselves, edge and leak separate | live engine output |
| 2 | "Scam / funnel?" | Hero trust row; no account; nav has no sign-up wall; GitHub link | verifiable |
| 3 | "What do I get?" | Story: the sample report builds itself, six beats | real numbers, labelled fictional |
| 4 | "Cherry-picked small samples?" | Honest math: the real shrinkage rule, interactive | the formula from `analyze.ts` |
| 5 | "Is it for my market / what else?" | Bento of every breakdown | real feature list |
| 6 | "Will my trades leak?" | Privacy wire, "0 requests when you drop a file", DevTools check | verifiable |
| 7 | "I don't know how to export" | Export how-to tabs | exact menu paths |
| 8 | "Why free, what's the catch?" | Roadmap: the analyzer is step one; the paid app is what the waitlist is for | honest funnel |
| 9 | Everything else | FAQ | |

CTA map: conversion 1 (run the analyzer) is offered above the fold (drop zone + sample button), at the story end, at the export end, in the final band and in the dock. Conversion 2 (waitlist) is offered three times and never before value: quiet nav link, contextual form under a rendered report, roadmap section (the main ask).

---

## 2. Visual system

### 2.1 Theme decision: dark only, "ink and ivory"

Dark only, one scope. Reasons: a trader's reference environment is a dark terminal; the canvas set-pieces are tuned once; one palette means one contrast audit for a single-session build. What makes it not the dark-fintech template: the surface is warm ink (not blue-black), the type is a newspaper trio (Newsreader, Schibsted Grotesk, DM Mono), **there is no chromatic accent**. Links, focus rings, buttons, stamps, the roadmap line and the privacy pulse are ivory. Green and red are the only colors on the page, and they always mean P&L. Weak spots and "too few" are graphite + hatch, never amber. No aurora, no glow blobs: the only texture is ruled lines inside the instrument panels.

`color-scheme: dark` on `:root`. The light tokens and both dark blocks in `style.css` are deleted; the `data-theme` attribute is no longer used.

### 2.2 Palette tokens (exact; contrast computed against `--bg`)

```css
:root {
  color-scheme: dark;
  /* surfaces: warm ink */
  --bg: #0E0D0B;
  --bg-2: #131210;             /* alternate band */
  --surface: #181714;          /* panels, cards, report panels */
  --surface-2: #1F1D19;        /* instrument panels (hero field, story stage), inputs */
  --surface-3: #262420;        /* hover */
  --line: #2A2823;
  --line-strong: #3B3831;
  --rule: rgba(242, 238, 228, 0.06);   /* ruled lines inside panels */
  /* ivory text */
  --text: #F2EEE4;             /* 16.8:1 */
  --text-2: #CFC9BB;           /* 11.2:1 */
  --muted: #938C7C;            /* 5.8:1, AA for body */
  --muted-2: #655F53;          /* decorative only: faded rows, hatch lines */
  /* the "accent" is ivory. Aliases the report CSS already uses. */
  --accent: var(--text);
  --accent-ink: var(--bg);
  --on-accent: var(--bg);
  --accent-soft: rgba(242, 238, 228, 0.08);
  --marker: rgba(242, 238, 228, 0.22);  /* highlighter swipe */
  --focus: #F2EEE4;
  /* P&L only. Green = made money, red = lost money. Nowhere else. */
  --pos: #3FD38A;              /* 10.1:1 */
  --pos-mark: #2EBF77;         /* canvas/SVG marks */
  --pos-soft: rgba(63, 211, 138, 0.12);
  --neg: #FF6B61;              /* 7.0:1 */
  --neg-mark: #E5534B;
  --neg-soft: rgba(255, 107, 97, 0.12);
  /* weak spots, "early signal", the <30-trades banner: graphite + hatch, not amber */
  --weak: #A39B85;             /* 7.0:1 */
  --weak-soft: rgba(163, 155, 133, 0.10);
  --hatch: repeating-linear-gradient(135deg, rgba(242, 238, 228, 0.10) 0 1px, transparent 1px 6px);
  /* type */
  --font-display: 'Newsreader', Georgia, 'Times New Roman', serif;
  --font-body: 'Schibsted Grotesk', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'DM Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --fs-hero: clamp(2.625rem, 1rem + 4.2vw, 4.75rem);   /* 42 → 76 */
  --fs-h2: clamp(2rem, 1.1rem + 3.2vw, 3.25rem);        /* 32 → 52 */
  --fs-h3: clamp(1.375rem, 1.1rem + 1vw, 1.75rem);      /* 22 → 28 */
  --fs-lede: clamp(1.0625rem, 1rem + 0.4vw, 1.25rem);   /* 17 → 20 */
  --fs-body: 1.0625rem;                                  /* 17 */
  --fs-small: 0.875rem;                                  /* 14 */
  --fs-micro: 0.75rem;                                   /* 12, mono labels */
  --fs-stat: clamp(1.75rem, 1.2rem + 2vw, 2.5rem);      /* 28 → 40 */
  --fs-num-xl: clamp(2.5rem, 1.5rem + 4vw, 4.5rem);     /* the +37.3% → +58.5% number */
  --lh-tight: 0.98; --lh-head: 1.08; --lh-body: 1.55;
  /* spacing, 4px base */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px; --s-6: 32px;
  --s-7: 48px; --s-8: 64px; --s-9: 96px; --s-10: 128px;
  --section: clamp(72px, 10vw, 128px);
  --container: 1200px; --container-narrow: 1040px;
  --gutter: 16px; --nav-h: 64px;
  /* radius */
  --r-s: 6px; --r-m: 10px; --r-l: 16px; --r-pill: 999px;
  /* motion */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-inout: cubic-bezier(0.65, 0, 0.35, 1);
  --t-fast: 160ms; --t-base: 320ms; --t-slow: 640ms;
  /* legacy name used by style.css */
  --radius: var(--r-m);
}
@media (min-width: 768px) { :root { --gutter: 24px; --nav-h: 64px; } }
@media (min-width: 1200px) { :root { --gutter: 40px; } }
@media (max-width: 767px) { :root { --nav-h: 56px; } }
```

Color rules (checked in acceptance 17): `--pos`/`--neg` (and `-mark`, `-soft`) appear only on P&L values, P&L bars, trade dots, the EDGE/LEAK tags, edge/leak cards and the pre-check verdict stamps. Everything interactive is ivory on ink. Confidence stamps: `solid` = solid 1.5px ivory border; `early signal` = dashed 1.5px `--text-2` border; `too few` = `--hatch` background + `--muted` text. Weak spot tag and card: `--weak` text, `--weak-soft` + hatch background. The `<30 trades` `.banner`: hatch background, ivory text.

### 2.3 Typography (Google Fonts, one request; sizes measured)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Schibsted+Grotesk:wght@400;500;600&display=swap" rel="stylesheet">
```

| Role | Family | Use |
|---|---|---|
| Display: h1, h2, story h3, the big number, pull lines | Newsreader 400 (variable opsz 6–72; `font-optical-sizing: auto`) | `letter-spacing: -0.015em` at ≥ 40px; `text-wrap: balance`. Line heights: hero 0.98, h2 1.08, h3 1.2. |
| Italic | Newsreader italic 400 | Exactly one emphasised word per headline (`<em class="hl">`) and the honest footnotes (2.8). No other italics. |
| Body, UI, buttons, nav, captions | Schibsted Grotesk 400 / 500 / 600 | 17px / 1.55 body; 500 for labels and nav; 600 for buttons and h4-level titles. |
| Every number that carries data, eyebrows, stamps, CSV rows, chips, table cells, the formula | DM Mono 400 / 500 | `font-variant-numeric: tabular-nums` everywhere. Eyebrows: 12px, uppercase, `letter-spacing: 0.08em`, `--muted`. Marketing copy uses U+2212 (−) for minus; the analyzer's own report keeps what `format.ts` prints. |

Fallback metrics so the swap does not shift the hero: two `@font-face` blocks `Newsreader-fallback { src: local('Georgia'); size-adjust: 103%; ascent-override: 92%; descent-override: 24%; }` and `Schibsted-fallback { src: local('Arial'); size-adjust: 98%; }`, placed before the real family in each stack. Measured transfer: 184 KB latin; cap 200 KB (acceptance 19).

### 2.4 Layout, spacing, radius, elevation

Container 1200px (`--container-narrow` 1040px for FAQ and story intro), gutters 16 / 24 / 40px. 12-column grid at ≥ 1024px, 24px gap. Section padding `--section` top and bottom; every section opens with a `.section-head`: mono eyebrow, serif h2, lede in `--text-2` (max 60ch). No box shadows (ink has none); elevation is a 1px `--line` border and a surface step. Instrument panels (`#field-wrap`, `#story-stage`, `#honest-diagram`, bento figures) use `--surface-2`, radius `--r-l`, and horizontal ruled lines every 32px in `--rule` (24px on phones) as a background image; the zero line is `--line-strong`.

### 2.5 Components (exact CSS behavior)

- `.btn`: 48px tall (56px for `.btn-lg` and all mobile primaries), padding 0 20px, radius `--r-m`, Schibsted 600 16px, `transition: background var(--t-fast), transform var(--t-fast)`. `.btn-primary`: ivory fill (`--text`) with ink text (`--bg`); hover `#FFFFFF`; the arrow glyph `→` inside shifts 4px right on hover. `.btn-secondary`: transparent, 1px `--line-strong`, ivory text; hover `--surface-3`. `.btn-tonal`: `--accent-soft` fill, ivory text, 1px `--line` (used for `#demo` in the hero). Focus: `outline: 2px solid var(--focus); outline-offset: 3px` under `:focus-visible` on every interactive element, always visible.
- `.drop` (`#drop`): dashed 2px `--line-strong`, radius `--r-l`, `--surface-2`, 148px tall on desktop, content centered: an inline SVG CSV glyph (24×28, 1.5px ivory stroke, three ruled lines), strong (Newsreader 26px) "Drop your CSV here", span (`--muted`, 14px). `.drop:hover, .drop.over`: border ivory, background `--accent-soft`, glyph lifts 4px (transform only; no transform in reduced motion).
- `.stamp`: DM Mono 500 11px uppercase, `letter-spacing: 0.08em`, 1.5px border, radius 3px, padding 3px 7px, `rotate(-1.5deg)`, inline-flex. Variants by `data-stamp`: `solid` (ivory border), `early` (dashed `--text-2`), `few` (hatch bg, `--muted` text, `--line-strong` border), `edge` (`--pos` text and border), `leak` (`--neg`), `weak` (`--weak`), `go` (`--pos` on `--pos-soft`), `nogo` (`--neg` on `--neg-soft`), `note` (ivory on `--surface-3`, no rotation). The report's `.tag` and `.conf` are restyled as stamps (same markup; `.conf-too-few` → few, `.conf-early-signal` → early, `.conf-solid` → solid).
- `.hl` (highlighter): `background-image: linear-gradient(var(--marker), var(--marker)); background-repeat: no-repeat; background-size: 0% 0.55em; background-position: 0 78%; padding: 0 0.04em;`. The swipe animates `background-size` to `100% 0.55em` (row 4 in section 4). Reduced motion and no-JS: `100%` from CSS.
- `.footnote`: Newsreader italic 400, 19px, `--text-2`, `max-width: 56ch`, preceded by a 24px ivory rule. One per section (2.8).
- `.card`: `--surface`, 1px `--line`, radius `--r-m`, padding 20px. `.card.edge` has a 3px left border `--pos` and `--pos-soft` background; `.card.leak` the same in `--neg`; `.card.weak` in `--weak` with the hatch.
- `.chip` (lens chips, example chips): 36px pill, 1px `--line-strong`, mono 13px; `[aria-pressed=true]` ivory fill, ink text.
- `.eyebrow`, `.lede`, `.muted`, `.num` (DM Mono tabular), `.sr-only` as expected.
- Report restyle (markup from `main.ts` untouched): `.stats .stat` → `--surface` tiles, values DM Mono `--fs-stat`; `.insight.edge/.leak/.weak` → `.card` rules above (classes stay, CSS maps them); `.conf` → stamp; `tr.few` stays at opacity 0.5 and gets the hatch on the row background; bars keep `currentColor` so `.pos/.neg` carry meaning; `.banner` → hatch; `.dim table` keeps its horizontal scroll.

### 2.6 Logo

`◆ MyTradePilot`: the diamond is an inline SVG (14×14, ivory fill) with `aria-hidden`, wordmark Schibsted 600 18px, `letter-spacing: -0.01em`. The nav's left link points to `#top`.

### 2.7 Motion personality: "an instrument, not a show"

1. Everything arrives in reading order and moves on one axis: up by 12–24px, or draws left to right. Nothing scales from zero except stamps.
2. No bounce. The single allowed overshoot is the stamp press (`scale 1.35 → 1, rotate −6° → −1.5°, 260ms, power4.out`).
3. Rules and axes draw before content arrives: tick, then text.
4. Numbers never fade in: they count (`power2.out`), or they are already there.
5. Scrub only the set-pieces (hero exit, story stage, roadmap line). Reveal-once everything else (`once: true`).
6. Durations: micro 160ms, base 320–480ms, reveal 640–900ms, draw 900–2200ms. Stagger 60ms per line, 40ms per card, 8–18ms per dot.
7. Color is never animated, except the highlighter swipe. A dot never transitions between green and red; it is one or the other.
8. Eases: `power4.out` reveals, `power3.inOut` morphs, `power2.out` counters, `none` for scrubbed draws. `gsap.defaults({ ease: 'power4.out', duration: 0.64 })`.
9. Loops run only while visible and only in: the hero lens tour, the bento tiles, the privacy pulse, the pre-check sequence. Nothing loops forever: the hero tour ends; bento loops pause off-screen.

### 2.8 Honest footnotes (exact, one per section)

| Section | Footnote |
|---|---|
| Hero (under the field caption) | A fictional trader. The patterns are real because the engine found them, not because we drew them. |
| Story (under the beats) | Hold time is shown but never mined: winners get held longer because they are winning. |
| Story beat 4 (inside the caption) | A tighter stop is not automatically better. The check reports what yours did, not what a rule says. |
| Honest math | Shrinkage makes the report quieter than your spreadsheet. That is the point. |
| Bento | Ticker and weekday are shown but never mined: too easy to fool yourself. |
| Privacy | There is no upload button because there is nothing to upload to. |
| Export | If the page can't read a file it says so and lists what it expected. Nothing is sent either way. |
| Roadmap | No launch date is promised. You'll hear from us when there is something to try. |

### 2.9 Wording that must mirror `analyze.ts` (use these sentences wherever the rule is explained)

- "Every group's average is shrunk toward your overall average: adjusted = (n × group average + 10 × overall average) ÷ (n + 10). Ten phantom average trades are mixed into every group."
- "Under 5 trades: too few. Faded in every table, never called an edge or a leak. 5 to 14: early signal. 15 or more: solid."
- "An edge needs its shrunk average above your overall average, a positive plain average, and a plain average at least half again above your overall (your average plus half of it)."
- "A leak is a group that loses money: its plain average is negative. A weak spot is profitable but averages under half of your overall average."
- "Hold time, weekday and ticker are shown but never mined for edges or leaks."
- "Fewer than 30 trades in total? The whole report is labelled an early signal."
- "The same trades under two names count once: your 1st trade of the day is also your first trade each day."

---

## 3. Page structure (section order is final)

| # | id | Section | Conversion role |
|---|---|---|---|
| 0 | `#skip`, `#nav` | Skip link, sticky nav | orientation; quiet waitlist link |
| 1 | `#hero` (contains `#input`, `#status`) | Headline, analyzer panel, trust row, the field | conversion 1 above the fold |
| 2 | `#results` (contains `#report-bar`, `#report`, `#report-followup` → `#signup`) | Where the report lands; contextual waitlist | conversion 2 at maximum belief |
| 3 | `#story` | "Your report, built in front of you": six scrubbed beats, then `#story-end` | conversion 1 |
| 4 | `#honest` | "Three lucky trades are not an edge": interactive shrinkage | believability |
| 5 | `#bento` | "Everything the report tells you": 8 tiles | breadth |
| 6 | `#privacy` | "Nowhere. That's the point.": wire + checklist | removes the biggest objection to dropping a real file |
| 7 | `#export` | "Your export takes about a minute": tabs | friction removal for conversion 1 |
| 8 | `#roadmap` (contains `#precheck`, `#signup-roadmap`) | Stepper, pre-trade check preview, the main waitlist ask | conversion 2 |
| 9 | `#faq` | 11 questions | last doubts |
| 10 | `#final` | "Your trade log is ready when you are." | conversion 1 |
| 11 | `footer` | Disclaimer, links, motion toggle | |
| — | `#dock` | Persistent CTA (desktop pill / mobile bar) | conversion 1 one click away |

Desktop = ≥ 1024px unless noted. "375px" describes the phone layout (section 9 has the full mobile plan).

### 3.0 Skip link and nav

`<a id="skip" class="sr-only-focusable" href="#drop">Skip to analyzer</a>` is the first focusable element.

`#nav`: sticky top, `--nav-h` tall, transparent until scrolled 40px, then `.is-stuck` adds `--surface` at 80% + `backdrop-filter: blur(12px)` + 1px `--line` bottom. Left: logo (2.6). Center (desktop only): links "What you get" (`#story`), "Honest math" (`#honest`), "Privacy" (`#privacy`), "Roadmap" (`#roadmap`), "FAQ" (`#faq`), Schibsted 500 14px `--text-2`, hover ivory with a 1px underline. Right: a muted icon link "Engine on GitHub" (`https://github.com/CezarAster/mytradepilot`, `rel="noopener"`, GitHub mark 18px inline SVG with `aria-label`) and `.btn-secondary` 40px "Join the waitlist" `data-action="waitlist"`.

375px: logo left; right: 36px `.btn-secondary` "Waitlist". No hamburger; section links live in the footer.

### 3.1 Hero `#hero`

Layout desktop: `.container` grid `minmax(0, 7fr) minmax(0, 5fr)`, gap 48px, `min-height: calc(100svh - var(--nav-h))`, `padding-top: 40px`, items vertically centered. Left column = `.hero-copy`; right column = `.hero-field`.

Left column, in order (exact copy):

1. `<p class="eyebrow">FREE TRADE ANALYZER · 100% IN YOUR BROWSER</p>`
2. `<h1 id="hero-h1" data-reveal="lines">Your edge is <em class="hl">already</em> in your trade log.</h1>` with `max-width: 12ch`. Must render on exactly two lines at 1280, 1366 and 1440 wide (acceptance 1).
3. `<p class="lede" data-reveal="up">Drop in a TradingView or broker export. In seconds you'll see where you make money, where you give it back, and what your stop is doing. Free, no account, and your trades never leave this tab.</p>`
4. The analyzer panel, existing markup with ids unchanged, now `<section class="panel" id="input">`:
   ```html
   <label class="drop" id="drop">
     <input type="file" id="files" accept=".csv,text/csv" multiple hidden />
     <svg class="drop-glyph" aria-hidden="true">…</svg>
     <strong><span class="drop-desktop">Drop your CSV here</span><span class="drop-mobile">Choose my CSV files</span></strong>
     <span class="drop-sub">or click to choose. Several files at once are fine; duplicates removed, partial fills merged.</span>
   </label>
   <div class="cta-row">
     <button type="button" id="demo" class="btn btn-tonal">See the sample report</button>
     <details class="options" id="options">
       <summary>Options</summary>
       <div class="options-grid">
         <label>Time zone of your export <select id="tz"></select></label>
         <label>Your usual stop (%) <input type="number" id="stop" value="2" min="0.1" max="50" step="0.1" /></label>
       </div>
     </details>
   </div>
   <details class="help">
     <summary>Which files work?</summary>
     <ul>
       <li><b>TradingView</b>: Bar Replay or Strategy Tester → List of trades → Export (CSV). Pick your chart's time zone under Options.</li>
       <li><b>Any broker</b>: an executions or fills export with columns for symbol, side, quantity, price and time. Fills are matched into round-trip trades automatically.</li>
       <li><b>Stop check</b>: runs when the export carries each trade's worst point. TradingView's does; a fills export can add a <code>Worst %</code> column on the closing fill.</li>
     </ul>
   </details>
   <p id="status" class="status" role="status"></p>
   ```
   `#demo` loses its old `class="link"` and becomes `.btn.btn-tonal` (48px). `#tz` and `#stop` live inside `<details id="options">`, closed by default; they exist in the DOM at load so `main.ts` binds unchanged. `.drop-mobile` is `display: none` on ≥ 768px; `.drop-desktop` and `.drop-sub` are hidden on ≤ 767px (section 9).
5. Trust row `<ul class="trust">`, 4 items, mono 12px uppercase, each with a 14px ivory check glyph: "Free, no account" · "Runs 100% in your browser" · "Trades never uploaded" · "Open methodology" (this item is a link to the GitHub repo).

Right column: the hero set-piece (section 5):

```html
<figure class="hero-field" id="field-wrap">
  <figcaption id="field-caption">
    <p class="eyebrow">FICTIONAL SAMPLE · 112 TRADES · COMPUTED LIVE BY THE ENGINE ON THIS PAGE</p>
    <h3 data-caption-title>Same 112 trades. Sorted by trade number of the day.</h3>
    <p class="muted" data-caption-line>1st trade of the day: +0.94% a trade (45 trades) · 3rd trade: −0.81% (26 trades)</p>
  </figcaption>
  <div class="field-stage">
    <canvas id="field" aria-hidden="true"></canvas>
    <div id="field-labels" aria-hidden="true"></div>
    <div id="field-tip" role="tooltip" hidden></div>
    <p id="field-sr" class="sr-only">Sorted by trade number of the day: 1st trade of the day +0.94% a trade over 45 trades; 3rd trade −0.81% over 26 trades.</p>
    <noscript><p class="muted">Turn on JavaScript to see the sample sorted live.</p></noscript>
  </div>
  <div id="field-lenses" role="group" aria-label="Sort the sample by">
    <button class="chip" data-lens="tradeOfDay" aria-pressed="true">Trade # of the day</button>
    <button class="chip" data-lens="time" aria-pressed="false">Entry time (NY)</button>
    <button class="chip" data-lens="afterPrev" aria-pressed="false">What came before</button>
    <button class="chip" data-lens="stop" aria-pressed="false">Your stop</button>
  </div>
  <p class="footnote">A fictional trader. The patterns are real because the engine found them, not because we drew them.</p>
</figure>
```

Lens captions (title / line; every number bound with `data-sample`, 7.3):

| lens | title | line |
|---|---|---|
| tradeOfDay | Same 112 trades. Sorted by trade number of the day. | 1st trade of the day: +0.94% a trade (45 trades) · 3rd trade: −0.81% (26 trades) |
| time | Same 112 trades. Sorted by entry time, New York. | 9:30–9:45 ET: +0.88% a trade (46 trades) · 2:00–4:00: −0.62% (9 trades) |
| afterPrev | Same 112 trades. Sorted by what came before. | First of the day: +0.94% (45 trades) · Within 10 min of a loss: −0.83% (13 trades) |
| stop | Same 112 trades. By worst point during the trade. | 33 went past −2% · 7 came back green · a hard 2% stop: +13.2% instead of +37.3% |

The caption block ships with the tradeOfDay text; `heroField.ts` swaps it per lens using the bound values.

Scroll cue, bottom center of the hero (desktop only): `<a class="scroll-cue" href="#story">WHAT YOU'LL SEE ↓</a>`, mono 12px.

375px order: eyebrow, h1 (42px), lede (17px), `#demo` as `.btn-primary.btn-lg` full width, `#drop` restyled as a 56px full-width `.btn-secondary` reading "Choose my CSV files" (glyph hidden, `.drop-sub` hidden; still the `<label for="files">` so a tap opens the files app), Options details, trust row as a 2×2 grid, "Which files work?" details, `#status`, then the field as a 240px-tall band with caption and chips, then the footnote. The sample button is within the first 600px.

### 3.2 Results `#results`

```html
<section id="results" aria-label="Your report">
  <div class="container-narrow">
    <div id="report-bar" class="report-bar" hidden><span data-report-label>Your report · computed in this tab · nothing uploaded</span><a href="#top" data-scroll-to="#top">Back to top ↑</a></div>
    <div id="report"></div>
    <div id="report-followup" hidden>
      <div class="followup-copy">
        <p class="eyebrow">NEXT STEP</p>
        <h2>That's your report. The full app uses it <em class="hl">before</em> you trade.</h2>
        <p>MyTradePilot is building the rest: a journal that keeps this report current, a pre-trade check that tells you if a setup matches where you make money, live alerts for your best setups, and an AI review of your week. Join the waitlist for early access and founding-member pricing.</p>
        <a href="#drop" data-scroll-to="#drop" class="link">Analyze another file ↑</a>
      </div>
      <section class="panel signup" id="signup" hidden>
        <form novalidate>
          <label for="signup-email" class="sr-only">Email address</label>
          <input type="email" id="signup-email" required autocomplete="email" placeholder="you@example.com" />
          <button type="submit" class="btn btn-primary">Join the waitlist</button>
        </form>
        <p class="signup-msg" role="status"></p>
        <p class="muted small">We only get your email address, never your trades. Unsubscribe anytime.</p>
      </section>
    </div>
  </div>
</section>
```

`#report` keeps `scroll-margin-top: calc(var(--nav-h) + 16px)`. `#results:has(#report:empty) { padding: 0 }` so the section is zero-height until a report exists; `#report` itself is never `display: none` (so `scrollIntoView` from `main.ts` always has a target). `body.has-report` (set by `reportMotion.ts`) shows `#report-bar` and `#report-followup` (2-column 7/5 at desktop, stacked on phones). `#report-bar` text: "Your report · computed in this tab · nothing uploaded", or "Sample report · 112 fictional trades generated to show what the analyzer finds · computed in this tab" when the last trigger was `#demo` (7.4). The existing `#signup` h2/p are removed from the section (the copy now lives in `.followup-copy`); `setupSignup` only needs `form`, `input[type=email]`, `button`, `.signup-msg`.

### 3.3 Story `#story` (signature set-piece A, 6.1)

Intro block (`.container-narrow`, unpinned): eyebrow `WHAT YOU'LL SEE`; h2 `Your report, built in front of you.`; lede "This is the sample report: 112 fictional trades over 45 days. Every number below is computed by the engine on this page from the same file the sample button loads, not typed into a mockup."

Then `.story-field` (height `700svh` at ≥ 1024px: 600svh of scroll plus the sticky stage's own viewport) containing `.story-sticky` (`position: sticky; top: var(--nav-h); height: calc(100svh - var(--nav-h))`), a 2-column grid 5/7 with 48px gap: left `#story-rail` (the six captions, absolutely stacked, cross-fading; a 2px vertical progress line with six dots `.rail-dot[data-beat]`, clickable), right `#story-stage` (instrument panel, `--surface-2`, radius `--r-l`, ruled background, aspect 4/3, max 720px; contains `<canvas id="stage">`, six `.overlay[data-beat]` DOM layers absolutely positioned over the canvas's right/bottom margins, and a header strip `Sample trades (fills).csv · 232 rows · fictional`).

Beat captions (`.beat[data-beat]`: eyebrow mono + h3 Newsreader 28px + p 17px + optional chips). Exact copy:

- **Beat 0** eyebrow `00 / DROP` · h3 `One file. Any broker.` · p "Drop a TradingView trade list or your broker's fills export. Several at once is fine: duplicates are dropped, partial fills merged. Nothing is uploaded; this tab does all the work." · Overlay: `<pre id="story-csv">` (the first 8 rows of `public/sample-trades.csv` typed in; `sample.ts` replaces them with the first 24 real lines once loaded), then the counter chip `232 fills → 112 trades`, then the chip `LUMN · 6 fills → 1 trade · held overnight · −0.89%` attached by a leader line to the LUMN 2026-03-03 dot.
- **Beat 1** eyebrow `01 / THE PART EVERY JOURNAL SHOWS YOU` · h3 `112 trades. 45 days. $3,238.` · p "61% winners, a 1.45 profit factor and a −$1,686 drawdown along the way. Useful. Not the point." · Overlay: six stat tiles (label / mono value / note): Trades `112` (45 days · 6 tickers) · Win rate `61%` · Avg per trade `+0.33%` (0.17R at a 2% stop) · Avg win `+1.53%` (avg loss −1.52%) · Total P&L `$3,238` (profit factor 1.45) · Max drawdown `−$1,686`.
- **Beat 2** eyebrow `02 / WHERE YOU MAKE MONEY` · h3 `Three edges, all solid.` · p "Three groups beat this trader's +0.33% average after shrinking toward it, with enough trades to count: the first trade of the day, the 9:30–9:45 window, and longs." · Overlay: three `.card.edge` with stamp `EDGE` and the confidence stamp: "Your 1st trade of the day: 45 trades, 73% win, +0.94% a trade vs +0.33% overall." `SOLID` · "Entries 9:30–9:45 ET: 46 trades, 72% win, +0.88% a trade vs +0.33% overall." `SOLID` · "Your longs: 79 trades, 65% win, +0.52% a trade vs +0.33% overall." `SOLID`.
- **Beat 3** eyebrow `03 / WHERE YOU GIVE IT BACK` · h3 `The third trade of the day.` · p "Third trades lost $2,346 across 26 trades. Skip them and +37.3% becomes +58.5%. Shorts: slightly under water. Quick re-entries within ten minutes of a loss: −0.83% a trade, an early signal." · Overlay: the big number `<span class="num-xl">+37.3%</span> → <span class="num-xl" data-count-from="37.3" data-count="58.5" data-format="pct1">+58.5%</span>` captioned "sum of trade % without your 3rd trade of the day", then three `.card.leak` with stamp `LEAK`: "Your 3rd trade of the day: 26 trades, 42% win, −0.81% a trade vs +0.33% overall. Skipping them would have made your total +58.5% instead of +37.3% (sum of trade %)." `SOLID` · "Your shorts: 33 trades, 52% win, −0.11% a trade vs +0.33% overall. Skipping them would have made your total +41.0% instead of +37.3% (sum of trade %)." `SOLID` · "Quick re-entries within 10 min of a loss: 13 trades, 38% win, −0.83% a trade vs +0.33% overall. Skipping them would have made your total +48.1% instead of +37.3% (sum of trade %)." `EARLY SIGNAL`.
- **Beat 4** eyebrow `04 / WHAT YOUR STOP IS DOING` · h3 `Is it the stop? No.` · p "33 trades went more than 2% against this trader. 7 came back green. Closing every one at −2% would have made +13.2% instead of +37.3%: a hard stop would have cost 24 points. The stop isn't the leak. The third trade is." · footnote (2.8) · Overlay legend: `● Never got near it · 79` (`--muted` dot) · `○ Went past it, came back green · 7` (`--pos` ring) · `● Went past it, stayed red · 26` (`--neg` dot) · readout `Total with a hard 2% stop: +13.2%` (counter from +37.3).
- **Beat 5** eyebrow `05 / HONEST NUMBERS` · h3 `Five trades made 65% of the total.` · p "Cut winners early and this whole report turns red. Groups under 5 trades are faded, not hidden. Small groups are shrunk toward the average, so three lucky trades are never called an edge." · Overlay: five mono labels beside the five dots (`HYDR +6.71%`, `RKT +5.03%`, `LUMN +4.78%`, `LUMN +4.17%`, `LUMN +3.64%`), a share bar under the plot filling to 65% labelled `TOP 5 TRADES / TOTAL · 65%`, and three stamps: `9:45–10:15 · 3 TRADES` `TOO FEW` · `AFTER A LOSS · 9 TRADES` `EARLY SIGNAL` · `1ST OF THE DAY · 45 TRADES` `SOLID`.

Under the beats, the section footnote (2.8), then `#story-end` (full width, centered): serif line `Computed in milliseconds. Yours will be too.`; buttons `.btn-primary` "Analyze my trades" `data-action="pick"` · `.btn-secondary` "See the sample report" `data-action="demo"`; micro-line (muted) "Nothing uploaded, nothing to sign up for."

< 1024px: no sticky. Each beat renders as caption, then its own `<canvas class="beat-canvas" data-beat>` (aspect 4/3, drawn once at the beat's end state), then its overlay; the rail is hidden. Same in reduced motion at any width.

### 3.4 Honest math `#honest` (signature set-piece B, 6.2)

Eyebrow `HONEST STATISTICS` · h2 `Three <em class="hl">lucky</em> trades are not an edge.` · lede "Every group's average is shrunk toward your overall average in proportion to how few trades it has. The fewer the trades, the less the engine believes them. Here is the exact rule, on the sample."

Desktop 2 columns 6/6. Left:
- Formula card (mono, on a rule): `adjusted = (n × group avg + 10 × overall avg) ÷ (n + 10)` and the muted line "10 is the number of phantom average trades mixed into every group."
- Example chips `#honest-examples` (`button.chip[data-example][data-n][data-raw][data-label]`), in this order: `9:45–10:15 ET · 3 trades · raw −1.17%` (default, `aria-pressed=true`) · `3 lucky trades at +4.00%` (hypothetical, `data-hypothetical`) · `Held under 15 min · 5 trades · raw +1.07%` · `Overnight · 5 trades · raw −2.55%` · `1st trade of the day · 45 trades · raw +0.94%`. `data-raw` on the four sample chips is bound (`data-sample`) to the engine's `avgReturn` for that group, unrounded.
- Rules list (the sentences in 2.9, as `<li>`s, in that order).
- Link: "Read the rule in src/core/analyze.ts →" (`https://github.com/CezarAster/mytradepilot/blob/main/src/core/analyze.ts`).
- Footnote (2.8).

Right: `#honest-diagram` (inline SVG `viewBox="0 0 560 320"`, ruled background): a horizontal number line −3% … +5% at y=180 with ticks every 1%; a hollow ivory tick labelled `your average +0.33%`; a hollow circle `raw` at the example's raw value; a filled ivory circle `what the report says` at the adjusted value with a tether line to the raw circle; readout row (mono 13px): `n = 3 · raw −1.17% · adjusted −0.01%` followed by the stamp `#honest-badge` (`TOO FEW` / `EARLY SIGNAL` / `SOLID`); verdict line `#honest-verdict` (17px): one of "The report would call this: nothing, too few trades." / "The report would call this: an edge (early signal)." / "…an edge (solid)." / "…a leak (early signal)." / "…a leak (solid)." / "…a weak spot (early signal)." / "…a weak spot (solid)." / "…nothing: not clearly away from your average." Under the SVG: `<label for="honest-n">Trades in this group</label> <input type="range" id="honest-n" min="1" max="45" step="1" value="3">` with the current n shown in a mono bubble.

375px: formula, diagram (full width, 300px tall), slider, chips as a horizontal snap-scroll row, rules, link, footnote.

### 3.5 Bento `#bento`

Eyebrow `EVERYTHING THE REPORT TELLS YOU` · h2 `One drop. Seven breakdowns. Three verdicts.` · lede "The same report for stocks, futures, forex or crypto: anything your export covers. Entry-time buckets use New York market hours; every other breakdown is session-independent."

Grid desktop: 4 columns × 3 rows, gap 16px; tile = `.tile[data-tile]` `--surface` panel, radius `--r-l`, padding 24px, a figure area on top (inline SVG, 100% wide, 120px tall, ruled background), title (Newsreader 24px) + one line (17px) + optional note (muted 14px). Spans in brackets; numbers are `data-sample` bound.

1. `edge` [2×1] **Edges.** "Groups of your trades that beat your own average, with a confidence label." Figure: a diverging bar grows to `+0.94%` beside a dashed line at `+0.33% overall`; stamp `SOLID` presses.
2. `leak` [2×1] **Leaks and weak spots.** "Groups that lose money, and what your total would be without them. Weak spots are profitable but drag your average down." Figure: mono `+37.3%` counts to `+58.5%`; a hatched bar sits below the average line.
3. `stop` [1×1] **Stop check.** "Trades that blew through your stop and came back, versus the ones that didn't. And your total if every one had been cut at the stop." Note: "On the sample: 1.5% → +18.0%, 2% → +13.2%, 3% → +35.5%. All below +37.3%. Needs worst-point data; TradingView exports include it." Figure: a mini scatter; the stop line steps 1.5 → 2 → 3 while the readout shows the three totals.
4. `concentration` [1×1] **Concentration.** "How much of your P&L your 5 best trades made." Figure: 112 thin bars sorted by return; the top 5 lift and gain rings; label `65%`.
5. `time` [1×1] **Entry time, New York.** "Pre-market, the open, midday, the close. Converted from your export's time zone." Figure: five bars rise (9:30–9:45 tallest, 9:45–10:15 hatched).
6. `before` [1×1] **Trade # of the day, and what came before.** "1st, 2nd, 3rd, 4th or later. After a win, after a loss, within 10 minutes of a loss." Figure: sequence `L → 7 min → entry`, the entry flagged.
7. `shown` [2×1] **Shown, never mined.** "Hold time, weekday and ticker are in the report so you can see them, and kept out of the edge list so they can't fool you." Figure: three small bar groups fade in muted with the stamp `NOT MINED`.
8. `files` [2×1] **Several files, your time zone.** "Overlapping exports are de-duplicated and partial fills merged into one trade. Pick the time zone your export is written in once; every entry is converted to New York time and the choice is remembered on this device." Figure: three sheets slide together, duplicate rows dissolve; a clock label flips `9:31 PT → 12:31 ET`.

Footnote (2.8). CTA link under the grid: "Run it on the sample →" `data-action="demo"`.

375px: one column, figures 96px; ≥ 600px: two columns (spans collapse to 1).

### 3.6 Privacy `#privacy` (set-piece C, 6.4)

Eyebrow `WHERE YOUR TRADES GO` · h2 `<em class="hl">Nowhere.</em> That's the point.` · body "Your file is read into this tab's memory, analyzed there, and shown to you. There is no upload, no account and no server that could leak it. This is a static page: the only thing it ever sends is your email address, if you choose to join the waitlist."

Desktop 2 columns 6/6. Left: `#privacy-wire` (inline SVG `viewBox="0 0 560 300"`): node `Your CSV` → node `This browser tab (engine runs here)` → node `Your report`, joined by a solid ivory path with a travelling pulse; a dashed branch from the tab node to a greyed node `Servers` with a mono badge `0 requests when you drop a file`. Right: a 3-item checklist (each with a 16px line-drawn lock glyph):
- "Check it yourself: open your browser's developer tools, Network tab, then drop a file. Nothing goes out."
- "Or turn off your Wi-Fi after the page loads and drop a file. It still works."
- "Open methodology: the engine is in src/core, the tests in test/. The command line prints the same report." (link to the repo)

Fine print (exact): "What this page does request: the page itself, its styles and scripts, fonts from Google Fonts, and the fictional sample file from this site (for the chart above and the sample button). Nothing in those requests is about you or your trades." Footnote (2.8).

375px: wire on top (full width, 240px tall), checklist below.

### 3.7 Export how-to `#export`

Eyebrow `GET YOUR FILE` · h2 `Your export takes about a minute.` · tabs `role="tablist"`: `#tab-tv` **TradingView** · `#tab-broker` **Any broker**; panels `#panel-tv`, `#panel-broker` (`role="tabpanel"`, arrow keys move between tabs).

TradingView panel: a 3-chip menu path in mono (`Bar Replay / Strategy Tester` → `List of trades` → `Export ▸ CSV`) that lights in sequence on enter, then numbered steps: "1. Open Bar Replay or the Strategy Tester. 2. Open the List of trades tab. 3. Export → CSV. 4. Drop it here and pick your chart's time zone under Options." Note: "Strategy Tester and Bar Replay exports include each trade's worst point, so the stop check runs on them."

Broker panel: "Export your executions or fills as CSV, not your positions. The file needs columns for symbol, side, quantity, price and time; common column names (ticker, action, shares, fill price, timestamp…) are detected automatically. Fills are matched into round-trip trades, first in, first out." Note: "Optional: a Worst % column on the closing fill turns on the stop check."

Footnote (2.8). CTA row: `.btn-primary` "Analyze my trades" `data-action="pick"` · `.btn-secondary` "Which files work?" (opens `details.help` in the hero and scrolls to it: `data-action="help"`).

375px: tabs full width; chips stack.

### 3.8 Roadmap and waitlist `#roadmap`

Eyebrow `WHERE THIS IS GOING` · h2 `The analyzer is step one. Step four checks your setup <em class="hl">before</em> you click buy.`

`#roadmap-stepper`: 6 nodes on an ivory line (horizontal at ≥ 1024px, vertical with a 24px left rail below): 1 **Free analyzer** "now, and staying free" (node filled) · 2 **Journal** "every trade in, automatically" · 3 **Edge analysis** "your edges and leaks kept current as you trade" · 4 **Pre-trade check** "does this setup match where you make money?" · 5 **Live alerts** "when your best setup shows up" · 6 **AI review of your week** "what to keep, what to stop".

`#precheck` (set-piece D, 6.5): header `PRE-TRADE CHECK · PREVIEW · BUILT FROM THE FICTIONAL SAMPLE`; two cards side by side (stacked on phones):

- Card A `data-precheck="red"`: setup line `ORBX · short · 11:15 ET · Thu Apr 9`; chips `3rd trade of the day` · `Short` · `3 min after a loss` · `10:15–11:30 entry`; rows (`.check-row`, bound): `3rd trade of the day → LEAK · −0.81% a trade · 26 trades · solid` · `Back in within 10 min of a loss → LEAK · −0.83% · 13 trades · early signal` · `Short → LEAK · −0.11% · 33 trades · solid` · `10:15–11:30 entry → +0.29% · 19 trades · solid`; verdict stamp `nogo`: `Matches where you give it back.`
- Card B `data-precheck="green"`: `LUMN · long · 9:42 ET · Thu Mar 5`; chips `1st trade of the day` · `Long` · `9:30–9:45 entry`; rows: `1st trade of the day → EDGE · +0.94% a trade · 45 trades · solid` · `9:30–9:45 entry → EDGE · +0.88% · 46 trades · solid` · `Long → EDGE · +0.52% · 79 trades · solid`; verdict stamp `go`: `Matches where you make money.`
- Footer line: "Two real trades from the sample. This feature is not built yet; the waitlist is how it gets built."

`#signup-roadmap` (same inner structure as `#signup`, ids suffixed `-2`, `hidden` until `setupSignup` runs): h3 `Get early access and founding-member pricing.`; p "Waitlist members get in first and keep founding-member pricing when the full app launches. No date promised; you'll hear from us when there is something to try."; `<label for="signup-email-2" class="sr-only">Email address</label><input type="email" id="signup-email-2" …>` + `.btn-primary` "Get early access"; `.signup-msg`; fine print "Only your email is sent, never your trades. Unsubscribe anytime." Footnote (2.8).

### 3.9 FAQ `#faq`

`.container-narrow`; eyebrow `QUESTIONS`; h2 `Fair questions.`; eleven `<details class="faq-row">`, each `<summary>` a question with a `+` glyph that rotates to `×`:

1. **Is it really free?** Yes. The analyzer runs on your computer, not on our servers, so it costs nothing to run and it stays free. The waitlist is for the full app, which will be paid.
2. **Do you see my trades?** No. The file is read in your browser's memory and never sent anywhere. You can check: open the Network tab in your browser's developer tools, drop a file, and watch nothing go out. The only thing this site ever sends is your email address, if you join the waitlist.
3. **Is the sample real?** No. The sample is a fictional trader generated by a script in the repository (scripts/make-sample.py) with planted patterns, so you can see what the analyzer finds. Every number on this page is computed from that file by the engine, live, in this tab.
4. **Which files work?** TradingView's List of trades export from Bar Replay or the Strategy Tester, and any broker executions or fills export with symbol, side, quantity, price and time columns. Several files at once are fine: overlapping exports are de-duplicated and partial fills are merged.
5. **Which markets?** Anything your export covers: stocks, futures, forex, crypto. The entry-time buckets use New York market hours; trade number of the day, what came before, direction, hold time, weekday and ticker don't depend on the session.
6. **How many trades do I need?** It runs on a handful, but under 30 trades the whole report is labelled an early signal. Groups under 5 trades are faded and never called an edge or a leak; 5 to 14 is an early signal; 15 or more is solid.
7. **What does "shrunk toward your average" mean?** Each group's average is mixed with 10 imaginary trades at your overall average: adjusted = (n × group average + 10 × overall average) ÷ (n + 10). Three lucky trades at +4% read as about +1.2%; 45 trades at +0.9% keep most of their signal.
8. **Why isn't hold time used for edges?** Because winners get held longer precisely because they are winning. It's shown so you can see it, but mining it would just tell you to hold winners, which you already know. Ticker and weekday are kept out for a different reason: they are too easy to overfit.
9. **What is the stop check?** If your export includes each trade's worst point (TradingView's does; a fills export can add a Worst % column), the report counts trades that went past your usual stop and came back, the ones that didn't, and what your total would be if every one had been closed at the stop. Without worst-point data the check is skipped and the report says so.
10. **Can I check the math?** Yes. The engine lives in src/core with tests in test/, and the command-line tool prints the same report as the page: `npm run report -- --tz America/New_York your-trades.csv`.
11. **What's in the full app, and when?** Journal, edge analysis that stays current, a pre-trade check, live alerts for your best setups and an AI review of your week. No launch date is promised. Waitlist members get early access and founding-member pricing.

### 3.10 Final CTA `#final`

Full-bleed band on `--bg-2`, centered text, `min-height: 60vh`. Behind the text: `<canvas id="final-field" aria-hidden>` rendered once in the `tradeOfDay` layout at 35% opacity (same module, `static: true`). h2 `Your trade log is ready when you are.` Buttons: `.btn-primary` "Analyze my trades" `data-action="pick"` · `.btn-secondary` "See the sample report" `data-action="demo"`. Micro-line: "Free. In your browser. Nothing uploaded."

### 3.11 Footer

Three rows: (1) "Educational tool, not investment advice. Past results don't predict future results." (2) links: "Engine and tests on GitHub" · "Sample data is fictional" (→ `#story`) · "What you get" · "Honest math" · "Privacy" · "Roadmap" · "FAQ". (3) `<button id="motion-toggle" aria-pressed="true">Motion: on</button>` and "© MyTradePilot". `BUILT IN THE OPEN · STATIC SITE · NO TRACKING SCRIPTS` as a mono line (true as long as no analytics are added).

### 3.12 Dock `#dock`

One fixed element, `role="region" aria-label="Quick actions"`. Desktop (≥ 768px): a bottom-center pill, 52px tall, `--surface` at 92% + blur, 1px `--line-strong`, radius pill, two buttons: `.btn-primary` "Drop your CSV" `data-action="pick"` and `.btn-secondary` "See the sample" `data-action="demo"`. Mobile (≤ 767px): a full-width 64px bar with `padding-bottom: env(safe-area-inset-bottom)` and one `.btn-primary` "See the sample report" `data-action="demo"`; `main { padding-bottom: 80px }` at ≤ 767px, set once in CSS.

Visibility rule (`nav.ts`, IntersectionObservers): shown when `#input` has scrolled above the viewport; hidden while any of `#input`, `#report-followup`, `#signup-roadmap`, `#final` intersects, while `body.has-report`, while any `input`/`select`/`textarea` has focus, and before first scroll. Toggled by `data-visible="true|false"`; CSS transitions `transform` 250ms (opacity-only under reduced motion).

---

## 4. Animation choreography

Defaults: `data-reveal` elements animate once on enter (`ScrollTrigger` `start: 'top 85%'`, `once: true`). `lines` = SplitText `type: 'lines', mask: 'lines', autoSplit: true`, from `yPercent: 110` to 0, 0.9s `power4.out`, stagger 0.06. `up` = `y: 16, opacity: 0 → 1`, 0.64s. `fade` = opacity only, 0.48s. Count-ups: `power2.out`, 1.1s unless noted. "RM" = reduced motion (`prefers-reduced-motion: reduce`, or `motion=off` stored): no Lenis, no ScrollTriggers, no loops; everything is in its final state from the first paint.

| # | Section | Element | Trigger | Effect | Timing | Technique | RM | Why (conversion) |
|---|---|---|---|---|---|---|---|---|
| 1 | Nav | `#nav` contents | load | fade + y 8px → 0, stagger 60ms | 0.4s, delay 0.1 | gsap.from | static | calm entrance |
| 2 | Nav | `#nav` | scroll > 40px | `.is-stuck` (blur, border) | 200ms | class toggle | same | waitlist link reachable without stealing attention |
| 3 | Hero | eyebrow | load | up | 0.4s, delay 0.05 | gsap | static | reading order |
| 4 | Hero | h1 | load, after `document.fonts.ready` (max 500ms wait) | lines reveal; then `.hl` swipe `background-size 0 → 100%` | 0.9s from 0.15; swipe 0.52s at 1.0 | SplitText + gsap | static, swipe at 100% | the baseline the client asked for, on the one word that reframes |
| 5 | Hero | lede | load | up | 0.64s, delay 0.45 | gsap | static | reading order |
| 6 | Hero | `#input` panel | load | opacity 0.6 → 1, y 12 → 0 (never below 0.6, never `pointer-events: none`) | 0.5s, delay 0.3 | gsap.from | static | drop zone usable from first paint; it only settles |
| 7 | Hero | `#drop` | hover / `.over` (set by main.ts) | border ivory, `--accent-soft` bg, glyph lifts 4px | 160ms | CSS | color only | affordance |
| 8 | Hero | `#drop` | `drop` event | radial "catch" flash from the pointer (`::after`, `--x/--y` set by nav.ts), fades | 400ms | CSS keyframe | none | confirms the drop; `run()` is never delayed |
| 9 | Hero | `#demo`, Options, trust items | load | up, stagger 80ms | 0.5s, delay 0.55 | gsap | static | reading order; objections 2 and 6 under the ask |
| 10 | Hero | `#field` rules + axis | load | ruled lines and the zero line clip-reveal left → right | 0.7s at 0.3 | canvas progress | static | the instrument wakes before the data |
| 11 | Hero | `#field` intro | sample parsed and canvas ≥ 50% visible | `chrono`: dots stream in by trade index with 8ms stagger (scale 0 → 1, 140ms each); the equity line draws beneath, left → right | 1.4s | canvas + one gsap tween on `progress` | final `tradeOfDay` layout drawn once | "your log looks like noise" |
| 12 | Hero | `#field` first sort | 0.6s after 11 | morph `chrono → tradeOfDay`; column ticks and average line draw first; labels fade in at 0.7s; caption crossfades | 1.1s `power3.inOut`, per-dot random delay ≤ 0.35s | canvas + gsap | n/a | the aha: edge and leak separate as shapes |
| 13 | Hero | `#field` lens tour | 6s after 12, then every 6s | `time → afterPrev → stop → tradeOfDay`, then rest | 1.1s each | gsap | off; chips switch instantly | shows the engine looks through several lenses; ends so it never fights the CTA |
| 14 | Hero | lens chips | click / Enter / Space | `aria-pressed` moves; field morphs; tour cancelled | 1.1s | gsap | instant redraw | user-driven proof |
| 15 | Hero | field column | hover (fine pointer) / tap | column dots 100%, others 35%; label `.is-hot`; `#field-tip` "1st trade of the day: 45 trades · 73% win · +0.94% a trade" | 200ms | canvas alpha + DOM | same, no fade | numbers feel inspectable |
| 16 | Hero | single dot | hover within 9px of a dot | that dot ringed; tip "LUMN · long · Mar 26 · +4.78% · $476" | 120ms | canvas + DOM | same | the 112 dots are 112 trades, not a graphic |
| 17 | Hero | hero right column | scroll (scrub) | y 0 → −48px, opacity 1 → 0.4 as the hero leaves | scrub 0.5 | ScrollTrigger | off | hands attention to the story |
| 18 | Hero | scroll cue | loop | chevron bob 6px | 1.8s | CSS keyframe | hidden | proof below |
| 19 | Hero | `.btn-primary` in hero/dock | hover (fine pointer) | magnetic pull ≤ 8px toward the pointer | `gsap.quickTo` 0.35s | gsap | off | craft on exactly the buttons that convert |
| 20 | Results | `#report` arrival | `#report` gains children | next frame: `body.has-report`; `.stats .stat` y 8 → 0 stagger 40ms; `.insight` cards up stagger 60ms; `.conf`/`.tag` stamps press; `.barcell .bar` scaleX 0 → 1 from the axis | 0.5s total | gsap.from on already-rendered DOM | static; `has-report` still set | directs the eye edges → leaks; never delays `render()` |
| 21 | Results | `.stat .value` | same | count from 0 to the rendered value (6.6 parser) | 0.9s | gsap proxy | values shown immediately | numbers feel earned |
| 22 | Results | page scroll | same, after a pick/drop/demo | `lenis.scrollTo('#report', { offset: -(nav + 16) })` | 0.9s | Lenis | native `scrollIntoView` from main.ts | the report is the payoff |
| 23 | Results | `#report-bar`, `#report-followup` | same | fade up | 0.6s, delay 0.4 | gsap | shown immediately | the earned waitlist ask |
| 24 | Story | h2, lede | enter once | lines / up | 0.9s / 0.64s | SplitText / gsap | static | baseline |
| 25 | Story | `#story-stage` + rail | scroll through `.story-field` | one timeline, progress 0 → 1 over 600svh, labels `beat0..beat5` at 0, 1/6 … 5/6 | scrub 0.5 | CSS sticky + ScrollTrigger `start: 'top top', end: 'bottom bottom'` on `.story-field` | not sticky; six static figures | one frame, one idea at a time |
| 26 | Story | captions | scrub | active caption opacity 1, y 0; others opacity 0, y ±16; rail dot fills | first 15% / last 10% of each beat | timeline | all visible, stacked | progressive disclosure |
| 27 | Story | beat 0 | 0 → 1/6 | CSV rows translate up and dissolve (0 → 60%); dots appear in `grid` (50 → 100%); counter 232 → 112; LUMN ring + leader draws | within beat | DOM transform + canvas | static | makes "drop" concrete |
| 28 | Story | beat 1 | 1/6 → 2/6 | dots morph `grid → curve` (0 → 45%); equity line draws L → R (30 → 85%); stat tiles count (40 → 90%); drawdown label at the trough | within beat | canvas + counters | static | the number every journal shows |
| 29 | Story | beat 2 | 2/6 → 3/6 | edge cards slide in from x 32 stagger 0.1; as each lands its member dots grow 1.6× and ring ivory, non-members dim to 30% | within beat | DOM + canvas | static | edges in the report's own words |
| 30 | Story | beat 3 | 3/6 → 4/6 | big number counts 37.3 → 58.5; 26 third-trade dots pulse once and stay `--neg-mark`; dashed counterfactual curve draws to +$5,583; leak cards slide in | within beat | canvas + counters | static | the money number |
| 31 | Story | beat 4 | 4/6 → 5/6 | morph `curve → stop` (0 → 35%); the −2% line slides in from the left (35 → 50%); 33 dots left of it pop (7 as rings) (50 → 65%); those 33 slide vertically to y = −2% while the readout counts +37.3 → +13.2 (65 → 100%) | within beat | canvas + counter | static scatter with both numbers | the twist: suspect the stop, exonerate it |
| 32 | Story | beat 5 | 5/6 → 1 | back to `curve`; top 5 dots grow to r 7 with labels; share bar fills to 65% and counts; three stamps press in order | within beat | canvas + DOM | static | honesty demonstrated, not claimed |
| 33 | Story | rail dots | click | `lenis.scrollTo` to that beat's scroll position | 0.8s | Lenis | anchors to captions | navigation |
| 34 | Story | `#story-end` | enter once | up | 0.6s | gsap | static | CTA at maximum belief |
| 35 | Honest | h2, lede, formula | enter once | lines; formula characters type on (SplitText chars, stagger 0.012) | 0.9s / 0.6s | SplitText | static | the eye lands on the actual rule |
| 36 | Honest | diagram | enter once (≥ 50% visible) | one-shot sweep: n 3 → 45 then back to the chip's n; markers slide, badge flips at 5 and 15 | 2.4s | gsap on the input value + `input` event | no sweep; slider works | feel how little 3 trades are trusted |
| 37 | Honest | `#honest-n`, chips | input / click | marker `cx`, readout, badge, verdict update | 320ms (instant under RM) | gsap.to on `cx` | instant | user-driven proof |
| 38 | Bento | tiles | enter once | up stagger 70ms; hairline border draws via `clip-path: inset()` | 0.64s | gsap | static | entrance rhythm |
| 39 | Bento | tile figures (8) | `.is-visible` (IO ≥ 30%) | per-tile loop (6.3) | 2.4–4s, `repeatDelay` 1.5s | gsap timelines, paused unless visible | final frame | each feature demonstrates itself |
| 40 | Privacy | `#privacy-wire` | `.is-visible` | pulse travels CSV → tab → report; the dashed branch and `0 requests` badge never move | 2.4s loop | SVG `stroke-dashoffset` via gsap | pulse frozen mid-path | the data path ends in the tab |
| 41 | Privacy | checklist | enter once | up stagger 0.1 | 0.5s | gsap | static | reading order |
| 42 | Export | tabs | click / arrow keys | panel crossfade; underline slides | 200ms | CSS | instant | friction removal |
| 43 | Export | menu-path chips | enter once | light in sequence 1 → 2 → 3 | 1.2s | gsap | static | the path is memorable |
| 44 | Roadmap | stepper line | scrub through `#roadmap-stepper` | ivory line fills (L → R, top → bottom on phones); nodes press in order | scrub 0.6 | ScrollTrigger + `stroke-dashoffset` | static | the analyzer is node one of a bigger thing |
| 45 | Roadmap | `#precheck` cards | enter once | card A: chips in (x −8, 0.2s apart), rows tick in (0.1s apart), verdict stamp presses; card B the same 0.6s later | 2.6s total | gsap timeline | static | previews the paid value, red then green |
| 46 | Roadmap | `#signup-roadmap` | enter once | up; email input focus ring glows ivory | 0.6s | gsap + CSS | static | the ask arrives after the preview |
| 47 | Any form | submit | click | handled by `signup.ts`; message fades in | 250ms | CSS | instant | feedback |
| 48 | FAQ | `details` | toggle | `grid-template-rows 0fr → 1fr`, `+` rotates 45° | 250ms | CSS | instant | comfort |
| 49 | Final | h2 | enter once | lines | 0.9s | SplitText | static | baseline |
| 50 | Final | `#final-field` | enter once | static sorted dots fade in to 35% | 0.8s | canvas, `static: true` | static | callback to the hero's proof at the last ask |
| 51 | Dock | `#dock` | visibility rule (3.12) | translateY 24px ↔ 0, opacity | 250ms | CSS class | opacity only | conversion 1 one click away |
| 52 | Global | `[data-count]` | enter once | count 0 → value, formatted per `data-format` | 1.1s | gsap proxy + `format.ts` | final value (already in HTML) | numbers feel real |
| 53 | Global | links, buttons | hover | underline / background 160ms; arrow shifts 4px | 160ms | CSS | color only | affordance |

Global rules: text reveals use `once: true`; scrubs exist only in rows 17, 25–32 and 44; loops only in rows 13 (bounded), 18, 39, 40, and they pause when their element is off-screen or `document.hidden`. `ScrollTrigger.refresh()` is called, debounced 100ms, after: `#report` resize (ResizeObserver), any `<details>` toggle, a tab switch, `document.fonts.ready`, orientation change.

---

## 5. Hero set-piece: "Same trades, sorted" (`#field`)

**What it is.** A 2D-canvas beeswarm of the 112 sample trades, one dot per trade, computed by the real engine on this page, that re-sorts into the engine's own groups so the edge and the leak become visible as shapes, and, in the fourth lens, into the stop check's worst-point-vs-result scatter.

**Data.** `sample.ts` (7.5) fetches `${import.meta.env.BASE_URL}sample-trades.csv` at idle (`requestIdleCallback`, fallback `setTimeout 200`), runs `parseFile → combineTrades → analyze(trades, { stopPct: 2 })` with `timeZone: 'America/New_York'`, and `tagTrades(closed)` (the new export from `analyze.ts`, 7.5) for per-trade context. Each dot: `{ i, sym, dir, date, minutes, ret, pnl, mae, mfe, labels: { tradeOfDay, time, afterPrev, direction, hold }, overnight }`. If the fetch or parse fails: draw the rules and axis only, show "The sample couldn't load. The analyzer still works: drop a file." in the caption line, hide the chips. No baked fallback data: there is one source of truth.

**Canvas.** `<canvas id="field" aria-hidden="true">` inside `.field-stage` (`position: relative; aspect-ratio: 6 / 5; width: 100%`), CSS size reserved so nothing shifts. DPR capped at 2 (1.5 under 768px); `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` once per resize (`ResizeObserver`, debounced 100ms). Labels (`#field-labels`) and the tooltip (`#field-tip`) are DOM for crisp text. Colors are read from CSS custom properties at mount (`getComputedStyle(document.documentElement).getPropertyValue`).

**Encoding.** y = return % on a fixed −5.5% … +7% scale (sample range −5.12 … +6.71; anything outside clamps to the edge); zero line `--line-strong` with a mono "0" and ticks at −4, −2, +2, +4, +6; ruled lines every 32px in `--rule`. Dot radius `3 + 4 · sqrt(|pnl| / 670)` (3 … 7px; ×0.75 under 768px). Fill `--pos-mark` for `ret > 0`, else `--neg-mark`, 88% alpha, 1px ring 20% darker. Groups with n < 5 render at 40% alpha and their label carries the `TOO FEW` stamp, exactly like the report.

**Layouts** (`dots.ts` 6.0; each returns `{x, y, alpha, scale}` per dot; collisions dodged by sorting a column's dots by y and offsetting x in ±3.5px steps alternating sides):

- `chrono`: x by trade index 0–111 across the plot width, y by return. The equity line (cumulative P&L by exit time, rescaled to the plot height, `--text-2` at 35%, 1.5px) draws beneath during the intro only.
- `tradeOfDay`: 4 columns `1st · 2nd · 3rd · 4th or later`.
- `time`: the 5 buckets present in the sample (`9:30–9:45 · 9:45–10:15 · 10:15–11:30 · 11:30–2:00 · 2:00–4:00`); buckets with no trades are omitted, as the engine does.
- `afterPrev`: 4 columns `First of the day · After a win · After a loss · < 10 min after a loss`.
- `stop`: x = worst point (`mae`) mapped over `[min(−6.5, dataMin − 0.3), 0]` (left = worst), y = return; a dashed vertical line at −2% labelled `−2% stop`; dots with `mae ≤ −2` and `ret > 0` drawn as 2px rings; a legend row replaces the column labels: `● never got near it · 79` · `○ past it, came back green · 7` · `● past it, stayed red · 26`.

Each column draws a short horizontal tick at its group average (ivory, 60%) and the overall average as a dashed ivory line across the plot, so "beats the average" is literally visible. Column labels read `label · n · avg` from the engine (`1st · 45 · +0.94%`); `#field-labels` is a CSS grid with one equal cell per column.

**Choreography** (rows 10–17): rules and axis reveal (0.7s) → when the sample is parsed and the canvas is ≥ 50% visible, `chrono` stream-in (1.4s) → 0.6s hold → morph to `tradeOfDay` (1.1s `power3.inOut`, per-dot random delay within 0.35s; column ticks and the average line draw first; labels fade in at 0.7s; caption h3/line crossfade 200ms) → after 6s, one tour `time → afterPrev → stop → tradeOfDay` with 6s holds → rest. The tour is cancelled by any chip click, canvas hover/tap, keyboard focus on a chip, and never runs while `#drop` has `.over` or focus, or while the pointer is over `#input` (the tour simply waits for the next tick that is clear).

**Pointer.** `pointermove` hit-tests dots first (within 9px → row 16), then columns (row 15). `pointerleave` resets. Touch: tap toggles the column; tap on a dot shows its tip for 2s. `#field-sr` is updated with each lens's sentence for screen readers. No parallax (the values stay honest).

**Scroll.** ScrollTrigger on `#hero` (`start: 'top top', end: 'bottom top', scrub: 0.5`) moves `.hero-field` to y −48px and opacity 0.4 as the hero leaves. No pinning.

**Rendering.** One `requestAnimationFrame` loop that runs only while a tween is active, the pointer moved since the last frame, or `dirty` is set; and only while the canvas is on screen (IntersectionObserver) and `!document.hidden`. Idle cost is zero frames (acceptance 20).

**Reduced motion.** `mount({ static: true })`: draws `tradeOfDay` once with labels; chips redraw instantly; tooltips work; no intro, tour or scroll effect.

**Why not WebGL/three.js.** 112 dots, five layouts and two lines cost well under 1ms a frame on canvas 2D; three.js would add ~150 KB for nothing a visitor could see.

---

## 6. Signature set-pieces beyond the hero

### 6.0 The dot system (`src/web/site/dots.ts`), shared by the hero, the story and the final band

```ts
export type LayoutId = 'chrono' | 'tradeOfDay' | 'time' | 'afterPrev' | 'stop' | 'grid' | 'curve' | 'top5';
export interface Placed { x: number; y: number; alpha: number; scale: number; ring?: boolean }
export interface Column { key: string; label: string; n: number; avg: number; x: number; w: number; confidence: Confidence }
export interface Scene { pos: Placed[]; columns: Column[]; lines: Line[]; curve?: number[] /* equity y per index */; curveAlt?: number[] }
export function layout(id: LayoutId, dots: Dot[], w: number, h: number, data: SampleData, opts: { highlight?: Set<number> }): Scene;
export class DotField {
  constructor(canvas: HTMLCanvasElement, data: SampleData, opts: { dpr: number; dotScale: number; static: boolean });
  setLayout(id: LayoutId, opts?: { duration?: number; stagger?: number; onLabels?: (cols: Column[]) => void }): Promise<void>;
  drawBlend(a: Scene, b: Scene, t: number, extras?: Extras): void;   // used by the story scrub
  hitTest(x: number, y: number): { dot?: number; column?: Column };
  resize(): void; destroy(): void;
}
```

Story-only layouts: `grid` = 16 × 7 grid, r 4, `--muted`; `curve` = x by exit index, y by cumulative P&L (axis −$1,000 … +$3,500), dot color by `pnl` sign; `top5` = `curve` with the five highest-return dots at r 7 and labelled. `extras` carry the counterfactual curve, the stop line, highlight sets and dims. `drawBlend` eases the position blend with `power2.inOut` and draws lines, then dots, then rings.

### 6.1 Story: "Your report, built in front of you" (`#story`, sticky scrubbed stage)

Approach: CSS sticky, not a GSAP pin. `.story-field { height: 700svh }` at ≥ 1024px; `.story-sticky { position: sticky; top: var(--nav-h); height: calc(100svh - var(--nav-h)) }`. No ancestor of `.story-field` may have `transform`, `overflow: hidden/clip` or `contain` (sticky silently breaks); the story intro's reveal tween targets the intro block only. One `gsap.timeline({ paused: true })` with labels `beat0..beat5` is driven by `ScrollTrigger.create({ trigger: '.story-field', start: 'top top', end: 'bottom bottom', scrub: 0.5, onUpdate: st => tl.progress(st.progress) })`; the canvas redraws from the timeline's own `onUpdate` with the current blend (`drawBlend`). Counters use proxy objects formatted with `pct`/`money` from `src/core/format.ts` so they match the report. Overlays are real DOM, present at all times, toggled with opacity/transform only.

Beat → layout: 0 `grid` (dots appear), 1 `curve`, 2 `curve` + highlight sets (members of `tradeOfDay=1st`, `time=9:30–9:45`, `direction=Long`), 3 `curve` + third-trade dots `--neg-mark` + `curveAlt` (cumulative P&L excluding `tradeOfDay === 3`, ends $5,583), 4 `stop`, 5 `top5`. Membership sets come from `tagTrades` labels; a dev assertion checks `members.size === GroupStats.n` for each.

Below 1024px and in reduced motion: `story.ts` adds `.is-stacked` to `#story`, which removes the sticky and the fixed height; each `.beat-canvas[data-beat]` is drawn once with `drawInto(canvas, beat)` at the beat's end state. With motion and < 1024px, a beat canvas morphs from the previous beat's layout over 0.9s when it enters the viewport (once).

### 6.2 Honest math (`#honest`): the shrinkage diagram

`honest.ts` keeps `{ n, raw, label, hypothetical }` as state. `adjusted = (n * raw + 10 * overall) / (n + 10)` with `overall = report.summary.avgReturn` from the sample (0.3333…). Marker positions are linear over the −3 … +5 scale (clamped). Badge: n < 5 `few`, 5–14 `early`, ≥ 15 `solid`. Verdict, exactly mirroring `analyze.ts`:

```
if (n < 5) 'nothing, too few trades'
else if (adj > overall && raw > 0 && raw >= overall + Math.abs(overall) / 2) 'an edge'
else if (adj <= overall && raw < 0) 'a leak'
else if (adj <= overall && raw < overall / 2) 'a weak spot'
else 'nothing: not clearly away from your average'
```

(with "(early signal)" / "(solid)" appended for 5–14 / ≥ 15). Reference values the engineer must reproduce: (−1.17, 3) → −0.01% TOO FEW; (−1.17, 5) → −0.17% leak, early signal; (+4.00, 3) → +1.18% TOO FEW; (+4.00, 5) → +1.56% edge, early signal; (+4.00, 15) → +2.53% edge, solid; (+0.94, 45) → +0.83% edge, solid; (+0.94, 1) → +0.39% TOO FEW. The slider is the source of truth: the one-shot sweep (row 36) writes `input.value` and dispatches `input`; a `pointerdown`/`keydown` on the slider or a chip click kills the sweep.

### 6.3 Bento micro-loops (`tiles.ts`)

Each tile's figure is inline SVG shipped in its final state. `tiles.ts` builds one `gsap.timeline({ repeat: -1, repeatDelay: 1.5, paused: true })` per tile from the SVG's existing elements and plays it only while `.is-visible` (IntersectionObserver threshold 0.3) and `!document.hidden`. Loops: `edge` bar scaleX from the axis then the stamp presses (3s); `leak` counter 37.3 → 58.5 via a proxy on a `<text>` (3.6s); `stop` the line's `x` steps 1.5 → 2 → 3 with the readout text swapped (`+18.0% · +13.2% · +35.5%`) (4s); `concentration` five bars lift 4px and rings fade in, label counts to 65 (2.4s); `time` five bars scaleY with 60ms stagger (2.6s); `before` three nodes light in order, the flag blinks once (3.2s); `shown` three groups fade in muted, stamp presses (2s); `files` three sheets translate together, duplicate rows fade, the clock label swaps (3.4s). Reduced motion: timelines are not built; the SVG's shipped state is the final frame.

### 6.4 Privacy wire (`#privacy-wire`)

Inline SVG; the solid path has a duplicate on top with `stroke-dasharray: 40 600`; `tiles.ts` tweens `stroke-dashoffset` 640 → 0 over 2.4s, `repeat: -1`, `ease: 'none'`, while visible. The dashed branch to `Servers` and the `0 requests when you drop a file` badge never animate. RM: the pulse is set at 50% of the path.

### 6.5 Pre-trade check preview (`#precheck`)

`precheck.ts` binds the rows (7.3) and builds the row-45 timeline on enter (once). The roadmap stepper's line is an SVG path whose `stroke-dashoffset` is scrubbed by a ScrollTrigger on `#roadmap-stepper` (`start: 'top 80%', end: 'bottom 40%'`); nodes press at their fraction of the path.

### 6.6 Report arrival (`reportMotion.ts`)

A `MutationObserver` on `#report` (`childList`). On each mutation batch, on the next animation frame: if `#report` has element children, add `body.has-report`, set the `#report-bar` label from the last trigger (`sample` if the last of `#demo` click / `#files` change / `#drop` drop was `#demo`, else `own`), un-hide `#report-bar` and `#report-followup`, run rows 20–23 (only rows 22–23 when `pendingScroll` is set by one of those three triggers), then `ScrollTrigger.refresh()`. If `#report` is empty: remove `has-report`, hide both. The observer never changes report HTML and bails out of all tweens in reduced motion (it still toggles the class and the hidden attributes). A `ResizeObserver` on `#report` debounces `ScrollTrigger.refresh()` 100ms.

Count-up parser for `.stat .value` (row 21): match `^([+\-−])?(\$)?([\d,]+)(?:\.(\d+))?(k|M|%)?$` on `textContent.trim()`; number = digits without commas plus decimals; tween a proxy from 0 and format with the same decimals count, thousands separators if the original had a comma, and the captured sign, `$` and suffix; on no match, leave the text alone. The final frame sets the exact original string.

### 6.7 Dock and actions (`nav.ts`)

`data-action="pick"`: `files.click()` synchronously in the click handler, then scroll to `#input` (Lenis `scrollTo` with offset `-(nav + 16)`, or `scrollIntoView({ block: 'start' })` in RM), then `drop.focus()` and `drop.classList.add('pulse')` for 600ms (CSS ring pulse; static ring in RM). `data-action="demo"`: `demo.click()`. `data-action="waitlist"`: scroll to `#signup-roadmap`, focus `#signup-email-2`. `data-action="help"`: open the hero `details.help`, scroll to it. `data-scroll-to="#id"`: Lenis or native scroll. Tabs: `role=tablist` keyboard pattern. Motion toggle (8.4). Second signup: `setupSignup(document.getElementById('signup-roadmap'))`; each form dispatches `signup:done` on success and the other form replaces its inputs with its `.signup-msg` text "You're on the list." The dock visibility rule is 3.12.

---

## 7. DOM and data contract

### 7.1 Untouched analyzer contract

`#files` (file input, inside `#drop`), `#drop` (`<label>`), `#tz` (`<select>`), `#stop` (`<input type=number>`), `#demo` (`<button>`), `#status` (`<p role=status>`), `#report` (`<div>`), `#signup` (`<section>` containing `form`, `input[type=email]#signup-email`, `button[type=submit]`, `.signup-msg`). Tag types and nesting assumptions in `main.ts` / `signup.ts` are preserved; **`src/web/main.ts` and `src/web/signup.ts` are not modified.** `style.css` keeps every selector the report uses (`.panel`, `.drop`, `.options`, `.help`, `.status`, `.banner`, `.stats`, `.stat`, `.label`, `.value`, `.note`, `.insights`, `.insight`, `.edge`, `.leak`, `.weak`, `.tag`, `.conf`, `.conf-*`, `.section-title`, `.dims`, `.dim`, `table`, `.num`, `tr.few`, `.barcell`, `.axis`, `.bar`, `.above`, `.below`, `.pos`, `.neg`, `.muted`, `.small`, `.signup`, `.signup-msg`, `.sr-only`) and only its token values and a few cosmetic rules change (2.5).

### 7.2 New ids (all must exist)

`#skip`, `#top` (on `body`'s first child wrapper), `#nav`, `#hero`, `#input` (existing section, now with the id), `#options`, `#field-wrap`, `#field-caption` (`[data-caption-title]`, `[data-caption-line]`), `#field`, `#field-labels`, `#field-tip`, `#field-sr`, `#field-lenses`, `#results`, `#report-bar`, `#report-followup`, `#story`, `#story-rail`, `#story-stage`, `#stage`, `#story-csv`, `#story-end`, `#honest`, `#honest-diagram`, `#honest-n`, `#honest-badge`, `#honest-readout`, `#honest-verdict`, `#honest-examples`, `#bento`, `#privacy`, `#privacy-wire`, `#export`, `#tab-tv`, `#tab-broker`, `#panel-tv`, `#panel-broker`, `#roadmap`, `#roadmap-stepper`, `#precheck`, `#signup-roadmap`, `#signup-email-2`, `#faq`, `#final`, `#final-field`, `#motion-toggle`, `#dock`.

### 7.3 Data attributes

- `data-reveal="lines|up|fade|chars"`, optional `data-reveal-delay="0.2"`, `data-reveal-stagger="0.06"`. Mounted by `motion.ts`. CSS: `.motion [data-reveal] { opacity: 0 }` only under `html.motion`.
- `data-count="3238" data-format="int|pctInt|pct|pct1|money|fixed2"` with optional `data-count-from="37.3"`: counts on enter; the element's text already holds the formatted final value.
- `data-sample="<path>" data-format="<fmt>"`: binds the element's text to the engine's report on the sample. The HTML ships with the same value typed in (reduced motion, no-JS and crawlers see it); `sample.ts` overwrites it after computing and, in dev (`import.meta.env.DEV`), `console.warn`s `sample drift: <path> html="…" engine="…"` on any mismatch. Paths:
  - `summary.<field>` for every `Summary` field (`trades`, `days`, `winRate`, `avgReturn`, `avgR`, `avgWin`, `avgLoss`, `totalPnl`, `totalReturn`, `profitFactor`, `maxDrawdown`, `symbols.length`)
  - `risk.<field>` for `RiskStats` (`pastStop`, `pastStopCameBack`, `returnWithStop`, `top5Share`, `stopPct`)
  - `stopAt.<pct>.<field>`: `analyze` re-run at another stop (`stopAt.1.5.returnWithStop`, `stopAt.3.pastStop`)
  - `edges.<i>.<field>` / `leaks.<i>.<field>`: `sentence` (from `insightSentence`), `phrase`, `n`, `winRate`, `avgReturn`, `confidence`, `returnWithout`, `pnlWithout`
  - `group.<dimId>.<label>.<field>`: `GroupStats` by dimension id and the engine's exact label, e.g. `group.time.9:30–9:45.n`, `group.tradeOfDay.3rd.avgReturn`, `group.afterPrev.< 10 min after a loss.confidence`, `group.direction.Short.totalPnl`. Paths are split on `.` only at the three fixed positions (labels contain spaces, en dashes and `<`, never dots).
  - `fills.rows` (232), `top5.<i>.symbol|returnPct|pnl`, `neverNear` (trades with `mae > −stopPct`, 79), `stayedRed` (26), `equity.end|peak|trough`.
  - Formats: `int`, `pctInt` (`Math.round(x*100) + '%'`), `pct` (`pct(x)`), `pct1` (`pct(x, 1)`), `money` (`money(x)`), `fixed2`, `text`. After formatting, ASCII `-` becomes U+2212 `−` for marketing text (the report itself is untouched).
- `data-lens`, `data-example` (+ `data-n`, `data-raw`, `data-label`, `data-hypothetical`), `data-beat`, `data-tile`, `data-precheck`, `data-stamp`, `data-caption-title`, `data-caption-line`, `data-report-label`, `data-visible` as described above.
- `data-action="pick|demo|waitlist|help"` and `data-scroll-to="#id"` on any button or link (6.7).

### 7.4 Boot order and the `motion` class

Inline in `<head>`, before the stylesheets:

```html
<script>try{var r=matchMedia('(prefers-reduced-motion: reduce)').matches||localStorage.getItem('motion')==='off';if(!r)document.documentElement.classList.add('motion');}catch(e){}</script>
```

CSS hides reveal targets only under `html.motion` (`.motion [data-reveal]`, `.motion .overlay`, etc.); without the class everything is visible. `<link rel="modulepreload" href="./assets/motion-*.js">` cannot be known at authoring time, so `site/index.ts` imports `./motion.ts` immediately (not at idle); Vite emits it as its own chunk because it is a dynamic import. `site/index.ts` sets a 1200ms safety timer that removes `.motion` if `motion.ts` has not set `html.motion-ready`. `@media (prefers-reduced-motion: reduce) { [data-reveal], .overlay, .beat { opacity: 1 !important; transform: none !important } * { animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important } }` is the belt-and-braces rule. `motion.ts` also listens to the `prefers-reduced-motion` media query `change` event and calls `disable()` (8.4) when it flips to reduce.

Script order in `index.html`: `<script type="module" src="/src/web/main.ts">` first (analyzer; imports only the core and `signup.ts`), then `<script type="module" src="/src/web/site/index.ts">`. Module scripts execute in document order, so the analyzer binds before any site code runs; the site chunk never imports `main.ts`. Section modules are lazy-imported by `index.ts` when their section is within 150% of the viewport (IntersectionObserver `rootMargin: '150% 0px'`), except `heroField.ts`, `reportMotion.ts` and `nav.ts`, which load with `motion.ts`.

### 7.5 File layout

```
index.html                         new structure; every id in 7.2; the head script in 7.4; both module scripts; both stylesheets
src/web/main.ts                    UNCHANGED
src/web/signup.ts                  UNCHANGED
src/web/style.css                  analyzer + report styles; tokens replaced by section 2.2; selectors kept
src/web/site.css                   marketing layout, components (2.5), keyframes, reveal initial states, reduced-motion rules, lenis css import
src/web/site/index.ts              boot: safety timer, import('./motion.ts'), lazy section imports, exposes nothing global
src/web/site/motion.ts             gsap + ScrollTrigger + SplitText registration, Lenis (gsap.ticker driven), gsap.matchMedia contexts
                                   ('(prefers-reduced-motion: no-preference)', '(min-width: 1024px)'), reveal()/count() utilities,
                                   refresh() debounce, enable()/disable(), the reduced-motion change listener
src/web/site/sample.ts             getSample(): fetch + parse + analyze once (memoised promise), tagTrades, stopAt map, equity series,
                                   membership sets, bindSampleNumbers(root), dev drift warning
src/web/site/dots.ts               layouts + DotField (6.0); no DOM beyond the canvas
src/web/site/heroField.ts          hero canvas (section 5): intro, tour, chips, labels, tooltips, scroll exit, final-band reuse
src/web/site/story.ts              sticky stage timeline / stacked beat canvases (6.1)
src/web/site/honest.ts             shrinkage diagram, chips, slider, sweep (6.2)
src/web/site/tiles.ts              bento loops + privacy pulse, IntersectionObserver gating (6.3, 6.4)
src/web/site/precheck.ts           roadmap stepper scrub + pre-check timeline (6.5)
src/web/site/reportMotion.ts       MutationObserver + ResizeObserver on #report (6.6)
src/web/site/nav.ts                stuck nav, data-action / data-scroll-to delegation, dock, tabs, FAQ refresh hooks, motion toggle,
                                   drop catch flash, second setupSignup, signup:done
src/core/analyze.ts                + export `tagTrades(closed: Trade[]): TaggedTrade[]` (additive; see below)
src/core/parsers/fills.ts          Step 0
scripts/make-sample.py             Step 0
public/sample-trades.csv           regenerated by Step 0
test/engine.test.ts                + Step 0 test
test/site.test.ts                  new: (a) tagTrades group counts == engine GroupStats.n for every dimension;
                                   (b) every data-sample in index.html equals the engine value after formatting (regex over the HTML,
                                   U+2212 normalised to '-'); (c) the honest-math reference values in 6.2
README.md                          + one line (0.3)
package.json                       unchanged (gsap, lenis already present)
```

`tagTrades` (additive export in `analyze.ts`, no behavior change): returns, per closed trade in the engine's order, `{ trade, date, minutes, weekday, tradeOfDay, prev, holdMin, overnight, labels: { time, tradeOfDay, afterPrev, direction, hold } }`, where `labels.*` are the matching bucket labels computed with the same `Bucket.test` functions the dimensions use. Implement it by reusing `withContext` and the bucket arrays; do not duplicate the bucket boundaries anywhere else.

Every site module exports `mount(ctx: { gsap; ScrollTrigger; mm: gsap.MatchMedia; reduced: boolean; lenis: Lenis | null; sample: Promise<SampleData> }): { destroy(): void }`. `destroy()` kills the module's tweens and triggers and leaves its DOM in the static final state.

---

## 8. Performance plan

### 8.1 Budgets (gzipped transfer unless noted; measured sizes in the preamble)

- JS total ≤ 100 KB target, 110 KB hard cap: analyzer entry (`main.ts` + core + `signup.ts`) ≤ 12 KB; `site/index.ts` ≤ 3 KB; motion vendor chunk (gsap core 28.3 + ScrollTrigger 18.0 + SplitText 3.7 + Lenis 8.3 = 58.3 KB); site modules combined ≤ 25 KB. No CustomEase, DrawSVG, Flip, ScrollSmoother, ScrambleText (not needed; keep them out of the bundle).
- CSS ≤ 20 KB gz (`style.css` + `site.css` + `lenis.css`).
- Fonts ≤ 200 KB (184 KB measured). `preconnect` to both Google hosts; `display=swap`; the fallback `@font-face` metrics in 2.3.
- Zero raster images, zero video. All illustrations inline SVG; the hero and story are canvas.
- Sample CSV: ~11 KB raw after Step 0, fetched once at idle; the `#demo` fetch hits the HTTP cache (same URL string).
- Targets (Lighthouse mobile, simulated 4G, built site): Performance ≥ 90, Accessibility ≥ 95, LCP (the h1) < 2.5s, CLS < 0.05, TBT < 150ms, INP < 200ms. Every canvas, figure and stage has its size reserved in CSS (`aspect-ratio` or `min-height`) so nothing shifts when modules mount.

### 8.2 Loading

1. HTML + CSS + preconnects; fonts swap in.
2. `main.ts` executes: the drop zone, options and sample button are live before any site code.
3. `site/index.ts` executes: safety timer; `import('./motion.ts')` starts immediately; `nav.ts`, `reportMotion.ts`, `heroField.ts` mount when it resolves; `sample.ts` starts its fetch at idle.
4. Section modules lazy by proximity (7.4). The story module waits for `getSample()`.
5. Nothing awaits the analyzer, and the analyzer awaits nothing.

### 8.3 Runtime

Canvas: DPR cap 2 (1.5 under 768px); `setTransform` once per resize; draw only on `dirty`; rAF stops when off-screen or hidden; final-band canvas renders exactly once. ScrollTrigger: `ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true })`; no pins; scrubbed properties are transform / opacity / `stroke-dashoffset` / canvas progress / text only. Lenis: `new Lenis({ lerp: 0.1, smoothWheel: true, syncTouch: false, autoRaf: false, anchors: { offset: -72 } })`, `lenis.on('scroll', ScrollTrigger.update)`, `gsap.ticker.add(t => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`; never `ScrollSmoother` or `ScrollTrigger.normalizeScroll`. `content-visibility: auto` with `contain-intrinsic-size` on `#faq` and `footer` only (never on sections carrying ScrollTriggers). `will-change` is applied by GSAP during tweens only. SplitText is applied to at most 30 elements; `autoSplit: true` handles resize, and each `onSplit` returns its tween so SplitText can revert it. Loops gated by IntersectionObserver and `visibilitychange`.

### 8.4 Reduced motion plan (complete; applies to `prefers-reduced-motion: reduce` and to `motion=off`)

1. `html.motion` is never added, so no element starts hidden or offset; every reveal target, overlay, stamp, badge and figure is in its final state at first paint.
2. `motion.ts` is still imported (for `data-action`, the dock, tabs and the toggle) but creates no Lenis, no ScrollTrigger, no SplitText; the `no-preference` matchMedia context never runs.
3. Hero field: static `tradeOfDay` render, instant lens switching, tooltips work, no intro/tour/scroll effect.
4. Story: `.is-stacked`; six beat canvases drawn once; all captions and overlays visible.
5. Honest math: no sweep; slider and chips update instantly.
6. Bento and privacy: shipped SVG state; no timelines built.
7. Report arrival: no count-ups or staggers; `has-report`, the bar and the followup still show; the scroll is `main.ts`'s native one.
8. Anchors and `data-scroll-to` use native `scrollIntoView({ behavior: 'auto' })`; the drop pulse is a static focus ring; the dock toggles opacity only.
9. The footer toggle. **Off** (from on): store `motion=off`, then `disable()`: `ScrollTrigger.getAll().forEach(t => t.kill())`, each module's `destroy()`, `splits.forEach(s => s.revert())`, `gsap.globalTimeline.clear()`, `lenis?.destroy()`, remove `html.motion`, set `html[data-motion=off]`, `gsap.set('[data-reveal], .overlay, .beat', { clearProps: 'all' })`; the page is then in state 1–8 without a reload. **On** (from off): store `motion=on`; if `#report` is empty, `location.reload()`; otherwise set the button text to "Motion: on next load" so the visitor's report is not lost. Button label reflects `aria-pressed`.
10. The `prefers-reduced-motion` media query `change` to `reduce` calls `disable()` live (no store); a change back to `no-preference` does nothing until the next load.

---

## 9. Mobile plan (375px, 16px gutter)

- `html, body { overflow-x: clip }` as a backstop only; nothing may rely on it. Every canvas and SVG is `width: 100%` with a `viewBox` or `aspect-ratio`; `#story-csv` is `overflow: hidden; white-space: pre`; report tables keep their own `overflow-x: auto` panel; chip rows scroll inside their container with `scroll-snap-type: x mandatory`; SplitText masks are `overflow: hidden`. No element is wider than `100vw − 32px`.
- Nav 56px: logo + "Waitlist" button; section links in the footer; skip link kept.
- Hero: single column in the order of 3.1; h1 42px / 0.98; primary = "See the sample report" (56px, full width); `#drop` = 56px full-width secondary "Choose my CSV files" (still the `<label for="files">`; `.over` stays meaningful only for desktop drag); Options collapsed; trust row 2×2; the field is a 240px band after the CTAs (DPR 1.5, dots ×0.75, labels shortened to `label · n`, avg moves into the tap tooltip); the tour still runs but stops on first tap; the sample button is within the first 600px.
- Reveals: `lines` is replaced by `up` under 768px (no SplitText on phones) except the hero h1.
- Story: `.is-stacked`; each beat = caption, 4:3 canvas (343×257), overlay; stat tiles as a 3×2 grid of two-line tiles; edge/leak cards show the full sentence; the share bar and legend wrap; no rail.
- Honest math: diagram full width 300px tall; slider 44px thumb target; chips in a horizontal snap row; one-shot sweep still plays on enter (with motion).
- Bento: one column (two from 600px); figures 96px; at most the two most-centered tiles loop at once.
- Privacy wire 240px tall above the checklist. Export tabs full width. Roadmap stepper vertical with a 24px left rail; pre-check cards stacked; forms stack input over button, both full width.
- Dock: 64px bottom bar with `env(safe-area-inset-bottom)`; `main { padding-bottom: 80px }` at ≤ 767px; hidden while an input has focus (keyboard-aware) and under the other rules in 3.12.
- Lenis uses native touch scrolling (`syncTouch: false`); there are no pins anywhere, so iOS address-bar resizes cannot jump content; `ScrollTrigger.config({ ignoreMobileResize: true })` stays on. An iPad in landscape (≥ 1024px, touch) gets the sticky story like desktop; it is CSS sticky, so it is safe.
- Tap targets ≥ 44px; the report tables remain the existing horizontally scrollable panels (bar column hidden under 560px, as today).

---

## 10. Acceptance checklist

1. **Fold, desktop.** Screenshots at 1280×720, 1366×768 and 1440×900 on a fresh load: the eyebrow, the h1 on exactly two lines, the lede, the drop zone, the "See the sample report" button and the four trust items are visible without scrolling, and the canvas on the right shows dots.
2. **Fold, phone.** Screenshot at 375×667: `document.documentElement.scrollWidth === 375`, gutters are 16px, the "See the sample report" button is fully visible within the first viewport.
3. **Step 0.** Section 0.4 passes in full (byte-identical first six CSV columns, the 14 unchanged report lines, the RISK line, 9/9 tests, typecheck).
4. **Hero sort.** Within 4s of load at 1440×900 the canvas has gone from a chronological scatter to four labelled columns; the "3rd" column's dots sit visibly lower than the "1st" column's; labels read "1st · 45 · +0.94%" and "3rd · 26 · −0.81%".
5. **Hero tour ends.** Without interaction the lens changes at most four times after the first sort and then stays on "Trade # of the day" (wait 40s, lens unchanged). Any chip click or canvas hover stops it (wait 15s after, lens unchanged).
6. **Hero tooltips.** Hovering the "3rd" column shows "26 trades · 42% win · −0.81% a trade"; hovering a dot shows a symbol, direction, date, return and P&L for a real sample trade (e.g. "LUMN · long · Mar 26 · +4.78% · $476"); clicking "Your stop" shows the −2% line with legend counts 79 / 7 / 26.
7. **Sample report.** Clicking "See the sample report" renders `#report` within 500ms of the fetch resolving; the page scrolls to it; the six stat values count up and end at 112 / 61% / +0.33% / +1.53% / $3,238 / −$1,686; the stop panel reads "33 of 112 trades went more than 2% against you at some point; 7 of them came back green. Closing every one of them at −2% would have made your total +13.2% instead of +37.3%"; `#report-bar` says "Sample report · 112 fictional trades…"; `#report-followup` is visible below the report.
8. **Own file.** Dropping any fills CSV onto `#drop` renders a report with `#report-bar` reading "Your report · computed in this tab · nothing uploaded"; in the Performance panel no GSAP frame runs between the `drop` event and the `#report` mutation; changing `#stop` to 3 on the sample report shows "+35.5% instead of +37.3%".
9. **Report cleared.** A file with no closed trades empties `#report`, removes `body.has-report` and hides `#report-bar` and `#report-followup`.
10. **No upload.** With the Network panel open, dropping a file produces zero new requests; going offline after load and dropping a file still produces a report; the only requests on a fresh load are the page, CSS, JS chunks, Google Fonts CSS and woff2 files, and `sample-trades.csv`.
11. **Reduced motion.** With `prefers-reduced-motion: reduce` emulated: no element has `opacity: 0` after load, `html` has no `motion` class, there is no Lenis instance, the story shows six stacked figures with all captions readable, the honest-math slider updates instantly, `document.getAnimations().length === 0` after 2s, and the analyzer works.
12. **Toggle.** The footer "Motion: off" produces the same state as item 11 without a reload and keeps a rendered report on screen; the preference survives a reload; "Motion: on" reloads when no report is on screen.
13. **No JS.** With scripting disabled the page is readable top to bottom (every headline, number, caption, card, stamp and FAQ answer visible), the drop label opens the file picker, and both waitlist forms post to Buttondown in a new tab.
14. **Story scrub.** Scrolling through `#story` at 1440×900 keeps the stage under the nav for about six viewports; beats appear in order; at beat 1 the curve ends at $3,238; at beat 3 the big number reads exactly "+37.3% → +58.5%" and the three leak cards match the CLI sentences (U+2212 for minus); at beat 4 exactly 33 dots sit left of the −2% line, 7 of them rings, and the readout ends at +13.2%; at beat 5 five labelled dots and a 65% bar.
15. **Rail.** Clicking the six rail dots scrolls to each beat; the URL does not change.
16. **Honest math.** Default chip, slider at 3: "adjusted −0.01%", badge TOO FEW; at 5: EARLY SIGNAL and "a leak"; at 15: SOLID. "3 lucky trades at +4.00%": +1.18% TOO FEW; at 5 → +1.56% "an edge (early signal)"; at 15 → +2.53% "an edge (solid)". "1st trade of the day" at 45 → +0.83%.
17. **Color discipline.** Green and red appear only on P&L values, bars, trade dots, EDGE/LEAK tags, edge/leak cards and pre-check verdicts; buttons, links, focus rings, stamps, the privacy pulse and the roadmap line are ivory; weak spots and "too few" are graphite/hatch. No amber anywhere.
18. **Contrast.** `--muted` on `--bg` ≥ 4.5:1, `--bg` on `--text` (buttons) ≥ 4.5:1, measured with the DevTools picker; all body text AA.
19. **Budgets.** Built site: JS ≤ 110 KB gz (target 100), CSS ≤ 20 KB gz, fonts ≤ 200 KB, no image requests; Lighthouse mobile Performance ≥ 90, Accessibility ≥ 95, CLS < 0.05.
20. **Idle cost.** Scrolled to the FAQ, the Performance panel shows no `heroField` frames and every bento timeline is paused; hero rAF resumes when scrolled back.
21. **Drift.** `npm test` runs `test/site.test.ts` and it passes; in dev the console shows no "sample drift" warning; every number in the hero captions, story overlays, bento notes and pre-check rows equals the CLI output.
22. **Waitlist.** Submitting the roadmap form with a valid email shows "You're on the list. Check your inbox to confirm your email." and the Network panel shows exactly one POST to buttondown.com containing only the email field; the contextual form behaves identically; after one succeeds the other shows "You're on the list."
23. **Keyboard.** Tab from the top reaches the skip link, the nav waitlist button, the drop zone (Enter opens the picker), the sample button, Options, the lens chips (Enter/Space switch), the rail dots, the honest-math chips and slider (arrow keys change n), the export tabs (arrow keys), every FAQ summary, both email inputs and the motion toggle; focus rings are visible on all of them.
24. **No fake proof.** No testimonials, user counts, press or partner logos; "TradingView" appears only as text naming a supported export; every statistic on the page is a product rule from `analyze.ts` or a sample number labelled fictional.
25. **Resize.** Rotating a phone portrait → landscape → portrait, opening three FAQ items, and rendering the sample report above the story leave the story stage aligned with its beats on desktop (refresh fired) and no horizontal scroll at any width.
26. **Dock.** At 1440×900 the dock appears once `#input` scrolls out and hides at `#report-followup`, `#signup-roadmap`, `#final` and when a report exists; its "Drop your CSV" opens the OS picker in one click and scrolls back to the drop zone.
27. **Subpath.** `npm run build && npx vite preview --base /mytradepilot/` serves a working site: fonts, `sample-trades.csv`, the motion chunk and the lazy section chunks all load with relative URLs.

---

## 11. Build notes for the engineer

**Build order (do it in this order; cut from the bottom of the cut list, never from the top of this one):** (1) Step 0 and its test. (2) `index.html` + `style.css` retarget + `site.css`: the whole page must read complete with scripting off before any animation code exists. (3) `site/index.ts`, `motion.ts`, `nav.ts` (actions, dock, tabs, toggle, second signup), `reportMotion.ts`. (4) `sample.ts` + `tagTrades` + `test/site.test.ts`. (5) `dots.ts` + `heroField.ts`. (6) `story.ts`. (7) `honest.ts`, `precheck.ts`. (8) `tiles.ts`. (9) final-band canvas, magnetic buttons, drop catch flash. **Cut list, in order:** magnetic buttons → bento loops (ship the static SVGs) → privacy pulse → final-band canvas → hero per-dot tooltip (keep the column tooltip) → hero "Your stop" lens (keep three) → story beat 5 (its content is already in the bento). Never cut: the hero sort, story beats 0–4, honest math, report followup, dock, reduced-motion correctness.

Gotchas:

1. **Lenis + GSAP ticker.** Exactly one loop: `autoRaf: false`, `gsap.ticker.add(t => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`, `lenis.on('scroll', ScrollTrigger.update)`. Import `lenis/dist/lenis.css` from `site.css`. Do not set a `scrollerProxy`, do not use ScrollSmoother or `normalizeScroll`. Lenis 1.3 uses native scroll, so `position: sticky` and `main.ts`'s `scrollIntoView` keep working.
2. **The report scroll.** `main.ts` calls `reportEl.scrollIntoView({ behavior: 'smooth' })` synchronously after `run()`. The MutationObserver callback runs as a microtask after that, so calling `lenis.scrollTo(reportEl, { offset: -(navH + 16), duration: 0.9 })` there takes over the native smooth scroll (browsers cancel a smooth scroll when another programmatic scroll starts). Only do it when `pendingScroll` was set by `#files` change, `#drop` drop or `#demo` click; a `#tz`/`#stop` re-render must not scroll. Test in Safari and Chrome.
3. **SplitText.** Import from `gsap/SplitText` (3.13+ is free). Use `SplitText.create(el, { type: 'lines', mask: 'lines', autoSplit: true, onSplit: self => gsap.from(self.lines, {...}) })` and return the tween from `onSplit` so `autoSplit` can revert and re-split on resize/font swap. Wait for `document.fonts.ready` (race it against a 500ms timeout) before the first split, or lines split on fallback metrics and re-wrap on swap. Keep masks `overflow: hidden` and never put `data-reveal="lines"` on an element with a `::before` rule.
4. **ScrollTrigger refresh.** Call `ScrollTrigger.refresh()` (debounced 100ms) on `document.fonts.ready`, on every `details` `toggle` (the hero help details changes the hero's height), on tab switches, on `orientationchange`, and from the `ResizeObserver` on `#report` (a 3000px report lands above every trigger). `ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true })`.
5. **Sticky.** `position: sticky` breaks silently under any ancestor with `transform`, `overflow` other than `visible`, or `contain`. The story intro's reveal must target the intro block, not the section; `#story` gets no `overflow: clip`; `content-visibility: auto` only on `#faq` and `footer`.
6. **Canvas.** Cap DPR at 2 (1.5 under 768px); size the backing store on resize only; `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`; clear with `clearRect` in CSS pixels; redraw only on a `dirty` flag; stop the rAF when the canvas leaves the viewport or `document.hidden`. Read colors from CSS custom properties; never hard-code hex in TS.
7. **Sample URL.** Use the identical string `main.ts` uses: `` `${import.meta.env.BASE_URL}sample-trades.csv` ``. With `base: './'` it resolves to `./sample-trades.csv`, relative to the page, so it works at the GitHub Pages subpath; the second fetch hits the cache. Never `/sample-trades.csv`.
8. **`base: './'`.** All asset references in `index.html` must be relative (Vite rewrites `/src/...` script tags, but hand-written `href`s to `/` would break under the subpath). Verify with acceptance 27.
9. **Untouched ids.** `files`, `drop`, `tz`, `stop`, `demo`, `status`, `report`, `signup` (and `signup-email`) keep their tags and nesting; `#tz` and `#stop` inside `<details>` are still in the DOM at load, which is all `main.ts` needs. Do not edit `main.ts` or `signup.ts`; if something seems to require it, the spec has another way.
10. **TypeScript settings.** `verbatimModuleSyntax` → `import type { … }` for types; `erasableSyntaxOnly` → no enums, namespaces or parameter properties; `allowImportingTsExtensions` → import with `.ts` extensions, including from `test/site.test.ts`, which runs under `node --test` with type stripping, so it must also avoid non-erasable syntax.
11. **Step 0 details.** `exc = random.Random(11)` must be a separate RNG; keep the condition's `exc.random()` before the branch's `gauss`. The `Worst %` on a closing fill is stored negative (`-Math.abs`), matching the TradingView parser. Open positions keep `mae/mfe` of their fills; `finish()` with `exitTime === null` is unchanged otherwise.
12. **Count-ups.** Only on `.stat .value` and `[data-count]`; the parser in 6.6; set the exact original string on complete; never run before the first paint of the rendered report (next animation frame).
13. **`has-report` lifecycle.** `main.ts` sets `reportEl.innerHTML = ''` when no closed trades are found; the observer must handle removal as well as insertion.
14. **Two signup forms.** `setupSignup` un-hides the section it is given and binds its `form`; give the second form its own `label for`, `input id`, `button` and `.signup-msg`. Buttondown de-duplicates by email, but mark both forms done after one success anyway.
15. **Hero density.** The h1 cap is 76px with `max-width: 12ch`; if it wraps to three lines at 1280 or 1366 wide, lower the cap, do not widen the column. The works-with line lives inside the help details; keep it there.
16. **Lens tour politeness.** Never start a morph while `#drop` has focus or `.over`, or while the pointer is inside `#input`; cancel the tour on any interaction; cap it at one tour.
17. **Color discipline.** Reusing `.pos`/`.neg` for decorative states is the easiest way to fail acceptance 17; the drop flash, pulse, privacy pulse, stepper line and stamps are ivory.
18. **Dev drift check.** `sample.ts`'s `bindSampleNumbers` compares the typed HTML to the computed value in `import.meta.env.DEV` and warns; `test/site.test.ts` makes the same check fail the build. When Step 0 regenerates the sample, re-run the CLI and update the typed numbers; the test tells you which.
19. **Idle work.** `requestIdleCallback` is missing in Safari: `const idle = window.requestIdleCallback ?? (cb => setTimeout(cb, 200))`.
20. **Buttondown.** `signup.ts` posts with `mode: 'no-cors'`; the response is opaque; the success message is shown on fetch resolution, which is the existing behavior and must not change.
