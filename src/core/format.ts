// Formatting shared by the CLI and the web page.
import type { Insight, Report } from './analyze.ts';

export const pct = (x: number, digits = 2) => `${x > 0 ? '+' : ''}${x.toFixed(digits)}%`;

export function money(x: number): string {
  const abs = Math.abs(x);
  const s = abs >= 1e6 ? `$${(abs / 1e6).toFixed(2)}M` : abs >= 1e4 ? `$${(abs / 1e3).toFixed(1)}k` : `$${Math.round(abs).toLocaleString('en-US')}`;
  return x < 0 ? `-${s}` : s;
}

export function insightSentence(i: Insight, r: Report): string {
  const g = i.group;
  const base = `${g.phrase}: ${g.n} trades, ${Math.round(g.winRate * 100)}% win, ${pct(g.avgReturn)} a trade vs ${pct(r.summary.avgReturn)} overall.`;
  if (i.kind === 'edge') return base;
  if (i.kind === 'weak') return `${base} Still profitable, but these trades pull your average down.`;
  return `${base} Without them, your total would have been ${pct(i.returnWithout, 1)} instead of ${pct(r.summary.totalReturn, 1)} (sum of trade %).`;
}

/** Shown next to every what-if figure ("would have been ..."). */
export const HYPOTHETICAL = 'Hypothetical: computed from past trades, not actual trading. Past results do not predict future results.';
