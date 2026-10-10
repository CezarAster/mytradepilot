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
