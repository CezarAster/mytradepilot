# HANDOFF: MyTradePilot website (the Referee, to be renamed Hardstop)

Drop this file into a new Claude Code session on your computer (or paste it as the first message) and say: "Read HANDOFF.md, then <the task you want>". It contains everything the previous sessions knew: what the product is, where the code and documents are, what is finished and verified, what is open, the rules the copy must obey, and ready-to-paste prompts for the next tasks.

Written 2026-10-12 from the cloud session that built the site. Nothing here is speculative; where something was not verified it says so.

---

## 1. What this is

MyTradePilot is being repositioned from a free trade analyzer into "the Referee": the trader writes their own behavioural rules while calm (max trades per day, no re-entry within N minutes of a losing exit, cooldown after N losses, stop attached within 15 seconds and never widened, declared size), declares them before the session, and the product holds them when the trader cannot. On TopstepX via the ProjectX API, a fill against the trader's own rule is flattened about two seconds after it lands, the breach is logged, a partner is notified, and the product escalates to the platform's own irreversible lockout. The free client-side analyzer stays as the funnel: drop a CSV, see edges and leaks, get three draft rules, click "Have the Referee enforce these". Price: Referee $19 a month or $169 a year plus the trader's own Topstep API key. Launch: a Topstep Combine pilot in April 2027, so the site converts to (1) running the free analyzer and (2) joining the waitlist.

The full strategy is `docs/strategy-2026-10-10-referee.md`. Read it before touching copy.

**Naming decision (made 2026-10-10):** the product name will be **Hardstop**. The URL is not chosen yet (hardstop.com and hardstop.app were taken at last check; see Appendix B for the prompt that finds the best available address). Until the URL is bought, the code still says "the Referee" everywhere; the rename is a planned task (section 6).

## 2. Where everything is

Repository: `CezarAster/mytradepilot` on GitHub.

| Branch | What it holds |
|---|---|
| `claude/trading-app-website-examples-1sfic8` | **The new site.** 33 commits on top of main. Open as draft pull request #2. This is the branch to work on. |
| `main` | The original one-page analyzer, plus the deploy workflow that also publishes the new site's branch build under `/referee/` (section 7). |
| `build/equity-river-1`, `-2`, `-3` | Backups of the analyzer-era "Equity River v2" site builds, before the Referee repositioning. Reference only. |

Live addresses:

- Current old page: https://cezaraster.github.io/mytradepilot/
- New site, built from the branch: https://cezaraster.github.io/mytradepilot/referee/

Documents, all on the branch under `docs/`:

| File | Read it when |
|---|---|
| `strategy-2026-10-10-referee.md` | Before any copy or product decision. The phrasing law in its section 8 is binding. |
| `website-content-spec-referee.md` | The content spec the site was built from: full copy per section, the story script, the rulebook and declaration mock, pricing, legal statements, compliance table, acceptance checklist. |
| `website-review-findings-2026-10-10.md` | **The open work.** Two adversarial reviews (counsel, conversion) with 11 majors and 19 minors, evidence and a fix for each. None applied yet. |
| `website-design-spec.md` | The Equity River v2 build spec: visual tokens, choreography table, set-piece engineering, performance budgets. The look still comes from here. |
| `website-design-spec-panel-pick.md` | An earlier design panel's spec (ink-and-ivory identity). Superseded; useful for engineering notes only. |
| `website-inspiration.md` | Competitor and animation research from the start of the project. |
| `prototypes/` | Single-file look-and-feel prototypes (equity-river-v2.html is the chosen look). See its README for how to open one. |

## 3. Setup on a computer

Requirements: Node 22 or newer (CI uses Node 24), npm, git. Python 3 only if you regenerate the sample data.

```bash
git clone https://github.com/CezarAster/mytradepilot.git
cd mytradepilot
git checkout claude/trading-app-website-examples-1sfic8
npm ci
npm run dev        # http://localhost:5173
npm test           # 26 tests: engine + site (drift, statements, forbidden phrases, draft rules)
npm run typecheck
npm run build      # static site in dist/
npm run report -- --tz America/New_York public/sample-trades.csv   # the analyzer in the terminal
```

Browser checks (optional, used for every QA pass so far): the two scripts in `scripts/qa/` take screenshots at desktop and phone widths and verify that clicking the sample button renders a report.

```bash
npm install --no-save playwright && npx playwright install chromium
npm run build && npx vite preview --port 4191 &
node scripts/qa/shot.mjs http://localhost:4191/ /tmp/shots            # add --reduced-motion for the static state
node scripts/qa/analyzer-check.mjs http://localhost:4191/ /tmp/analyzer
```

