// The three draft rules the analyzer writes from a record (content spec 4.1). Pure; tested on the sample.
// A draft cites a statistic only when the group is solid (n ≥ 15) and its 95% interval excludes the trader's
// own average. Otherwise it is the trader's rule with no number. The Referee holds five kinds of rule; a draft
// is always one of the five.
import type { GroupStats, Insight, Report, TaggedTrade } from './analyze.ts';
import { money, pct } from './format.ts';
import { ci95, excludes, median } from './stats.ts';

export type RuleKind = 'maxTrades' | 'stopAttached' | 'size' | 'cooldown' | 'noReentry';

export type RuleParams =
  | { maxTrades: number }
  | { stopWithinSec: 15; neverWiden: true }
  | { size: number | null }
  | { losses: number; minutes: number }
  | { minutes: number };

export type HeldBy = 'live flatten' | 'nudge';

export type DraftRecord =
  | { cited: true; n: number; winRate: number; avgReturn: number; totalPnl: number; ci: [number, number] }
  | { cited: false; reason: string; n?: number };

export interface Draft {
  kind: RuleKind;
  /** The trader's words, first person. */
  sentence: string;
  params: RuleParams;
  heldBy: HeldBy;
  record: DraftRecord;
  /** The card's lines: `Draft 1 · cites your record`, `Your record shows: …`, `Held by: …`. */
  tag: string;
  recordLine: string;
  heldLine: string;
}

export interface DraftResult {
  drafts: Draft[];
  /** Solid leaks whose dimension has no Referee rule: `your shorts, 33 trades, 52% win, -0.11% a trade (solid)`. */
  notRules: string[];
  /** The one-paragraph "Also in your record, not a Referee rule" line, or '' when there is none. */
  notRuleLine: string;
}

/** Groups smaller than this never cite a number. */
export const CITE_MIN_N = 15;

const ORDINAL = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
const ordinal = (n: number) => ORDINAL[n] ?? `${n}th`;
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

const TRADE_OF_DAY: Record<string, { max: number; noun: string }> = {
  '2nd': { max: 1, noun: 'second trades of the day' },
  '3rd': { max: 2, noun: 'third trades of the day' },
  '4th or later': { max: 3, noun: 'trades after your 3rd of the day' },
};

const NOT_RULE_DIM: Record<string, string> = {
  time: 'entry-time',
  direction: 'direction',
  hold: 'hold-time',
  weekday: 'weekday',
  symbol: 'ticker',
};

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

function returnsOf(tagged: TaggedTrade[], dim: string, label: string): number[] {
  const key = dim as keyof TaggedTrade['labels'];
  return tagged.filter((t) => t.labels[key] === label).map((t) => t.trade.returnPct);
}

/** The record half of a draft: cited when solid and the interval excludes the trader's average. */
export function recordFor(g: GroupStats, returns: number[], overallAvg: number): DraftRecord {
  const ci = ci95(returns);
  if (g.confidence === 'solid' && ci && excludes(ci, overallAvg)) {
    return { cited: true, n: g.n, winRate: g.winRate, avgReturn: g.avgReturn, totalPnl: g.totalPnl, ci };
  }
  const reason = g.n < 5 ? 'too few' : g.n < CITE_MIN_N ? 'early signal' : 'not clearly away from your average';
  return { cited: false, reason, n: g.n };
}

function citedLine(noun: string, rec: Extract<DraftRecord, { cited: true }>, overallAvg: number): string {
  return (
    `Your record shows: ${rec.n} ${noun}, ${Math.round(rec.winRate * 100)}% winners, ${pct(rec.avgReturn)} a trade, net ${money(rec.totalPnl)}. ` +
    `Solid: n = ${rec.n}, 95% interval ${pct(rec.ci[0])} to ${pct(rec.ci[1])}, which excludes your average of ${pct(overallAvg)}.`
  );
}

