// The shrinkage rule, mirroring src/core/analyze.ts exactly. Pure, so test/site.test.ts can check it.

export const SHRINK_K = 10;
export const MIN_INSIGHT_N = 5;
export const SOLID_N = 15;

export type Badge = 'few' | 'early' | 'solid';

export const adjusted = (n: number, raw: number, overall: number): number => (n * raw + SHRINK_K * overall) / (n + SHRINK_K);

export const badge = (n: number): Badge => (n < MIN_INSIGHT_N ? 'few' : n < SOLID_N ? 'early' : 'solid');

export const badgeLabel = (b: Badge): string => (b === 'few' ? 'too few' : b === 'early' ? 'early signal' : 'solid');

/** What the report would call a group of `n` trades averaging `raw`% against `overall`%. */
export function verdict(n: number, raw: number, overall: number): string {
  if (n < MIN_INSIGHT_N) return 'nothing, too few trades';
  const adj = adjusted(n, raw, overall);
  const conf = n < SOLID_N ? ' (early signal)' : ' (solid)';
  if (adj > overall && raw > 0 && raw >= overall + Math.abs(overall) / 2) return `an edge${conf}`;
  if (adj <= overall && raw < 0) return `a leak${conf}`;
  if (adj <= overall && raw < overall / 2) return `a weak spot${conf}`;
  return 'nothing: not clearly away from your average';
}
