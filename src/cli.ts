// Usage: node src/cli.ts [--tz America/Los_Angeles] [--stop 2] file.csv [more.csv ...]
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { analyze, tagTrades } from './core/analyze.ts';
import { draftRules } from './core/drafts.ts';
import { insightSentence, money, pct } from './core/format.ts';
import { combineTrades, parseFile } from './core/parsers/index.ts';
import { isValidTimeZone } from './core/time.ts';

const args = process.argv.slice(2);
let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
let stopPct = 2;
const files: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--tz') timeZone = args[++i];
  else if (args[i] === '--stop') stopPct = Number(args[++i]);
  else files.push(args[i]);
}
if (!files.length || !isValidTimeZone(timeZone) || !(stopPct > 0)) {
  console.error('Usage: node src/cli.ts [--tz America/Los_Angeles] [--stop 2] trades.csv [...]');
  process.exit(1);
}

const lists = files.map((f) => {
  const res = parseFile(readFileSync(f, 'utf8'), { timeZone, fileName: basename(f) });
  for (const w of res.warnings) console.warn(`! ${w}`);
  console.log(`${basename(f)}: ${res.format}, ${res.trades.length} trades`);
  return res.trades;
});
const trades = combineTrades(lists);
const report = analyze(trades, { stopPct });
const s = report.summary;

console.log(`\n=== ${s.trades} closed trades, ${s.days} days, ${s.firstDay} → ${s.lastDay} (${s.symbols.join(', ')}) ===`);
if (s.openTrades) console.log(`(${s.openTrades} open trade(s) left out)`);
console.log(`Win rate ${Math.round(s.winRate * 100)}%  avg ${pct(s.avgReturn)}  median ${pct(s.medianReturn)}  avg win ${pct(s.avgWin ?? 0)}  avg loss ${pct(s.avgLoss ?? 0)}`);
console.log(`Total ${money(s.totalPnl)} (${pct(s.totalReturn, 1)} summed)  profit factor ${s.profitFactor?.toFixed(2) ?? '–'}  max drawdown ${money(s.maxDrawdown)}  avg R at ${stopPct}% stop ${s.avgR.toFixed(2)}R`);

console.log('\nEDGES');
for (const e of report.edges) console.log(`  + ${insightSentence(e, report)} [${e.group.confidence}]`);
console.log('LEAKS');
for (const l of report.leaks) console.log(`  - ${insightSentence(l, report)} [${l.group.confidence}]`);
// The same three drafts the web page renders (content spec 4.1), so "check the math" holds for them too.
const drafted = draftRules(report, tagTrades(trades));
console.log('DRAFTS');
for (const d of drafted.drafts) console.log(`  * ${d.sentence}  [${d.tag}]  ${d.recordLine}  ${d.heldLine}`);
if (drafted.notRuleLine) console.log(`  ${drafted.notRuleLine}`);

const r = report.risk;
if (r.hasExcursions) {
  console.log(`\nRISK: ${r.pastStop} trades went past -${r.stopPct}%; ${r.pastStopCameBack} came back green. With a hard ${r.stopPct}% stop: ${pct(r.returnWithStop, 1)} vs ${pct(s.totalReturn, 1)}.`);
}
if (r.top5Share !== null) console.log(`Top 5 trades = ${Math.round(r.top5Share * 100)}% of the total. Stop orders used on ${Math.round(r.stopOrderRate * 100)}% of exits.`);

for (const d of report.dimensions) {
  console.log(`\n${d.title}`);
  for (const g of d.groups) {
    console.log(`  ${g.label.padEnd(26)} n=${String(g.n).padStart(3)}  win ${String(Math.round(g.winRate * 100)).padStart(3)}%  avg ${pct(g.avgReturn).padStart(7)}  total ${money(g.totalPnl).padStart(9)}`);
  }
}
