// "From fills to verdict in four scrolls" (build spec 6.1): CSS sticky field, one scrubbed timeline, no pins.
// A port of the prototype's Story class; chips and lane numbers come from the engine's tagged trades.
import { pct } from '../../core/format.ts';
import { $, $$, clamp, type Mounted, type SiteCtx, type StoryHandle } from './motion.ts';
import type { SampleData } from './sample.ts';

const LANE_LABELS = ['1st', '2nd', '3rd', '4th or later'];

class Story {
  private section = $('#story')!;
  private stage = $('#frame-stage')!;
  private csv = $('#story-csv')!;
  private chipsWrap = $('#story-chips')!;
  private lanes = $$('.lane', $('#story-frame')!);
  private card = $('#story-card')!;
  private counter = $('#story-counter')!;
  private steps = $$('.step', $('#story')!);
  private states = $$('#story-states i');
  private rows: HTMLSpanElement[] = [];
  private chips: HTMLDivElement[] = [];
  private grid: { x: number; y: number }[] = [];
  private lanePos: { x: number; y: number }[] = [];
  private laneShift = [0, 0, 0, 0];
  private avgs = [0.94, 0.44, -0.81, -0.29];
  private totalReturn = 37.3;
  private returnWithout = 58.5;
  private thresholds: number[] | null = null;
  private active = -1;
  tl: gsap.core.Timeline | null = null;
  st: ScrollTrigger | null = null;
  private ctx: SiteCtx;

  constructor(ctx: SiteCtx) {
    this.ctx = ctx;
  }

  setData(data: SampleData): void {
    this.rows.forEach((r) => r.remove());
    this.chips.forEach((c) => c.remove());
    this.rows = data.csvLines.slice(0, 14).map((line, i) => {
      const s = document.createElement('span');
      s.textContent = line;
      if (i === 0) s.className = 'hd';
      this.csv.appendChild(s);
      return s;
    });
    this.chips = data.dots.map((d) => {
      const c = document.createElement('div');
      c.className = `chip${d.pnl > 0 ? '' : ' neg'}`;
      c.dataset.lane = String(Math.min(4, d.tradeOfDay));
      this.chipsWrap.appendChild(c);
      return c;
    });
    const tod = data.report.dimensions.find((d) => d.id === 'tradeOfDay');
    this.avgs = LANE_LABELS.map((l, k) => tod?.groups.find((g) => g.label === l)?.avgReturn ?? this.avgs[k]);
    this.totalReturn = data.report.summary.totalReturn;
    this.returnWithout = data.report.leaks[0]?.returnWithout ?? this.returnWithout;
  }

