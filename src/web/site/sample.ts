// The sample data module shared by every set-piece (build spec 6.0 and 7.3).
// Fetches public/sample-trades.csv once, at idle, and runs the real engine on it; nothing here is baked.
// Pure helpers (buildSampleData, resolvePath, formatValue, shrink*) have no DOM dependency so test/site.test.ts can use them.
import { analyze, tagTrades, type Confidence, type GroupStats, type Insight, type Report, type RiskStats, type TaggedTrade } from '../../core/analyze.ts';
import { insightSentence, money, pct } from '../../core/format.ts';
import { combineTrades, parseFile } from '../../core/parsers/index.ts';
import { marketClock } from '../../core/time.ts';

export interface Dot {
  i: number;
  sym: string;
  dir: 'long' | 'short';
  date: string;
  weekday: string;
  entry: string;
  exit: string;
  ret: number;
  pnl: number;
  fills: number;
  tradeOfDay: number;
  minutes: number;
  prev: TaggedTrade['prev'];
  overnight: boolean;
  holdMin: number;
  mae: number | null;
  mfe: number | null;
  cum: number;
}

export interface SampleData {
  report: Report;
  tagged: TaggedTrade[];
  dots: Dot[];
  equity: number[];
  stopAt: Record<string, RiskStats>;
  csvLines: string[];
  bytes: number;
  neverNear: number;
  stayedRed: number;
  cameBackPoints: number;
  stayedRedPoints: number;
  top5: number[];
  maxAbsRet: number;
}

export const SAMPLE_STOP = 2;
const EXTRA_STOPS = [1.5, 3];

const clock = (d: Date) => {
  const c = marketClock(d);
  return { ...c, hm: `${Math.floor(c.minutes / 60)}:${String(c.minutes % 60).padStart(2, '0')}` };
};

export function buildSampleData(text: string): SampleData {
  const parsed = parseFile(text, { timeZone: 'America/New_York', fileName: 'Sample trades (fills).csv' });
  const trades = combineTrades([parsed.trades]);
  const report = analyze(trades, { stopPct: SAMPLE_STOP });
  const tagged = tagTrades(trades);
  const byExit = [...tagged].sort((a, b) => a.trade.exitTime!.getTime() - b.trade.exitTime!.getTime());
  let cum = 0;
  const dots: Dot[] = byExit.map((tg, i) => {
    const t = tg.trade;
    cum += t.pnl;
    const en = clock(t.entryTime);
    return {
      i,
      sym: t.symbol,
      dir: t.direction,
      date: en.date,
      weekday: en.weekday,
      entry: en.hm,
      exit: clock(t.exitTime!).hm,
      ret: t.returnPct,
      pnl: t.pnl,
      fills: t.fills,
      tradeOfDay: tg.tradeOfDay,
      minutes: tg.minutes,
      prev: tg.prev,
      overnight: tg.overnight,
      holdMin: tg.holdMin,
      mae: t.maePct,
      mfe: t.mfePct,
      cum,
    };
  });
  const closed = tagged.map((tg) => tg.trade);
  const stopAt: Record<string, RiskStats> = {};
  for (const s of EXTRA_STOPS) stopAt[String(s)] = analyze(trades, { stopPct: s }).risk;
  const past = closed.filter((t) => t.maePct !== null && t.maePct <= -SAMPLE_STOP);
  const back = past.filter((t) => t.returnPct > 0);
  const red = past.filter((t) => t.returnPct <= 0);
  const csvLines = text.split('\n').filter((l) => l.trim() !== '');
  return {
    report,
    tagged,
    dots,
    equity: [0, ...dots.map((d) => d.cum)],
    stopAt,
    csvLines,
    bytes: new TextEncoder().encode(text).length,
    neverNear: closed.filter((t) => t.maePct !== null && t.maePct > -SAMPLE_STOP).length,
    stayedRed: red.length,
    cameBackPoints: back.reduce((a, t) => a + t.returnPct, 0),
    stayedRedPoints: red.reduce((a, t) => a + t.returnPct, 0),
    top5: [...dots].sort((a, b) => b.ret - a.ret).slice(0, 5).map((d) => d.i),
    maxAbsRet: dots.reduce((m, d) => Math.max(m, Math.abs(d.ret)), 0),
  };
}

