// The hypothetical-results statement (content spec, section 0). Both texts are constants; switching is one line.
// Rendered as one component, `.cftc-441`, directly beneath every what-if figure, in full, never collapsed.
// Counsel must confirm both texts against the live eCFR 17 CFR 4.41(b) and NFA Compliance Rule 2-29(c) before launch.

/** NFA Compliance Rule 2-29(c), which satisfies CFTC Rule 4.41(b)(1)(ii). Shipped by default. */
export const STATEMENT_NFA =
  'HYPOTHETICAL PERFORMANCE RESULTS HAVE MANY INHERENT LIMITATIONS, SOME OF WHICH ARE DESCRIBED BELOW. NO REPRESENTATION IS BEING MADE THAT ANY ACCOUNT WILL OR IS LIKELY TO ACHIEVE PROFITS OR LOSSES SIMILAR TO THOSE SHOWN. IN FACT, THERE ARE FREQUENTLY SHARP DIFFERENCES BETWEEN HYPOTHETICAL PERFORMANCE RESULTS AND THE ACTUAL RESULTS SUBSEQUENTLY ACHIEVED BY ANY PARTICULAR TRADING PROGRAM. ONE OF THE LIMITATIONS OF HYPOTHETICAL PERFORMANCE RESULTS IS THAT THEY ARE GENERALLY PREPARED WITH THE BENEFIT OF HINDSIGHT. IN ADDITION, HYPOTHETICAL TRADING DOES NOT INVOLVE FINANCIAL RISK, AND NO HYPOTHETICAL TRADING RECORD CAN COMPLETELY ACCOUNT FOR THE IMPACT OF FINANCIAL RISK IN ACTUAL TRADING. FOR EXAMPLE, THE ABILITY TO WITHSTAND LOSSES OR TO ADHERE TO A PARTICULAR TRADING PROGRAM IN SPITE OF TRADING LOSSES ARE MATERIAL POINTS WHICH CAN ALSO ADVERSELY AFFECT ACTUAL TRADING RESULTS. THERE ARE NUMEROUS OTHER FACTORS RELATED TO THE MARKETS IN GENERAL OR TO THE IMPLEMENTATION OF ANY SPECIFIC TRADING PROGRAM WHICH CANNOT BE FULLY ACCOUNTED FOR IN THE PREPARATION OF HYPOTHETICAL PERFORMANCE RESULTS AND ALL OF WHICH CAN ADVERSELY AFFECT ACTUAL TRADING RESULTS.';

/** The CFTC's own text, Rule 4.41(b)(1)(i). The alternative counsel may prefer. */
export const STATEMENT_CFTC =
  'Hypothetical or simulated performance results have certain limitations. Unlike an actual performance record, simulated results do not represent actual trading. Also, since the trades have not been executed, the results may have under-or-over compensated for the impact, if any, of certain market factors, such as lack of liquidity. Simulated trading programs in general are also subject to the fact that they are designed with the benefit of hindsight. No representation is being made that any account will or is likely to achieve profit or losses similar to those shown.';

export const STATEMENT = STATEMENT_NFA;

export const STATEMENT_LABEL = 'Hypothetical-results statement';

/** The `.cftc-441` markup: a mono label line, then the full statement. Same component in the report and the static page. */
export function cftcBlock(): string {
  return `<div class="cftc-441"><span class="cftc-label">${STATEMENT_LABEL}</span><p class="cftc-text">${STATEMENT}</p></div>`;
}
