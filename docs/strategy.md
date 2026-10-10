# MyTradePilot strategy: how to reach millions by solving the most acute need of traders

Produced 2026-10-10 from six parallel research passes (market, broker APIs, trader pain, AI competitors, regulation, growth), six independent strategies, one adversarial attack per strategy, a judge, a writer, a critic and a reviser. Every number carries its source or is labelled an assumption. Growth-benchmark figures came from model recall because the web-search budget ran out, and are marked low confidence.

## 1. The most acute need

The most acute need is not "see my live trades so the AI can catch repeating mistakes." The need sits in one window: the minutes after a losing trade, inside a prop evaluation, before the next entry. The trader knows the rule and breaks it anyway. [OneFunded reports 78.7% of its failed evaluations ended on a daily-loss-limit breach](https://onefunded.com/blog/trading-psychology/why-traders-fail-prop-firm-challenges/) (firm-published, no methodology). [Topstep passed 16.8% of Trading Combines in 2025](https://www.topstep.com/our-program); its marketing says 63% of traders have lost an account in a single day (marketing claim). [Coval and Shumway found professional CBOT traders with morning losses were about 16% more likely to take above-average afternoon risk, 31.2% versus 27.0%, and placed more and larger trades](https://ideas.repec.org/a/bla/jfinan/v60y2005i1p1-34.html). [hoc-trade's 500,000-account dataset shows revenge trading in 37% of traders at about $1,917 each](https://hoc-trade.com/blogs/behavioral-risks/revenge-trading-emotional-recovery) and [profitability falling from 33% to 15% as trades per day rise, almost all of it before the 10th trade](https://hoc-trade.com/blogs/trading-psychology/how-many-trades-per-day).

Two corrections. First, information alone does not change behaviour. [97% of persistent Brazilian futures day traders lose with no evidence of learning](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3423101), and [TopstepX already ships irreversible lockouts and a "Liquidate and Block" daily loss limit for free](https://help.topstepx.com/settings/risk-settings/lock-out-customizations). A sentence next to a free lockout is a vitamin. Second, the mechanism is not only trade count. hoc-trade finds over half of traders carry average losses more than twice their average wins, attributed to stop widening, and most firms count floating loss toward the daily limit, so stop and hold-time rules must bind too. The need is for the trader's own pre-committed rule to bind.

## 2. The product thesis

On TopstepX, no tool enforces the trader's own declared behavioural rules (cooldown after a loss, no re-entry inside N minutes, stop attached and not widened, size versus declaration) with a partner who sees the breach. The nearest analogues are [PropSafely, from $20 a month, threshold-based, 67 firm rule sets, auto-close on ProjectX, and Meridian, NT8 only, a generic stability score, enforcement up to broker disconnect](https://www.meridianpsi.com/compare/meridian-vs-prop-firm-lockouts). What differs: trader-authored rules, the pre-fill declaration, the partner, and escalation to the native lockout. The Referee is an add-on to the platform's own lockouts, never a substitute.

The hero. A Topstep 50K Combine, TradingView chart beside TopstepX order entry (an in-TradingView connection is unconfirmed), Referee panel on the ProjectX API. At 9:25 the trader confirmed the day's declaration: max 3 trades, written into TopstepX's own daily trade limit; stop attached within 15 seconds, never widened; 2 contracts; 20-minute cooldown after 2 losses; no entry within 10 minutes of a losing exit. The second loss closes at 10:41 and the panel is already red: "Your rule: no entry before 11:01. Your record on re-entries inside 10 minutes of a loss: 23 trades, net -$1,400, 26% winners (solid, n = 23, 95% interval 12% to 46%). If you fill now I will flatten it." He fills at 10:43:12; the reduce-only close lands two seconds later. The breach is logged and partner Mia's phone buzzes. The panel reads "declared 2 of 3, fills 3," because the flattened fill paid commission and counts in Topstep's own statistics. It then deep-links to TopstepX's irreversible lockout. The private day card reads "Rules kept 4 of 5. One breach cost you $11," under the CFTC Rule 4.41 statement, with no share button.

Keep the plain-English strategy and indicator intake only to draft rule candidates and name setups. Sharpen "4th trade of the day" into a rule the trader authors and the app enforces, with the statistic as draft. The founder's "gave back 40% from trade 4 onward" is a new per-day computation; [the engine's pnlWithout is the nearest current what-if](src/core/analyze.ts in the MyTradePilot repo). Drop stop-loss and R suggestions in favour of enforcing the trader's own stop and R rules: [hasExcursions needs maePct on every trade](src/core/analyze.ts in the MyTradePilot repo), which only the replay export carries, and "your stop supports 1 contract" forfeits [Rule 4.14(a)(9)](https://www.ecfr.gov/current/title-17/chapter-I/part-4/section-4.14).

## 3. How it sees live trades

TradingView first. [Its Broker REST API is a spec brokers implement so TradingView can poll them, not a feed of a user's orders](https://www.tradingview.com/broker-api-docs/). [Webhooks fire only on Pine strategy fills, never on discretionary panel orders](https://www.tradingview.com/pine-script-docs/concepts/alerts/), and [its terms forbid non-display use](https://in.tradingview.com/policies), so a scraping extension risks the account. No platform surveyed exposes a pre-submission hook, and momentum entries are market orders (the founder's characterisation, not sourced). So "pre-trade" means the declaration before the click and the next-trade state computed when the previous trade closes. The flatten is post-fill, and marketing says so.

Rung 1, TopstepX via ProjectX. [The user buys Topstep's key at $29 a month, $14.50 with code; the SignalR hub pushes accounts, orders and positions; the JWT lasts 24 hours; Live Funded accounts are excluded](https://help.topstep.com/en/articles/11187768-topstepx-api-access). The key can trade. The digest shows no read-only scope and no order types; reduce-only is to be confirmed with Topstep.

Rung 2, manual declare-and-reconcile, the day-one floor for everyone else: Tradovate evaluation accounts ([its API excludes them](https://support.tradovate.com/s/article/Tradovate-API-Access?language=en_US)), Apex and Rithmic ([Apex prohibits automation](https://support.apextraderfunding.com/hc/en-us/articles/40463668243099-Prohibited-Activities)). Hotkey declaration, one-tap "stopped out," overnight reconciliation through the existing parsers. Undeclared trades are logged as "undeclared," separate from "rule broken," and count against the declaration metric, not the breach count. Week-one task: test a live TradingView History-tab export against the parser, which the README says covers replay and tester output only; if it fails, rung 2 reconciles from the broker's own fill CSV. Labelled nudge-only.

Rung 3, after 300 payers: [MetaApi investor-password streaming, $30 base plus per-account hosting, to be confirmed](https://metaapi.cloud/docs/client/faq/) and [cTrader Open API, free, OAuth, view-only scope](https://help.ctrader.com/open-api/terms-of-use/), nudge tier.

Custody. The engine runs as a local agent on the trader's machine; the key stays in the OS keychain and never reaches the server. The trade-off: enforcement stops when the agent is closed, the key is revoked, or the trader opens TopstepX on another device. To the founder pushback "what is the $19 for when Topstep's free lockout is the only non-bypassable control": it buys the pre-commitment ritual while calm, the escalation that writes the native lockout before tilt, the partner who sees the bypass, and the breach history that makes next week's declaration honest. Bypass rate (agent killed, key revoked, cooldown evaded on another device) is a pilot metric beside override rate. If bypass is common, the product is the declaration plus the partner at an EmotionLock-like price.

## 4. Why traders will pay and how much

What they already pay. [Topstep Combines run $49 to $199 a month plus $149 activation](https://www.topstep.com/our-program); [Apex lists $197 to $597, routinely $30 to $50 on promo](https://apextraderfunding.com/help-center/billing/evaluation-plan-fees-and-access-explained/). Journals: [TradeZella $35 to $99](https://www.tradezella.com/blog/tradezella-pricing), [Consistry $29.99](https://www.consistry.com/). Guards: [Meridian $29.99 to $69.99, PropSafely from $20](https://www.meridianpsi.com/compare/meridian-vs-prop-firm-lockouts), [EmotionLock €49.99 activation then €9.99](https://www.emotionlock.app/learn/best-apps-stop-revenge-trading).

Price. A $29 to $39 product plus the Topstep key costs $43 to $68 a month. So the Referee is $19 a month or $169 a year (assumption), keeping the all-in at $33.50 to $48, under TradeZella Essential alone. The annual discount, $4.92 a month, covers about a third of the discounted key; only a Topstep waiver absorbs it, which is why the waiver is the first co-marketing ask. One plan, no AI credits, no auto-charging trial, 14-day money-back, one-click cancel.

Free: the client-side analyzer, rule drafting, one manual rule, the private rules-kept score, the Record Card. Referee: live ProjectX connection, unlimited rules, flatten, cooldown, lockout escalation, one read-only partner seat, declare-and-reconcile.

Paid life is bounded by Combine and Express Funded life, so the model is per-evaluation-cycle with reactivation, not a continuous subscription. Win-back rate (payers who return on their next Combine without a new sale) is a pilot and 300-payer metric. Live Funded graduates lose rung 1 and move to declare-and-reconcile plus partner, nudge-only, with TopstepX's Live risk settings as the enforcer.

Cold start. [The engine shrinks each bucket toward the trader's mean with K = 10, labels buckets under n = 5 "too few" and keeps them out of the edge and leak lists, and calls them "early signal" below n = 15](src/core/analyze.ts in the MyTradePilot repo). It scans about 17 cells and picks the top 3 edges and leaks by impact with no multiplicity correction, so drafts are a winner's-curse sample. Rule: a draft cites a statistic only when the cell is solid (n at or above 15) and its interval excludes the trader's own mean; otherwise it is the trader's rule with no number. Intervals and conditional cells are new code. Day-one value comes from user-authored rules, which bind from trade one. Imports are source-tagged so replay output never seeds the record.

## 5. Distribution

The first 1,000 payers come from Topstep Combine traders through four channels, in cost order.

One, the free analyzer. Every report ends with three draft rules and one button: "Have the Referee enforce these." The shareable Record Card is a one-stat PNG with the 4.41 statement baked in.

Two, founder-as-creator: "I broke my 4th-trade rule for a year, here is the data," and weekly anonymised findings. No pass-rate claims.

Three, the partner loop. Every payer invites one partner who gets breach pushes free. That the partner is usually a trader who converts is an assumption with no source.

Four, Topstep co-marketing: a help-center listing and the key waiver.

Discarded: 30% recurring creator affiliates. [Prop-firm programs pay 10 to 20% of the evaluation fee, about $10 to $120 per referral](https://apextraderfunding.com/affiliate). $5.70 a month loses, the creators are paid by the resets the Referee cuts, and it is the [Warrior Trading fact pattern](https://www.ftc.gov/news-events/news/press-releases/2022/04/ftc-takes-action-against-day-trading-investment-program-misleading-claims).

Funnel inputs, all unanchored assumptions (the digest has no CAC data): 2,500 analyzer sessions a month by month six, 10% from Topstep traders who connect or declare, 25% trial conversion, about 60 new payers a month.

## 6. The arithmetic, with the ceiling

Consumer line. $19 a month, 40% annual at $14.08, blended ARPU about $17 (assumption). Churn 12% a month, from [RevenueCat's "one in five still paying at 12 months," about 12.6% monthly](https://www.revenuecat.com/state-of-subscription-apps-2025/) (recalled, low confidence).

Steady state is gross adds divided by monthly churn. At 60 adds and 12% churn the base caps at 500 payers, about $100K ARR. 1,000 payers needs 120 adds a month. $1M ARR needs about 4,900 payers and 590 adds a month, roughly 10x the funnel. 300 payers arrives about seven months after the April 2027 launch, month 13.

To the founder pushback "your funnel tops out at 500, and you are building the riskiest piece first": yes. Year one is a thesis test, not a business. Budget: founder time plus under $25K cash for memo, insurance, signing and billing (assumption); stop date October 2027. The flatten is built first because friction is the thesis and the pilot is the cheapest way to falsify it. The nudge tier (declaration plus partner) earns from month six whether or not the flatten survives.

The levers, each a multiplier on 60 and each an assumption: the key waiver, 1.5x on conversion, no evidence yet; the partner loop, 1.3x if a third of partners convert; a second live rung, 1.5x on the pool. Together, about 175 adds a month, about 1,450 payers, about $300K ARR. That is the direct ceiling without a change in churn: a Tradervue-shaped business. [Tradervue, a solo-founder journal, sold to SureSwift in 2020 on $826K EBITDA after nine years; EBITDA reached $1.43M by 2023 under the acquirer](https://www.sureswiftcapital.com/blog/tradervue-acquisition).

B2B lever, not in the base case. A prop firm with 20,000 active evaluation traders at $3 per trader per month is $720K a year (assumption). Two contracts plus the direct line is $2.4M to $3.4M ARR, with direct at $1M to $2M. It stays out because [FTMO's parent booked about $329M in 2024 almost entirely from challenge fees paid by traders who mostly fail](https://www.financemagnates.com/forex/ftmos-parent-netted-over-62-million-on-329m-revenue-in-2024/), no journal-to-prop-firm deal with pricing exists in the digest, and the firm loses money on every trader who survives longer. It opens only on a signed paid LOI.

## 7. Moat

What compounds. The ratified rulebook, breach history and partner graph: switching means re-ratifying rules, losing the record, and telling your partner you quit. The opt-in pool with source tags and published cell counts, which [TradesViz, the one incumbent that could pool, would have to re-consent 200,000 users to match](https://www.tradesviz.com/pricing/); cohort cards wait for a stated minimum cell count.

What does not. The analytics: [TradesViz says the tech is no longer the moat](https://www.tradesviz.com/blog/state-of-journaling-2026/), TradeTally is open source, [MT5 added native AI and MCP in July 2026](https://www.metatrader5.com/en/releasenotes/terminal/2447). The ProjectX integration, which Consistry, Tanto and PropSafely already have.

To the founder pushback "Topstep is your only live platform, gatekeeper, co-marketing hope and most likely competitor; if it ships cooldown-after-loss next quarter you are a nudge product": correct. The timing is speculation; the exposure is real. So the feed-independent floor must earn on its own and is tested as a pilot arm. Topstep shipping it is an explicit pivot trigger that pulls cTrader and MetaApi forward and keeps the rulebook, breach history and partner graph as the switching cost. The key-waiver conversation doubles as the early-warning channel.

## 8. Legal and trust

Regime. Futures and forex users put the product under the CFTC's CTA definition. [Rule 4.14(a)(9) exempts software only if it does not direct client accounts or tailor advice to a client's positions](https://www.ecfr.gov/current/title-17/chapter-I/part-4/section-4.14), and [Vartuli turned on software marketed to be followed mechanically](https://github.com/Hollaar/digital-law-online/blob/master/cases/60PQ2D1953.htm). The CFTC/NFA memo is commissioned in week one and delivered before the first charge. Its questions: (1) a flatten of a pre-authorised rule as directing client accounts; (2) LLM-drafted rule candidates as tailored advice; (3) whether sim evaluation accounts are commodity interests and who the client is (My Forex Funds); (4) the name "Referee" and the flatten copy under Vartuli; (5) registration cost and timeline, including NFA Rule 2-29 effects on marketing; (6) a tech E&O plus cyber quote before the first enforced flatten (no premium data in the digest).

Phrasing. "Your rule says" and "your record shows." Never "skip this trade," "verdict" or "coach," and no instrument-specific stop or size lines. [The Rule 4.41 statement sits in immediate proximity to every what-if figure and applies even to exempt CTAs](https://www.ecfr.gov/current/title-17/chapter-I/part-4/section-4.41).

Trust. Every number is the user's own record. No pass-rate or "saved you $X" claims. The discovery-call statement reads: "designed to reduce daily-loss breaches and resets; the Topstep pilot will measure breaches per trader-week, dry-run versus enforced, intent-to-treat; would you pay for that result if it holds?" Any LOI is conditional on the pilot number.

Data. The free analyzer stays client-side. The Referee's server holds the rulebook, breach log and partner pushes, which probably makes the company a GLBA financial institution, so encryption, MFA and breach reporting from the first server-side byte. [GDPR applies once EU users are monitored, and an automated lockout is an Article 22 decision](https://eur-lex.europa.eu/eli/reg/2016/679/oj). Human review must sit with the controller, so a lay partner does not qualify. EU users get explicit consent under Article 22(2)(c), the kill switch and a company review route for contested flattens; otherwise the flatten is geofenced to US accounts and EU users get declare-and-reconcile and partner pushes, which decide nothing. [UK cohort nudges are regulated "targeted support" from April 2026](https://www.legislation.gov.uk/uksi/2026/74), so no cohort cards outside the US.

Wrong flattens. Live enforcement must handle partial fills, scale-ins, bracket children, flips, SignalR reconnects and JWT expiry. Design: reduce-only (to be confirmed), a dry-run week, a visible kill switch, escalation after one flatten to the native lockout, confirmed by a rejected test order because nothing in the digest says the API can read lockout settings. Any wrong flatten auto-pauses enforcement for that account, credits the commission, and gets a post-mortem before re-enabling. Gate: under 1 wrong flatten per 100 trader-weeks.

## 9. Sequence

MyTradePilot's parsers, FIFO matcher, tags and shrinkage are the rule-drafting engine. The live state model is new code.

90 days, to mid-January 2027. Hold items: memo commissioned in week one; declare-and-reconcile with the undeclared/rule-broken split; the local agent with the ProjectX feed in dry-run, live matcher tested on sim; Stripe billing; desktop packaging, signing, auto-update and keychain on two operating systems; the TradingView export test. Slip-first: LLM strategy intake, Record Card, partner pushes, Wilson intervals. Ten prop-firm discovery calls with the conditional statement. The pilot start moves with the agent, not the calendar. Gate: 300 ratified rulebooks, memo delivered, Topstep's written confirmation that third parties may hold customer keys, insurance quoted.

Six months, to April 2027. The pilot, two arms. Arm A: 50 Topstep Combine traders, 60 days, the real all-in price, alternating dry-run and enforced weeks (ABAB) to spread novelty and regression to the mean. Intent-to-treat: a trader whose Combine dies is carried at their dry-run breach rate or scored at the rule's maximum for the remaining weeks. Arm B: 25 Apex or Tradovate-evaluation traders on declare-and-reconcile plus partner, at $19 versus a lower nudge price. Measure breaches per trader-week, override, bypass, wrong flattens, declaration-before-fill, undeclared trades, Referee cancellation (apart from Combine death and rebuy) and win-back. Gate: breaches fall by at least a third (assumption), declaration-before-fill above 60%, wrong flattens under 1 per 100 trader-weeks, cancellation under 15% (directional; 7 of 50 has a 95% interval of about 7% to 27%, so the real churn gate is the 300-payer cohort). Gray zone (churn 15 to 20%, or declaration 40 to 60%): extend 60 days with arm B, no paid launch; a second miss is the kill. Then paid launch.

Twelve months, to October 2027. 300 payers by month 13 before any second rung. Then MetaApi and cTrader as nudge tier and the opt-in pool. B2B behind a signed LOI only. Gate: 300 payers, churn at or under 12%, 35% with an active partner, win-back above 50% (assumption).

Not in year one: broker-sync race, AI chat with credits, any order ticket or veto, instrument-specific stop or size lines, "traders like you," charity stake, NT8, mobile, market replay, US equities, firm-paid contracts, published survival study.

## 10. Kill criteria

Breaches per trader-week do not fall from dry-run to enforced for the same traders on intent-to-treat, or override plus bypass stays above half. A null result on friction, not a marketing problem. Enforcement ends. The paid product becomes the declaration plus partner at an EmotionLock-like price, or the analyzer stays free and nothing is sold. cTrader and MetaApi stay as data sources for rule drafting, not a product pivot, because a read-only observer is the vitamin section 1 rejects.

Wrong flattens stay above 1 per 100 trader-weeks after the post-mortems. Kills enforcement, not the product.

Referee cancellation above 20% a month, or declaration-before-fill under 40%, in either arm. Collapse to the free analyzer plus Rulebook as a funnel and sell nothing until a second live rung exists.

Topstep refuses written key confirmation, or ships personalised lockout presets. Rung 1 is gone; the floor is the product, with cTrader and MetaApi as the live rungs.

Three or more of the ten discovery calls produce a signed paid LOI conditional on the pilot number. That reopens B2B, trader still the payer, firm as distribution.

The memo says the flatten requires CTA registration at a cost the company cannot carry. Enforcement becomes escalation only; the product is the rulebook, the declaration and the partner. If that also fails the breach test, the thesis is over and the analyzer stays free.