function uncitedLine(noun: string, rec: Extract<DraftRecord, { cited: false }>): string {
  const why =
    rec.reason === 'early signal'
      ? `an early signal, under the ${CITE_MIN_N} trades a draft needs before it cites a number`
      : rec.reason === 'too few'
        ? `too few trades for a draft to cite a number`
        : `solid, but its 95% interval includes your average, so the draft cites no number`;
  return `Your record has ${rec.n ?? 0} ${noun}: ${why}. This is your rule, not a statistic.`;
}

function recordDraft(kind: RuleKind, sentence: string, params: RuleParams, heldBy: HeldBy, noun: string, heldLine: string, g: GroupStats, returns: number[], overallAvg: number): Draft {
  const record = recordFor(g, returns, overallAvg);
  return {
    kind,
    sentence,
    params,
    heldBy,
    record,
    tag: '',
    recordLine: record.cited ? citedLine(noun, record, overallAvg) : uncitedLine(noun, record),
    heldLine,
  };
}

function maxTradesDraft(max: number, noun: string, g: GroupStats, returns: number[], overallAvg: number): Draft {
  return recordDraft(
    'maxTrades',
    `I stop after ${max} ${plural(max, 'trade')} a day.`,
    { maxTrades: max },
    'live flatten',
    noun,
    `Held by: red once your ${ordinal(max)} trade is in; the fill that opens a ${ordinal(max + 1)} is flattened.`,
    g,
    returns,
    overallAvg,
  );
}

function noReentryDraft(minutes: number, g: GroupStats, returns: number[], overallAvg: number): Draft {
  return recordDraft(
    'noReentry',
    `I don't enter within ${minutes} minutes of a losing exit.`,
    { minutes },
    'live flatten',
    `re-entries inside ${minutes} minutes of a loss`,
    `Held by: red at the losing exit; a fill inside ${minutes} minutes is flattened.`,
    g,
    returns,
    overallAvg,
  );
}

function cooldownDraft(losses: number, minutes: number, g: GroupStats, returns: number[], overallAvg: number): Draft {
  const after = losses === 1 ? 'a loss' : `${losses} losses`;
  const red = losses === 1 ? 'red at the losing exit' : `red when the ${ordinal(losses)} loss closes`;
  return recordDraft(
    'cooldown',
    `After ${after} I stop for ${minutes} minutes.`,
    { losses, minutes },
    'live flatten',
    `trades after a loss (10+ min later)`,
    `Held by: ${red}; a fill inside ${minutes} minutes is flattened.`,
    g,
    returns,
    overallAvg,
  );
}

function typicalDayDraft(med: number, days: number): Draft {
  const max = Math.max(1, Math.round(med));
  return {
    kind: 'maxTrades',
    sentence: `I stop after ${max} ${plural(max, 'trade')} a day.`,
    params: { maxTrades: max },
    heldBy: 'live flatten',
    record: { cited: false, reason: 'from your typical day, not a statistic' },
    tag: '',
    recordLine: `Your typical day is ${max} ${plural(max, 'trade')}: the median over your ${days} ${plural(days, 'day')}, not a statistic about those trades. This is your rule; set the number you want.`,
    heldLine: `Held by: red once your ${ordinal(max)} trade is in; the fill that opens a ${ordinal(max + 1)} is flattened.`,
  };
}

function stopDraft(): Draft {
  return {
    kind: 'stopAttached',
    sentence: 'A stop is on within 15 seconds of every fill. I never widen it.',
    params: { stopWithinSec: 15, neverWiden: true },
    heldBy: 'live flatten',
    record: { cited: false, reason: 'a fills export cannot show whether a stop was attached' },
    tag: '',
    recordLine: "A fills export can't show whether a stop was attached or moved, so this draft never carries a number. The Referee's live feed can see both.",
    heldLine: 'Held by: a fill with no stop at 15 seconds, or a stop moved away from price, is flattened.',
  };
}