let memo: Promise<SampleData> | null = null;

/** Memoised fetch + engine run, started at idle (Safari has no requestIdleCallback). */
export function getSample(): Promise<SampleData> {
  if (memo) return memo;
  const idle: (cb: () => void) => void = typeof requestIdleCallback === 'function' ? (cb) => requestIdleCallback(cb, { timeout: 1500 }) : (cb) => setTimeout(cb, 200);
  memo = new Promise<SampleData>((resolve, reject) => {
    idle(() => {
      // The identical URL string main.ts uses, so the #demo fetch hits the HTTP cache.
      fetch(`${import.meta.env.BASE_URL}sample-trades.csv`)
        .then((res) => {
          if (!res.ok) throw new Error(`sample: HTTP ${res.status}`);
          return res.text();
        })
        .then((text) => resolve(buildSampleData(text)))
        .catch(reject);
    });
  });
  return memo;
}

/* ---------- data-sample paths and formats (spec 7.3) ---------- */

export type Format = 'int' | 'pctInt' | 'pct' | 'pct1' | 'money' | 'fixed2' | 'signed2' | 'text';

export function formatValue(v: unknown, fmt: string): string {
  if (v === null || v === undefined) return '';
  if (fmt === 'text') return String(v);
  const x = Number(v);
  if (!Number.isFinite(x)) return String(v);
  switch (fmt) {
    case 'int': return String(Math.round(x));
    case 'pctInt': return `${Math.round(x * 100)}%`;
    case 'pct': return pct(x);
    case 'pct1': return pct(x, 1);
    case 'money': return money(x);
    case 'fixed2': return x.toFixed(2);
    case 'signed2': return (x > 0 ? '+' : '') + x.toFixed(2);
    default: return String(v);
  }
}

/** Marketing copy uses U+2212 for minus; the report itself keeps what format.ts prints. */
export const marketingMinus = (s: string) => s.replace(/-(?=[\d$])/g, '−');

function group(report: Report, dim: string, label: string): GroupStats | undefined {
  return report.dimensions.find((d) => d.id === dim)?.groups.find((g) => g.label === label);
}

function insightField(list: Insight[], i: number, field: string, report: Report): unknown {
  const ins = list[i];
  if (!ins) return undefined;
  const sentence = insightSentence(ins, report);
  switch (field) {
    case 'sentence': return sentence;
    case 'base': return sentence.slice(0, sentence.indexOf('overall.') + 'overall.'.length);
    case 'phrase': return ins.group.phrase;
    case 'n': return ins.group.n;
    case 'winRate': return ins.group.winRate;
    case 'avgReturn': return ins.group.avgReturn;
    case 'confidence': return ins.group.confidence;
    case 'returnWithout': return ins.returnWithout;
    case 'pnlWithout': return ins.pnlWithout;
    default: return (ins.group as unknown as Record<string, unknown>)[field];
  }
}

