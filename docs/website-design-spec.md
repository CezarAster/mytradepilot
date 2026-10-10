# MyTradePilot website: build spec (Equity River v2)

**Direction: Equity River, restyled as Flight Recorder.** The client kept the Equity River direction and asked for three changes: the visual style becomes Flight Recorder's, the hero tagline becomes "Drop in your trades. Watch your edge show up.", and Flight Recorder's "Get your edge checked before every trade" block (the pre-trade check card and the waitlist band) comes into the page. Everything else that made Equity River is kept: the full-viewport particle hero that settles onto the real equity curve, the analyzer console in the hero fold, the trust strip, the sample counters, the four-scroll story frame (fills, trades, lanes, verdict) exactly as it is, the pilot marker that leaves the curve and lands in the waitlist button, the six bento loops, FAQ and footer.

**The look is locked** to the prototype `docs/prototypes/equity-river-v2.html` (a copy of `/tmp/claude-0/-home-user-mytradepilot/9604b351-8d91-5354-8384-6d4bd9ae4985/scratchpad/protos/equity-river-v2.html`). Its `:root` tokens, markup, CSS and the four classes in its script (`River`, `Story`, `Pilot`, `Preflight`) are the reference the engineers port into TypeScript modules. Where this document and the prototype disagree on numbers or copy, the prototype's rendered look wins and this document's copy and data binding win (the prototype bakes its numbers; production computes them). Line references below point into that file: CSS 5–430, boot gate 431–439, markup 441–828, baked `DATA` 830–833, site script 895–1492 (`River` 932–1112, `Story` 1114–1224, `Pilot` 1226–1282, `Preflight` 1284–1334, boot 1336–1491).

Three independent engineers each build the whole production site from this document in one session: vanilla TypeScript + CSS + canvas 2D, GSAP 3.15.0 (core, ScrollTrigger, SplitText) and Lenis 1.3.26 from `node_modules`, on the Vite 7 static site at `/home/user/mytradepilot` (`base: './'`, deployed to GitHub Pages under `/mytradepilot/`). Google Fonts is the only external resource. No three.js, no images, no CDN scripts. Where this document says "exact", copy verbatim.

### What was verified before writing (this repo, this session)

- `node src/cli.ts --tz America/New_York public/sample-trades.csv`: 112 closed trades, 45 days, 2026-03-02 → 2026-05-01, tickers HYDR, LUMN, NOVA, ORBX, QBIT, RKT. Win rate 61% (0.6071), avg +0.33% (0.33327), median +0.44%, avg win +1.53%, avg loss −1.52%, total $3,238 (+37.3% summed, 37.326), profit factor 1.45 (1.4511), max drawdown −$1,686, 0.17R at a 2% stop. 232 fill rows (233 lines), 10,578 bytes before Step 0.
- Edges (all solid): 1st trade of the day 45 · 73% · +0.94%; entries 9:30–9:45 ET 46 · 72% · +0.88%; longs 79 · 65% · +0.52%. Leaks: 3rd trade of the day 26 · 42% · −0.81% → +58.5% instead of +37.3% ($5,583 without them, solid); shorts 33 · 52% · −0.11% → +41.0% (solid); quick re-entries within 10 min of a loss 13 · 38% · −0.83% → +48.1% (early signal). Top 5 trades = 65% of the total. Trade number of the day: 1st 45 · 73% · +0.94% · $4,131; 2nd 38 · 58% · +0.44% · $1,538; 3rd 26 · 42% · −0.81% · −$2,346; 4th or later 3 · 67% · −0.29% · −$86 (too few). 10:15–11:30 entries 19 · 47% · +0.29% (solid).
- Equity by exit time: trough −$774 at trade 43, peak $3,441 at trade 111, end $3,238. Top 5 by return: HYDR long Apr 14 +6.71% ($670), RKT long Mar 30 +5.03% ($502), LUMN long Mar 26 +4.78% ($476), LUMN long Apr 29 +4.17% ($416), LUMN long Apr 13 +3.64% ($363). Worst: ORBX long Mar 13 −5.12% (−$512). Returns range −5.12% … +6.71%; largest |P&L| $670.
- The three real trades used in copy, re-derived with the engine's own context rules: LUMN long Tue 2026-03-03 09:31 ET, 1st of the day, 6 fills, held overnight, −0.89% (−$197). ORBX short Thu 2026-04-09 11:15 ET: 3rd trade of the day, quick re-entry (< 10 min after a loss), −2.95% (−$293). LUMN long Thu 2026-03-05 09:42 ET: 1st trade of the day, first of the day, +2.18% (+$218).
- Shrinkage (engine formula `adj = (n·avg + 10·overall)/(n + 10)`, overall 0.33327): (−1.17, 3) → −0.01; (−1.17, 5) → −0.17; (+4.00, 3) → +1.18; (+4.00, 5) → +1.56; (+4.00, 15) → +2.53; (+0.94, 45) → +0.83; (+0.94, 1) → +0.39; (+3.00, 3) → +0.95; (+3.00, 20) → +2.11.
- **Step 0 reproduced in a scratch copy** (section 0): the first six CSV columns are byte-identical to `HEAD`, all 14 report lines above RISK are unchanged, 8/8 existing tests pass, the regenerated file is 12,334 bytes (12.0 KB), and the CLI prints `RISK: 33 trades went past -2%; 7 came back green. With a hard 2% stop: +13.2% vs +37.3%.`; `--stop 1.5` → 41 past, 11 back, +18.0%; `--stop 3` → 15 past, 0 back, +35.5%. 79 trades never got within 2% (`maePct > −2`), 26 stayed red; the 7 that came back made +16.25 points combined, the 26 that stayed red made −58.12; minimum worst point −6.46%.
- Parse + analyze of the sample: 11.3 ms per run in Node (20-run average). "Computed in milliseconds" is true.
- Gzipped vendor sizes from `node_modules` (gsap 3.15.0, lenis 1.3.26): `gsap.min.js` 28.3 KB, `ScrollTrigger.min.js` 18.0 KB, `SplitText.min.js` 3.7 KB, `lenis.mjs` 8.2 KB (`lenis.min.js` 5.4 KB). 58.2 KB for the four Vite will bundle. `CustomEase` (3.7 KB) is registered by the prototype but never used: leave it out.
- Google Fonts latin woff2 transfer for `Instrument+Serif:ital@0;1`, `Inter:wght@400;500;600`, `JetBrains+Mono:wght@400;500`: Instrument Serif 15.0 + 15.7 KB, Inter (one variable file) 48.4 KB, JetBrains Mono (one variable file) 31.3 KB = 110.5 KB.
- Prototype QA (`shots-equity-river-v2*/report.json`): 0 console errors, 0 page errors, 0 failed requests, no horizontal overflow at 1440 (document 9,316 px tall) or 375 (10,038 px); reduced-motion pass renders every section static. Screenshots `desktop-000/030/045/075/090.png` and `phone-000.png` are the reference frames quoted in section 2.

### Decisions that resolve the judges' critiques of Equity River