function sizeDraft(): Draft {
  return {
    kind: 'size',
    sentence: 'I trade the size I declared. Not more.',
    params: { size: null },
    heldBy: 'live flatten',
    record: { cited: false, reason: 'your number' },
    tag: '',
    recordLine: `Your size is your number, not a statistic; no export decides it. Put it in "I'm taking this" before the entry, and the Referee checks the opening fill against it.`,
    heldLine: 'Held by: an opening fill above the size you declared is flattened.',
  };
}

/** Median closed trades per day, from the tagged trades' New York dates. */
export function medianTradesPerDay(tagged: TaggedTrade[]): number {
  const counts = new Map<string, number>();
  for (const t of tagged) counts.set(t.date, (counts.get(t.date) ?? 0) + 1);
  return median([...counts.values()]);
}

function tagOf(i: number, d: Draft): string {
  const r = d.record;
  const how = r.cited ? 'cites your record' : r.reason === 'from your typical day, not a statistic' ? r.reason : 'your rule, no number';
  return `Draft ${i + 1} · ${how}`;
}

/**
 * Three draft rules from a report and its tagged trades (content spec 4.1): record-cited drafts first, then
 * uncited record drafts, then the fills (max trades from the typical day when no trade-of-day leak exists,
 * the stop rule, the size rule). Deterministic; exactly three.
 */
export function draftRules(report: Report, tagged: TaggedTrade[]): DraftResult {
  const overall = report.summary.avgReturn;
  const fromRecord: Draft[] = [];
  const notRules: string[] = [];
  const notRuleDims: string[] = [];
  let hasTradeOfDay = false;
  let hasAfterPrev = false;

  const dimId = (i: Insight) => report.dimensions.find((d) => d.title === i.dimension)?.id ?? '';

  for (const leak of report.leaks) {
    const g = leak.group;
    const dim = dimId(leak);
    if (dim === 'tradeOfDay') {
      const map = TRADE_OF_DAY[g.label];
      if (!map || hasTradeOfDay) continue;
      hasTradeOfDay = true;
      fromRecord.push(maxTradesDraft(map.max, map.noun, g, returnsOf(tagged, dim, g.label), overall));
    } else if (dim === 'afterPrev') {
      if (hasAfterPrev) continue;
      const returns = returnsOf(tagged, dim, g.label);
      if (g.label.startsWith('<')) {
        hasAfterPrev = true;
        fromRecord.push(noReentryDraft(10, g, returns, overall));
      } else if (g.label === 'After a loss') {
        hasAfterPrev = true;
        fromRecord.push(cooldownDraft(1, 30, g, returns, overall));
      }
    } else {
      const name = NOT_RULE_DIM[dim] ?? dim;
      notRules.push(`${lowerFirst(g.phrase)}, ${g.n} trades, ${Math.round(g.winRate * 100)}% win, ${pct(g.avgReturn)} a trade (${g.confidence})`);
      if (g.confidence === 'solid' && !notRuleDims.includes(name)) notRuleDims.push(name);
    }
  }

  const cited = fromRecord.filter((d) => d.record.cited);
  const uncited = fromRecord.filter((d) => !d.record.cited);
  const fills: Draft[] = [];
  if (!hasTradeOfDay) {
    const days = new Set(tagged.map((t) => t.date)).size;
    fills.push(typicalDayDraft(medianTradesPerDay(tagged), days));
  }
  fills.push(stopDraft(), sizeDraft());
  const drafts = [...cited, ...uncited, ...fills].slice(0, 3).map((d, i) => ({ ...d, tag: tagOf(i, d) }));

  const solidNotRules = notRules.filter((s) => s.endsWith('(solid)'));
  const notRuleLine = solidNotRules.length
    ? `Also in your record, not a Referee rule: ${solidNotRules.join('; ')}. The Referee has no ${notRuleDims.join(' or ')} rule. Yours to hold by hand.`
    : '';

  return { drafts, notRules, notRuleLine };
}