## 4. Map of the code

| Path | Owns |
|---|---|
| `index.html` | Every section and all copy. Sections in order: nav, hero (+ analyzer console), results, trust, counters, story, why, rulebook, features, partner, limits, pricing, shrink lab, method, export, roadmap (rungs), waitlist band, FAQ, final band, footer with `#legal`, dock. `data-sample` attributes bind numbers to the engine; a test fails if they drift. |
| `src/web/style.css` | Design tokens (dark only) and the analyzer report styles. |
| `src/web/site.css` | Marketing sections, set-pieces, reduced-motion and no-JS states. |
| `src/web/main.ts` | The analyzer UI. Element ids `files, drop, tz, stop, demo, status, report, signup, signup-email` are a contract; never rename them. |
| `src/web/report.ts` | Renders the report, the three draft rules and the two buttons; places the hypothetical-performance statement under every what-if figure (`data-whatif`). |
| `src/web/legal.ts` | The statement texts (NFA Compliance Rule 2-29(c) shipped; CFTC 4.41(b)(1)(i) as the alternative) and `cftcBlock()`. |
| `src/web/signup.ts` | Buttondown waitlist post: email plus `tag` fields for the "Where do you trade?" select and the partner-in-mind checkbox; shows the invite block after success. |
| `src/web/site/index.ts` | Boot: `html.motion` gate (only when reduced motion is not requested), 2 s safety reveal, lazy import of the motion stack. |
| `src/web/site/motion.ts` | GSAP + ScrollTrigger + SplitText registration, Lenis on the GSAP ticker, reveals and counters. No GSAP pins anywhere; sticky sections use CSS `position: sticky`. |
| `src/web/site/river.ts` | Hero canvas: 112 sample trades rain in and settle on the real equity curve. |
| `src/web/site/story.ts` | The four-scroll story frame (record, sorted, rule, held); beat 4 is the sample's Thursday April 9 breach moment. |
| `src/web/site/pilot.ts` | The pilot marker that rides from the curve end through the counters and the story's flatten row into the waitlist button. |
| `src/web/site/declaration.ts` | The declaration card (Declared / Breached faces, Off state) in the rulebook section. |
| `src/web/site/tiles.ts`, `labs.ts`, `roadmap.ts`, `nav.ts`, `reportMotion.ts`, `sample.ts` | Bento loops, the shrink lab, the rungs timeline, nav and dock, report-arrival animation, the sample data pipeline. |
| `src/core/` | The engine (no browser or Node dependencies): parsers, `analyze.ts`, `drafts.ts` (the three draft rules), `stats.ts` (confidence intervals), `format.ts`. |
| `scripts/make-sample.py` | Regenerates `public/sample-trades.csv` (fictional). The optional Worst %/Best % columns turn on the stop check. |
| `test/` | `engine.test.ts`, `drafts.test.ts`, `site.test.ts` (data-sample drift, statement adjacency, forbidden-phrase grep over `index.html`, band form shape). `fixtures/forbidden-phrases.txt` is the banned list the test enforces. |
| `.github/workflows/deploy.yml` | On push to main: tests, typecheck, build, and deploy to GitHub Pages, plus the branch build under `/referee/`. |

## 5. Rules that must hold (tests enforce some of them)

From the strategy's section 8, applied to every sentence on the site:

- Say "your rule says" and "your record shows". Never "skip this trade", "verdict", "coach", "traders like you", "saved you $X", pass rates, or any instrument-specific stop or size line.
- The flatten is post-fill, and the page says so. "About two seconds" is a design target, never a promise. "Pre-trade" means only the declaration before the click and the next-trade state computed when the previous trade closes.
- The hypothetical-performance statement sits immediately under every what-if figure, at body size, never fine print. `test/site.test.ts` checks adjacency.
- Every number is the fictional labelled sample's engine output, the visitor's own, or labelled illustrative. No invented statistics; third-party findings only with their source and caveat.
- The Referee is an add-on to the platform's own lockouts, never a substitute. Enforcement stops when the local agent is closed, the key is revoked, or TopstepX is opened on another device; the site says so.
- Pilot status is stated: not for sale until the April 2027 pilot. No testimonials, user counts or partner logos.
- Keep the analyzer instant: nothing in the animation stack may delay or block it. The analyzer ids are a contract.
- Reduced motion and no JavaScript must render the complete page in its final state. 375 px wide with 16 px gutters and no horizontal scroll.
- Commit messages: plain and descriptive, no AI model names.

