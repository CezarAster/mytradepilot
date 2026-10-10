// The sample data module: fetches public/sample-trades.csv once, runs the engine on it and
// serves every set-piece (river, counters, story, labs, pre-check rows) from the same numbers.
// The HTML ships with the same values typed in; bindSampleNumbers() overwrites them after
// computing and, in dev, warns about any drift. test/site.test.ts makes that drift fail the build.
import { analyze, tagTrades, type GroupStats, type Insight, type Report, type RiskStats, type TaggedTrade } from '../../core/analyze.ts';
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
  prev: 'first' | 'win' | 'loss' | 'quick-after-loss';
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

const STOP = 2;
const TZ = 'America/New_York';
const hhmm = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
const byteLength = (s: string) => (typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length);

/** Pure: CSV text → everything the page binds. Same in Node (tests) and the browser. */
export function buildSample(text: string): SampleData {
  const trades = combineTrades([parseFile(text, { timeZone: TZ, fileName: 'sample-trades.csv' }).trades]);
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
      entry: hhmm(t.minutes),
      exit: hhmm(marketClock(t.trade.exitTime!).minutes),
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
  const withMae = closed.filter((t) => t.maePct !== null);
  const past = withMae.filter((t) => t.maePct! <= -STOP);
  const back = past.filter((t) => t.returnPct > 0);
  const stay = past.filter((t) => t.returnPct <= 0);
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const byRet = dots.map((d) => d.i).sort((a, b) => dots[b].ret - dots[a].ret);
  return {
    report,
    tagged,
    dots,
    equity: [0, ...dots.map((d) => d.cum)],
    stopAt: { '1.5': analyze(trades, { stopPct: 1.5 }).risk, '3': analyze(trades, { stopPct: 3 }).risk },
    csvLines: lines,
    bytes: byteLength(text),
    neverNear: withMae.filter((t) => t.maePct! > -STOP).length,
    stayedRed: stay.length,
    cameBackPoints: back.reduce((a, t) => a + t.returnPct, 0),
    stayedRedPoints: stay.reduce((a, t) => a + t.returnPct, 0),
    top5: byRet.slice(0, 5),
    maxAbsRet: Math.max(...dots.map((d) => Math.abs(d.ret)), 0.01),
  };
}

/** Finds a group by dimension id and the engine's exact label. */
export function findGroup(report: Report, dimId: string, label: string): GroupStats | null {
  return report.dimensions.find((d) => d.id === dimId)?.groups.find((g) => g.label === label) ?? null;
}

function insightField(i: Insight, report: Report, field: string): unknown {
  switch (field) {
    case 'sentence':
      return insightSentence(i, report);
    case 'base': {
      const s = insightSentence(i, report);
      const k = s.indexOf('overall.');
      return k >= 0 ? s.slice(0, k + 'overall.'.length) : s;
    }
    case 'phrase':
    case 'n':
    case 'winRate':
    case 'avgReturn':
    case 'confidence':
    case 'label':
    case 'totalPnl':
    case 'totalReturn':
    case 'adjReturn':
      return (i.group as unknown as Record<string, unknown>)[field];
    case 'returnWithout':
    case 'pnlWithout':
    case 'kind':
    case 'dimension':
      return (i as unknown as Record<string, unknown>)[field];
    default:
      return undefined;
  }
}

/**
 * Resolves a `data-sample` path (7.3). Paths are split on '.' only at the fixed positions:
 * `group.<dimId>.<label>.<field>` and `stopAt.<pct>.<field>` keep their middle part whole.
 */
