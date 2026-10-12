// Small, pure statistics shared by the draft-rules logic, the site bindings and the tests.

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation (n − 1 in the denominator); null when n < 2. */
export function sampleSd(xs: number[]): number | null {
  const n = xs.length;
  if (n < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) * (x - m), 0) / (n - 1));
}

/**
 * 95% interval on the plain mean, normal approximation: mean ± 1.96 · sd / √n, sample sd.
 * Null when there are fewer than two values.
 */
export function ci95(xs: number[]): [number, number] | null {
  const sd = sampleSd(xs);
  if (sd === null) return null;
  const m = mean(xs);
  const half = (1.96 * sd) / Math.sqrt(xs.length);
  return [m - half, m + half];
}

/** True when the interval sits entirely on one side of `value`. */
export function excludes(ci: [number, number] | null, value: number): boolean {
  return ci !== null && (ci[1] < value || ci[0] > value);
}