## 6. Status

**Done and verified** (branch head `0671463`, CI green on GitHub):

- The whole site per the content spec, built on the Equity River v2 visual system.
- `npm test` 26/26, `npm run typecheck`, `npm run build` (about 90 KB gzipped JavaScript, 13 KB CSS).
- Headless Chromium: the sample click renders the report with the three draft rules and the enforce button; zero console errors; no horizontal overflow at 375 px; motion, reduced-motion, no-JS and keyboard paths; 33 of 34 acceptance items in the content spec (the 34th is Lighthouse, not run).
- Deployed as a preview at `/referee/` on GitHub Pages without touching the old page.

**Open, in priority order:**

1. **Apply the review findings** in `docs/website-review-findings-2026-10-10.md`. The majors: the page states as fact that the Referee writes a max-trades limit into TopstepX (hedge it: "to be confirmed with Topstep"); "writes" versus "deep-links to" the irreversible lockout is inconsistent (a deep link cannot write a setting); one coaching-voiced sentence in the visitor's own report; the free report asserts live flatten mechanics for every visitor ("Held by" lines); on phones the statement sits two screens below the first what-if figure; the page implies the rulebook, manual rule, rules-kept score and Record Card exist today; the report follow-up promises every waitlist joiner a pilot seat while the band says 50 traders; "declared 2 of 3 · fills 3" is never defined; the export how-to never says whether a TopstepX export works; the three draft rules sit far below the top of the report; "two seconds" appears unqualified in two places; the bento's illustrative figures are not all labelled; "costs less than a journal" is unsourced; the trust strip overclaims. Each has evidence and a fix in the file.
2. **Run the two reviews that never ran** (polish/mobile and engineering/accessibility/performance), then fix what they find.
3. **Rename to Hardstop** once the URL is bought (section 8 lists every place). Then the deploy path `/referee/` becomes `/hardstop/` or the custom domain.
4. **Logos and favicons**: the logo files are on Cezar's computer; add favicon.ico, favicon.svg, apple-touch-icon, icon-192/512 with a web manifest, replace the diamond glyph in the nav and footer, add a 1200x630 social preview image in the site's style, update the head meta.
5. **Counsel items** (strategy open questions): confirm the statement text against the live rules, the name under Vartuli, and whether the shrink lab's hypothetical chip needs a statement.
6. **Lighthouse** on the production build (Performance 90+, Accessibility 95+, CLS under 0.05 are the spec targets).
7. Small known issues: on phones the story's CTA passes under the sticky frame for a moment at the end of the scroll; step 4 and FAQ 4 print "3 minutes" as a bound numeral instead of the spelled-out "three"; Buttondown's acceptance of repeated `tag` fields is unverified (fallback: `metadata__platform`).

## 7. Deploying

- Pushing to `main` deploys the whole Pages site. The workflow builds main at the root and the site branch under `/referee/`. To refresh `/referee/` after new commits on the branch, re-run "Test and deploy" from the repository's Actions tab (or push anything to main).
- To make the new site the real site: merge pull request #2 into main (mark it ready first), then delete the `/referee/` steps from `.github/workflows/deploy.yml` or keep them as a preview of a future branch.
- Custom domain: add a `public/CNAME` file containing the domain and point DNS at GitHub Pages (four A records for the apex, a CNAME for www); then set the domain in the repository's Pages settings. Vite's `base: './'` already makes the build path-independent.

## 8. The Hardstop rename, when the URL is bought