export function lookup(data: SampleData, path: string): unknown {
  const segs = path.split('.');
  const head = segs[0];
  const last = segs[segs.length - 1];
  const r = data.report;
  switch (head) {
    case 'summary':
      return segs.slice(1).reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), r.summary);
    case 'risk':
      return (r.risk as unknown as Record<string, unknown>)[segs[1]];
    case 'stopAt': {
      const rs = data.stopAt[segs.slice(1, -1).join('.')];
      return rs ? (rs as unknown as Record<string, unknown>)[last] : undefined;
    }
    case 'edges':
    case 'leaks': {
      const ins = r[head][Number(segs[1])];
      return ins ? insightField(ins, r, segs[2]) : undefined;
    }
    case 'group': {
      const g = findGroup(r, segs[1], segs.slice(2, -1).join('.'));
      return g ? (g as unknown as Record<string, unknown>)[last] : undefined;
    }
    case 'fills':
      return segs[1] === 'rows' ? data.csvLines.length - 1 : segs[1] === 'kb' ? Math.round(data.bytes / 1024) : undefined;
    case 'top5': {
      const d = data.dots[data.top5[Number(segs[1])]];
      if (!d) return undefined;
      return segs[2] === 'symbol' ? d.sym : segs[2] === 'returnPct' ? d.ret : segs[2] === 'pnl' ? d.pnl : undefined;
    }
    case 'neverNear':
    case 'stayedRed':
    case 'cameBackPoints':
    case 'stayedRedPoints':
      return data[head];
    case 'equity': {
      const eq = data.equity;
      const mn = Math.min(...eq);
      const mx = Math.max(...eq);
      switch (segs[1]) {
        case 'end':
          return eq[eq.length - 1];
        case 'peak':
          return mx;
        case 'trough':
          return mn;
        case 'peakIndex':
          return eq.indexOf(mx);
        case 'troughIndex':
          return eq.indexOf(mn);
        default:
          return undefined;
      }
    }
    default:
      return undefined;
  }
}

export type SampleFormat = 'int' | 'pctInt' | 'pct' | 'pct1' | 'money' | 'fixed2' | 'text';

/** Formats an engine value the way the page shows it (ASCII minus; the caller typographs it). */
export function formatSample(value: unknown, fmt: string | undefined): string {
  if (typeof value !== 'number') return value == null ? '' : String(value);
  switch (fmt as SampleFormat | undefined) {
    case 'int':
      return String(Math.round(value));
    case 'pctInt':
      return `${Math.round(value * 100)}%`;
    case 'pct':
      return pct(value);
    case 'pct1':
      return pct(value, 1);
    case 'money':
      return money(value);
    case 'fixed2':
      return value.toFixed(2);
    default:
      return String(value);
  }
}

const MINUS = '−';
const typographic = (s: string) => s.replace(/-(?=[\d$])/g, MINUS);

/** Count-up attributes hold plain numbers in the count format's own domain (pct0 counts 61, not 0.61). */
function countTarget(value: number, countFormat: string | undefined): number {
  return countFormat === 'pct0' || countFormat === 'pctInt' ? value * 100 : value;
}

/** Writes the engine's numbers into every `[data-sample]` under `root`; warns about drift in dev. */
export function bindSampleNumbers(root: ParentNode, data: SampleData): void {
  const motion = document.documentElement.classList.contains('motion');
  const dev = Boolean(import.meta.env?.DEV);
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('[data-sample]'))) {
    const path = el.dataset.sample!;
    const value = lookup(data, path);
    if (value === undefined) {
      if (dev) console.warn(`sample path not found: ${path}`);
      continue;
    }
    const text = typographic(formatSample(value, el.dataset.format));
    const current = (el.textContent ?? '').trim();
    if (dev && current.replace(/−/g, '-') !== text.replace(/−/g, '-') && !el.hasAttribute('data-counter') && !el.hasAttribute('data-count')) {
      console.warn(`sample drift: ${path} html="${current}" engine="${text}"`);
    }
    if (typeof value === 'number') {
      if (el.hasAttribute('data-counter')) el.dataset.counter = String(countTarget(value, el.dataset.counterFormat));
      if (el.hasAttribute('data-count')) el.dataset.count = String(countTarget(value, el.dataset.format));
    }
    // A number that is still counting up keeps its running text; the count ends on the engine value.
    const counting = motion && (el.hasAttribute('data-counter') || el.hasAttribute('data-count')) && el.dataset.countState !== 'done';
    if (!counting && current !== text) el.textContent = text;
  }
}

let memo: Promise<SampleData> | null = null;

/** Fetches the sample once, at idle, with the identical URL main.ts uses so #demo's fetch hits the cache. */
export function getSample(): Promise<SampleData> {
  if (memo) return memo;
  memo = new Promise<SampleData>((resolve, reject) => {
    const go = () =>
      fetch(`${import.meta.env.BASE_URL}sample-trades.csv`)
        .then((res) => {
          if (!res.ok) throw new Error(`sample ${res.status}`);
          return res.text();
        })
        .then((text) => resolve(buildSample(text)))
        .catch(reject);
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (typeof ric === 'function') ric(go);
    else setTimeout(go, 200);
  });
  return memo;
}
