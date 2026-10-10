// "From fills to verdict in four scrolls" (6.1): CSS sticky stage, one scrubbed timeline. The 112 chips
// and the CSV rows come from the sample; the lane averages are the engine's tradeOfDay groups.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { pct } from '../../core/format.ts';
import { clamp, isMobile, type Ctx, type Module } from './motion.ts';
import { typo, type SampleData } from './sample.ts';

const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends Element>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)];

export class Story {
  section = document.getElementById('story')!;
  frame = document.getElementById('story-frame')!;
  stage = document.getElementById('frame-stage')!;
  csv = document.getElementById('story-csv')!;
  chipsWrap = document.getElementById('story-chips')!;
  card = document.getElementById('story-card')!;
  counter = document.getElementById('story-counter')!;
  lanes = $$<HTMLElement>('.lane', this.frame);
  steps = $$<HTMLElement>('.step', this.section);
  states = $$<HTMLElement>('#story-states i');
  rows: HTMLElement[] = [];
  chips: HTMLElement[] = [];
  laneOf: number[] = [];
  avgs = [0, 0, 0, 0];
  from = 0;
  to = 0;
  grid: { x: number; y: number }[] = [];
  lanePos: { x: number; y: number }[] = [];
  laneShift = [0, 0, 0, 0];
  thresholds: number[] | null = null;
  active = -1;
  tl: gsap.core.Timeline | null = null;
  st: ScrollTrigger | null = null;

  constructor(data: SampleData | null) {
    const avgFrom = (lbl: string, fallback: number) => data?.report.dimensions.find((d) => d.id === 'tradeOfDay')?.groups.find((g) => g.label === lbl)?.avgReturn ?? fallback;
    const num = (s: string | null | undefined) => parseFloat((s ?? '0').replace('\u2212', '-')) || 0;
    const typed = this.lanes.map((l) => num($<HTMLElement>('.bar-val', l)?.textContent));
    this.avgs = [avgFrom('1st', typed[0]), avgFrom('2nd', typed[1]), avgFrom('3rd', typed[2]), avgFrom('4th or later', typed[3])];
    this.from = data?.report.summary.totalReturn ?? num($<HTMLElement>('[data-sample="summary.totalReturn"]', this.card)?.textContent);
    this.to = data?.report.leaks[0]?.returnWithout ?? num(this.counter.textContent);
    if (data) {
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
      this.laneOf = data.dots.map((d) => Math.min(4, d.tradeOfDay) - 1);
    }
    this.layout();
  }