Occurrences of "Referee" at the time of writing: `index.html` (54), `src/core/drafts.ts` (6), `README.md` (2), `src/web/report.ts` (2), `src/web/signup.ts` (2), `src/web/site/nav.ts` (1), `src/web/site/pilot.ts` (1). Also: `<title>` and meta description, the `og:` tags, the "Have the Referee enforce these" button label (keep the verb "enforce" only there, per the content spec's verb policy), the pricing card, the FAQ, the waitlist band, the Buttondown list name and the "Join the Referee waitlist" button, `package.json` name, the repository name and the Pages path, and the footer disclaimers. Keep "referee" out of the forbidden-phrases fixture (it is not banned) but add a test that the old name no longer appears in `index.html` once the rename lands.

Rename voice: "Hardstop holds the rule" reads as a device, which is the point. Tagline used on the naming board: "Mental stops break. Hard stops hold."

## 9. Ready-to-paste prompts for the new session

**Apply the review findings**

> Read HANDOFF.md and docs/website-review-findings-2026-10-10.md. Work the majors first, then the minors. For each finding: verify it against the live page (npm run build, npx vite preview, scripts/qa), fix it if real and proportionate, or reject it with a reason if it contradicts the strategy's phrasing law or the content spec. Keep npm test, npm run typecheck and npm run build green; re-run scripts/qa/analyzer-check.mjs and scripts/qa/shot.mjs (normal and --reduced-motion) and read the screenshots before committing. Commit with explicit, plain messages and push to the branch.

**Add the logos**

> Read HANDOFF.md section 6 item 4. The logo files are in <folder>. Generate favicon.ico, favicon.svg, apple-touch-icon.png (180), icon-192.png, icon-512.png and site.webmanifest into public/; replace the ◆ glyph in the nav brand and footer with the logo mark (SVG inline, currentColor where possible); add a 1200x630 social preview image in the site's palette; update the head meta and og tags in index.html; verify in the browser at desktop and phone; commit and push.

**Rename to Hardstop**

> Read HANDOFF.md section 8. Our domain is <domain>. Rename the product from "the Referee" to "Hardstop" everywhere listed, keep the analyzer ids and the phrasing law intact, update title, meta, og tags, the Buttondown button label, README and package.json, add the CNAME file for the domain, change the deploy preview path from /referee/ to /hardstop/, run the tests and the QA scripts, commit and push.

## Appendix A: links

- Pull request: https://github.com/CezarAster/mytradepilot/pull/2
- Pages preview of the new site: https://cezaraster.github.io/mytradepilot/referee/
- Old page: https://cezaraster.github.io/mytradepilot/

## Appendix B: prompt to find the Hardstop URL (run in a session with internet access)

```text
We have chosen the product name HARDSTOP (a trading-discipline tool for US prop-firm futures traders: the trader writes their own rules, declares them before the session, and Hardstop holds them; sold at $19 a month; audience lives on Discord, YouTube and X). The name is final. Find the best AVAILABLE address for it, verify every claim yourself, and tell me exactly what to buy.

ALREADY KNOWN: hardstop.com and hardstop.app are taken. An iOS app "HardStop: Strict App Blocker" (Everpeak Group LLC, March 2026) exists; find out whether Everpeak holds either domain. A Chrome extension "The Hard Stop" and an app "AppLimit: App Usage Hard Stop" also exist.

CHECK, IN ORDER:
1. Bare name on every plausible TLD (.com .app .io .co .net .org .ai .so .dev .gg .me .us .one .run .live .tools .software .finance .markets .trade .trading .pro .systems .tech .digital .cc .xyz .top). For each, do an RDAP lookup: GET https://rdap.org/domain/hardstop.<tld> (for .com use https://rdap.verisign.com/com/v1/domain/hardstop.com; for .app use https://pubapi.registry.google/rdap/domain/hardstop.app). HTTP 404 = not registered; 200 = registered: record registrar, creation and expiry dates and name servers (parking name servers mean it is for sale or idle). Confirm the live price at Porkbun and Namecheap (some .app and .io names are premium and still return 404 on RDAP). Open http://hardstop.<tld> for every registered one and say what is there.
2. Modifier forms, same checks: gethardstop.com, usehardstop.com, tryhardstop.com, joinhardstop.com, hardstophq.com, hardstopapp.com, hardstoplabs.com, hardstoprules.com, and the .app and .io versions. No hyphens, numbers, "trading" or "fx".
3. Acquisition path for hardstop.com (and hardstop.app if it is not Everpeak's): owner, listings on Afternic, Sedo, Dan.com, GoDaddy Auctions or Squarespace Domains, listed price, expiry, backorder options; a realistic price range from comparable two-word .com sales; a recommended ceiling; a two-line anonymous offer message.
4. Handles: @hardstop and @hardstopapp on X, youtube.com/@hardstop, a Discord vanity "hardstop", github.com/hardstop, and what a later iOS app of ours would have to be called given the App Store collision.
5. Trademark: USPTO (tmsearch.uspto.gov) for HARDSTOP and HARD STOP in classes 9, 36 and 42; every live mark, owner and goods. If unreachable, say "unchecked".

OUTPUT: a table of every address checked (status, registrar, expiry, what is on it, evidence link); the buy list with one PRIMARY address, the redirects to register alongside it, first-year cost and the handles to grab; the acquisition route and offer for hardstop.com or a plain "not buyable"; trademark findings. Every "available" must come from an RDAP 404 plus a registrar price you saw. Do not invent availability or prices.
```
