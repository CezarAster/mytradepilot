// "From record to rule to held, in four scrolls" (content spec 3): CSS sticky field, one scrubbed timeline, no pins.
// Beats: fills (the CSV types in) → sorted (112 chips into four lanes) → rule (the lanes pack, the rule card slides in,
// the counter counts to the 3rd-trade net) → held (the card crossfades to the held panel: clock, fill row, flatten row,
// stamp, push chip). Chips, lane numbers, the rule sentence and the Apr 9 times come from the engine on the sample.
import { money } from '../../core/format.ts';
import { $, $$, clamp, type Mounted, type SiteCtx, type StoryHandle } from './motion.ts';
import { marketingMinus, type SampleData } from './sample.ts';

const LANE_LABELS = ['1st', '2nd', '3rd', '4th or later'];
/** The frame clock through beat 4: the losing exit, then the fill, then the flatten two seconds later (the seconds are illustrative). */
const CLOCK = ['11:12', '11:15:00', '11:15:01', '11:15:02'];
/** The trade the held panel is about: 3 minutes after a losing exit, 3rd of the day (asserted in test/site.test.ts). */
const BREACH = { date: '2026-04-09', sym: 'ORBX', entry: '11:15' };
const RING = '0 0 0 1.5px rgba(243,245,247,.9)';

class Story {
  private section = $('#story')!;
  private stage = $('#frame-stage')!;
  private csv = $('#story-csv')!;
  private chipsWrap = $('#story-chips')!;
  private lanes = $$('.lane', $('#story-frame')!);
  private card = $('#story-card')!;
  private faceA = $('#story-rule');
  private faceB = $('#story-held');
  private counter = $('#story-counter');
  private clock = $('#story-clock');
  private push = $('#story-push');
  private heldRows = this.faceB ? $$('.held-row', this.faceB) : [];
  private stamp = this.faceB ? $('.pf-stamp', this.faceB) : null;
  private status = this.faceB ? $('.held-status', this.faceB) : null;
  private link = this.faceB ? $('.held-link', this.faceB) : null;
  private steps = $$('.step', $('#story')!);
  private states = $$('#story-states i');
  private rows: HTMLSpanElement[] = [];
  private chips: HTMLDivElement[] = [];
  private breachChip: HTMLDivElement | null = null;
  private grid: { x: number; y: number }[] = [];
  private lanePos: { x: number; y: number }[] = [];
  private laneShift = [0, 0, 0, 0];
  private avgs = [0.94, 0.44, -0.81, -0.29];
  private totalPnl3rd = -2346;
  private hA = 0;
  private hB = 0;
  private thresholds: number[] | null = null;
  private active = -1;
  tl: gsap.core.Timeline | null = null;
  st: ScrollTrigger | null = null;
  private ctx: SiteCtx;

  constructor(ctx: SiteCtx) {
    this.ctx = ctx;
  }