  layout(): void {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const mob = isMobile();
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
    this.lanePos = this.chips.map((_, i) => {
      const k = this.laneOf[i];
      const j = counts[k]++;
      return { x: labelW + (j % perRow) * pitch, y: laneTop + k * lanePitch + Math.floor(j / perRow) * pitch };
    });
    this.lanes.forEach((lane, k) => {
      const rowsIn = Math.ceil(counts[k] / perRow);
      lane.style.top = `${laneTop + k * lanePitch}px`;
      lane.style.height = `${lanePitch - 6}px`;
      const zero = $<HTMLElement>('.zero', lane)!;
      const bar = $<HTMLElement>('.bar', lane)!;
      const val = $<HTMLElement>('.bar-val', lane)!;
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
    // verdict state: pack the lanes above the leak card so none of them hides under it
    const cardH = this.card.offsetHeight || (mob ? 160 : 176);
    const avail = H - cardH - 10;
    const laneH = this.lanes.map((lane, k) => {
      const rowsIn = Math.ceil(counts[k] / perRow);
      const lblH = $<HTMLElement>('.lane-lbl', lane)?.offsetHeight || (mob ? 48 : 58);
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
      const dy = this.laneShift[this.laneOf[i]];
      c.style.transform = `translate(${p.x}px,${p.y + dy}px)`;
      c.style.opacity = this.laneOf[i] === 2 ? '.25' : '1';
    });
    this.lanes.forEach((lane, k) => {
      lane.style.transform = `translateY(${this.laneShift[k]}px)`;
      $$<HTMLElement>('.lane-lbl,.bar-val,.zero', lane).forEach((el) => (el.style.opacity = ''));
      const bar = $<HTMLElement>('.bar', lane);
      if (bar) bar.style.transform = '';
    });
    this.rows.forEach((r) => {
      r.style.clipPath = '';
      r.style.opacity = '';
      r.style.transform = '';
    });
    this.csv.style.opacity = '0';
    this.card.style.transform = '';
    this.card.style.opacity = '';
    this.counter.textContent = typo(pct(this.to, 1));
    this.states.forEach((s) => s.classList.add('on'));
    this.steps.forEach((s) => s.classList.add('active'));
    this.steps[0]?.parentElement?.classList.remove('scrubbed');
  }

  build(): void {
    this.tl?.kill();
    this.st?.kill();
    const tl = (this.tl = gsap.timeline({ paused: true, defaults: { ease: 'power2.inOut' } }));
    const cnt = { v: this.from };
    const lane3 = this.chips.filter((_, i) => this.laneOf[i] === 2);
    const lblEls = this.lanes.map((l) => $<HTMLElement>('.lane-lbl', l)!);
    const barEls = this.lanes.map((l) => $<HTMLElement>('.bar', l)!);
    const valEls = this.lanes.map((l) => $<HTMLElement>('.bar-val', l)!);
    const zeroEls = this.lanes.map((l) => $<HTMLElement>('.zero', l)!);
    gsap.set(this.csv, { opacity: 1 });
    if (this.rows.length) gsap.set(this.rows, { clipPath: 'inset(0 100% 0 0)', opacity: 1, y: 0 });
    if (this.chips.length) gsap.set(this.chips, { x: (i: number) => this.grid[i].x, y: (i: number) => this.grid[i].y, scale: 0, opacity: 0 });
    gsap.set([...lblEls, ...valEls, ...zeroEls], { opacity: 0 });
    gsap.set(barEls, { scaleX: 0 });
    gsap.set(this.lanes, { y: 0 });
    gsap.set(this.card, { yPercent: 115, opacity: 0 });
    this.counter.textContent = typo(pct(this.from, 1));
    // A: fills type in
    tl.addLabel('fills', 0);
    if (this.rows.length) tl.to(this.rows, { clipPath: 'inset(0 0% 0 0)', duration: 0.35, stagger: 0.07, ease: 'none' }, 'fills');
    // B: rows collapse, chips pop into a grid
    tl.addLabel('trades', 1.35);
    if (this.rows.length) tl.to(this.rows, { opacity: 0, y: -10, duration: 0.45, stagger: 0.02 }, 'trades');
    if (this.chips.length) tl.to(this.chips, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)', stagger: { amount: 0.9, from: 'start' } }, 'trades+=.15');
    // C: chips fly into four lanes, bars grow once the last chip has landed
    tl.addLabel('lanes', 2.9);
    if (this.chips.length) tl.to(this.chips, { x: (i: number) => this.lanePos[i].x, y: (i: number) => this.lanePos[i].y, duration: 1, stagger: { amount: 0.5 } }, 'lanes');
    tl.to([...lblEls, ...zeroEls], { opacity: 1, duration: 0.4, stagger: 0.06 }, 'lanes+=.5');
    tl.to(barEls, { scaleX: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 'lanes+=1.45');
    tl.to(valEls, { opacity: 1, duration: 0.3, stagger: 0.08 }, 'lanes+=1.65');
    // D: verdict: lanes pack upward, the leak card slides in, the counter counts
    tl.addLabel('verdict', 5.3);
    tl.to(this.lanes, { y: (i: number) => this.laneShift[i], duration: 0.7, ease: 'power3.out' }, 'verdict');
    if (this.chips.length) tl.to(this.chips, { y: (i: number) => this.lanePos[i].y + this.laneShift[this.laneOf[i]], duration: 0.7, ease: 'power3.out' }, 'verdict');
    if (lane3.length) tl.to(lane3, { opacity: 0.25, duration: 0.5 }, 'verdict');
    tl.to(this.card, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 'verdict');
    tl.to(
      cnt,
      {
        v: this.to,
        duration: 1.1,
        ease: 'power2.out',
        snap: { v: 0.1 },
        onUpdate: () => {
          this.counter.textContent = typo(pct(cnt.v, 1));
        },
        onComplete: () => {
          this.counter.textContent = typo(pct(this.to, 1));
        },
      },
      'verdict+=.25',
    );
    tl.to({}, { duration: 0.4 });
    const dur = tl.duration();
    const L = tl.labels;
    this.thresholds = [L.trades / dur + 0.02, L.lanes / dur + 0.02, L.verdict / dur + 0.02];
    this.st = ScrollTrigger.create({
      trigger: this.section,
      start: isMobile() ? 'top 15%' : 'top top',
      end: 'bottom bottom',
      scrub: 0.6,
      animation: tl,
      onUpdate: (st) => this.setProgress(st.progress),
    });
    this.steps[0]?.parentElement?.classList.add('scrubbed');
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
    this.st?.kill();
    this.tl?.kill();
    this.st = null;
    this.tl = null;
    this.layout();
    this.setStatic();
  }
}

export function mount(ctx: Ctx): Module {
  let story: Story | null = null;
  const relayout = () => {
    if (!story) return;
    if (ctx.reduced || !story.st) {
      story.layout();
      story.setStatic();
      return;
    }
    const p = story.st.progress;
    story.layout();
    story.build();
    story.tl?.progress(p);
  };
  const init = (data: SampleData | null) => {
    story = new Story(data);
    if (ctx.reduced) story.setStatic();
    else {
      story.build();
      ScrollTrigger.refresh();
    }
    window.addEventListener('site:relayout', relayout);
  };
  ctx.sample.then(init, () => init(null));
  return {
    destroy() {
      // the resize listener stays: under reduced motion it re-lays out the static frame
      story?.destroy();
    },
  };
}