  layout(): void {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const mob = this.ctx.isMobile();
    const cs = mob ? 10 : 14;
    const gap = mob ? 3 : 4;
    const pitch = cs + gap;
    const cols = 8;
    const rws = 14;
    const cell = Math.min((W - 24) / cols, (H - 24) / rws);
    const gx0 = (W - cell * cols) / 2 + (cell - cs) / 2;
    const gy0 = (H - cell * rws) / 2 + (cell - cs) / 2;
    this.grid = this.chips.map((_, i) => ({ x: gx0 + (i % cols) * cell, y: gy0 + Math.floor(i / cols) * cell }));
    const labelW = mob ? 66 : 92;
    const aw = W - labelW - 8;
    const perRow = Math.max(4, Math.floor(aw / pitch));
    const laneTop = H * 0.03;
    const lanePitch = (H * 0.97) / 4;
    const counts = [0, 0, 0, 0];
    this.lanePos = this.chips.map((c) => {
      const k = Number(c.dataset.lane) - 1;
      const j = counts[k]++;
      return { x: labelW + (j % perRow) * pitch, y: laneTop + k * lanePitch + Math.floor(j / perRow) * pitch };
    });
    this.lanes.forEach((lane, k) => {
      const rowsIn = Math.ceil(counts[k] / perRow);
      lane.style.top = `${laneTop + k * lanePitch}px`;
      lane.style.height = `${lanePitch - 6}px`;
      const zero = $('.zero', lane)!;
      const bar = $('.bar', lane)!;
      const val = $('.bar-val', lane)!;
      const x0 = labelW + aw * 0.4;
      const maxW = aw * 0.38;
      const w = Math.abs(this.avgs[k]) * maxW;
      const barY = rowsIn * pitch + 6;
      zero.style.left = `${x0}px`;
      zero.style.top = `${barY - 3}px`;
      zero.style.bottom = 'auto';
      zero.style.height = '13px';
      bar.style.top = `${barY}px`;
      bar.style.width = `${w}px`;
      bar.style.left = `${this.avgs[k] > 0 ? x0 : x0 - w}px`;
      val.style.top = `${barY - 3}px`;
      val.style.left = `${x0 + (this.avgs[k] > 0 ? w : 0) + 8}px`;
      val.style.right = 'auto';
    });
    const cardH = this.card.offsetHeight || (mob ? 160 : 176);
    const avail = H - cardH - 10;
    const laneH = this.lanes.map((lane, k) => {
      const rowsIn = Math.ceil(counts[k] / perRow);
      const lblH = $('.lane-lbl', lane)?.offsetHeight || (mob ? 48 : 58);
      return Math.max(rowsIn * pitch + 16, lblH);
    });
    const sumH = laneH.reduce((a, b) => a + b, 0);
    const gapV = clamp((avail - sumH) / 3, 6, 28);
    let vt = 0;
    this.laneShift = laneH.map((h, k) => {
      const top = vt;
      vt += h + gapV;
      return top - (laneTop + k * lanePitch);
    });
  }

  setStatic(): void {
    this.chips.forEach((c, i) => {
      const p = this.lanePos[i];
      const dy = this.laneShift[Number(c.dataset.lane) - 1];
      c.style.transform = `translate(${p.x}px, ${p.y + dy}px)`;
      c.style.opacity = c.dataset.lane === '3' ? '.25' : '1';
    });
    this.lanes.forEach((lane, k) => {
      lane.style.transform = `translateY(${this.laneShift[k]}px)`;
    });
    this.csv.style.opacity = '0';
    this.states.forEach((s) => s.classList.add('on'));
    this.steps.forEach((s) => s.classList.remove('active'));
    this.steps[0]?.parentElement?.classList.remove('scrubbed');
    this.counter.textContent = pct(this.returnWithout, 1);
  }