  private moneyText(v: number): string {
    return marketingMinus(money(v));
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
    const bi = data.dots.findIndex((d) => d.sym === BREACH.sym && d.date === BREACH.date && d.entry === BREACH.entry);
    this.breachChip = bi >= 0 ? this.chips[bi] : null;
    const tod = data.report.dimensions.find((d) => d.id === 'tradeOfDay');
    this.avgs = LANE_LABELS.map((l, k) => tod?.groups.find((g) => g.label === l)?.avgReturn ?? this.avgs[k]);
    this.totalPnl3rd = tod?.groups.find((g) => g.label === '3rd')?.totalPnl ?? this.totalPnl3rd;
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
    // Two faces: face B is absolutely positioned (like .pf-face[data-face="b"]), so each face has its own height.
    // The lanes pack against the taller one so they never sit under the held panel.
    let cardH = this.card.offsetHeight || (mob ? 160 : 176);
    if (this.faceA && this.faceB && !this.ctx.reduced) {
      const cs2 = getComputedStyle(this.card);
      const pad = parseFloat(cs2.paddingTop) + parseFloat(cs2.paddingBottom) + parseFloat(cs2.borderTopWidth) + parseFloat(cs2.borderBottomWidth);
      this.hA = this.faceA.offsetHeight + pad;
      this.hB = this.faceB.offsetHeight + pad;
      cardH = Math.max(this.hA, this.hB) || cardH;
    }
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

  /** The end state without motion: lanes packed, lane 3 dimmed with the Apr 9 chip ringed, the clock at the flatten. */
  setStatic(): void {
    this.chips.forEach((c, i) => {
      const p = this.lanePos[i];
      const dy = this.laneShift[Number(c.dataset.lane) - 1];
      c.style.transform = `translate(${p.x}px, ${p.y + dy}px)`;
      const ringed = c === this.breachChip;
      c.style.opacity = c.dataset.lane === '3' && !ringed ? '.25' : '1';
      c.classList.toggle('ring', ringed);
    });
    this.lanes.forEach((lane, k) => {
      lane.style.transform = `translateY(${this.laneShift[k]}px)`;
    });
    this.csv.style.opacity = '0';
    this.states.forEach((s) => s.classList.add('on'));
    this.steps.forEach((s) => s.classList.remove('active'));
    this.steps[0]?.parentElement?.classList.remove('scrubbed');
    if (this.counter) this.counter.textContent = this.moneyText(this.totalPnl3rd);
    if (this.clock) this.clock.textContent = CLOCK[CLOCK.length - 1];
  }

  build(): void {
    const g = this.ctx.gsap;
    this.tl?.kill();
    this.st?.kill();
    const tl = (this.tl = g.timeline({ paused: true, defaults: { ease: 'power2.inOut' } }));
    const cnt = { v: 0 };
    const clk = { v: 0 };
    const lane3 = this.chips.filter((c) => c.dataset.lane === '3');
    const lbl = this.lanes.map((l) => $('.lane-lbl', l)!);
    const bars = this.lanes.map((l) => $('.bar', l)!);
    const vals = this.lanes.map((l) => $('.bar-val', l)!);
    const zeros = this.lanes.map((l) => $('.zero', l)!);
    const [r1, r2, r3, r4] = this.heldRows;
    const setClock = () => {
      if (this.clock) this.clock.textContent = CLOCK[clamp(Math.round(clk.v), 0, CLOCK.length - 1)];
    };
    g.set(this.csv, { opacity: 1 });
    g.set(this.rows, { clipPath: 'inset(0 100% 0 0)', opacity: 1, y: 0 });
    g.set(this.chips, { x: (i: number) => this.grid[i].x, y: (i: number) => this.grid[i].y, scale: 0, opacity: 0 });
    this.chips.forEach((c) => c.classList.remove('ring'));
    g.set([...lbl, ...vals, ...zeros], { opacity: 0 });
    g.set(bars, { scaleX: 0 });
    g.set(this.lanes, { y: 0 });
    this.card.style.height = '';
    g.set(this.card, { yPercent: 115, opacity: 0 });
    if (this.faceA) g.set(this.faceA, { opacity: 1 });
    if (this.faceB) g.set(this.faceB, { opacity: 0 });
    if (this.clock) g.set(this.clock, { opacity: 0 });
    setClock();
    if (this.push) g.set(this.push, { opacity: 0, x: 12 });
    if (r1 || r2) g.set([r1, r2].filter(Boolean), { opacity: 0, x: -6 });
    if (r3 || r4) g.set([r3, r4].filter(Boolean), { opacity: 0, x: 24 });
    if (this.stamp) g.set(this.stamp, { opacity: 0, scale: 1.18, transformOrigin: 'center' });
    if (this.status) g.set(this.status, { opacity: 0 });
    if (this.link) g.set(this.link, { opacity: 0 });
    if (this.counter) this.counter.textContent = this.moneyText(0);

    // Beat 1: the fills type in.
    tl.addLabel('fills', 0);
    tl.to(this.rows, { clipPath: 'inset(0 0% 0 0)', duration: 0.35, stagger: 0.07, ease: 'none' }, 'fills');
    // Beat 2: sorted. The rows go, the chips pop into the grid, then fly into the four lanes with their bars.
    tl.addLabel('sorted', 1.35);
    tl.to(this.rows, { opacity: 0, y: -10, duration: 0.45, stagger: 0.02 }, 'sorted');
    tl.to(this.chips, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)', stagger: { amount: 0.9, from: 'start' } }, 'sorted+=.15');
    tl.to(this.chips, { x: (i: number) => this.lanePos[i].x, y: (i: number) => this.lanePos[i].y, duration: 1, stagger: { amount: 0.5 } }, 2.9);
    tl.to([...lbl, ...zeros], { opacity: 1, duration: 0.4, stagger: 0.06 }, 3.4);
    tl.to(bars, { scaleX: 1, duration: 0.6, stagger: 0.08, ease: 'power3.out' }, 4.35);
    tl.to(vals, { opacity: 1, duration: 0.3, stagger: 0.08 }, 4.55);
    // Beat 3: the rule. The lanes pack upward, lane 3 dims, the rule card slides in and the counter counts the 3rd-trade net.
    tl.addLabel('rule', 5.3);
    tl.to(this.lanes, { y: (i: number) => this.laneShift[i], duration: 0.7, ease: 'power3.out' }, 'rule');
    tl.to(this.chips, { y: (i: number) => this.lanePos[i].y + this.laneShift[Number(this.chips[i].dataset.lane) - 1], duration: 0.7, ease: 'power3.out' }, 'rule');
    if (lane3.length) tl.to(lane3, { opacity: 0.25, duration: 0.5 }, 'rule');
    tl.to(this.card, { yPercent: 0, opacity: 1, duration: 0.7, ease: 'power3.out' }, 'rule');
    tl.to(cnt, { v: this.totalPnl3rd, duration: 1.1, ease: 'power2.out', snap: { v: 1 }, onUpdate: () => this.counter && (this.counter.textContent = this.moneyText(cnt.v)) }, 'rule+=.25');
    // Beat 4: held. Face A fades while the card's height tweens to face B; the clock, the rows, the stamp, the push.
    tl.addLabel('held', 7.4);
    if (this.faceA) tl.to(this.faceA, { opacity: 0, duration: 0.3 }, 'held');
    if (this.faceA && this.faceB && this.hA && this.hB) tl.fromTo(this.card, { height: this.hA }, { height: this.hB, duration: 0.45, ease: 'power2.inOut', immediateRender: false }, 'held');
    if (this.faceB) tl.to(this.faceB, { opacity: 1, duration: 0.3 }, 7.6);
    if (this.clock) tl.to(this.clock, { opacity: 1, duration: 0.3 }, 7.6);
    if (r1) tl.to(r1, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, 7.8);
    if (r2) tl.to(r2, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, 8.15);
    tl.to(clk, { v: 1, duration: 0.01, ease: 'none', onUpdate: setClock }, 8.6);
    if (r3) tl.to(r3, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, 8.6);
    if (this.breachChip) tl.to(this.breachChip, { opacity: 1, boxShadow: RING, duration: 0.35 }, 8.6);
    tl.to(clk, { v: 2, duration: 0.01, ease: 'none', onUpdate: setClock }, 9.0);
    tl.to(clk, { v: 3, duration: 0.01, ease: 'none', onUpdate: setClock }, 9.4);
    if (r4) tl.to(r4, { opacity: 1, x: 0, duration: 0.35, ease: 'power2.out' }, 9.4);
    if (this.stamp) tl.to(this.stamp, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, 9.6);
    if (this.push) {
      tl.to(this.push, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, 9.8);
      tl.to(this.push, { x: 2, duration: 0.5 / 6, repeat: 5, yoyo: true, ease: 'sine.inOut' }, 10.1);
    }
    if (this.status) tl.to(this.status, { opacity: 1, duration: 0.35 }, 10.2);
    if (this.link) tl.to(this.link, { opacity: 1, duration: 0.3 }, 10.5);
    tl.to({}, { duration: 0.5 }, 10.8);
    const dur = tl.duration();
    const L = tl.labels;
    this.thresholds = [L.sorted / dur + 0.02, L.rule / dur + 0.02, L.held / dur + 0.02];
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
    const th = this.thresholds ?? [0.14, 0.49, 0.67];
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
    const extra = [this.faceA, this.faceB, this.clock, this.push, this.stamp, this.status, this.link, ...this.heldRows].filter((el): el is HTMLElement => !!el);
    this.ctx.gsap.set([this.csv, ...this.rows, ...this.chips, ...this.lanes, this.card, ...extra, ...$$('.lane-lbl, .bar, .bar-val, .zero', $('#story-lanes')!)], { clearProps: 'all' });
    this.card.style.height = '';
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
