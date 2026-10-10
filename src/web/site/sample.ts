// The sample data every set-piece shares: the fictional sample CSV run through the real engine.
// Nothing here is baked; the HTML ships typed numbers that bindSampleNumbers() overwrites (and,
// in dev, checks). test/site.test.ts runs the same resolve/format pair over index.html.
import { analyze, tagTrades, type Insight, type Report, type RiskStats, type TaggedTrade } from '../../core/analyze.ts';
import { insightSentence, money, pct } from '../../core/format.ts';
import { combineTrades, parseFile } from '../../core/parsers/index.ts';
import { marketClock } from '../../core/time.ts';

export interface Dot {
  /** Index in exit-time order (the river's and the story's order). */
  i: number;
  sym: string;
  dir: 'long' | 'short';
  /** Entry date in New York, YYYY-MM-DD. */
  date: string;
  weekday: string;
  entry: string;
  exit: string;
  ret: number;
  pnl: number;
  fills: number;
  tradeOfDay: number;
  minutes: number;
  prev: 'first' | 'win' | 'loss' | 'quick-after-loss';
  overnight: boolean;
  holdMin: number;
  mae: number | null;
  mfe: number | null;
  /** Cumulative P&L after this trade. */
  cum: number;
}

export interface SampleData {
  report: Report;
  tagged: TaggedTrade[];
  dots: Dot[];
  /** [0, ...cum]: one value per closed trade plus the start. */
  equity: number[];
  stopAt: Record<string, RiskStats>;
  csvLines: string[];
  bytes: number;
  neverNear: number;
  stayedRed: number;
  cameBackPoints: number;
  stayedRedPoints: number;
  /** Indices into dots, by return descending. */
  top5: number[];
  maxAbsRet: number;
}

export const SAMPLE_NAME = 'Sample trades (fills).csv';
const TZ = 'America/New_York';
const STOP = 2;

const clock = (d: Date) => {
  const c = marketClock(d);
  return `${Math.floor(c.minutes / 60)}:${String(c.minutes % 60).padStart(2, '0')}`;
};

/** Runs the engine on the CSV text and derives everything the page binds. Pure; used by the test too. */
export function buildSample(text: string): SampleData {
  const trades = combineTrades([parseFile(text, { timeZone: TZ, fileName: SAMPLE_NAME }).trades]);
  const report = analyze(trades, { stopPct: STOP });
  const tagged = tagTrades(trades);
  const order = tagged.map((_, i) => i).sort((a, b) => tagged[a].trade.exitTime!.getTime() - tagged[b].trade.exitTime!.getTime() || a - b);
  let cum = 0;
  const dots: Dot[] = order.map((idx, i) => {
    const t = tagged[idx];
    cum += t.trade.pnl;
    return {
      i,
      sym: t.trade.symbol,
      dir: t.trade.direction,
      date: t.date,
      weekday: t.weekday,
      entry: clock(t.trade.entryTime),
      exit: clock(t.trade.exitTime!),
      ret: t.trade.returnPct,
      pnl: t.trade.pnl,
      fills: t.trade.fills,
      tradeOfDay: t.tradeOfDay,
      minutes: t.minutes,
      prev: t.prev,
      overnight: t.overnight,
      holdMin: t.holdMin,
      mae: t.trade.maePct,
      mfe: t.trade.mfePct,
      cum,
    };
  });
  const closed = tagged.map((t) => t.trade);
  const past = closed.filter((t) => t.maePct !== null && t.maePct <= -STOP);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const lines = text.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return {
    report,
    tagged,
    dots,
    equity: [0, ...dots.map((d) => d.cum)],
    stopAt: { '1.5': analyze(trades, { stopPct: 1.5 }).risk, '3': analyze(trades, { stopPct: 3 }).risk },
    csvLines: lines,
    bytes: new TextEncoder().encode(text).length,
    neverNear: closed.filter((t) => t.maePct !== null && t.maePct > -STOP).length,
    stayedRed: past.filter((t) => t.returnPct <= 0).length,
    cameBackPoints: sum(past.filter((t) => t.returnPct > 0).map((t) => t.returnPct)),
    stayedRedPoints: sum(past.filter((t) => t.returnPct <= 0).map((t) => t.returnPct)),
    top5: dots
      .map((d) => d.i)
      .sort((a, b) => dots[b].ret - dots[a].ret)
      .slice(0, 5),
    maxAbsRet: Math.max(...dots.map((d) => Math.abs(d.ret)), 0.01),
  };
}

function insightField(i: Insight, r: Report, field: string): unknown {
  switch (field) {
    case 'sentence':
      return insightSentence(i, r);
    case 'base': {
      const s = insightSentence(i, r);
      const cut = s.indexOf('overall.');
      return cut >= 0 ? s.slice(0, cut + 'overall.'.length) : s;
    }
    case 'returnWithout':
    case 'pnlWithout':
    case 'kind':
    case 'dimension':
      return i[field];
    default:
      return (i.group as unknown as Record<string, unknown>)[field];
  }
}