  build(): void {
    const g = this.ctx.gsap;
    this.tl?.kill();
    this.st?.kill();
    const tl = (this.tl = g.timeline({ paused: true, defaults: { ease: 'power2.inOut' } }));
    const cnt = { v: this.totalReturn };
    const lane3 = this.chips.filter((c) => c.dataset.lane === '3');
    const lbl = this.lanes.map((l) => $('.lane-lbl', l)!);
    const bars = this.lanes.map((l) => $('.bar', l)!);
    const vals = this.lanes.map((l) => $('.bar-val', l)!);
    const zeros = this.lanes.map((l) => $('.zero', l)!);
    g.set(this.csv, { opacity: 1 });
    g.set(this.rows, { clipPath: 'inset(0 100% 0 0)', opacity: 1, y: 0 });
    g.set(this.chips, { x: (i: number) => this.grid[i].x, y: (i: number) => this.grid[i].y, scale: 0, opacity: 0 });
    g.set([...lbl, ...vals, ...zeros], { opacity: 0 });
    g.set(bars, { scaleX: 0 });
    g.set(this.lanes, { y: 0 });
    g.set(this.card, { yPercent: 115, opacity: 0 });
    this.counter.textContent = pct(this.totalReturn, 1);
    tl.addLabel('fills', 0);
    tl.to(this.rows, { clipPath: 'inset(0 0% 0 0)', duration: 0.35, stagger: 0.07, ease: 'none' }, 'fills');
    tl.addLabel('trades', 1.35);
    tl.to(this.rows, { opacity: 0, y: -10, duration: 0.45, stagger: 0.02 }, 'trades');
    tl.to(this.chips, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)', stagger: { amount: 0.9, from: 'start' } }, 'trades+=.15');
    tl.addLabel('lanes', 2.9);
    tl.to(this.chips, { x: (i: number) => this.lanePos[i].x, y: (i: number) => this.lanePos[i].y, duration: 1, stagger: { amount: 0.5 } }, 'lanes');
    tl.to([...lbl, ...zeros], { opacity: 1, duration: 0.4, stagger: 0.06 }, 'lanes+=.5');
    tl.to(bars, { scaleX: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 'lanes+=1.45');
    tl.to(vals, { opacity: 1, duration: 0.3, stagger: 0.08 }, 'lanes+=1.65');
    tl.addLabel('verdict', 5.3);
    tl.to(this.lanes, { y: (i: number) => this.laneShift[i], duration: 0.7, ease: 'power3.out' }, 'verdict');
    tl.to(this.chips, { y: (i: number) => this.lanePos[i].y + this.laneShift[Number(this.chips[i].dataset.lane) - 1], duration: 0.7, ease: 'power3.out' }, 'verdict');
    tl.to(lane3, { opacity: 0.25, duration: 0.5 }, 'verdict');
    tl.to(this.card, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 'verdict');
    tl.to(cnt, { v: this.returnWithout, duration: 1.1, ease: 'power2.out', snap: { v: 0.1 }, onUpdate: () => (this.counter.textContent = pct(cnt.v, 1)) }, 'verdict+=.25');
    tl.to({}, { duration: 0.4 });
    const dur = tl.duration();
    const L = tl.labels;
    this.thresholds = [L.trades / dur + 0.02, L.lanes / dur + 0.02, L.verdict / dur + 0.02];
    this.st = this.ctx.ScrollTrigger.create({
      trigger: this.section,
      start: this.ctx.isMobile() ? 'top 15%' : 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      animation: tl,
      onUpdate: (st) => this.setProgress(st.progress),
    });
    this.steps[0]?.parentElement?.classList.add('scrubbed');
    this.active = -1;
    this.setProgress(this.st.progress);
  }

  setProgress(p: number): void {
    const th = this.thresholds ?? [0.24, 0.51, 0.86];
    const idx = p < th[0] ? 0 : p < th[1] ? 1 : p < th[2] ? 2 : 3;
    if (idx === this.active) return;
    this.active = idx;
    this.steps.forEach((s, i) => s.classList.toggle('active', i === idx));
    this.states.forEach((s, i) => s.classList.toggle('on', i <= idx));
  }

  destroy(): void {
    this.tl?.kill();
    this.st?.kill();
    this.tl = null;
    this.st = null;
    this.ctx.gsap.set([this.csv, ...this.rows, ...this.chips, ...this.lanes, this.card, ...$$('.lane-lbl, .bar, .bar-val, .zero', $('#story-lanes')!)], { clearProps: 'all' });
    this.layout();
    this.setStatic();
  }
}

export function mount(ctx: SiteCtx): Mounted {
  if (!$('#story') || !$('#frame-stage')) return { destroy() {} };
  const story = new Story(ctx);
  const handle: StoryHandle = { setStatic: () => story.setStatic() };
  ctx.story = handle;
  let ready = false;
  const offResize = ctx.on('resize', () => {
    if (!ready) return;
    if (ctx.reduced) {
      story.layout();
      story.setStatic();
      return;
    }
    const p = story.st ? story.st.progress : 0;
    story.layout();
    story.build();
    story.tl?.progress(p);
  });
  ctx.sample
    .then((data) => {
      story.setData(data);
      story.layout();
      ready = true;
      if (ctx.reduced) story.setStatic();
      else {
        story.build();
        ctx.refresh();
      }
    })
    .catch(() => {
      // No sample: the lanes and the card from the HTML stay; the CSV and chips are simply absent.
      story.layout();
      story.setStatic();
    });
  return {
    destroy() {
      offResize();
      story.destroy();
    },
  };
}