| Risk raised (judges on proposal 1, plus the panel's general risks) | Decision in this spec |
|---|---|
| Copy is the thinnest of the four; the builder must invent most of the page | Section 3 carries the full copy of every section, including the sections the prototype cut (shrink lab, stop lab, methodology with the privacy proof, export how-to, a 12-question FAQ, honest footnotes). No placeholder text anywhere. |
| Conversion scaffolding is thin: no sticky CTA, waitlist nudge under the report is a link, no export how-to, demo CTA lives mainly in the nav | Objection-ordered architecture and CTA map (1.3): the analyzer is offered above the fold (one-click OS picker + sample button), under the story, under the export how-to, in the final band and in a persistent dock (desktop pill, mobile bar); the waitlist is asked after value only: a contextual form under the rendered report (`#signup-report`), the roadmap CTA, and the band. |
| Methodology after the waitlist | `#method` (engine, unit, shrinkage, privacy proof, requests fine print) sits before the roadmap and the band. |
| Pilot marker traversing a GSAP-pinned story; anchor rects unstable; "recompute on refresh" does not cover a pinned leg | **No GSAP pins anywhere.** The story is CSS `position: sticky` inside a fixed-height field (`400vh`) with one scrubbed ScrollTrigger (`start: 'top top', end: 'bottom bottom'`). The pilot reads every anchor's `getBoundingClientRect()` per frame while active (sticky rects are then always current), recomputes its scroll stops on every `ScrollTrigger.refresh()`, and is disabled ≤ 768 px, under reduced motion and while `body.has-report` (6.2). |
| Hero-to-story particle hand-off is a time sink | Cut, as in the prototype: the hero exit scrub only fades the curve and drifts/greys the particles (5.5). Nothing travels between sections except the pilot. |
| `hero-data.ts` bakes a duplicate 112-point curve that can drift | No baked data. `sample.ts` fetches the CSV and runs the engine; the HTML ships typed numbers bound with `data-sample`, checked by a build-failing test (7.3). If the fetch fails, the hero draws the grid only and says so; it never paints a fake curve. |
| `lenis.scrollTo('#report')` and `main.ts`'s `scrollIntoView` double-scroll | `reportMotion.ts` takes over from the native smooth scroll inside the `#report` MutationObserver callback, only after a pick/drop/demo (6.7, gotcha 2). |
| Reduced-motion plan does not say whether `[data-reveal]` is hidden by default (hidden content with JS off) | The prototype's gate: reveal targets are hidden only under `html.motion`, added by an inline head script when motion is allowed; a 2 s safety timer and a `window.error` fallback call `revealAll()` (7.4). With JS off nothing is hidden. |
| Hero crams a 100vh canvas, 7-col text and a 5-col console | The prototype's layout is the reference (desktop-000.png at 1440×900): h1 capped at 76 px, console 5/12 wide, curve drawn in the lower 52% of the hero. Acceptance 1 checks 1280×720, 1366×768 and 1440×900. The hero end labels that overlapped the console in the prototype get a collision rule (5.4). |
| Sample counters echo the competitor lead-with-a-number pattern | Kept (a client set-piece), labelled fictional in the caption, followed by an honest footnote, and placed after `#results` so a visitor's own report always outranks it. |
| Cyan-on-black particle hero is the awwwards-crypto cliché | Flight Recorder's tokens: signal blue `#5B9CFF` is the only UI colour, near-black `#0A0C10`, white serif headlines. Cyan and the warm paper tone are gone (grep for `6FE3FF`, `F6EFE3`, `--paper` must return nothing). |
| 130 KB font budget unrealistic for 7 files | Measured 110.5 KB (four files: Google serves Inter and JetBrains Mono as one variable file each). Cap 130 KB (8.1). |
| Stop check shown schematically, no numbers | **Step 0 adopted** (section 0): optional `Worst %`/`Best %` fill columns and the regenerated sample. The stop lab, the bento stop tile, the FAQ and the live `#stop` input all show real engine output. The four-scroll story is untouched by it. |
| Nav has a filled "Join the waitlist" before any value | Locked Flight Recorder nav. The button only scrolls to the band, which sits after the story, bento, labs, methodology, export and roadmap; nothing is gated on it; the dock and the hero carry conversion 1. |
| Amber anywhere breaks "signal blue is the single UI colour" | `--weak` appears only where the report itself uses it: the `early signal` pill and weak-spot tags/cards. The `#status` line, the stop lines in the stop tile and the stop lab, the scan line, pulses and focus rings are blue or achromatic. |
| Two signup forms share state and messages | `#signup` (the band, bound by `main.ts`) and `#signup-report` (bound by `nav.ts` via a second `setupSignup`): distinct ids, labels and `.signup-msg`; a `signup:done` event marks the other form done. |
| `has-report` left on after `#report` is emptied; count-ups parse `$12.3k` / `-$1,686` | The MutationObserver handles removal; the count-up regex and formatter in 6.7 leave anything unparsed alone. |
| Mobile page length; `body` padding toggling | One `#dock` (desktop pill / mobile bar); `main { padding-bottom: 80px }` once at ≤ 767 px. |
| Pre-trade check flip changes the card height and shifts the page | The prototype's slot rule: `#pf-slot` keeps `min-height` = the taller face; the card tweens its own height while flipping (6.3). |
| Scope | Build order and cut list in section 11; everything on the cut list ships as static HTML/SVG that is already in the page. |

---

## 0. Data prerequisite: the stop check needs worst-point data (Step 0, ~30 minutes, exact diff)

`public/sample-trades.csv` is a plain fill list, so `analyze()` returns `risk.hasExcursions = false` and the stop check is skipped for the sample. The page demos three verdicts (edges, leaks, stop); without this step it can only demo two, and the stop lab, the bento stop tile and the FAQ's stop answer would have nothing true to show. Apply this before any site work. The trade stream is untouched: the new columns are appended to the closing fill of each round trip only.

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

`findColumns` is unchanged: `required` stays `symbol, side, qty, price, time`, so the two new keys are optional and every existing fill list still parses. The `Worst %` on a closing fill is stored negative (`-Math.abs`), matching the TradingView parser. Open positions keep the `mae/mfe` of their fills; `finish()` with `exitTime === null` is otherwise unchanged.

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

The header row becomes `['Symbol', 'Side', 'Qty', 'Price', 'Time', 'Commission', 'Worst %', 'Best %']`. Extend the docstring with "Losers run well past a 2% stop; a few winners dip past it and come back." Keep the evaluation order exactly as written (the condition's `exc.random()` is drawn before the branch's `gauss`). Run `python3 scripts/make-sample.py` from the repo root; it prints `232 fills`.

### 0.3 Tests and docs

- `test/engine.test.ts`: add `test('fills: optional Worst %/Best % columns become maePct/mfePct and turn on the stop check')`: a 2-row CSV with header `Symbol,Side,Qty,Price,Time,Commission,Worst %,Best %`, rows `ABC,Buy,100,10,2026-03-02 09:35,1,,` and `ABC,Sell,100,11,2026-03-02 10:00,1,-3.1,12`; assert `maePct === -3.1`, `mfePct === 12`, and `analyze(trades, { stopPct: 2 }).risk.hasExcursions === true`.
- `README.md`, one line under Layout: "A fills export may carry optional `Worst %` / `Best %` columns on the closing fill (TradingView's `Adverse excursion %` is read automatically); they turn on the stop check."
- The hero help details gets a third bullet (3.1).

### 0.4 Acceptance for Step 0

`diff <(cut -d, -f1-6 public/sample-trades.csv) <(git show HEAD:public/sample-trades.csv | cut -d, -f1-6)` is empty; `node src/cli.ts --tz America/New_York public/sample-trades.csv` prints the same lines as before plus `RISK: 33 trades went past -2%; 7 came back green. With a hard 2% stop: +13.2% vs +37.3%.`; `--stop 1.5` → `+18.0%`, `--stop 3` → `+35.5%`; `npm test` 9/9; `npm run typecheck` clean; the file is 12,334 bytes. If any of these fail, stop and fix Step 0 before touching the site; never type a number the CLI does not print.

---

## 1. Positioning, headline, subhead, CTAs

**Positioning line** (nav tagline at ≥ 1400 px, footer): `The honest trade analyzer. Free, in your browser, nothing uploaded.`

**`<meta name="description">` / OG description:** "MyTradePilot is a free trade analyzer that runs entirely in your browser: drop in a TradingView or broker export and see where you make money, where you give it back, and what your stop is doing. Step one of the pre-trade check that keeps you inside your edge."

**`<title>`:** `MyTradePilot: free trade analyzer that finds your edge, in your browser`

**Hero headline (final, exact):** `Drop in your trades. Watch your <em>edge</em> show up.` The `<em>` is Instrument Serif italic in `--accent` (2.3); the rest of the h1 is white. Renders on two lines at 1280, 1366 and 1440 wide (acceptance 1) and three at 375.

**Eyebrow** (Inter 500 12 px, uppercase, `--muted`): source text `Free trade analyzer · Runs in your browser`, rendered `FREE TRADE ANALYZER · RUNS IN YOUR BROWSER`.

**Subhead (exact, Equity River's):** "Drop a TradingView or broker export. In seconds you see where you make money, where you give it back, and what your stop is really doing. Free, runs 100% in your browser, your trades are never uploaded."

**CTA labels (exact):**

| Where | Label | Element and action |
|---|---|---|
| Hero primary (desktop and phone) | "Drop your CSV" (≤ 768 px the same button reads "Choose my CSV files") | `button#cta-drop.btn.btn-primary[data-action="pick"]`: `files.click()` synchronously in the click handler (opens the OS picker in one click), then on ≤ 768 px scroll to `#input`, then `drop.classList.add('pulse')` for 1.4 s. `main.ts`'s `change` handler does the rest. |
| Hero secondary | "Run the sample report" | `button#cta-sample.btn.btn-secondary[data-action="demo"]` → `document.getElementById('demo').click()` |
| Console | drop zone strong "Drop CSV files here", span "or click to choose. Several files at once are fine; duplicates removed, partial fills merged." | `label.drop#drop[for="files"]` (unchanged contract) |
| Console ghost link | "Run the sample report" | `button#demo.btn-ghost` (bound by `main.ts`, unchanged) |
| Nav | outlined "Try the sample" · filled "Join the waitlist" | `#nav-sample[data-action="demo"]` · `a#nav-join[href="#signup"][data-scroll-to]` |
| Under the counters | "Want this before every trade? Join the waitlist →" | `a.slim[href="#signup"][data-scroll-to]` |
| Story end | "Run this on your trades" | `#story-run.btn.btn-secondary[data-action="pick"]` |
| Export end | "Analyze my trades" · "Which files work?" | `[data-action="pick"]` · `[data-action="help"]` (opens the hero `details.help`, scrolls to it) |
| Roadmap | "Join the waitlist" + small print "Early access and founding-member pricing for the waitlist." | `a.btn.btn-primary[href="#signup"][data-scroll-to][data-magnetic]` |
| Waitlist band | submit "Join the waitlist" (the pilot lands in its `.pilot-slot`) | `#signup form` → `signup.ts`, unchanged |
| Contextual, under a rendered report | submit "Join the waitlist" | `#signup-report form` → `signup.ts` via a second `setupSignup` call from `nav.ts` |
| Final band | "Analyze my trades" · "Run the sample report" | `pick` · `demo` |
| Dock, desktop | "Drop your CSV" · "Run the sample" | `pick` · `demo` |
| Dock, phone | "Run the sample report" | `demo` |

### 1.3 Conversion logic (read before building)

The page answers a skeptical trader's objections in this order, and every section exists for one of them.

| # | Objection | Answered by | Proof (all true) |
|---|---|---|---|
| 1 | "Worth 30 seconds?" | Hero: the trader's own 112 trades rain in and become an equity curve; the analyzer sits beside it | live engine output, fictional and labelled |
| 2 | "Scam / funnel?" | Trust strip, "runs locally" chip, no account, the engine on GitHub | verifiable |
| 3 | "What do I get?" | Sample counters, then the story: fills → trades → lanes → verdict | real numbers |
| 4 | "What else does it find?" | Bento: edges, leaks, stop, concentration, breakdowns, many files | real feature list |
| 5 | "Cherry-picked small samples?" | Shrink lab: the exact shrinkage rule, interactive | the formula from `analyze.ts` |
| 6 | "Will it just tell me to tighten my stop?" | Stop lab: 79 / 7 / 26 and the hard-stop ladder | engine output after Step 0 |
| 7 | "Will my trades leak? Can I check the math?" | Methodology + privacy proof + requests fine print | verifiable, DevTools check |
| 8 | "I don't know how to export" | Export how-to tabs | exact menu paths |
| 9 | "Why free, what's the catch?" | Roadmap: the analyzer is step one; the pre-trade check preview; the waitlist is how the paid app gets built | honest funnel |
| 10 | Everything else | FAQ | |

CTA map: conversion 1 (run the analyzer) is offered above the fold (picker button, sample button, drop zone), at the story end, at the export end, in the final band and in the dock. Conversion 2 (waitlist) is offered after value only: the contextual form under a rendered report, the slim link under the counters, the roadmap CTA and the band; the nav button is a shortcut to the band, never a gate.

---

## 2. Visual system (Flight Recorder's, exact)

### 2.1 Theme decision

Dark only, `color-scheme: dark`, one scope. The surface is near-black blue-grey (`#0A0C10`), the type is Instrument Serif (white headlines, one italic accent word in signal blue), Inter (body, UI, eyebrows) and JetBrains Mono (labels, counters, CSV, chips). Signal blue `#5B9CFF` is the single UI colour: links, focus rings, the primary button, the brand diamond, the pilot marker, the river, the roadmap line, milestone "when" labels, ticks, the "runs locally" dot, the scan line, the band's pulse. Green and red appear only on P&L: particles, chips, bars, values, `Edge`/`Leak` tags, edge/leak cards, pre-check rows and verdicts. The light theme, the `data-theme` attribute and both dark blocks in `style.css` are deleted. Texture is the faint 12×8 grid behind the hero and the `--shadow-1` panel elevation; no aurora, no blobs.

### 2.2 Tokens (exact; `:root` from the prototype, lines 6–29)

```css
:root{
  color-scheme:dark;
  --bg:#0A0C10; --bg-2:#0E1116; --surface:#141820; --surface-2:#1B2029; --surface-3:#222834;
  --line:#262D38; --line-strong:#344050; --grid:rgba(243,245,247,.05);
  --text:#F3F5F7; --text-2:#C3C9D2; --muted:#8A93A0; --muted-2:#5F6977; --faint:var(--muted-2);
  --accent:#5B9CFF; --accent-strong:#7FB4FF; --accent-ink:#06131A; --accent-soft:rgba(91,156,255,.14); --glow:rgba(91,156,255,.35); --accent-glow:var(--glow);
  --pos:#3DD68C; --pos-mark:#2EBF77; --pos-soft:rgba(61,214,140,.12);
  --neg:#FF6B6B; --neg-mark:#E5534B; --neg-soft:rgba(255,107,107,.12);
  --weak:#F0B35A; --weak-soft:rgba(240,179,90,.12);
  --radius-s:8px; --radius:14px; --radius-l:22px; --radius-lg:22px; --radius-pill:999px;
  --shadow-1:inset 0 1px 0 rgba(255,255,255,.04),0 12px 40px rgba(0,0,0,.45);
  --shadow-glow:0 0 0 1px var(--accent-soft),0 0 48px var(--glow);
  --font-display:'Instrument Serif',Georgia,'Times New Roman',serif;
  --font-body:'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
  --font-mono:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --fs-display:clamp(2.75rem,1rem + 4.2vw,4.75rem);   /* 44 → 76px; 69.8 at 1280, 73.4 at 1366, 76 at 1440 */
  --fs-h2:clamp(2rem,1.2rem + 3.2vw,3.5rem);           /* 32 → 56px */
  --fs-h3:clamp(1.375rem,1.1rem + 1vw,1.75rem);        /* 22 → 28px */
  --fs-lead:clamp(1.125rem,1rem + .5vw,1.3125rem);     /* 18 → 21px */
  --fs-body:1.0625rem; --fs-caption:.75rem;            /* 17px, 12px */
  --gutter:16px; --max:1200px; --nav-h:56px;
  /* aliases the analyzer stylesheet already uses */
  --on-accent:var(--accent-ink); --focus:var(--accent-strong);
}
@media (min-width:720px){:root{--gutter:32px;--nav-h:64px}}
@media (min-width:1100px){:root{--gutter:48px}}
```

Contrast against `--bg` (`#0A0C10`): `--text` 18.6:1, `--text-2` 13.1:1, `--muted` 6.6:1 (AA for body), `--muted-2` 3.4:1 (decorative only: the nav tagline, hero caption, trust line), `--accent` 7.8:1, `--pos` 11.2:1, `--neg` 7.6:1, `--weak` 10.1:1; `--accent-ink` on `--accent` (primary button) 7.5:1. `--muted-2` is never used for copy longer than one line.

Colour rules (acceptance 17): `--pos`/`--neg` and their `-mark`/`-soft` variants appear only on particles, chips, lane bars and values, `Edge`/`Leak` tags, edge/leak cards and rows, verdict stamps, the report's `.pos/.neg` and the stop-lab outcome paths. `--weak` only on the `early signal` pill and the report's weak-spot tag/cards. Everything interactive is blue on near-black.

### 2.3 Typography (Google Fonts, one request; sizes measured in the prototype)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
```

| Role | Setting (exact) |
|---|---|
| h1 | Instrument Serif 400, `--fs-display`, line-height 1, letter-spacing −.02em, `--text`; `em` italic `--accent`. Phone (≤ 768): 44px; ≤ 480: 40px. |
| h2 (`.display-2`) | Instrument Serif 400, `--fs-h2`, line-height 1.08, letter-spacing −.01em, white; `em` italic accent. |
| h3 | Instrument Serif 400, `--fs-h3`, line-height 1.2. Story steps 24px/1.15; bento tiles 24px; milestones 22px; lane labels 22px/1. |
| Body | Inter 400 17px/1.6 `--text`; `.lede` `--fs-lead`/1.5 `--text-2` max 60ch; `.small` 14px/1.5; step copy 15px `--text-2`; tile copy 14.5px/1.5 `--text-2`; milestone copy 14px/1.5 `--muted`; FAQ answers 16px/1.6 `--text-2` max 70ch. |
| Eyebrow | Inter 500 12px/1.4, uppercase, letter-spacing .08em, `--muted`. Counter labels: Inter 500 11px uppercase .06em `--muted`. |
| Mono label | JetBrains Mono 500 12px/1.4 `--muted` (`.mono-label`): hero caption, frame head, pre-check header, status. |
| Numbers | JetBrains Mono, `font-variant-numeric: tabular-nums` on `body`. Counters 500 `clamp(34px, 1.6rem + 1.8vw, 52px)`/1 letter-spacing −.01em (34px on phones); story big number 500 `clamp(32px, 1.4rem + 1.2vw, 40px)`; lane values 500 12px; chips 500 12px; CSV rows 400 12px/20px (10px/16px on phones). Marketing copy uses U+2212 (−) for minus; the report keeps what `format.ts` prints. |
| Buttons, nav | Inter 500 16px (nav buttons 14px, links 14px `--text-2`); brand Inter 600 16px letter-spacing −.01em. |
| Honest footnote | Instrument Serif italic 400 19px/1.4 `--text-2`, max 56ch, preceded by a 24px × 1px `--accent` rule (`.footnote`). |

Fallback metrics so the swap does not shift the hero: `@font-face { font-family: 'Instrument Serif Fallback'; src: local('Georgia'); size-adjust: 96%; ascent-override: 88%; descent-override: 22%; }` and `@font-face { font-family: 'Inter Fallback'; src: local('Arial'); size-adjust: 107%; }`, placed in the stacks right after the real family. The hero reveal waits for `document.fonts.ready` raced against 900 ms (the prototype's boot, line 1490).

### 2.4 Layout, spacing, radius, elevation

`.wrap { width: min(100% - 2*var(--gutter), var(--max)); margin-inline: auto }` (gutters 16 / 32 / 48 at 0 / 720 / 1100). `.section { padding: 64px 0 }`, 128px at ≥ 720. `.section-head { max-width: 760px; margin-bottom: 48px }` (32px on phones): eyebrow, h2 (`margin-top: 12px`), lede (`margin-top: 16px`). Radii: 8 (inputs, cards inside panels), 14 (console drop zone, tiles, counters link, pre-check card), 22 (console, story frame, waitlist band), pill (buttons, chips). Elevation: 1px `--line` border + `--shadow-1` on the console, story frame and pre-check card; the waitlist band uses the accent ring (2.5). Alternate bands: `#trust`, `#story` and `#roadmap` sit on `--bg-2` with 1px `--line` top/bottom rules; everything else on `--bg`.

### 2.5 Components (exact CSS behaviour, from the prototype's stylesheet)

- `.btn`: inline-flex, gap 8px, `padding: 12px 20px`, radius pill, Inter 500 16px/1.2, 1px transparent border, `transition: background .2s, color .2s, border-color .2s, box-shadow .2s`, `will-change: transform` (magnetic). `.btn-primary`: `--accent` fill, `--accent-ink` text; hover `--accent-strong` + `box-shadow: var(--shadow-glow)`. `.btn-secondary`: transparent, 1px `--line-strong`, white text; hover border `--accent`, background `--accent-soft`. Nav buttons: `padding: 10px 16px; font-size: 14px`. `.btn-ghost`: no box, `--accent`, underline offset 4px thickness 1px, Inter 500 15px; hover `--accent-strong`. Focus: `:focus-visible { outline: 2px solid var(--accent-strong); outline-offset: 2px; border-radius: 4px }` everywhere.
- `.mchip` (mono chip): inline-flex, gap 6px, JetBrains Mono 500 12px/1, `padding: 6px 10px`, pill, 1px `--line-strong`, `--surface` fill, `--text-2`; `.dot` 6px circle `--accent` with `box-shadow: 0 0 8px var(--accent)`. Used for "runs locally" and "trades sent: 0 bytes" (11px there).
- `.pill` (confidence, SOLID style): inline-block, Inter 500 11px/1, uppercase, letter-spacing .06em, `padding: 5px 8px`, pill. `.pill.solid { background: rgba(243,245,247,.08); color: var(--text) }`, `.pill.early { background: var(--weak-soft); color: var(--weak) }`, `.pill.few { background: rgba(138,147,160,.12); color: var(--muted) }`. The report's `.conf` is restyled as `.pill` (`.conf-solid` → solid, `.conf-early-signal` → early, `.conf-too-few` → few); the report's `.tag` becomes the Flight Recorder tag: Inter 600 13px, `--pos` for edge, `--neg` for leak, `--weak` for weak.
- `.console` (`#input`): `--surface-2`, 1px `--line`, radius 22, `--shadow-1`, `padding: 24px` (20px on phones). `.wb-head`: flex, gap 12px, wrap; h2 "Analyzer" Inter 500 15px; `.spacer` flex 1; `.file-card`: grid `28px 1fr`, gap 10px, width 188px, `padding: 8px 10px`, `--surface`, 1px `--line-strong`, radius 8, mono 500 11px/1.35 `--text-2`; the SVG file glyph in `--accent`; `b` white, ellipsised; `span` `--muted`. Below 1280 px the file card wraps full-width under the header (`order: 10; width: 100%`).
- `.drop` (`#drop`): block, `margin-top: 24px`, `padding: 32px 24px` (24px 16px on phones), centred, 1.5px dashed `--line-strong`, radius 14, `background: rgba(10,12,16,.25)`, `overflow: hidden`, `transition: border-color .2s, background .2s`. `strong` Inter 600 17px/1.3 white; `span` 14px/1.45 `--muted` max 36ch centred, `margin-top: 6px`. `.drop:hover, .drop.over, .drop.pulse`: border `--accent`, background `--accent-soft`. Under `html.motion`, `.over` and `.pulse` add a 2px accent scan line (`::after`, `box-shadow: 0 0 12px var(--accent)`, `@keyframes scan { from { top: 0 } to { top: 100% } }` 1.2s linear infinite).
- `.options`: grid 1fr 1fr gap 12px `margin-top: 16px` (one column ≤ 1100 px); labels Inter 500 13px `--muted`; `select, input`: `margin-top: 6px`, full width, `--surface`, 1px `--line`, radius 8, `padding: 10px 12px`, Inter 400 15px (the number input in mono); focus border `--accent` + `box-shadow: 0 0 0 3px var(--accent-soft)`.
- `.wb-foot`: column, gap 12px, `margin-top: 16px`. `details.help summary`: Inter 500 14px `--text-2`, no marker, `::before` content `+` in mono `--accent` (12px wide), `–` when open; `ul` disc, `padding-left: 18px`, 13.5px `--muted` 1.5, `b` white 600. `.trust-line`: 12px/1.5 `--muted-2`. `.status`: mono 500 12px/1.4 `--text-2` (`:empty { display: none }`).
- `.trust`: `padding: 28px 0`, `--bg-2`, 1px `--line` top and bottom; `ul` grid 3 columns gap 16px 32px (1 column on phones); `.trust-item`: flex gap 10px, 14px/1.45 `--muted`, SVG 18px `--accent` (`flex: 0 0 18px; margin-top: 2px`), `strong` block white 600.
- `.counter`: `border-top: 1px solid var(--line); padding-top: 22px`; `.val` flex baseline gap 10px mono number; `.lbl` `margin-top: 12px` eyebrow-style 11px. `.numbers .grid`: 4 columns gap 24px `margin-top: 56px` (2 columns ≤ 1024, gap 20 and `margin-top: 36px` on phones). `.slim`: flex space-between, `margin-top: 40px`, `padding: 16px 20px`, 1px `--line`, radius 14, `--surface-2`, Inter 500 16px white, `span` `--accent`; hover border `--accent`; phones stack it.
- Story frame, chips, lanes, card: 6.1 (CSS lines 166–214, copied verbatim).
- `.tile`: `--surface-2`, 1px `--line`, radius 14, `padding: 24px` (18px phones), column gap 12px, `min-height: 300px` (none on phones); `.loop`: height 140px, radius 8, `--bg`, 1px `--line`, `overflow: hidden`; `.loop text`: mono 500 10px `--muted` letter-spacing .06em; tile eyebrow, h3 24px, p 14.5px. Grid: 3 columns gap 16px; 2 at ≤ 1024; 1 at ≤ 768 (gap 14).
- `.timeline`, `.milestone`, `.preflight`, `.pf-*`, `.roadmap-foot`, `.roadmap-cta`: 6.3 (CSS lines 273–303).
- `.signup-band`: 6.3 (CSS lines 305–319). `.signup-form input`: `flex: 1 1 220px`, `--surface-2`, 1px `--line-strong`, pill, `padding: 12px 18px`, Inter 400 16px white; focus border `--accent` + 3px `--accent-soft` ring. `.signup-msg`: mono 500 13px `--accent`, `margin-top: 10px; min-height: 1.4em`. `.small-print`: 13px `--muted`, flex wrap gap 8px 10px.
- `.method .cols`: 3 columns gap 24px `margin-top: 40px` (1 column, gap 18 on phones); each `border-top: 1px solid var(--line); padding-top: 18px`, 15px/1.55 `--text-2`; the mono caption `--accent` 500 13px block `margin-bottom: 10px`.
- `.faq details`: 1px `--line` top (and bottom on the last); `summary`: flex space-between, `padding: 18px 0` (16 on phones), Inter 500 17px/1.4 white, `::after` content `+` mono `--accent` 20px, `–` when open; `p`: `padding: 0 0 18px`, 16px/1.6 `--text-2` max 70ch.
- `.footer`: `padding: 48px 0 64px`, 1px `--line` top, `--muted` 14px; `.wrap` flex space-between wrap gap 24 (column on phones); brand 15px with the 12px diamond; `nav` flex wrap gap 6px 16px, links and the motion button underlined (offset 3px), hover white.
- `.card.edge/.leak` (report insight cards, story card): `--surface` or `rgba(27,32,41,.96)`, 1px border tinted (`rgba(255,107,107,.45)` for leak, `rgba(61,214,140,.45)` for edge), 3px left rule in `--neg`/`--pos`, radius 8, `padding: 16px 18px`.
- `#pilot` layer: fixed, inset 0, `pointer-events: none`, `z-index: 45`, shown only under `html.motion.pilot-on`; the marker is an 11px `rgba(91,156,255,.14)` disc plus a 14px diamond path `M0 -7 L7 0 L0 7 L-7 0 Z` in `#5B9CFF` with a Gaussian-blur glow filter (stdDeviation 4, merged twice); the tail is nine `--accent` circles r 3.2 → 0.8, opacity .5 → .1.

### 2.6 Logo

`◆ MyTradePilot`: inline SVG diamond `<svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 0l7 7-7 7-7-7z" fill="currentColor"/></svg>` in `--accent`, `aria-hidden`, gap 8px, wordmark Inter 600 16px. The brand links to `#top`. The same diamond at 12px in the footer and, as the `◆` glyph, inside the waitlist button's `.pilot-slot` when the pilot lands.

### 2.7 Motion personality: "the instrument panel comes alive"

The prototype's eases are the vocabulary; use nothing else.

1. Load choreography is one timeline (`expo.out` defaults): nav and eyebrow from −8/+8px at 0.1s, the h1 as words rising out of masks (`yPercent: 100`, 0.9s `power4.out`, stagger .045) at 0.2s, lede and CTAs up 16px at 0.5s (stagger .06), the console from `opacity 0, scale .98, blur 8px` at 0.55s (0.8s `power3.out`). The river starts at t = 0 regardless.
2. Scroll reveals (`[data-reveal]`): `opacity 0, y 18 → 0.7s expo.out`, `once: true`, `start: 'top 92%'`, optional `data-reveal-delay`. Section headlines (`[data-split]`): SplitText lines in masks, `yPercent 110, opacity 0`, 0.9s stagger .07 `expo.out`, `start: 'top 90%'`, `once`, reverted on complete.
3. Numbers count rather than fade: counters 1.4s `power3.out` from 0; the verdict counter 1.1s `power2.out` with `snap: 0.1`; report stat values 0.9s.
4. Scrub only the set-pieces: the hero exit (`scrub: true`), the story field (`scrub: 0.6`), the roadmap line (`scrub: 0.4`), the stop-lab paths (`scrub: 0.5`). Everything else is reveal-once.
5. The allowed overshoots: chips popping (`back.out(2)`), pre-check ticks (`back.out(3)`), milestones (`back.out(1.4)`). Verdict stamps press in (`opacity 0, scale 1.18 → 1`, 0.4s `power3.out`). Nothing else bounces.
6. Loops run only while visible: the file card float (2s `sine.inOut` yoyo), bento CSS keyframes under `.is-visible`, the pre-check flip (ScrollTrigger `onToggle`), the band's border pulse (6s), the hero rAF (IntersectionObserver), the pilot ticker (only while active). Nothing loops while `document.hidden`.
7. Colour is never animated except the stop tile's path turning green after it crosses the stop and the bento dot fills. A chip never changes sign.
8. Pointer craft on fine pointers only: magnetic buttons (≤ 12px, `quickTo` 0.4s `power3`), the hero tilt (±1.6°, perspective 1400) and parallax (6px), the nearest-trade tooltip.
9. `gsap.defaults({ ease: 'expo.out', duration: 0.7 })`; `ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true })`.

### 2.8 Honest footnotes (exact, one per section, `.footnote`)

| Section | Footnote |
|---|---|
| Sample counters | A fictional trader. The patterns are real because the engine found them, not because we drew them. |
| Story | Hold time is shown but never mined: winners get held longer because they are winning. |
| Bento | Ticker and weekday are shown but never mined: too easy to fool yourself. |
| Shrink lab | Shrinkage makes the report quieter than your spreadsheet. That is the point. |
| Stop lab | A tighter stop is not automatically better. The check reports what yours did, not what a rule says. |
| Methodology | There is no upload button because there is nothing to upload to. |
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
- Stop check: "Trades whose worst point went past your stop are counted; the ones that still closed green are the ones that came back. The total with a hard stop replaces each of those trades' return with −stop%."

---

## 3. Page structure (final order) with full copy

| # | id | Section | Conversion role |
|---|---|---|---|
| 0 | `#skip`, `#top` (nav) | Skip link, fixed nav | orientation; sample shortcut; waitlist shortcut |
| 1 | `#hero` (contains `#input`, `#status`) | The Equity River, headline, analyzer console | conversion 1 above the fold |
| 2 | `#results` (`#report-bar`, `#report`, `#report-followup` → `#signup-report`) | Where the report lands; contextual waitlist | conversion 2 at maximum belief |
| 3 | `#trust` | Three true claims with icons | objection 2 |
| 4 | `#numbers` | Sample counters, caption, footnote, slim waitlist link | shape of a report, fast |
| 5 | `#story` | "From fills to verdict in four scrolls." sticky frame | what the verdict looks like; conversion 1 |
| 6 | `#features` | Six bento loops | breadth |
| 7 | `#shrink-lab` | "Three lucky trades are not an edge." | believability |
| 8 | `#stop-lab` | "Your stop, replayed." | the twist; needs Step 0 |
| 9 | `#method` | "Nothing to take on faith." engine, unit, rule, privacy proof, requests fine print | objection 7 |
| 10 | `#export` | "Your export takes about a minute." tabs | friction removal; conversion 1 |
| 11 | `#roadmap` (`#timeline`, `#preflight-roadmap`, roadmap CTA) | "From analyzer to pilot." + pre-trade check preview | honest funnel; conversion 2 |
| 12 | `#signup` | Waitlist band "Get your edge checked before every trade." | the main ask; the pilot lands here |
| 13 | `#faq` | 12 questions | last doubts |
| 14 | `#final` | "Your trade log is ready when you are." | conversion 1 |
| 15 | `footer` | Disclaimer, links, motion toggle | |
| — | `#dock`, `#pilot` | Persistent CTA; the pilot layer | conversion 1 one click away |

Desktop = ≥ 769 px unless noted (the prototype's breakpoints: 768, 899, 1024, 1100, 1279, 1400). "375 px" describes the phone layout (section 9).

### 3.0 Skip link and nav

`<a id="skip" class="sr-only-focusable" href="#drop">Skip to analyzer</a>` is the first focusable element (visible on focus: fixed top-left, `--accent` fill, `--accent-ink` text, 8px 12px, radius 8).

`<header class="nav" id="top">` (markup lines 455–471): fixed top, `--nav-h` tall, transparent; `.is-scrolled` (scrollY > 40) adds `background: rgba(10,12,16,.72); backdrop-filter: blur(12px); box-shadow: inset 0 -1px 0 var(--line)`. Inside `.wrap`: `.nav-lead` with the brand (2.6) and `.nav-tag` "The honest trade analyzer. Free, in your browser, nothing uploaded." (mono 400 11px `--muted-2`, shown ≥ 1400 px only); centre `nav.nav-links` "How it works" (`#story`), "Methodology" (`#method`), "Roadmap" (`#roadmap`) in Inter 500 14px `--text-2`, hover white; right `.nav-actions`: `button#nav-sample.btn.btn-secondary[data-action="demo"]` "Try the sample" and `a#nav-join.btn.btn-primary[href="#signup"][data-scroll-to]` "Join the waitlist". Below 900 px the links and the outlined button are hidden: brand + filled button only. No hamburger; section links live in the footer. Every `[data-scroll-to]` link scrolls with Lenis (offset −(nav + 8), `#top` with offset 0) or natively under reduced motion.

### 3.1 Hero `#hero` (markup lines 473–532; CSS 97–146)

```html
<section class="hero" id="hero" aria-label="Free trade analyzer">
  <div class="hero-river" id="hero-river">
    <canvas id="hero-canvas" aria-hidden="true"></canvas>
    <span class="hero-end" id="hero-end" data-pilot-anchor="hero" aria-hidden="true"></span>
    <div class="hero-labels" id="hero-labels" aria-hidden="true"></div>
  </div>
  <div class="hero-scrim" aria-hidden="true"></div>
  <div class="hero-tooltip" id="hero-tooltip" aria-hidden="true"></div>
  <p class="hero-caption mono-label" aria-hidden="true">Sample report · <span data-sample="summary.trades" data-format="int">112</span> fictional trades · computed in your browser</p>
  <p id="hero-sr" class="sr-only">The sample trader's equity curve: 112 fictional trades, trough −$774, peak $3,441, end $3,238.</p>

  <div class="wrap hero-inner">
    <div class="hero-text">
      <p class="eyebrow" data-hero>Free trade analyzer · Runs in your browser</p>
      <h1 data-split="words" data-hero-split>Drop in your trades. Watch your <em>edge</em> show up.</h1>
      <p class="lede" data-hero>Drop a TradingView or broker export. In seconds you see where you make money, where you give it back, and what your stop is really doing. Free, runs 100% in your browser, your trades are never uploaded.</p>
      <div class="hero-ctas" data-hero>
        <button type="button" class="btn btn-primary" id="cta-drop" data-action="pick" data-magnetic><span class="cta-desktop">Drop your CSV</span><span class="cta-mobile">Choose my CSV files</span></button>
        <button type="button" class="btn btn-secondary" id="cta-sample" data-action="demo" data-magnetic>Run the sample report</button>
      </div>
    </div>

    <section class="console" id="input" aria-label="Analyzer" data-hero>
      <div class="wb-head">
        <h2>Analyzer</h2>
        <span class="mchip"><i class="dot"></i>runs locally</span>
        <span class="spacer"></span>
        <div class="file-card" id="file-card" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 3h9l6 6v16H7z"/><path d="M16 3v6h6M10 14h9M10 18h9M10 22h6"/></svg>
          <div><b id="file-card-name">Sample trades (fills).csv</b><span id="file-card-meta"><span data-sample="fills.rows" data-format="int">232</span> rows · <span data-sample="fills.kb" data-format="int">12</span> KB</span></div>
        </div>
      </div>
      <label class="drop" id="drop" for="files">
        <input type="file" id="files" accept=".csv,text/csv" multiple hidden />
        <strong>Drop CSV files here</strong>
        <span>or click to choose. Several files at once are fine; duplicates removed, partial fills merged.</span>
      </label>
      <div class="options">
        <label>Time zone of your export <select id="tz"></select></label>
        <label>Your usual stop (%) <input type="number" id="stop" value="2" min="0.1" max="50" step="0.1" /></label>
      </div>
      <div class="wb-foot">
        <button type="button" id="demo" class="btn-ghost">Run the sample report</button>
        <details class="help">
          <summary>Which files work?</summary>
          <ul>
            <li><b>TradingView</b>: Bar Replay or Strategy Tester → List of trades → Export (CSV). Use your chart's time zone above.</li>
            <li><b>Any broker</b>: an executions/fills export with columns for symbol, side, quantity, price and time. Fills are matched into round-trip trades automatically.</li>
            <li><b>Stop check</b>: runs when the export carries each trade's worst point. TradingView's does; a fills export can add a <code>Worst %</code> column on the closing fill.</li>
          </ul>
        </details>
        <p class="trust-line">Open DevTools and watch the Network tab: nothing leaves. Turn Wi-Fi off after the page loads and it still works.</p>
        <p id="status" class="status" role="status"></p>
      </div>
    </section>
  </div>
</section>
```

Layout (desktop): `.hero { position: relative; min-height: 100svh; display: flex; align-items: center; overflow: clip; padding-top: var(--nav-h) }`; `.hero-river { position: absolute; inset: 0; z-index: 0; transform-style: preserve-3d }` (the canvas fills it); `.hero-scrim` (z 1, pointer-events none): `linear-gradient(180deg, rgba(10,12,16,.4) 0%, rgba(10,12,16,0) 22%, rgba(10,12,16,0) 72%, rgba(10,12,16,.78) 100%), radial-gradient(ellipse 44% 62% at 24% 46%, rgba(10,12,16,.62), rgba(10,12,16,0) 100%)`; `.hero-inner { position: relative; z-index: 2; display: grid; grid-template-columns: 7fr 5fr; gap: 64px; align-items: center; padding-top: 32px; padding-bottom: 72px }`; `.hero-text { max-width: 760px }`, h1 `margin: 16px 0 24px`, lede max 52ch, `.hero-ctas { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px }`. `.hero-caption`: absolute, `left: var(--gutter); bottom: 18px`, `--muted-2`. `.hero-tooltip`: absolute z 3, `rgba(20,24,32,.92)`, 1px `--line-strong`, radius 8, `padding: 8px 10px`, mono 500 12px/1.4 white, `small` block `--muted` 400, `transform: translate(-50%, -100%)` (`.flip` → `translate(-100%, -100%)`), `opacity 0 → 1` in .15s under `.on`. `.hero-end`: 14×14 absolutely positioned by the river at the curve's last point (the pilot's hero anchor). `.cta-mobile` is `display: none` above 768 px; `.cta-desktop` below.

The `#tz` options are written by `main.ts` at load (the select ships empty, as today). `#file-card-name`/`#file-card-meta` show the sample at load; after the visitor picks or drops files, `nav.ts` sets the name to the first file's name (ellipsised) and the meta to `N files · KB` from `File.size` (one file: `12 KB`). This is DOM only; `main.ts` reads nothing from the card.

### 3.2 Results `#results` (new; directly after the hero)

```html
<section id="results" aria-label="Your report">
  <div class="wrap">
    <div id="report-bar" class="report-bar" hidden><span class="mono-label" data-report-label>Your report · computed in this tab · nothing uploaded</span><a href="#top" data-scroll-to class="btn-ghost">Back to top ↑</a></div>
    <div id="report"></div>
    <div id="report-followup" hidden>
      <div class="followup-copy">
        <p class="eyebrow">Next step</p>
        <h2 class="display-2">That's your report. The full app uses it <em>before</em> you trade.</h2>
        <p class="lede">MyTradePilot is building the rest: a journal that keeps this report current, a pre-trade check that tells you if a setup matches where you make money, live alerts for your best setups, and an AI review of your week. Join the waitlist for early access and founding-member pricing.</p>
        <a href="#drop" data-scroll-to class="btn-ghost">Analyze another file ↑</a>
      </div>
      <section class="signup-mini" id="signup-report" hidden aria-label="Waitlist">
        <form class="signup-form" novalidate>
          <label for="signup-email-2" class="sr-only">Email address</label>
          <input type="email" id="signup-email-2" required autocomplete="email" placeholder="you@example.com" />
          <button type="submit" class="btn btn-primary">Join the waitlist</button>
        </form>
        <p class="signup-msg" role="status"></p>
        <p class="small-print">We only get your email address, never your trades. Unsubscribe anytime.</p>
      </section>
    </div>
  </div>
</section>
```

`#report` keeps `scroll-margin-top: calc(var(--nav-h) + 16px)` and is never `display: none` or `hidden` (so `main.ts`'s `scrollIntoView` always has a target); `#results:has(#report:empty) { padding: 0 }` so the section is zero-height until a report exists. `body.has-report` (set by `reportMotion.ts`) un-hides `#report-bar` and `#report-followup` (desktop grid `7fr 5fr` gap 48px, stacked on phones; the mini form is a `--surface-2` card, radius 22, padding 32px). `#report-bar` text: "Your report · computed in this tab · nothing uploaded", or "Sample report · 112 fictional trades generated to show what the analyzer finds · computed in this tab" when the last trigger was `#demo`. The report markup from `main.ts` is untouched; its CSS is retargeted (2.5, 7.1).

### 3.3 Trust strip `#trust` (markup 535–552, exact copy)

Three `li.trust-item[data-reveal]` (delays 0 / .08 / .16), each an 18px inline SVG icon (lock: `rect x3 y8 w12 h8 rx2` + `path M6 8V6a3 3 0 016 0v2`; check circle: `circle 9 9 r7` + `path M5.5 9.5l2.5 2.5 4.5-5`; code brackets: `path M6 4L2 9l4 5M12 4l4 5-4 5`; all `fill="none" stroke="currentColor" stroke-width="1.5"`) and:

- **Nothing uploaded** — the file is read by this tab and never sent anywhere; refresh and it is gone.
- **Free, no account** — no sign-up to see your report.
- **Open methodology** — the engine and its tests are public; small groups are shrunk toward your average. (the `strong` links to `https://github.com/CezarAster/mytradepilot`, `rel="noopener"`)

### 3.4 Sample counters `#numbers` (markup 554–581)

Eyebrow `Sample report` · h2 `data-split="lines"` `Here is the sample report, computed live on this page.` · four `.counter[data-reveal]` (delays 0/.08/.16/.24): `112` "trades" (`data-counter="112" data-counter-format="int" data-sample="summary.trades"`), `61%` "win rate" (`pct0`, `summary.winRate`), `+37.3%` "summed return" (`pct1`, `.pos`, `summary.totalReturn`; its `.val` carries `<span class="pilot-slot" id="num-pilot" data-pilot-anchor="numbers">` before the number), `1.45` "profit factor" (`dec2`, `summary.profitFactor`). Caption (`.caption.small.muted`, max 640px, `margin-top: 36px`): "Sample trades are fictional (public/sample-trades.csv). Your own numbers appear the moment you drop a file." Footnote (2.8). Then `a.slim[href="#signup"][data-scroll-to]`: "Want this before every trade? <span>Join the waitlist →</span>".

### 3.5 Story `#story` (markup 583–631; copy and choreography exactly as the prototype)

```html
<section class="story" id="story">
  <div class="wrap story-stage">
    <div class="story-head section-head">
      <p class="eyebrow" data-reveal>How it works</p>
      <h2 class="display-2" data-split="lines">From fills to verdict in four scrolls.</h2>
    </div>
    <figure class="story-frame" id="story-frame" aria-label="Sample report walkthrough">
      <div class="frame-head">
        <span class="mono-label">Sample · 112 <span class="ph-hide">fictional </span>trades</span>
        <span class="states" id="story-states" aria-hidden="true"><span class="pilot-slot" id="frame-pilot" data-pilot-anchor="frame"></span><i class="on"></i><i></i><i></i><i></i></span>
      </div>
      <div class="frame-stage" id="frame-stage">
        <pre class="story-csv" id="story-csv" aria-hidden="true"></pre>
        <div class="lanes" id="story-lanes" aria-hidden="true">
          <div class="lane" data-lane="1"><div class="lane-lbl"><b>1st</b><small><span data-sample="group.tradeOfDay.1st.n">45</span> trades · <span data-sample="group.tradeOfDay.1st.winRate" data-format="pctInt">73%</span> win</small></div><i class="zero"></i><i class="bar"></i><span class="bar-val" data-sample="group.tradeOfDay.1st.avgReturn" data-format="pct">+0.94%</span></div>
          <div class="lane" data-lane="2"><div class="lane-lbl"><b>2nd</b><small>38 trades · 58% win</small></div><i class="zero"></i><i class="bar"></i><span class="bar-val">+0.44%</span></div>
          <div class="lane" data-lane="3"><div class="lane-lbl"><b>3rd</b><small>26 trades · 42% win</small></div><i class="zero"></i><i class="bar neg"></i><span class="bar-val neg">−0.81%</span></div>
          <div class="lane" data-lane="4"><div class="lane-lbl"><b>4th+</b><small>3 trades · too few</small></div><i class="zero"></i><i class="bar neg"></i><span class="bar-val neg">−0.29%</span></div>
        </div>
        <div class="story-chips" id="story-chips" aria-hidden="true"></div>
        <div class="story-card" id="story-card">
          <span class="tag"><span class="vdot" id="story-dot" data-pilot-anchor="story"></span>Leak <span class="conf pill solid">solid</span></span>
          <p>Your 3rd trade of the day: 26 trades, 42% win, −0.81% a trade vs +0.33% overall.</p>
          <div class="verdict"><span class="big num" id="story-counter">+58.5%</span><small>total if you skip them<br>instead of +37.3%</small></div>
        </div>
      </div>
    </figure>
    <div class="story-steps" id="story-steps">
      <div class="step active" data-story-step="1" data-n="1"><h3>It reads your fills.</h3><p>Any broker CSV with symbol, side, quantity, price, time. TradingView trade lists too. Fills are matched into round trips, duplicates dropped.</p></div>
      <div class="step" data-story-step="2" data-n="2"><h3>It tags every trade.</h3><p>New York entry time, trade number of the day, what came before, hold time, direction, weekday, ticker.</p></div>
      <div class="step" data-story-step="3" data-n="3"><h3>It finds where the money is.</h3><p>Your 1st trade of the day: 45 trades, 73% win, +0.94% a trade vs +0.33% overall. Solid.</p></div>
      <div class="step" data-story-step="4" data-n="4"><h3>And where it leaks.</h3><p>Your 3rd trade of the day: 26 trades, 42% win, −0.81% a trade. Skipping them would have made your total +58.5% instead of +37.3%.</p></div>
      <p class="story-cta"><button type="button" class="btn btn-secondary" id="story-run" data-action="pick">Run this on your trades</button></p>
      <p class="footnote">Hold time is shown but never mined: winners get held longer because they are winning.</p>
    </div>
  </div>
</section>
```

Lanes 2–4 and the card/step numbers carry the same `data-sample` bindings as lane 1 (`group.tradeOfDay.2nd.*`, `3rd.*`, `4th or later.*`; the card paragraph binds `leaks.0.sentence` minus its second sentence, i.e. `leaks.0.base`; `#story-counter` binds `leaks.0.returnWithout` as `pct1`; "instead of +37.3%" binds `summary.totalReturn`). The CSV `<pre>` is filled by `story.ts` with the first 14 lines of the fetched sample (header + 13 rows, so the LUMN 6-fill position's first lines are among them). The twelve `<i class="on">` state bars and the step numbers are exactly the prototype's.

### 3.6 Bento `#features` (markup 633–709)

Eyebrow `The report` · h2 `Six questions the report answers.` · six `article.tile[data-reveal]` (delays 0 … .4), each a `.loop[data-loop]` figure (the prototype's inline SVGs, lines 641–703, copied verbatim with their classes and `style` custom properties) and eyebrow / h3 / p:

1. `edges` **Edges** · *Where you make money.* · "Groups that clearly beat your average, ranked by impact."
2. `leaks` **Leaks** · *Where you give it back.* · "Money-losing patterns first, then profitable-but-weak ones."
3. `stop` **Stop** · *What your stop is doing.* · "Trades that went past your stop and came back vs. not, and your total if every one had been closed at the stop. On the sample: 33 went past −2%, 7 came back green; a hard 2% stop would have made +13.2% instead of +37.3%." (numbers bound: `risk.pastStop`, `risk.pastStopCameBack`, `risk.returnWithStop`, `summary.totalReturn`)
4. `conc` **Concentration** · *How much rides on five trades.* · "In the sample, the 5 best trades made 65% of the total." (`risk.top5Share` as `pctInt`; the SVG's `65%` text too)
5. `break` **Breakdowns** · *When, how often, after what.* · "Entry time, trade number of the day, after a loss, quick re-entry, hold time, symbol, weekday."
6. `files` **Many files** · *Drop them all.* · "Overlapping exports are de-duplicated, partial fills merged."

Footnote (2.8) under the grid, then `a.btn-ghost[data-action="demo"]` "Run it on the sample →".

### 3.7 Shrink lab `#shrink-lab`

Eyebrow `Honest statistics` · h2 `Three <em>lucky</em> trades are not an edge.` · lede "Every group's average is shrunk toward your overall average in proportion to how few trades it has. The fewer the trades, the less the engine believes them. Here is the exact rule, on the sample."

Desktop 2 columns 6/6, gap 48. Left:
- Formula card (`--surface-2`, 1px `--line`, radius 14, padding 20): mono 500 15px `adjusted = (n × group avg + 10 × overall avg) ÷ (n + 10)` and the muted line "10 is the number of phantom average trades mixed into every group."
- Example chips `#shrink-examples` (`button.mchip[data-example][data-n][data-raw][data-label]`, `[aria-pressed=true]` = accent border + `--accent-soft` fill), in this order: `9:45–10:15 ET · 3 trades · raw −1.17%` (default) · `3 lucky trades at +4.00%` (`data-hypothetical`) · `Held under 15 min · 5 trades · raw +1.07%` · `Overnight · 5 trades · raw −2.55%` · `1st trade of the day · 45 trades · raw +0.94%`. `data-raw` on the four sample chips binds to the engine's unrounded `avgReturn` (`group.time.9:45–10:15.avgReturn` etc.).
- The rules list (the first four sentences of 2.9 as `<li>`s).
- Link `.btn-ghost`: "Read the rule in src/core/analyze.ts →" (`https://github.com/CezarAster/mytradepilot/blob/main/src/core/analyze.ts`).
- Footnote (2.8).

Right: `#shrink-diagram` (inline SVG `viewBox="0 0 560 320"`, `--surface-2` panel, the 12×8 grid as `--grid` lines): a horizontal number line −3% … +5% at y = 180 with 1% ticks (mono 10px labels); a hollow `--text-2` tick labelled `your average +0.33%`; a hollow circle `raw` (1.5px `--muted`) at the example's raw value; a filled `--accent` circle `what the report says` at the adjusted value with a 1px tether to the raw circle; readout row `#shrink-readout` (mono 13px): `n = 3 · raw −1.17% · adjusted −0.01%` followed by the pill `#shrink-badge` (`few` / `early` / `solid`); verdict line `#shrink-verdict` (17px): one of "The report would call this: nothing, too few trades." / "…an edge (early signal)." / "…an edge (solid)." / "…a leak (early signal)." / "…a leak (solid)." / "…a weak spot (early signal)." / "…a weak spot (solid)." / "…nothing: not clearly away from your average." Under the SVG: `<label for="shrink-n">Trades in this group</label> <input type="range" id="shrink-n" min="1" max="45" step="1" value="3">` with the current n in a mono bubble. Logic in 6.4.

375 px: formula, diagram (full width, 300px tall), slider, chips as a horizontal snap-scroll row, rules, link, footnote.

### 3.8 Stop lab `#stop-lab` (needs Step 0)

Eyebrow `Your stop` · h2 `Your stop, <em>replayed.</em>` · lede "Every trade's worst point is checked against your stop. Three things can happen. On the sample, 33 trades went more than 2% against this trader and 7 of them came back green. Closing every one at −2% would have made +13.2% instead of +37.3%. The stop isn't the leak. The third trade is." (bound: `risk.pastStop`, `risk.pastStopCameBack`, `risk.returnWithStop`, `summary.totalReturn`).

Desktop 2 columns 7/5. Left: `#stop-figure` (inline SVG `viewBox="0 0 640 320"`, `--surface-2` panel): the zero line at y = 96 (`--line-strong`), a dashed `--muted` stop line at y = 192 labelled `−2% stop` (mono), three price paths from x = 40 to x = 600 (`fill: none; stroke-width: 2; stroke-linecap: round`): `data-stop-path="none"` stays above the stop and ends at +1.4% (stroke `--pos-mark`), `data-stop-path="back"` dips to −3.1% at x ≈ 300 and ends at +0.9% (stroke `--pos-mark` after x = 300, `--neg-mark` before, drawn as two segments), `data-stop-path="stay"` crosses at x ≈ 260 and ends at −4.2% (`--neg-mark`); y scale 32px per 1%. Each path has `pathLength="1"`, `stroke-dasharray="1"`, `stroke-dashoffset="1"` (scrubbed to 0, 6.5). Right: three outcome rows (`.stop-row`: mono 500 13px label, big mono count): `Never got near it` **79** (`neverNear`) · `Went past it, came back green` **7** (`risk.pastStopCameBack`) · `Went past it, stayed red` **26** (`stayedRed`); then the ladder `#stop-ladder` (mono 13px, three cells): `1.5% → +18.0%` (`stopAt.1.5.returnWithStop`) · `2% → +13.2%` (`risk.returnWithStop`) · `3% → +35.5%` (`stopAt.3.returnWithStop`) and the line "All three below +37.3%. The 7 that came back made +16.25 points between them; the 26 that stayed red made −58.12." (`cameBackPoints`, `stayedRedPoints`). Note (`.small.muted`): "Needs worst-point data: TradingView exports include it; a fills export can add a Worst % column on the closing fill. Your usual stop in the analyzer above re-runs this on your file." Footnote (2.8).

375 px: figure full width (240px tall), rows, ladder, note, footnote.

### 3.9 Methodology `#method` (markup 782–794 extended)

Eyebrow `Methodology` · h2 `Nothing to take on faith.` · three `.cols div[data-reveal]` exactly as the prototype: `src/core · test/` "Open engine: src/core, tests in test/." · `% per trade` "Unit is % return per trade, so results compare across sizes." · `n < 5 → faded` "Groups under 5 trades are faded; nothing under 5 is ever called an edge or a leak."

Then the privacy proof (`.proof`, 2 columns 6/6 at ≥ 1024, `margin-top: 48px`). Left `#privacy-wire` (inline SVG `viewBox="0 0 560 300"`, `--surface-2` panel): node `Your CSV` → node `This browser tab (engine runs here)` → node `Your report`, joined by a solid `--accent` path (1.5px) with a duplicate pulse path (`stroke-dasharray: 40 600`), and a dashed `--line-strong` branch from the tab node to a `--muted-2` node `Servers` with the mono badge `0 requests when you drop a file`. Right, a 3-item checklist (each with the 18px lock icon in `--accent`):

- "Check it yourself: open your browser's developer tools, Network tab, then drop a file. Nothing goes out."
- "Or turn off your Wi-Fi after the page loads and drop a file. It still works."
- "The command line prints the same report: `npm run report -- --tz America/New_York your-trades.csv`. Read the engine on GitHub →" (link to the repo)

Fine print (`.small.muted`, exact): "What this page does request: the page itself, its styles and scripts, fonts from Google Fonts, and the fictional sample file from this site (for the river above and the sample button). Nothing in those requests is about you or your trades." Footnote (2.8).

### 3.10 Export how-to `#export`

Eyebrow `Get your file` · h2 `Your export takes about a minute.` · tabs `role="tablist"`: `#tab-tv` **TradingView** · `#tab-broker` **Any broker** (`.mchip`-styled tabs, `[aria-selected=true]` accent border + soft fill); panels `#panel-tv`, `#panel-broker` (`role="tabpanel"`, arrow keys move between tabs).

TradingView panel: a 3-chip menu path in mono (`Bar Replay / Strategy Tester` → `List of trades` → `Export ▸ CSV`) that lights in sequence on enter, then numbered steps: "1. Open Bar Replay or the Strategy Tester. 2. Open the List of trades tab. 3. Export → CSV. 4. Drop it here and pick your chart's time zone in the analyzer." Note: "Strategy Tester and Bar Replay exports include each trade's worst point, so the stop check runs on them."

Broker panel: "Export your executions or fills as CSV, not your positions. The file needs columns for symbol, side, quantity, price and time; common column names (ticker, action, shares, fill price, timestamp…) are detected automatically. Fills are matched into round-trip trades, first in, first out." Note: "Optional: a Worst % column on the closing fill turns on the stop check."

Footnote (2.8). CTA row: `.btn.btn-primary[data-action="pick"]` "Analyze my trades" · `.btn.btn-secondary[data-action="help"]` "Which files work?".

375 px: tabs full width; chips stack.

### 3.11 Roadmap `#roadmap` (markup 711–760; ported from Flight Recorder)

```html
<section class="section roadmap" id="roadmap" aria-label="Roadmap">
  <div class="wrap">
    <div class="section-head">
      <p class="eyebrow" data-reveal>Roadmap</p>
      <h2 class="display-2" data-split="lines">From analyzer to pilot.</h2>
      <p class="lede" data-reveal>The free analyzer is step one. The full app keeps your journal, learns your edges from it, and checks every setup against them before you click.</p>
    </div>
    <div class="timeline" id="timeline">
      <svg class="line" viewBox="0 0 1000 2" preserveAspectRatio="none" aria-hidden="true"><line id="roadmap-line" x1="0" y1="1" x2="1000" y2="1" stroke="#344050" stroke-width="2"/><line id="roadmap-line-fill" x1="0" y1="1" x2="1000" y2="1" stroke="#5B9CFF" stroke-width="2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/></svg>
      <ol class="milestones" id="milestones">
        <li class="milestone now" data-ms><span class="when">Now</span><h3>Free analyzer</h3><p>Drop an export, see edges, leaks, stop check and breakdowns.</p></li>
        <li class="milestone" data-ms><span class="when">Next</span><h3>Journal</h3><p>Your trades, kept and tagged, so the edge analysis grows with you.</p></li>
        <li class="milestone" data-ms><span class="when">Then</span><h3>Pre-trade check</h3><p>Does this setup match where you make money? Answered before you enter.</p></li>
        <li class="milestone" data-ms><span class="when">Then</span><h3>Live alerts</h3><p>A ping when one of your best setups is forming.</p></li>
        <li class="milestone" data-ms><span class="when">Then</span><h3>AI review of your week</h3><p>What worked, what leaked, in plain language.</p></li>
      </ol>
    </div>
    <div class="roadmap-foot">
      <div class="pf-slot" id="pf-slot">
        <div class="preflight" id="preflight-roadmap" data-reveal aria-label="Pre-trade check, coming in the full app">
          <div class="pf-face" data-face="a">
            <div class="pf-head">Pre-trade check · <b>ORBX</b> · short · 11:15 ET · Thu Apr 9</div>
            <ul class="pf-rows">
              <li class="pf-row"><span class="tick">✓</span><span class="what"><b>3rd trade of the day</b> → Leak</span><span class="res neg"><span data-sample="group.tradeOfDay.3rd.avgReturn" data-format="pct">−0.81%</span> a trade · <span data-sample="group.tradeOfDay.3rd.confidence">solid</span></span></li>
              <li class="pf-row"><span class="tick">✓</span><span class="what"><b>Back in within 10 min of a loss</b> → Leak</span><span class="res neg">−0.83% a trade · early signal</span></li>
              <li class="pf-row"><span class="tick">✓</span><span class="what"><b>Short</b> → Leak</span><span class="res neg">−0.11% a trade · solid</span></li>
              <li class="pf-row"><span class="tick">✓</span><span class="what"><b>10:15–11:30 entry</b></span><span class="res">+0.29% a trade · solid</span></li>
            </ul>
            <div class="pf-verdict bad">This setup matches where you give it back.</div>
            <div class="pf-foot">Coming in the full app</div>
          </div>
          <div class="pf-face" data-face="b" aria-hidden="true">
            <div class="pf-head">Pre-trade check · <b>LUMN</b> · long · 9:42 ET · Thu Mar 5</div>
            <ul class="pf-rows">
              <li class="pf-row"><span class="tick">✓</span><span class="what"><b>1st trade of the day</b> → Edge</span><span class="res pos">+0.94% a trade · solid</span></li>
              <li class="pf-row"><span class="tick">✓</span><span class="what"><b>9:30–9:45 entry</b> → Edge</span><span class="res pos">+0.88% a trade · solid</span></li>
              <li class="pf-row"><span class="tick">✓</span><span class="what"><b>Long</b> → Edge</span><span class="res pos">+0.52% a trade · solid</span></li>
            </ul>
            <div class="pf-verdict good">This matches where you make money.</div>
            <div class="pf-foot">Coming in the full app</div>
          </div>
        </div>
        <p class="pf-note small muted">Two real trades from the sample. This feature is not built yet; the waitlist is how it gets built.</p>
      </div>
      <div class="roadmap-cta" data-reveal>
        <a class="btn btn-primary" href="#signup" data-scroll-to data-magnetic>Join the waitlist</a>
        <small>Early access and founding-member pricing for the waitlist.</small>
        <p class="footnote">No launch date is promised. You'll hear from us when there is something to try.</p>
      </div>
    </div>
  </div>
</section>
```

Every row's `.res` binds the same way as the first (`group.afterPrev.< 10 min after a loss.*`, `group.direction.Short.*`, `group.time.10:15–11:30.*`, `group.tradeOfDay.1st.*`, `group.time.9:30–9:45.*`, `group.direction.Long.*`). CSS (lines 273–303): `.timeline { position: relative; margin-top: 48px }`, the line SVG absolute at `top: 11px`, full width, 2px tall, `overflow: visible`; `.milestones` grid 5 columns gap 16; `.milestone { padding-top: 32px }` with a 16px `::before` disc (`--surface-2`, 2px `--line-strong`), `.now::before` accent-filled with `box-shadow: 0 0 16px var(--glow)`; `.when` mono 500 12px `--accent`; h3 22px `margin: 6px 0 4px`; p 14px `--muted`. `.roadmap-foot { margin-top: 48px; display: grid; grid-template-columns: minmax(0, 460px) 1fr; gap: 32px; align-items: center }`; `.pf-slot, .roadmap-cta { min-width: 0 }`; `.roadmap-cta` column, gap 12, `align-items: flex-start`, `small` 14px `--muted`. `.preflight`: relative, `overflow: hidden`, `--surface`, 1px `--line-strong`, radius 14, `--shadow-1`, `padding: 16px 18px`; `.pf-head` mono 500 12px/1.4 `--muted`, `b` white 500, flex wrap gap 8; `.pf-rows` column gap 6 `margin-top: 12px`; `.pf-row` grid `18px 1fr auto` gap 8 baseline, 13.5px/1.35 `--text-2`, `padding: 6px 0`, 1px `--line` bottom; `.tick` mono `--accent`; `.what b` white 600; `.res` mono 12px nowrap (`.pos`/`.neg`); `.pf-verdict { margin-top: 12px; padding: 10px 12px; border-radius: 8px; font: 500 14px/1.35 Inter }` `.bad` `--neg-soft`/`--neg`, `.good` `--pos-soft`/`--pos`; `.pf-foot` 11px uppercase .06em `--muted` `margin-top: 10px`; `.pf-face[data-face="b"] { position: absolute; left: 18px; right: 18px; top: 16px; opacity: 0; pointer-events: none }`, `display: none` under `html:not(.motion)`; `html:not(.motion) #roadmap-line-fill { stroke-dashoffset: 0 }`. ≤ 899 px: the line SVG is hidden, milestones stack with a 2px `--line` left rail (`margin-left: 7px`, discs at `left: -9px`), `.roadmap-foot` one column, `.pf-row` two columns with `.res` on its own line (12.5 / 11.5 px), `.pf-head` wraps (`display: block; white-space: normal; line-height: 1.5`), `.pf-foot` hidden.

### 3.12 Waitlist band `#signup` (markup 762–780; ported from Flight Recorder; bound by `main.ts`)

```html
<section class="section signup-sec" id="signup" aria-label="Waitlist">
  <div class="wrap">
    <div class="signup-band">
      <div class="signup-copy">
        <h2 class="display-2" id="signup-h" data-split="lines">Get your edge checked before every trade.</h2>
        <p>The full MyTradePilot app is coming: a journal that learns your edges, a pre-trade check that tells you if a setup matches where you make money, live alerts for your best setups, and an AI review of your week. Join the waitlist for early access and founding-member pricing.</p>
      </div>
      <div>
        <form class="signup-form" id="signup-form" novalidate action="https://buttondown.com/api/emails/embed-subscribe/MyTradePilot" method="post" target="_blank">
          <label for="signup-email" class="sr-only">Email address</label>
          <input type="email" id="signup-email" name="email" required autocomplete="email" placeholder="you@example.com" />
          <button type="submit" class="btn btn-primary" id="signup-btn" data-magnetic><span class="pilot-slot" id="wl-pilot" data-pilot-anchor="waitlist" aria-hidden="true"></span>Join the waitlist</button>
        </form>
        <p class="signup-msg" role="status" id="signup-msg"></p>
        <p class="small-print">We only get your email address, never your trades. Unsubscribe anytime. <span class="mchip">trades sent: 0 bytes</span></p>
      </div>
    </div>
  </div>
</section>
```

The section is not `hidden` (the provider is configured in `signup.ts`, so `setupSignup` would un-hide it anyway; shipping it visible means no layout shift and a readable ask with scripting off). The `action`/`method`/`target`/`name` attributes duplicate what `setupSignup` sets so the form posts to Buttondown in a new tab with scripting off; `test/site.test.ts` asserts the markup's `action` equals the URL built from `SIGNUP.id` (7.5). `setupSignup` keeps `#signup` as its section: `form`, `input[type=email]#signup-email`, `button[type=submit]`, `.signup-msg` are all present and unchanged. CSS (lines 305–319): `.signup-band { position: relative; border: 1px solid var(--accent-soft); border-radius: 22px; padding: 48px 32px; background: linear-gradient(180deg, rgba(91,156,255,.06), transparent 60%), var(--surface); box-shadow: 0 0 0 1px rgba(91,156,255,.12), 0 0 60px rgba(91,156,255,.08); display: grid; grid-template-columns: 1.2fr 1fr; gap: 32px; align-items: center }` (one column, `padding: 32px 24px` ≤ 899 px); under `html.motion` the band runs `@keyframes pulse` 6s ease-in-out infinite between `box-shadow: 0 0 0 1px rgba(91,156,255,.35), 0 0 48px rgba(91,156,255,.10)` and `0 0 0 1px rgba(91,156,255,.6), 0 0 64px rgba(91,156,255,.22)`; `.signup-copy p { color: var(--text-2); margin-top: 16px; font-size: 16px }`. `.pilot-slot` inside the button: 14×14 inline-block with `::before` content `◆` (13px, `--accent-ink`, opacity 0, transition .3s) that becomes visible under `.btn.landed` and under `html:not(.motion)`.

### 3.13 FAQ `#faq` (markup 796–817, extended to 12 questions)

Eyebrow `FAQ` · h2 `Questions, answered straight.` · `.faq-list[data-reveal]` (max 760px) with twelve `<details>`:

1. **Is it really free?** Yes. The analyzer runs on your computer, not on our servers, so it costs nothing to run and it stays free. The waitlist is for the full app, which will be paid.
2. **Do you see my trades?** No. The file is read in your browser's memory and never sent anywhere. You can check: open the Network tab in your browser's developer tools, drop a file, and watch nothing go out. The only thing this site ever sends is your email address, if you join the waitlist.
3. **Is the sample real?** No. The sample is a fictional trader generated by a script in the repository (scripts/make-sample.py) with planted patterns, so you can see what the analyzer finds. Every number on this page is computed from that file by the engine, live, in this tab.
4. **Which files work?** TradingView's List of trades export from Bar Replay or the Strategy Tester, and any broker executions or fills export with symbol, side, quantity, price and time columns. Several files at once are fine: overlapping exports are de-duplicated and partial fills are merged.
5. **Which markets?** Anything your export covers: stocks, futures, forex, crypto. The entry-time buckets use New York market hours; trade number of the day, what came before, direction, hold time, weekday and ticker don't depend on the session.
6. **How many trades do I need?** It runs on a handful, but under 30 trades the whole report is labelled an early signal. Groups under 5 trades are faded and never called an edge or a leak; 5 to 14 is an early signal; 15 or more is solid.
7. **What does "early signal" mean?** Fewer than 15 trades in the group. "Solid" is 15 or more. Under 5 is "too few" and never becomes an insight.
8. **What does "shrunk toward your average" mean?** Each group's average is mixed with 10 imaginary trades at your overall average: adjusted = (n × group average + 10 × overall average) ÷ (n + 10). Three lucky trades at +4% read as about +1.2%; 45 trades at +0.9% keep most of their signal.
9. **Why isn't hold time used for edges?** Because winners get held longer precisely because they are winning. It's shown so you can see it, but mining it would just tell you to hold winners, which you already know. Ticker and weekday are kept out for a different reason: they are too easy to overfit.
10. **What is the stop check?** If your export includes each trade's worst point (TradingView's does; a fills export can add a Worst % column), the report counts trades that went past your usual stop and came back, the ones that didn't, and what your total would be if every one had been closed at the stop. Without worst-point data the check is skipped and the report says so.
11. **Can I check the math?** Yes. The engine lives in src/core with tests in test/, and the command-line tool prints the same report as the page: `npm run report -- --tz America/New_York your-trades.csv`.
12. **What's in the full app, and when? Is any of this advice?** Journal, edge analysis that stays current, a pre-trade check, live alerts for your best setups and an AI review of your week. No launch date is promised; waitlist members get early access and founding-member pricing. None of it is investment advice: it is an educational tool, and past results don't predict future results.

### 3.14 Final band `#final`

Full-bleed band on `--bg-2` with 1px `--line` top, centred, `padding: 96px 0` (64 on phones). h2 `data-split="lines"` `Your trade log is ready when you are.` Buttons: `.btn.btn-primary[data-action="pick"][data-magnetic]` "Analyze my trades" · `.btn.btn-secondary[data-action="demo"]` "Run the sample report". Micro-line (`.small.muted`): "Free. In your browser. Nothing uploaded." No canvas here (the hero's set-piece is not repeated).

### 3.15 Footer (markup 819–828)

Left: the brand at 15px with the 12px diamond; "Educational tool, not investment advice. Past results don't predict future results."; "Sample data is fictional." Right `nav[aria-label="Footer"]`: "How it works" (`#story`) · "Methodology" (`#method`) · "Roadmap" (`#roadmap`) · "Waitlist" (`#signup`) · "FAQ" (`#faq`) · "Engine and tests on GitHub" (repo, `rel="noopener"`) · `<button type="button" id="motion-toggle" aria-pressed="true">Motion: on</button>` · `© 2026 MyTradePilot`. A mono line `BUILT IN THE OPEN · STATIC SITE · NO TRACKING SCRIPTS` (true as long as no analytics are added).

### 3.16 Dock `#dock`

One fixed element, `role="region" aria-label="Quick actions"`, `data-visible="false"` by default. Desktop (≥ 769 px): a bottom-centre pill, 52px tall, `rgba(20,24,32,.92)` + `backdrop-filter: blur(12px)`, 1px `--line-strong`, radius pill, `--shadow-1`, two buttons at 40px: `.btn.btn-primary[data-action="pick"]` "Drop your CSV" and `.btn.btn-secondary[data-action="demo"]` "Run the sample". Phone (≤ 768 px): a full-width 64px bar (`padding: 10px var(--gutter) calc(10px + env(safe-area-inset-bottom))`, `--surface` at 96%, 1px `--line` top) with one full-width `.btn.btn-primary[data-action="demo"]` "Run the sample report"; `main { padding-bottom: 80px }` at ≤ 768 px, set once in CSS.

Visibility rule (`nav.ts`, IntersectionObservers): shown when `#input` has scrolled above the viewport; hidden while any of `#input`, `#report-followup`, `#roadmap .roadmap-foot`, `#signup`, `#final` intersects, while `body.has-report`, while any `input`/`select`/`textarea` has focus, and before the first scroll. Toggled by `data-visible="true|false"`; CSS transitions `transform` 250ms (`translateY(24px)` ↔ 0) and `opacity` (opacity only under reduced motion).

---

## 4. Animation choreography

Defaults: `[data-reveal]` = `opacity 0, y 18 → 0`, 0.7s `expo.out`, `ScrollTrigger start: 'top 92%', once: true`, `data-reveal-delay` in seconds. `[data-split]` (lines) = `SplitText.create(el, { type: 'lines', mask: 'lines' })`, `yPercent 110, opacity 0 → 0`, 0.9s stagger .07 `expo.out`, `start: 'top 90%', once`, `split.revert()` on complete. The hero h1 alone splits by words (`mask: 'words'`). "RM" = reduced motion (`prefers-reduced-motion: reduce`, or `motion=off` stored): `html.motion` is absent, no Lenis, no ScrollTriggers, no loops; everything is in its final state from the first paint. Timings for the hero, story, pilot and pre-check are the prototype's (script lines 932–1334).

| # | Section | Element | Trigger | Effect | Timing | Technique | RM | Why (conversion) |
|---|---|---|---|---|---|---|---|---|
| 1 | Nav | `.nav` | load | opacity 0, y −8 → 0 | 0.5s expo.out at 0.1 | heroTl | static | calm entrance |
| 2 | Nav | `.nav` | scrollY > 40 | `.is-scrolled` (blur, hairline) | 200ms | class toggle from Lenis scroll (or a passive scroll listener) | same | links reachable, nothing stolen |
| 3 | Hero | eyebrow | load | opacity 0, y 8 → 0 | 0.5s at 0.1 | heroTl | static | reading order |
| 4 | Hero | h1 | load, after `fonts.ready` (max 900ms) | words rise out of masks, `yPercent 100 → 0`; `<em>` survives because the split is by words | 0.9s power4.out, stagger .045, at 0.2; revert on complete | SplitText words | static | the tagline the client chose, animated the Flight Recorder way |
| 5 | Hero | lede, CTAs | load | opacity 0, y 16 → 0 | 0.7s, stagger .06, at 0.5 | heroTl | static | reading order |
| 6 | Hero | `#input` console | load | opacity 0, scale .98, blur 8px → 1, 1, 0; `clearProps: 'filter,transform'`; never `pointer-events: none` | 0.8s power3.out at 0.55 | heroTl | static | the workbench arrives as an instrument; the drop zone is clickable throughout |
| 7 | Hero | `#file-card` | while hero visible | y 3 yoyo | 2s sine.inOut repeat −1 | gsap.to | static | a live object in the panel |
| 8 | Hero | canvas grid | t = 0 | 12×8 grid fades in | 0.4s linear | canvas | drawn | the instrument wakes |
| 9 | Hero | 112 particles | t = delay … delay + 1.7 (delay = i/112·0.6 + rnd·0.25) | rain from above with swirl, settle onto the curve point; fade in over the first 18% | ease-out cubic per particle; all settled by 2.5s | canvas rAF | final frame | "your log looks like noise, then it has a shape" |
| 10 | Hero | equity curve | t = 0.9 → 2.4 | draws left → right under a clip, glow head dot; area wash and sign tints follow | 1.5s ease-in-out quad | canvas | drawn | the real sample becomes the hero |
| 11 | Hero | trough/peak/end labels | cp ≥ .85 | fade in | 0.15 of cp | canvas/DOM | shown | the numbers are the engine's |
| 12 | Hero | curve end | t ≥ 2.4 until the pilot takes over | diamond pulses (ring 9 + 7·sin) | 3.2 rad/s | canvas | static diamond | the pilot's origin |
| 13 | Hero | pilot | t = 2.7 (`onDone`) | pilot layer fades in on the curve end; the canvas stops drawing its own diamond | 0.6s | `pilot.setActive(true)` | off | a persistent object the eye follows |
| 14 | Hero | canvas | pointermove (fine pointer, ≥ 769) | nearest particle within 24px rings; tooltip "LUMN +4.78%" / "Long · 2026-03-26 · $476"; scene parallax 6px; tilt ±1.6° | quickTo 0.5–0.6s power3 | canvas + DOM + gsap.quickTo | off | the 112 dots are trades |
| 15 | Hero | `.hero-river` | scroll (scrub) over `#hero` `top top → bottom top` | `river.setExit(p)`: curve alpha 1 − p, particles drift down `p·(0.45H + rnd·0.5H)` and grey, grid parallax −10%·H | scrub true | ScrollTrigger | off | hands attention down the page |
| 16 | Hero | `.btn-primary`, `[data-magnetic]` | hover (fine pointer) | pull ≤ 12px toward the pointer | quickTo 0.4s power3 | gsap | off | craft on the buttons that convert |
| 17 | Hero | `#drop` | `.over` (main.ts) / `.pulse` (nav.ts) | accent border + soft fill; scan line | 1.2s linear loop while over | CSS | colour only | affordance; confirms the drop |
| 18 | Results | `#report` arrival | `#report` gains children | next frame: `body.has-report`; `.stats .stat` y 8 → 0 stagger 40ms; `.insight` up stagger 60ms; `.conf` pills press (scale 1.18 → 1); `.barcell .bar` scaleX 0 → 1 from the axis | 0.5s total | gsap.from on rendered DOM | static; `has-report` still set | directs the eye edges → leaks; never delays `render()` |
| 19 | Results | `.stat .value` | same | count 0 → the rendered value (6.7 parser) | 0.9s power2.out | gsap proxy | values shown immediately | numbers feel earned |
| 20 | Results | page scroll | same, after pick/drop/demo | `lenis.scrollTo(report, { offset: -(nav + 16), duration: 0.9 })` | 0.9s | Lenis | native `scrollIntoView` from main.ts | the report is the payoff |
| 21 | Results | `#report-bar`, `#report-followup` | same | fade up | 0.6s, delay .4 | gsap | shown | the earned waitlist ask |
| 22 | Trust | items | enter once | reveal, stagger .08 | 0.7s | data-reveal | static | objection 2 |
| 23 | Numbers | h2 | enter once | lines | 0.9s | SplitText | static | baseline |
| 24 | Numbers | counters | enter once (`top 88%`) | count 0 → 112 / 61% / +37.3% / 1.45 | 1.4s power3.out | gsap proxy, formats int/pct0/pct1/dec2 | final values | shape of a report, fast |
| 25 | Numbers | pilot | scroll stop `numbers` (centre of `#num-pilot` − 0.5vh … +180px) | the pilot sits in the `+37.3%` slot | per frame | pilot.update | off | the marker carries the money number |
| 26 | Story | h2 | enter once | lines | 0.9s | SplitText | static | baseline |
| 27 | Story | field | scroll through `.story` (`start 'top top'`, phone `'top 15%'`; `end 'bottom bottom'`) | one timeline (≈7.05s) scrubbed; labels `fills` 0, `trades` 1.35, `lanes` 2.9, `verdict` 5.3 | scrub 0.6 | CSS sticky + one ScrollTrigger | not sticky; final frame | one frame, one idea at a time |
| 28 | Story | CSV rows | `fills` | 14 rows typed in: `clip-path inset(0 100% 0 0) → inset(0 0% 0 0)` | .35s each, stagger .07, ease none | timeline | hidden | makes "drop" concrete |
| 29 | Story | rows → chips | `trades` | rows fade up 10px (stagger .02); 112 chips pop in an 8×14 grid: scale 0 → 1, opacity 0 → 1 | .45s / .5s back.out(2), stagger amount .9 from start (+.15) | timeline | chips in lanes | fills become trades |
| 30 | Story | chips → lanes | `lanes` | chips fly to four lanes (1s, stagger amount .5); labels and zero ticks fade (+.5, .4s stagger .06); bars scaleX 0 → 1 (+1.45, .6s power3.out stagger .08); values fade (+1.65, .3s stagger .08) | within beat | timeline | static lanes | the sort is the proof |
| 31 | Story | verdict | `verdict` | lanes pack upward (`laneShift`, .7s power3.out) and chips follow; lane-3 chips dim to .25 (.5s); the leak card slides in `yPercent 115 → 0` (.7s power3.out); counter +37.3 → +58.5 (+.25, 1.1s power2.out, snap .1) | within beat; .4s tail | timeline | card and +58.5% shown | the money number |
| 32 | Story | steps, state bars | timeline progress | the active step is at opacity 1, others .32 (thresholds = label/duration + .02); state bars fill to the active index | .4s CSS transition | `setProgress` | all visible | progressive disclosure |
| 33 | Story | pilot | stops `frame` (10% → 72% of the story's scroll span) and `story` (90% → span + 0.3vh) | the pilot rides the frame head, then becomes the verdict dot | per frame | pilot.update | off | the marker becomes the verdict |
| 34 | Story | `#story-run`, footnote | enter once | reveal | 0.7s | data-reveal | static | conversion 1 at max belief |
| 35 | Bento | tiles | enter once | reveal, stagger .08 | 0.7s | data-reveal | static | rhythm |
| 36 | Bento | `.loop` figures | `.is-visible` (IO ≥ .15) | CSS keyframe loops: edges 4.2s, leaks 4.6s, stop 5s, conc 4.4s, break 6s, files 5s (6.6) | per tile | CSS animations gated by class | end frame | each feature demonstrates itself |
| 37 | Shrink lab | h2, formula | enter once | lines; the formula's characters type on (SplitText chars, stagger .012) | 0.9 / 0.6s | SplitText | static | the eye lands on the rule |
| 38 | Shrink lab | diagram | enter once (≥ 50% visible) | one-shot sweep: n 3 → 45 then back to the chip's n; markers slide, badge flips at 5 and 15 | 2.4s | gsap on `input.value` + `input` event | none | feel how little 3 trades are trusted |
| 39 | Shrink lab | slider, chips | input / click | marker `cx`, readout, badge, verdict update | 320ms (instant under RM) | gsap.to on `cx` | instant | user-driven proof |
| 40 | Stop lab | three paths | scrub over `#stop-lab` (`top 70%` → `bottom 60%`) | `stroke-dashoffset 1 → 0` in order none, back, stay; the stop line slides in from the right first | scrub 0.5 | ScrollTrigger + stroke-dashoffset | drawn | the three outcomes draw themselves |
| 41 | Stop lab | counts and ladder | enter once | count up 0 → 79 / 7 / 26; ladder values count from +37.3 | 1.1s power2.out | data-count | final | the stop is exonerated with numbers |
| 42 | Method | cols, checklist | enter once | reveal, stagger .08 | 0.7s | data-reveal | static | reading order |
| 43 | Method | `#privacy-wire` pulse | `.is-visible` | `stroke-dashoffset 640 → 0` on the duplicate path | 2.4s loop, ease none | gsap | pulse frozen at 50% | the data path ends in the tab |
| 44 | Export | tabs | click / arrow keys | panel crossfade | 200ms | CSS | instant | friction removal |
| 45 | Export | menu-path chips | enter once | light in sequence 1 → 2 → 3 | 1.2s | gsap | static | the path is memorable |
| 46 | Roadmap | h2, lede | enter once | lines / reveal | 0.9 / 0.7s | SplitText / gsap | static | baseline |
| 47 | Roadmap | `#roadmap-line-fill` | scrub over `#timeline` (`top 80%` → `bottom 30%`) | `strokeDashoffset 1 → 0`, ease none | scrub 0.4 | ScrollTrigger | filled | the analyzer is node one of a bigger thing |
| 48 | Roadmap | `[data-ms]` | enter once (`#milestones top 85%`) | scale .9, opacity 0 → 1 | 0.5s back.out(1.4), stagger .1 | gsap.from | static | reading order |
| 49 | Roadmap | `#preflight-roadmap` | ScrollTrigger `onToggle` (`top 85%` → `bottom 0%`) plays/pauses | rows slide in (x −6, .35s stagger .16), ticks pop (back.out(3)), verdict stamps (1.0s); at 4.0 face A fades, the card height tweens to face B (.45s power2.inOut), face B rows/ticks/stamp (4.4 / 5.1); at 8.2 back to face A; loop | 8.85s cycle, repeat −1 | gsap timeline (6.3) | face A static, face B hidden | previews the paid value, red then green |
| 50 | Roadmap | CTA, footnote | enter once | reveal | 0.7s | data-reveal | static | the ask arrives after the preview |
| 51 | Roadmap → band | pilot | stop `waitlist` (`min(centre of #wl-pilot − 0.5vh, maxScroll − 2)`) | quadratic flight from the verdict dot to the button, with a 9-circle tail; `.landed` shows the ◆ inside the button and hides the layer | per frame | pilot.update / land | ◆ always shown | the object the eye followed ends inside the ask |
| 52 | Band | `.signup-band` | always (motion) | border/glow pulse | 6s ease-in-out loop | CSS keyframes | static ring | the brightest object on the page is the ask |
| 53 | Band, mini form | submit | click | `signup.ts` message; button pop scale .97 → 1 | .2s | gsap | message only | feedback |
| 54 | FAQ | `details` | toggle | content `grid-template-rows 0fr → 1fr`; `+` → `–` | 250ms | CSS | instant | comfort |
| 55 | Final | h2, buttons | enter once | lines / reveal | 0.9 / 0.7s | SplitText / gsap | static | baseline |
| 56 | Dock | `#dock` | visibility rule (3.16) | translateY 24 ↔ 0, opacity | 250ms | CSS class | opacity only | conversion 1 one click away |
| 57 | Global | `[data-count]` | enter once | count 0 → value, `data-format` | 1.1s power2.out | gsap proxy + `format.ts` | final (already in HTML) | numbers feel real |
| 58 | Global | links, buttons, chips | hover | background / border / underline | 160–200ms | CSS | colour only | affordance |

Global rules: reveals are `once: true`; scrubs exist only in rows 15, 27–33, 40 and 47; loops only in rows 7, 12, 17, 36, 43, 49, 52, and they pause when their element is off-screen or `document.hidden`. `ScrollTrigger.refresh()` is called, debounced 100ms, after: `#report` resize (ResizeObserver), any `<details>` toggle, a tab switch, `document.fonts.ready`, `orientationchange`, and the 200ms-debounced window resize that also re-lays out the river, the story and the pre-check card (prototype lines 1472–1480).

---

## 5. Hero set-piece: the Equity River (`#hero-canvas`, exact; port of `River`, prototype lines 932–1112)

**What it is.** 112 particles, one per closed sample trade, rain in from above the hero, swirl, and settle onto their point of the cumulative-P&L curve (−$774 trough at trade 43, $3,441 peak at trade 111, $3,238 end), while the curve draws itself left to right in signal blue with a glow. The final point pulses as a diamond until the pilot marker takes it over. Behind everything, a faint 12×8 grid.

**Data.** `sample.ts` (6.0) provides `dots` sorted by exit time with `cum` (cumulative P&L after that trade) and `equity = [0, ...cum]` (113 values). Fallback when the fetch or parse fails: draw the grid only, set the caption to "The sample couldn't load. The analyzer still works: drop a file.", disable the pilot (`#signup-btn.landed`). No baked curve.

**Canvas and layout** (`layout()`, lines 945–969). `.hero-river` is measured with `getBoundingClientRect()`; `W`, `H` rounded; `dpr = min(devicePixelRatio, W ≤ 768 ? 1.5 : 2)`; backing store `W·dpr × H·dpr`, `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`; sprites are rebuilt on every layout. Plot box: desktop `padL = max(24, 0.035·W)`, `padR = 30`, `yTop = 0.40·H`, `yBot = 0.92·H`; phone (≤ 768) `padL = padR = 14`, `yTop = 0.10·H`, `yBot = 0.62·H`. Points `pts[i] = { x: padL + (W − padL − padR)·i/112, y: yBot − (v − min)/(max − min)·(yBot − yTop), v }` for the 113 equity values; `zeroY` the same mapping of 0; `minI`/`maxI` the indices of the trough and peak. The path is a `Path2D` through quadratic midpoints (`quadraticCurveTo(pts[i], midpoint(pts[i], pts[i+1]))`), finishing with `lineTo` the last point. Each particle `k` targets `pts[k + 1]`; its start `y0 = y0f·H` with `y0f = −(0.05 + rnd·0.5)`. `#hero-end` is positioned at the last point (`left/top` in px). Seeded PRNG `rng(7)` (mulberry32, line 910) so the choreography is identical on every load.

**Particles** (constructor, lines 938–942). `r = 3 + 4·min(1, |ret|/6.71)` (the sample's largest |return|; bind to `Math.max(|ret|)` from the data), `pos = pnl > 0`, `delay = (i/112)·0.6 + rnd·0.25`, `amp = 18 + rnd·40`, `ang = rnd·2π`, `jx = (rnd − .5)·120`. Sprite (`sprite()`, lines 970–986): a cached canvas per `colour|radius` with glow radius `r·2.6`, radial gradient stops `.55 / .16 / 0` of `46,191,119` (pos), `229,83,75` (neg) or `138,147,160` (grey), the disc in `#2EBF77` / `#E5534B` / `#8A93A0`, and a highlight dot `rgba(255,255,255,.45)` of radius `.38r` at `(−.28r, −.3r)`. Radii are rounded to 0.5px for cache hits; the hovered particle draws at `1.7r`.

**Draw** (`draw(t)`, lines 1012–1095), per frame with `t` in seconds since start:
1. `clearRect`. Grid: alpha `clamp(t/0.4)` (1 in static), translated by `−exit·0.10·H`, 1px lines at `rgba(243,245,247,.05)`, 11 verticals at `round(c/12·W) + .5` spanning −0.2H … 1.2H and 7 horizontals at `round(r/8·H) + .5`.
2. `translate(par.x·6, par.y·6)` (pointer parallax).
3. Curve progress `cp = done || t ≥ 2.4 ? 1 : clamp((t − 0.9)/1.5)`, eased in-out quad; `alpha = 1 − exit`. If `cp > 0` and `alpha > .01`: clip to `x ≤ head.x + 1` where `head = headAt(cp)` (linear interpolation along `pts`); fill the area under the curve with a vertical gradient `rgba(91,156,255, .10·alpha) → 0` from the curve's top to `H`; add a sign tint: above `zeroY` `rgba(46,191,119, .08·alpha)`, below `rgba(229,83,75, .08·alpha)` (each clipped to its half); the zero line `rgba(243,245,247, .12·alpha)` 1px from `pts[0].x` to the last x at `round(zeroY) + .5`; the river: `shadowColor rgba(91,156,255, .6·alpha)`, `shadowBlur 24`, `strokeStyle rgba(91,156,255, alpha)`, `lineWidth 2`, round joins/caps, `stroke(path)`; while `cp < 1` a head dot r 3.5 at `rgba(91,156,255,.95)` with `shadowBlur 18`.
4. Labels at `la = clamp((cp − .85)/.15)·alpha`, desktop only: mono 500 12px, `textBaseline middle`: `fmtUsd(trough) + ' trough'` left-aligned at `(lo.x + 12, lo.y + 14)` in `rgba(138,147,160, la)`; when `W ≥ 1280`, right-aligned at `W − 12`: `fmtUsd(peak) + ' peak'` at `hi.y − 16` (muted), `fmtUsd(end) + ' · ' + pct1(totalReturn)` at `en.y + 22` in `rgba(243,245,247, la)`, `trades + ' trades'` at `en.y + 38` (muted). **Collision rule (new):** measure the end stack's widest string; if `W − 12 − width < inputRect.right + 8` (the console's right edge, read on layout), draw the stack at 11px left-aligned from `inputRect.right + 8`; if even that exceeds `W − 12`, keep only the end line. `fmtUsd` uses U+2212 for negatives (`−$774`).
5. Particles: for each, `u = done ? 1 : clamp((t − delay)/1.7)`; skip while `u ≤ 0`; `e = 1 − (1 − u)³`, `sw = (1 − u)²`; `x = tx + amp·sw·cos(ang + 2.6t) + jx·(1 − e)`, `y = y0 + (ty − y0)·e + 0.6·amp·sw·sin(ang + 2.6t)`; with `exit > 0`: `y += exit·(0.45H + rnd·0.5H)`, `x += exit·(rnd − .5)·40`; `fade = clamp(u/0.18)`; draw the colour sprite at `globalAlpha = fade·(1 − .75·exit)` and, when exiting, the grey sprite over it at `fade·exit·.5`; the hovered particle gets a 1.5px ring `rgba(243,245,247,.9)` at `r + 4`.
6. End marker while `cp ≥ 1 && !pilotActive && alpha > .01`: `pulse = animate ? .5 + .5·sin(3.2t) : .6`; a disc r `9 + 7·pulse` at `rgba(91,156,255, .18·alpha·(1 − .5·pulse))`, then the 7px diamond in `rgba(91,156,255, alpha)` with `shadowBlur 14`.

**Loop** (`loop()`, lines 993–1005): rAF while `visible` (IntersectionObserver on `#hero`, threshold 0); `done = true` and `onDone()` at `t > 2.7`; after `done`, keep drawing only while the pointer is over the hero, `exit` changed, or the end marker pulses (i.e. until the pilot is active); otherwise stop and set `needDraw` on the next change. `start()` resets `t0`; `replay()` (after a pick/drop) re-runs the rain; `drawStatic()` = `draw(10)`.

**Pointer** (`pointerMove`, lines 1096–1111; desktop and `done` only): nearest particle within 24px (after removing the parallax offset); tooltip HTML `<b>SYM <span class="pos|neg">+4.78%</span></b><small>Long · 2026-03-26 · $476</small>`, `.flip` when `x > W − 170`, positioned at `(x + par.x·6 − (flip ? 14 : 0), y + par.y·6 − 16)`. `pointerleave` clears. Hero `pointermove` also drives `rotationX = −ny·1.6`, `rotationY = nx·1.6` on `.hero-river` (`transformPerspective 1400`) and `par.x/y = nx/ny` through `gsap.quickTo` (0.6s / 0.5s `power3`).

**Scroll.** `ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true, onUpdate: st => river.setExit(st.progress) })`. No pin.

**Resize.** Debounced 200ms: `river.layout()`; `drawStatic()` when not animating; the pilot re-measures.

**Phone (≤ 768).** The river is a 40vh band under the nav (`.hero-river, .hero-scrim { height: 40vh; inset: var(--nav-h) 0 auto 0 }`, scrim `linear-gradient(180deg, rgba(10,12,16,.35) 0%, rgba(10,12,16,0) 22%, rgba(10,12,16,.15) 52%, rgba(10,12,16,.9) 80%, var(--bg) 100%)`); DPR 1.5; no labels, no tooltip, no tilt/parallax, no exit scrub, no pilot (the band's `.landed` ◆ is shown); the rain still plays.

**Reduced motion.** `river.animate = false; river.start()` → `drawStatic()`: the final frame with labels; `#signup-btn.landed`.

**Why canvas 2D.** 112 sprites, one path and two gradients cost well under 1ms a frame; nothing a visitor could see would come from WebGL.

---

## 6. Signature set-pieces beyond the hero

### 6.0 The sample data module (`src/web/site/sample.ts`), shared by every set-piece

```ts
export interface Dot {            // one closed trade, in exit-time order (the river's and the story's order)
  i: number; sym: string; dir: 'long' | 'short'; date: string /* 2026-03-26 */; weekday: string;
  entry: string /* 9:42 */; exit: string; ret: number; pnl: number; fills: number;
  tradeOfDay: number; minutes: number; prev: 'first' | 'win' | 'loss' | 'quick-after-loss';
  overnight: boolean; holdMin: number; mae: number | null; mfe: number | null; cum: number;
}
export interface SampleData {
  report: Report;                   // analyze(trades, { stopPct: 2 }) with timeZone 'America/New_York'
  tagged: TaggedTrade[];            // tagTrades(trades) in the engine's (entry) order
  dots: Dot[]; equity: number[];    // equity = [0, ...dots.map(d => d.cum)], 113 values
  stopAt: Record<string, RiskStats>;// '1.5' and '3' (analyze re-run at those stops)
  csvLines: string[]; bytes: number;// the fetched text split on '\n' (header first) and its byte length
  neverNear: number; stayedRed: number; cameBackPoints: number; stayedRedPoints: number;
  top5: number[];                   // indices into dots, by return desc
  maxAbsRet: number;                // 6.71 on the sample; the river's radius scale
}
export function getSample(): Promise<SampleData>;         // memoised; fetch at idle, see below
export function bindSampleNumbers(root: ParentNode, data: SampleData): void;  // 7.3
```

`getSample()` fetches `` `${import.meta.env.BASE_URL}sample-trades.csv` `` (the identical string `main.ts` uses, so `#demo`'s fetch hits the cache) in `requestIdleCallback` (fallback `setTimeout 200`), then `parseFile → combineTrades → analyze` and `tagTrades` (7.5). It never touches the analyzer's `loaded` state. On failure the promise rejects once; every consumer has a static fallback (hero grid only; story and counters keep their typed HTML numbers).

### 6.1 Story: "From fills to verdict in four scrolls" (port of `Story`, lines 1114–1224; CSS 166–214 and 382–386, 407–423)

**Approach.** CSS sticky, not a GSAP pin. `html.motion .story { height: 400vh }` and `html.motion .story-stage { position: sticky; top: 0; height: 100vh; padding-top: var(--nav-h) }` at ≥ 769 px; `html:not(.motion) .story { padding: 128px 0 }`. `.story-stage` is a 12-column grid (`gap: 0 24px`, two rows, `align-content: center`): `.story-head` columns 1–5 row 1 (`margin-bottom: 34px`, `align-self: end`), `.story-steps` columns 1–5 row 2 (max 440px), `.story-frame` columns 6–12 rows 1–2 (`justify-self: end; width: 100%; max-width: 520px; height: min(560px, 76vh)`, `--surface-2`, 1px `--line`, radius 22, `--shadow-1`, `padding: 18px 24px 24px`, column flex, `overflow: hidden`). `.frame-head` (flex, space-between, `margin-bottom: 12px`): the mono label and `.states` (the pilot slot 14px + four 18×3px bars at `rgba(243,245,247,.12)`, `.on` = `--accent` with `0 0 8px var(--glow)`). `.frame-stage { position: relative; flex: 1; min-height: 0 }` holds, all absolutely positioned at `inset: 0`: `pre.story-csv` (mono 400 12px/20px `--text-2`, `white-space: pre; overflow: hidden; opacity: 0`, header line `.hd` in `--accent`), `.lanes`, `.story-chips` (`display: none` until `html.js`), and `.story-card` (bottom-anchored: `rgba(27,32,41,.96)`, 1px `rgba(255,107,107,.45)`, 3px left `--neg`, radius 8, `padding: 16px 18px`, `box-shadow: 0 -20px 50px rgba(0,0,0,.45)`, `backdrop-filter: blur(6px)`; `.tag` Inter 600 13px `--neg` with the 14px `.vdot` whose `::before` is an 8px `--neg` disc with `0 0 10px rgba(255,107,107,.6)`; `.verdict .big` mono 500 clamp(32–40px) `--pos`; `small` mono 13px `--muted`). `.chip { position: absolute; left: 0; top: 0; width: 14px; height: 14px; border-radius: 4px; border: 1px solid var(--pos-mark); background: var(--pos-soft); will-change: transform; opacity: 0 }`, `.neg` with `--neg-mark`/`--neg-soft`; `html:not(.motion) .chip { opacity: 1 }`. `.lane` absolute full-width; `.lane-lbl` 84px wide (`b` serif 22px white, `small` mono 11px `--muted`); `.bar` 7px tall radius 4 `--pos-mark` with `0 0 12px rgba(46,191,119,.35)`, `transform-origin: left center` (`.neg`: `--neg-mark`, `rgba(229,83,75,.35)`, origin right); `.bar-val` mono 500 12px `--pos`/`--neg`; `.zero` 1px × 13px `--line-strong`. `.step { padding: 16px 0 16px 20px; border-left: 1px solid var(--line); margin-bottom: 6px; transition: opacity .4s }` with the `::before` number disc (17px, `--bg-2`, 1px `--line-strong`, mono 500 9px `--muted`; `.active::before` accent border/text with `0 0 10px var(--glow)`); `.story-steps.scrubbed .step:not(.active) { opacity: .32 }`.

**Layout** (`layout()`, lines 1124–1156), recomputed on resize from `#frame-stage`'s `clientWidth/Height`: chip size `cs = 14` (10 on phones), `gap = 4` (3), `pitch = cs + gap`; grid 8 × 14 with `cell = min((W − 24)/8, (H − 24)/14)`, centred; lanes: `labelW = 92` (66), `aw = W − labelW − 8`, `perRow = max(4, floor(aw/pitch))`, `laneTop = 0.03H`, `lanePitch = 0.97H/4`; chip `k` of lane `L` (by `min(4, tradeOfDay)`) at `(labelW + (j % perRow)·pitch, laneTop + (L − 1)·lanePitch + floor(j/perRow)·pitch)`; each lane element is placed at its `laneTop + k·lanePitch` with height `lanePitch − 6`; bars: `x0 = labelW + 0.4·aw`, `maxW = 0.38·aw`, `w = |avg|·maxW` (avg in %, from `group.tradeOfDay.*.avgReturn`), `barY = rowsIn·pitch + 6`, positive bars start at `x0`, negative end at `x0`; the zero tick at `(x0, barY − 3)`; values at `x0 + (avg > 0 ? w : 0) + 8`. Verdict packing: `cardH = card.offsetHeight`, `avail = H − cardH − 10`, each lane's packed height `max(rowsIn·pitch + 16, labelHeight)`, `gapV = clamp((avail − ΣlaneH)/3, 6, 28)`, `laneShift[k] = packedTop − (laneTop + k·lanePitch)`.

**Timeline** (`build()`, lines 1164–1215), `paused`, `defaults: { ease: 'power2.inOut' }`, rebuilt on resize at the same progress. Initial `set`: csv opacity 1; rows `clipPath: 'inset(0 100% 0 0)'`; chips at their grid position, `scale 0, opacity 0`; labels, values, zero ticks opacity 0; bars `scaleX 0`; lanes `y 0`; card `yPercent 115, opacity 0`; counter text `+37.3%`. Then exactly rows 28–31 of section 4. The ScrollTrigger: `trigger: '#story', start: isMobile ? 'top 15%' : 'top top', end: 'bottom bottom', scrub: 0.6, animation: tl, onUpdate: st => setProgress(st.progress)`; `setProgress` picks the active step by the thresholds and toggles the state bars. `.story-steps` gets `.scrubbed` once built.

**Static state** (`setStatic()`, lines 1157–1163; reduced motion and no-GSAP): chips at their lane positions plus `laneShift`, lane-3 chips at opacity .25, lanes translated by `laneShift`, csv hidden, all four state bars on; the card is visible at its CSS position.

**Phone (≤ 768, motion).** `.story-stage` is a column flex; `.story-frame` is `position: sticky; top: calc(var(--nav-h) + 8px); z-index: 3; height: min(58vh, 480px); min-height: 380px; padding: 14px 14px 16px; margin-bottom: 24px` with a deeper shadow; steps get `min-height: 40vh` (first 30vh) and centre their text; `.ph-hide` hides "fictional " in the frame label; chips 10px, lane labels 62px / 18px / 10px, CSV 10px/16px, card paddings 12/14, big number 30px. Under reduced motion on phones: no sticky, the static frame, then the steps.

**Data.** The 112 chips are built from `dots` (`neg` when `pnl ≤ 0`, `data-lane = min(4, tradeOfDay)`); counts per lane must equal the engine's `group.tradeOfDay.*.n` (45 / 38 / 26 / 3; asserted in `test/site.test.ts`). The CSV rows are `csvLines.slice(0, 14)`.

### 6.2 Pilot marker (port of `Pilot`, lines 1226–1282; anchor strategy under the no-pins policy)

Anchors, in order: `#hero-end` (positioned by the river at the curve's last point), `#num-pilot` (inside the `+37.3%` counter), `#frame-pilot` (in the sticky frame's head), `#story-dot` (the verdict card's dot), `#wl-pilot` (inside the band's button). The marker lives in the fixed `#pilot` SVG layer (2.5) and is shown only under `html.motion.pilot-on`.

`measure()` (lines 1233–1249) computes scroll stops in document coordinates: with `vh = innerHeight`, `docC(el)` = the element's document centre y, `storyTop` and `span = max(0, storyHeight − vh)` from `#story`'s rect, `maxS = scrollHeight − vh`, `kNum = docC(#num-pilot) − 0.5vh`:

| stop | arrive | leave |
|---|---|---|
| hero | 0 | 0.1vh |
| numbers | kNum | kNum + 180 |
| frame | storyTop + 0.10·span | storyTop + 0.72·span |
| story (verdict dot) | storyTop + 0.90·span | storyTop + span + 0.3vh |
| waitlist | min(docC(#wl-pilot) − 0.5vh, maxS − 2) | ∞ |

then monotonic repair: each `arrive ≥ previous leave + 10`, each `leave ≥ arrive + 10`.

`update()` (lines 1255–1278), every `gsap.ticker` frame while active: `s = scrollY`; if `s ≥ waitlist.arrive` → `land(true)` (adds `.landed` to `#signup-btn`, hides the marker and tail) and return; otherwise `land(false)`; find the segment: while `s < stop[i].leave` the marker sits at the live viewport centre of `stop[i].el` (`getBoundingClientRect()` read now, so a sticky or translating anchor is always current); while `stop[i].leave ≤ s < stop[i+1].arrive` it flies: `p` eased in-out quad, from `A = vp(stop[i].el)` to `B = vp(stop[i+1].el)` along a quadratic Bézier whose control point is the midpoint pushed 30% of the A–B distance along the perpendicular, alternating sides per segment. The marker's `transform` is `translate(x y)`; the tail stores up to 9 past positions (added when the marker moved > 6px) and the nine tail circles follow them.

Lifecycle: `setActive(true)` when the river reports `onDone` (desktop, motion); `measure()` + `update()` on every `ScrollTrigger.refresh` (a global `ScrollTrigger.create({ start: 0, end: 'max', onRefresh })`), which also runs after the `#report` ResizeObserver; `setActive(false)` while `body.has-report` (the report would otherwise sit between the hero and the counters with the marker hovering over it) and again `true` when `#report` empties; disabled entirely ≤ 768 px and under reduced motion, where `#signup-btn.landed` is set at boot. The hero stops drawing its own diamond once the pilot is active (`river.setPilot(true)`). If `#hero-end` has no curve (sample fetch failed), the pilot is never activated.

### 6.3 Pre-trade check card, roadmap line and waitlist band (port of `Preflight`, lines 1284–1334)

`Preflight(el = #preflight-roadmap, slot = #pf-slot)` collects `faceA/faceB`, their `.pf-row`s, `.tick`s and `.pf-verdict`s. `build()` (also on resize, preserving progress and play state): kills the previous timeline and trigger; clears `el.style.height`; measures `hA`/`hB` = each face's `offsetHeight` + the card's vertical padding and borders; sets `slot.style.minHeight = max(hA, hB) + 'px'` (so nothing below the card moves while it flips); initial `set`: all rows `opacity 0, x −6`, all ticks `scale 0` (origin centre), both verdicts `opacity 0, scale 1.18`, face B `opacity 0`, face A `opacity 1`. Timeline (`paused`, `repeat: -1`):

```
rowsIn(A, 0.1)   rows: opacity 1, x 0, .35s, stagger .16, power2.out; ticks: scale 1, .35s, stagger .16, back.out(3), +.05
stamp(verA, 1.0) opacity 1, scale 1, .4s, power3.out
4.0  faceA → opacity 0 (.3s);  el height hA → hB (.45s power2.inOut, immediateRender false)
4.2  faceB → opacity 1 (.3s)
4.4  rowsIn(B);  5.1 stamp(verB)
8.2  faceB → opacity 0 (.3s);  el height → hA (.45s)
8.5  set rows/ticks/verdicts back to their initial state;  faceA → opacity 1 (.3s)
8.8  set el { clearProps: 'height' };  then a .05s tail
```

`ScrollTrigger.create({ trigger: el, start: 'top 85%', end: 'bottom 0%', onToggle: st => st.isActive ? tl.play() : tl.pause() })`. Reduced motion: face A static, face B `display: none`, the slot without `min-height`. `revealAll()` (7.4) clears inline `opacity/transform/height/minHeight` on the rows, ticks, verdicts, faces, milestones, the card and the slot.

The roadmap line: `gsap.to('#roadmap-line-fill', { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '#timeline', start: 'top 80%', end: 'bottom 30%', scrub: 0.4 } })`; milestones: `gsap.from('[data-ms]', { scale: 0.9, opacity: 0, duration: 0.5, ease: 'back.out(1.4)', stagger: 0.1, scrollTrigger: { trigger: '#milestones', start: 'top 85%', once: true } })`.

The band: CSS only (3.12) plus the submit pop (`gsap.fromTo('#signup-btn', { scale: .97 }, { scale: 1, duration: .2 })` on `submit`, after `signup.ts` has handled it; `nav.ts` listens on the form with a non-capturing listener added after `main.ts` ran, so order is guaranteed by script order).

### 6.4 Shrink lab (`labs.ts`)

State `{ n, raw, label, hypothetical }`. `adjusted = (n * raw + 10 * overall) / (n + 10)` with `overall = report.summary.avgReturn` (0.33327). Marker positions are linear over −3 … +5 (clamped). Badge: n < 5 `few`, 5–14 `early`, ≥ 15 `solid`. Verdict, mirroring `analyze.ts` exactly:

```
if (n < 5) 'nothing, too few trades'
else if (adj > overall && raw > 0 && raw >= overall + Math.abs(overall) / 2) 'an edge'
else if (adj <= overall && raw < 0) 'a leak'
else if (adj <= overall && raw < overall / 2) 'a weak spot'
else 'nothing: not clearly away from your average'
```

with "(early signal)" / "(solid)" appended for 5–14 / ≥ 15. Reference values the engineer must reproduce (acceptance 16): (−1.17, 3) → −0.01% TOO FEW; (−1.17, 5) → −0.17% a leak (early signal); (+4.00, 3) → +1.18% TOO FEW; (+4.00, 5) → +1.56% an edge (early signal); (+4.00, 15) → +2.53% an edge (solid); (+0.94, 45) → +0.83% an edge (solid); (+0.94, 1) → +0.39% TOO FEW. The slider is the source of truth: the one-shot sweep (row 38) writes `input.value` and dispatches `input`; a `pointerdown`/`keydown` on the slider or a chip click kills the sweep.

### 6.5 Stop lab (`labs.ts`)

Three `path[data-stop-path]` with `pathLength="1"` and `stroke-dasharray="1"`; one ScrollTrigger on `#stop-lab` (`start: 'top 70%', end: 'bottom 60%', scrub: 0.5`) drives a timeline: the stop line translates in from `x: 120%` (0 → 0.2), then the paths draw in order none (0.2 → 0.45), back (0.45 → 0.75; its second segment switches to the `--pos-mark` stroke once its own dashoffset reaches 0), stay (0.75 → 1). Counts and the ladder are `[data-count]` elements (row 41). Reduced motion: everything drawn from CSS (`html:not(.motion) [data-stop-path] { stroke-dashoffset: 0 }`).

### 6.6 Bento loops (`tiles.ts`, CSS lines 216–271)

The six figures are the prototype's inline SVGs with its CSS keyframes, verbatim: `edges` three bars `scaleX` 0 → 1 → 0 (`edgeGrow` 4.2s, delays 0/.18/.36); `leaks` the 3RD bar drains (`leakDrain`), the TOTAL bar grows `.64 → 1` (`leakTotal`), the `+37.3%` label swaps to `+58.5% if skipped` (`leakTb`/`leakTa`), 4.6s; `stop` the stop line sweeps in from the right (`stopSweep`) and the path draws `stroke-dashoffset 320 → 0` turning from `--neg-mark` to `--pos-mark` at 64% (`stopPath`), 5s, the stop line stroke is `--muted` dashed; `conc` the ring fills to 65% (`ringFill`, dasharray 213.6, offset 74.8) and five dots fill in sequence (`dotFill`, delays .25s apart), 4.4s; `break` seven columns morph between three heights (`--a/--b/--c`) while the caption cycles BY WEEKDAY / BY ENTRY TIME / BY HOLD TIME (`cols`, `cap1..3`), 6s; `files` three sheets slide together (`filesMerge`) and the `112 TRADES` badge fades in (`badgeIn`), 5s. `tiles.ts` only toggles `.is-visible` with an IntersectionObserver (threshold .15); the keyframes run under `.is-visible` only, so off-screen tiles cost nothing. Reduced motion: the global `animation: none !important` rule leaves the shipped end frame.

### 6.7 Report arrival (`reportMotion.ts`)

A `MutationObserver` on `#report` (`childList`). On each mutation batch, on the next animation frame: if `#report` has element children, add `body.has-report`, set the `#report-bar` label from the last trigger (`sample` if the last of `#demo` click / `#files` change / `#drop` drop was `#demo`, else `own`), un-hide `#report-bar` and `#report-followup`, call `pilot.setActive(false)`, run rows 18–21 (rows 20–21 only when `pendingScroll` was set by one of those three triggers; a `#tz`/`#stop` re-render must not scroll), then `ScrollTrigger.refresh()`. If `#report` is empty: remove `has-report`, hide both, re-enable the pilot. The observer never changes report HTML and skips all tweens in reduced motion (it still toggles the class and the hidden attributes). A `ResizeObserver` on `#report` debounces `ScrollTrigger.refresh()` 100ms.

Count-up parser for `.stat .value` (row 19): match `^([+\-−])?(\$)?([\d,]+)(?:\.(\d+))?(k|M|%)?$` on `textContent.trim()`; number = digits without commas plus decimals; tween a proxy from 0 and format with the same decimals count, thousands separators if the original had a comma, and the captured sign, `$` and suffix; on no match, leave the text alone. The final frame sets the exact original string.

### 6.8 Dock and actions (`nav.ts`)

`data-action="pick"`: `files.click()` synchronously in the click handler, then (≤ 768 px, or when `#input` is off-screen) scroll to `#input` (Lenis `scrollTo` with offset `-(nav + 16)`, or `scrollIntoView({ block: 'start' })` in RM), then `drop.focus()` and `drop.classList.add('pulse')` for 1.4s (CSS ring + scan line; static ring in RM). `data-action="demo"`: `demo.click()`. `data-action="help"`: open the hero `details.help`, scroll to it, then refresh. `[data-scroll-to]` / `href="#id"`: Lenis or native scroll (the prototype's `scrollToEl`, offset `-(navH + 8)`, `#top` → 0). Tabs: the `role=tablist` keyboard pattern. Motion toggle (8.4). Second signup: `setupSignup(document.getElementById('signup-report'))`; each form dispatches `signup:done` on success and the other replaces its inputs with its `.signup-msg` text "You're on the list." The file card adoption (3.1). The dock visibility rule is 3.16.

---

## 7. DOM and data contract

### 7.1 Untouched analyzer contract

`#files` (file input, inside `#drop`), `#drop` (`<label for="files">`), `#tz` (`<select>`), `#stop` (`<input type=number>`), `#demo` (`<button>`), `#status` (`<p role=status>`), `#report` (`<div>`), `#signup` (`<section>` containing `form`, `input[type=email]#signup-email`, `button[type=submit]`, `.signup-msg`). Tag types and nesting assumptions in `main.ts` / `signup.ts` are preserved; **`src/web/main.ts` and `src/web/signup.ts` are not modified.** `style.css` keeps every selector the report uses (`.panel`, `.drop`, `.drop.over`, `.options`, `.help`, `.status`, `.banner`, `.stats`, `.stat`, `.label`, `.value`, `.note`, `.insights`, `.insight`, `.edge`, `.leak`, `.weak`, `.tag`, `.conf`, `.conf-too-few`, `.conf-early-signal`, `.conf-solid`, `.section-title`, `.dims`, `.dim`, `table`, `td`, `th`, `.num`, `tr.few`, `.barcell`, `.axis`, `.bar`, `.above`, `.below`, `.pos`, `.neg`, `.muted`, `.small`, `.signup`, `.signup-msg`, `.sr-only`, `button.link`) and only its token values and cosmetic rules change: the `:root` block becomes section 2.2 (the light theme and both dark blocks are deleted), `.panel` → `--surface` + 1px `--line` + radius 14, `.stats .stat` → `--surface-2` tiles with mono values at `clamp(28px, 1.2rem + 2vw, 40px)`, `.insight.edge/.leak/.weak` → the tinted cards of 2.5, `.tag` → the Flight Recorder tag, `.conf` → `.pill`, `tr.few` stays at opacity .5, bars keep `currentColor`, `.banner` → `--weak-soft` on `--weak` text (the only other amber), `.dim table` keeps its horizontal scroll panel.

### 7.2 New ids (all must exist)

`#skip`, `#top` (the nav header), `#nav-sample`, `#nav-join`, `#hero`, `#hero-river`, `#hero-canvas`, `#hero-end`, `#hero-labels`, `#hero-tooltip`, `#hero-sr`, `#cta-drop`, `#cta-sample`, `#input` (the console), `#file-card`, `#file-card-name`, `#file-card-meta`, `#results`, `#report-bar`, `#report-followup`, `#signup-report`, `#signup-email-2`, `#trust`, `#numbers`, `#num-pilot`, `#story`, `#story-frame`, `#story-states`, `#frame-pilot`, `#frame-stage`, `#story-csv`, `#story-lanes`, `#story-chips`, `#story-card`, `#story-dot`, `#story-counter`, `#story-steps`, `#story-run`, `#features`, `#shrink-lab`, `#shrink-examples`, `#shrink-diagram`, `#shrink-readout`, `#shrink-badge`, `#shrink-verdict`, `#shrink-n`, `#stop-lab`, `#stop-figure`, `#stop-ladder`, `#method`, `#privacy-wire`, `#export`, `#tab-tv`, `#tab-broker`, `#panel-tv`, `#panel-broker`, `#roadmap`, `#timeline`, `#roadmap-line`, `#roadmap-line-fill`, `#milestones`, `#pf-slot`, `#preflight-roadmap`, `#signup-form`, `#signup-btn`, `#wl-pilot`, `#signup-msg`, `#faq`, `#final`, `#motion-toggle`, `#dock`, `#pilot`, `#pilot-g`, `#pilot-tail`.

### 7.3 Data attributes

- `data-reveal` (+ `data-reveal-delay`), `data-split="lines|words"`, `data-hero` (the load-timeline targets), `data-hero-split` (the h1). CSS: `html.motion [data-reveal], html.motion [data-hero] { opacity: 0 }`, `html.motion [data-split] { visibility: hidden }` (prototype lines 347–351); without `html.motion` everything is visible.
- `data-counter="112" data-counter-format="int|pct0|pct1|dec2"` (the four hero counters; text already holds the final value); `data-count="79" data-format="int|pctInt|pct|pct1|money|fixed2"` with optional `data-count-from="37.3"` for every other counted number.
- `data-sample="<path>" data-format="<fmt>"`: binds the element's text to the engine's report on the sample. The HTML ships with the same value typed in (reduced motion, no-JS and crawlers see it); `sample.ts` overwrites it after computing and, in dev (`import.meta.env.DEV`), `console.warn`s `sample drift: <path> html="…" engine="…"` on any mismatch. Paths:
  - `summary.<field>` for every `Summary` field (`trades`, `days`, `winRate`, `avgReturn`, `avgR`, `avgWin`, `avgLoss`, `totalPnl`, `totalReturn`, `profitFactor`, `maxDrawdown`, `symbols.length`)
  - `risk.<field>` for `RiskStats` (`pastStop`, `pastStopCameBack`, `returnWithStop`, `top5Share`, `stopPct`)
  - `stopAt.<pct>.<field>`: `analyze` re-run at another stop (`stopAt.1.5.returnWithStop`, `stopAt.3.pastStop`)
  - `edges.<i>.<field>` / `leaks.<i>.<field>`: `sentence` (from `insightSentence`), `base` (the sentence up to and including "overall."), `phrase`, `n`, `winRate`, `avgReturn`, `confidence`, `returnWithout`, `pnlWithout`
  - `group.<dimId>.<label>.<field>`: `GroupStats` by dimension id and the engine's exact label, e.g. `group.time.9:30–9:45.n`, `group.tradeOfDay.3rd.avgReturn`, `group.afterPrev.< 10 min after a loss.confidence`, `group.direction.Short.totalPnl`. Paths are split on `.` only at the three fixed positions (labels contain spaces, en dashes and `<`, never dots).
  - `fills.rows` (232), `fills.kb` (`Math.round(bytes/1024)`, 12 after Step 0), `top5.<i>.symbol|returnPct|pnl`, `neverNear` (79), `stayedRed` (26), `cameBackPoints` (16.25), `stayedRedPoints` (−58.12), `equity.end|peak|trough|troughIndex|peakIndex`.
  - Formats: `int`, `pctInt` (`Math.round(x*100) + '%'`), `pct` (`pct(x)`), `pct1` (`pct(x, 1)`), `money` (`money(x)`), `fixed2`, `text`. After formatting, ASCII `-` becomes U+2212 `−` for marketing text (the report itself is untouched).
- `data-pilot-anchor="hero|numbers|frame|story|waitlist"`, `data-story-step`, `data-n`, `data-lane`, `data-face`, `data-ms`, `data-loop`, `data-example` (+ `data-n`, `data-raw`, `data-label`, `data-hypothetical`), `data-stop-path`, `data-report-label`, `data-visible`, `data-magnetic`, `data-action="pick|demo|help"`, `data-scroll-to`.

### 7.4 Boot order and the `motion` class

Inline in `<head>`, before the stylesheets (the prototype's gate, lines 431–439, with `localStorage` instead of the URL hash):

```html
<script>(function(){var h=document.documentElement;h.classList.add('js');try{var off=false;try{off=localStorage.getItem('motion')==='off'}catch(e){}if(matchMedia('(prefers-reduced-motion: no-preference)').matches&&!off)h.classList.add('motion');}catch(e){}window.__booted=false;setTimeout(function(){if(!window.__booted){h.classList.remove('motion');h.classList.add('motion-failed');}},2000);})();</script>
```

`site/index.ts` sets `window.__booted = true` at the end of `bootMotion()` / `bootStatic()`; `window.addEventListener('error', () => { if (!window.__booted) revealAll(); })` and the `catch` around `bootMotion()` call `revealAll()` (prototype lines 913–918, extended as in 6.3), which removes `html.motion` and clears inline `opacity/visibility/transform/height/minHeight` on every reveal target, pre-check row/tick/verdict/face, milestone and the slot. `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important } }` is the belt-and-braces rule. `motion.ts` also listens to the `prefers-reduced-motion` media query `change` event and calls `disable()` (8.4) when it flips to reduce.

Script order in `index.html`: `<script type="module" src="/src/web/main.ts">` first (analyzer; imports only the core and `signup.ts`), then `<script type="module" src="/src/web/site/index.ts">`. Module scripts execute in document order, so the analyzer binds before any site code runs; the site chunk never imports `main.ts`. `index.ts` waits for `Promise.race([document.fonts.ready, 900ms])`, then boots; section modules (`story`, `labs`, `tiles`, `preflight`) are lazy-imported when their section is within 150% of the viewport (IntersectionObserver `rootMargin: '150% 0px'`); `river.ts`, `pilot.ts`, `reportMotion.ts` and `nav.ts` load with `motion.ts`.

### 7.5 File layout

```
index.html                         new structure; every id in 7.2; the head script in 7.4; both module scripts; both stylesheets; Google Fonts links
src/web/main.ts                    UNCHANGED
src/web/signup.ts                  UNCHANGED
src/web/style.css                  analyzer + report styles; tokens replaced by section 2.2; selectors kept (7.1)
src/web/site.css                   marketing layout, components (2.5), keyframes (bento, scan, pulse), motion gating, reduced-motion rules, `@import 'lenis/dist/lenis.css'`
src/web/site/index.ts              boot: fonts race, import('./motion.ts'), bootMotion/bootStatic, revealAll, lazy section imports
src/web/site/motion.ts             gsap + ScrollTrigger + SplitText registration, Lenis (gsap.ticker driven), reveal()/split()/count() utilities,
                                   refresh() debounce, enable()/disable(), the reduced-motion change listener, matchMedia contexts
src/web/site/sample.ts             getSample(), tagTrades consumer, equity series, stopAt map, bindSampleNumbers(root), dev drift warning (6.0)
src/web/site/river.ts              the hero canvas (section 5): River class, pointer, exit scrub, labels, file-card adoption hook
src/web/site/story.ts              the four-scroll frame (6.1)
src/web/site/pilot.ts              the pilot marker (6.2)
src/web/site/preflight.ts          roadmap line scrub, milestones, pre-trade check timeline (6.3)
src/web/site/labs.ts               shrink lab + stop lab (6.4, 6.5)
src/web/site/tiles.ts              bento .is-visible gating, privacy pulse (6.6, row 43)
src/web/site/reportMotion.ts       MutationObserver + ResizeObserver on #report (6.7)
src/web/site/nav.ts                stuck nav, data-action / data-scroll-to delegation, dock, tabs, details/FAQ refresh hooks, motion toggle,
                                   drop pulse, file card adoption, second setupSignup, signup:done, magnetic buttons
src/core/analyze.ts                + export `tagTrades(trades: Trade[]): TaggedTrade[]` (additive; see below)
src/core/parsers/fills.ts          Step 0
scripts/make-sample.py             Step 0
public/sample-trades.csv           regenerated by Step 0
test/engine.test.ts                + Step 0 test
test/site.test.ts                  new: (a) tagTrades group counts == engine GroupStats.n for every dimension and the lane counts 45/38/26/3;
                                   (b) every data-sample in index.html equals the engine value after formatting (regex over the HTML, U+2212 normalised to '-');
                                   (c) the shrink-lab reference values in 6.4; (d) #signup form action == the Buttondown URL built from SIGNUP.id;
                                   (e) the three copy trades exist with their contexts (ORBX short 2026-04-09 11:15 tradeOfDay 3 prev quick-after-loss;
                                   LUMN long 2026-03-05 09:42 tradeOfDay 1; LUMN long 2026-03-03 6 fills overnight); (f) Step 0's RISK numbers 33 / 7 / 13.2
README.md                          + one line (0.3)
docs/prototypes/equity-river-v2.html  the locked look (already in the repo)
package.json                       unchanged (gsap, lenis already present)
```

`tagTrades` (additive export in `analyze.ts`, no behaviour change): returns, per closed trade in the engine's order, `{ trade, date, minutes, weekday, tradeOfDay, prev, holdMin, overnight, labels: { time, tradeOfDay, afterPrev, direction, hold } }`, where `labels.*` are the matching bucket labels computed with the same `Bucket.test` functions the dimensions use. Implement it by reusing `withContext` and the bucket arrays; do not duplicate the bucket boundaries anywhere else.

Every site module exports `mount(ctx: { gsap; ScrollTrigger; lenis: Lenis | null; reduced: boolean; sample: Promise<SampleData> }): { destroy(): void }`. `destroy()` kills the module's tweens and triggers and leaves its DOM in the static final state.

---

## 8. Performance plan

### 8.1 Budgets (gzipped transfer unless noted; measured sizes in the preamble)

- JS total ≤ 100 KB target, 110 KB hard cap: analyzer entry (`main.ts` + core + `signup.ts`) ≤ 12 KB; `site/index.ts` ≤ 3 KB; motion vendor chunk (gsap core 28.3 + ScrollTrigger 18.0 + SplitText 3.7 + Lenis 8.2 = 58.2 KB); site modules combined ≤ 25 KB. No CustomEase, DrawSVG, Flip, ScrollSmoother, ScrambleText.
- CSS ≤ 24 KB gz (`style.css` + `site.css` + `lenis.css`).
- Fonts ≤ 130 KB (110.5 KB measured). `preconnect` to both Google hosts; `display=swap`; the fallback `@font-face` metrics in 2.3.
- Zero raster images, zero video. All illustrations inline SVG; the hero and the story chips are canvas and DOM.
- Sample CSV: 12.3 KB raw after Step 0, fetched once at idle; the `#demo` fetch hits the HTTP cache (same URL string).
- Targets (Lighthouse mobile, simulated 4G, built site): Performance ≥ 90, Accessibility ≥ 95, LCP (the h1) < 2.5s, CLS < 0.05, TBT < 150ms, INP < 200ms. Every canvas, figure and the story frame has its size reserved in CSS (`min-height`, `height`, `aspect-ratio`) so nothing shifts when modules mount.

### 8.2 Loading

1. HTML + CSS + preconnects; fonts swap in (the h1 waits ≤ 900ms for them before splitting).
2. `main.ts` executes: the drop zone, options, sample button and the band's form are live before any site code.
3. `site/index.ts` executes: boot gate, `import('./motion.ts')`; `nav.ts`, `reportMotion.ts`, `river.ts`, `pilot.ts` mount when it resolves; `sample.ts` starts its fetch at idle; the river draws its grid at once and starts the rain when the data arrives (the canvas is visible at load).
4. Section modules lazy by proximity (7.4). The story module waits for `getSample()`.
5. Nothing awaits the analyzer, and the analyzer awaits nothing.

### 8.3 Runtime

Canvas: DPR cap 2 (1.5 ≤ 768); `setTransform` once per layout; sprites cached per radius; the rAF stops when the hero leaves the viewport, `document.hidden`, or once the pilot owns the end marker and the pointer is away; the story has no canvas (112 transformed divs with `will-change: transform`, positions precomputed once per resize). ScrollTrigger: `ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true })`; no pins; scrubbed properties are transform / opacity / clip-path / `stroke-dashoffset` / canvas `exit` / text only. Lenis: `new Lenis({ lerp: 0.1, autoRaf: false })`, `lenis.on('scroll', e => { ScrollTrigger.update(); onScrollNav(e.scroll) })`, `gsap.ticker.add(t => lenis.raf(t * 1000))`, `gsap.ticker.lagSmoothing(0)`; never `ScrollSmoother` or `ScrollTrigger.normalizeScroll`. `content-visibility: auto` with `contain-intrinsic-size` on `#faq` and `footer` only (never on sections carrying ScrollTriggers). SplitText is applied to at most 12 elements and reverted when its reveal completes. Loops gated by IntersectionObserver and `visibilitychange`.

### 8.4 Reduced motion plan (complete; applies to `prefers-reduced-motion: reduce` and to `motion=off`)

1. `html.motion` is never added, so no element starts hidden or offset; every reveal target, chip, card, pill and figure is in its final state at first paint.
2. `motion.ts` is still imported (for `data-action`, the dock, tabs and the toggle) but creates no Lenis, no ScrollTrigger, no SplitText.
3. Hero: `drawStatic()` (the final frame with labels), no rain, no tooltip, no tilt, no exit; `#signup-btn.landed`.
4. Story: `setStatic()` (6.1); no sticky; all four steps at full opacity.
5. Pilot: never activated; the ◆ is shown inside the waitlist button from CSS.
6. Pre-check: face A static, face B hidden; the roadmap line filled from CSS; milestones static.
7. Bento and the privacy pulse: shipped SVG state; no `.is-visible` work.
8. Shrink lab: no sweep; slider and chips update instantly. Stop lab: paths drawn from CSS.
9. Report arrival: no count-ups or staggers; `has-report`, the bar and the followup still show; the scroll is `main.ts`'s native one.
10. Anchors and `data-scroll-to` use native `scrollIntoView({ behavior: 'auto' })`; the drop pulse is a static ring; the dock toggles opacity only.
11. The footer toggle. **Off** (from on): store `motion=off`, then `disable()`: `ScrollTrigger.getAll().forEach(t => t.kill())`, each module's `destroy()`, `splits.forEach(s => s.revert())`, `gsap.globalTimeline.clear()`, `lenis?.destroy()`, remove `html.motion` and `html.pilot-on`, `revealAll()`, `river.drawStatic()`, `story.setStatic()`, `#signup-btn.landed`; the page is then in state 1–10 without a reload. **On** (from off): store `motion=on`; if `#report` is empty, `location.reload()`; otherwise set the button text to "Motion: on next load" so the visitor's report is not lost. The button label reflects `aria-pressed`.
12. The `prefers-reduced-motion` media query `change` to `reduce` calls `disable()` live (no store); a change back to `no-preference` does nothing until the next load.

---

## 9. Mobile plan (375 px, 16 px gutters)

- `html, body { overflow-x: clip }` as a backstop only (`clip` does not break `position: sticky`; `hidden` would). Every canvas and SVG is `width: 100%` with a `viewBox` or a reserved height; `#story-csv` is `overflow: hidden; white-space: pre`; the frame is `overflow: hidden`; report tables keep their own `overflow-x: auto` panel; chip rows scroll inside their container with `scroll-snap-type: x mandatory`; SplitText masks are `overflow: hidden`; `#pf-slot` and `.roadmap-cta` have `min-width: 0` so the nowrap mono rows cannot inflate the grid (a per-element overflow check is part of acceptance 2, because `overflow-x: clip` hides overflow from `scrollWidth`). No element is wider than `100vw − 32px`.
- Nav 56px: brand + filled "Join the waitlist"; section links in the footer; skip link kept.
- Hero (`.hero { min-height: 0; display: block }`): the river as a 40vh band under the nav (5), `.hero-inner { display: block; padding: 28px 0 40px }`, `.hero-text { padding-top: 26vh }`, h1 44px (40px ≤ 480) `margin: 12px 0 18px`, lede 16px, CTAs stacked full width (`flex: 1 1 auto`, `margin-top: 24px`): "Choose my CSV files" (primary) then "Run the sample report"; then the console (`margin-top: 20px; padding: 20px`, drop zone `padding: 24px 16px`, options in one column, file card full width). The primary CTA is fully visible at 375×667 and both CTAs at 375×740 (acceptance 2). The caption and tooltip are hidden.
- Results: `#report-followup` stacked; the mini form's input and button stack full width.
- Trust: one column. Counters: 2×2, 34px values. Story: 6.1's phone block (sticky frame 58vh, steps 40vh). Bento: one column, 14px gap, tiles `padding: 18px`, loops still run (at most the two most-centred tiles at once). Shrink lab and stop lab per 3.7/3.8. Method: wire 240px tall above the checklist. Export: tabs full width. Roadmap: 3.11's ≤ 899 block. Band: one column, `padding: 32px 24px`. FAQ summaries 16px padding. Footer stacked.
- Dock: the 64px bottom bar with `env(safe-area-inset-bottom)`; `main { padding-bottom: 80px }` at ≤ 768; hidden while an input has focus (keyboard-aware) and under the other rules in 3.16.
- Pilot off; magnetic off; tilt/parallax off; `pointer: coarse` gets no hover tooltips. Lenis uses native touch scrolling (`syncTouch` default false); no pins anywhere, so iOS address-bar resizes cannot jump content; `ignoreMobileResize` stays on. An iPad in landscape (≥ 769, touch) gets the sticky story and the pilot like desktop; both are CSS sticky and per-frame rects, so they are safe.
- Tap targets ≥ 44px; the report tables remain the existing horizontally scrollable panels (bar column hidden under 560px, as today).

---