/** Resolves a data-sample path (7.3) against the computed sample. Returns undefined for an unknown path. */
export function resolveSample(data: SampleData, path: string): unknown {
  const parts = path.split('.');
  const head = parts[0];
  const last = parts[parts.length - 1];
  const r = data.report;
  const walk = (obj: unknown, keys: string[]): unknown => keys.reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
  switch (head) {
    case 'summary':
      return walk(r.summary, parts.slice(1));
    case 'risk':
      return walk(r.risk, parts.slice(1));
    case 'stopAt': {
      const risk = data.stopAt[parts.slice(1, -1).join('.')];
      return risk ? walk(risk, [last]) : undefined;
    }
    case 'edges':
    case 'leaks': {
      const i = r[head][Number(parts[1])];
      return i ? insightField(i, r, parts.slice(2).join('.')) : undefined;
    }
    case 'group': {
      // group.<dimId>.<label>.<field>: labels contain spaces, en dashes and '<', never dots.
      const dim = r.dimensions.find((d) => d.id === parts[1]);
      const g = dim?.groups.find((x) => x.label === parts.slice(2, -1).join('.'));
      return g ? walk(g, [last]) : undefined;
    }
    case 'fills':
      return last === 'rows' ? data.csvLines.length - 1 : last === 'kb' ? Math.round(data.bytes / 1024) : undefined;
    case 'top5': {
      const d = data.dots[data.top5[Number(parts[1])]];
      if (!d) return undefined;
      return last === 'symbol' ? d.sym : last === 'returnPct' ? d.ret : last === 'pnl' ? d.pnl : undefined;
    }
    case 'equity': {
      const eq = data.equity;
      const lo = Math.min(...eq);
      const hi = Math.max(...eq);
      return { end: eq[eq.length - 1], peak: hi, trough: lo, troughIndex: eq.indexOf(lo), peakIndex: eq.indexOf(hi) }[last];
    }
    case 'neverNear':
    case 'stayedRed':
    case 'cameBackPoints':
    case 'stayedRedPoints':
      return data[head];
    default:
      return undefined;
  }
}

/** Marketing text uses U+2212 for minus; the report itself keeps what format.ts prints. */
export const typo = (s: string) => s.replace(/-(?=[\d$])/g, '−');

/** Formats a resolved value the way the typed HTML shows it (7.3), minus already typographic. */
export function formatSample(v: unknown, fmt: string | null | undefined): string {
  if (typeof v !== 'number') return v == null ? '' : String(v);
  switch (fmt) {
    case 'int':
      return typo(String(Math.round(v)));
    case 'pctInt':
      return typo(`${Math.round(v * 100)}%`);
    case 'pct':
      return typo(pct(v));
    case 'pct1':
      return typo(pct(v, 1));
    case 'money':
      return typo(money(v));
    case 'fixed2':
      return typo(v.toFixed(2));
    case 'signed2':
      return typo(`${v > 0 ? '+' : ''}${v.toFixed(2)}`);
    default:
      return typo(String(v));
  }
}

const isDev = (): boolean => {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
};

/** Overwrites every [data-sample] text and [data-raw-sample] data-raw under root with the engine's values. */
export function bindSampleNumbers(root: ParentNode, data: SampleData): void {
  const dev = isDev();
  root.querySelectorAll<HTMLElement>('[data-sample]').forEach((el) => {
    const path = el.dataset.sample!;
    const value = resolveSample(data, path);
    if (value === undefined) {
      if (dev) console.warn(`sample path unknown: ${path}`);
      return;
    }
    const text = formatSample(value, el.dataset.format);
    const current = (el.textContent ?? '').trim();
    if (current !== text) {
      if (dev) console.warn(`sample drift: ${path} html="${current}" engine="${text}"`);
      el.textContent = text;
    }
  });
  root.querySelectorAll<HTMLElement>('[data-raw-sample]').forEach((el) => {
    const value = resolveSample(data, el.dataset.rawSample!);
    if (typeof value === 'number') el.dataset.raw = String(value);
  });
}

const SHRINK_K = 10;
const MIN_N = 5;
export type Verdict = 'nothing, too few trades' | 'an edge' | 'a leak' | 'a weak spot' | 'nothing: not clearly away from your average';

/** The engine's own rule (analyze.ts), for the shrink lab: shrinkage, confidence and the edge/leak/weak-spot test. */
export function shrink(raw: number, n: number, overall: number): { adjusted: number; badge: 'few' | 'early' | 'solid'; verdict: Verdict; label: string } {
  const adjusted = (n * raw + SHRINK_K * overall) / (n + SHRINK_K);
  const badge = n < MIN_N ? 'few' : n < 15 ? 'early' : 'solid';
  let verdict: Verdict;
  if (n < MIN_N) verdict = 'nothing, too few trades';
  else if (adjusted > overall && raw > 0 && raw >= overall + Math.abs(overall) / 2) verdict = 'an edge';
  else if (adjusted <= overall && raw < 0) verdict = 'a leak';
  else if (adjusted <= overall && raw < overall / 2) verdict = 'a weak spot';
  else verdict = 'nothing: not clearly away from your average';
  const conf = badge === 'early' ? ' (early signal)' : badge === 'solid' ? ' (solid)' : '';
  const label = verdict.startsWith('nothing') ? verdict : verdict + conf;
  return { adjusted, badge, verdict, label };
}

const idle = (cb: () => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(cb, { timeout: 1500 });
  else setTimeout(cb, 200);
};

let promise: Promise<SampleData> | null = null;

/** Fetches the sample once (the same URL main.ts uses, so #demo hits the cache), at idle. Rejects once on failure. */
export function getSample(): Promise<SampleData> {
  if (!promise) {
    promise = new Promise<SampleData>((resolve, reject) => {
      idle(() => {
        fetch(`${import.meta.env.BASE_URL}sample-trades.csv`)
          .then((res) => {
            if (!res.ok) throw new Error(`sample fetch failed: ${res.status}`);
            return res.text();
          })
          .then((text) => resolve(buildSample(text)))
          .catch(reject);
      });
    });
  }
  return promise;
}