/** Resolves a data-sample path; dots are split only at the fixed positions (labels contain spaces, en dashes and '<', never dots). */
export function resolvePath(data: SampleData, path: string): unknown {
  const r = data.report;
  const dot = path.indexOf('.');
  const head = dot < 0 ? path : path.slice(0, dot);
  const rest = dot < 0 ? '' : path.slice(dot + 1);
  const last = rest.lastIndexOf('.');
  const field = last < 0 ? rest : rest.slice(last + 1);
  const middle = last < 0 ? '' : rest.slice(0, last);
  switch (head) {
    case 'summary':
      if (rest === 'symbols.length') return r.summary.symbols.length;
      return (r.summary as unknown as Record<string, unknown>)[rest];
    case 'risk': return (r.risk as unknown as Record<string, unknown>)[rest];
    case 'stopAt': return (data.stopAt[middle] as unknown as Record<string, unknown> | undefined)?.[field];
    case 'edges': return insightField(r.edges, Number(middle), field, r);
    case 'leaks': return insightField(r.leaks, Number(middle), field, r);
    case 'group': {
      const d2 = middle.indexOf('.');
      const g = group(r, middle.slice(0, d2), middle.slice(d2 + 1));
      return g ? (g as unknown as Record<string, unknown>)[field] : undefined;
    }
    case 'fills': return rest === 'rows' ? data.csvLines.length - 1 : rest === 'kb' ? Math.round(data.bytes / 1024) : undefined;
    case 'top5': {
      const d = data.dots[data.top5[Number(middle)]];
      return d ? (field === 'symbol' ? d.sym : field === 'returnPct' ? d.ret : field === 'pnl' ? d.pnl : undefined) : undefined;
    }
    case 'neverNear': return data.neverNear;
    case 'stayedRed': return data.stayedRed;
    case 'cameBackPoints': return data.cameBackPoints;
    case 'stayedRedPoints': return data.stayedRedPoints;
    case 'equity': {
      const eq = data.equity;
      const min = Math.min(...eq), max = Math.max(...eq);
      return rest === 'end' ? eq[eq.length - 1] : rest === 'peak' ? max : rest === 'trough' ? min : rest === 'troughIndex' ? eq.indexOf(min) : rest === 'peakIndex' ? eq.indexOf(max) : undefined;
    }
    default: return undefined;
  }
}

export function sampleText(data: SampleData, path: string, fmt: string): string | null {
  const v = resolvePath(data, path);
  if (v === undefined || v === null) return null;
  return marketingMinus(formatValue(v, fmt));
}

/** Writes every [data-sample] under root from the engine's report; in dev, warns on drift from the typed HTML. */
export function bindSampleNumbers(root: ParentNode, data: SampleData): void {
  const els = root.querySelectorAll<HTMLElement>('[data-sample]');
  els.forEach((el) => {
    const path = el.dataset.sample!;
    const text = sampleText(data, path, el.dataset.format ?? 'text');
    if (text === null) {
      if (import.meta.env.DEV) console.warn(`sample: no value for ${path}`);
      return;
    }
    const counting = el.dataset.countFinal !== undefined;
    const typed = (counting ? el.dataset.countFinal! : (el.textContent ?? '')).trim();
    if (typed !== text) {
      if (import.meta.env.DEV) console.warn(`sample drift: ${path} html="${typed}" engine="${text}"`);
      if (counting) el.dataset.countFinal = text;
      else el.textContent = text;
    }
  });
}

/* ---------- the shrinkage rule, mirrored from analyze.ts (spec 6.4) ---------- */

export const SHRINK_K = 10;

export function shrinkAdjusted(n: number, raw: number, overall: number): number {
  return (n * raw + SHRINK_K * overall) / (n + SHRINK_K);
}

export function shrinkConfidence(n: number): Confidence {
  return n < 5 ? 'too few' : n < 15 ? 'early signal' : 'solid';
}

export function shrinkVerdict(n: number, raw: number, overall: number): string {
  const adj = shrinkAdjusted(n, raw, overall);
  if (n < 5) return 'nothing, too few trades';
  const conf = n < 15 ? ' (early signal)' : ' (solid)';
  if (adj > overall && raw > 0 && raw >= overall + Math.abs(overall) / 2) return `an edge${conf}`;
  if (adj <= overall && raw < 0) return `a leak${conf}`;
  if (adj <= overall && raw < overall / 2) return `a weak spot${conf}`;
  return 'nothing: not clearly away from your average';
}
