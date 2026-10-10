// Roadmap line scrub, milestones, and the pre-trade check card that flips between two real sample trades (spec 6.3).
import { $, $$, type Mounted, type SiteCtx } from './motion.ts';

class Preflight {
  private faceA: HTMLElement;
  private faceB: HTMLElement;
  private rowsA: HTMLElement[];
  private rowsB: HTMLElement[];
  private ticksA: HTMLElement[];
  private ticksB: HTMLElement[];
  private verA: HTMLElement;
  private verB: HTMLElement;
  private ctx: SiteCtx;
  private el: HTMLElement;
  private slot: HTMLElement | null;
  tl: gsap.core.Timeline | null = null;
  st: ScrollTrigger | null = null;

  constructor(ctx: SiteCtx, el: HTMLElement, slot: HTMLElement | null) {
    this.ctx = ctx;
    this.el = el;
    this.slot = slot;
    this.faceA = $('[data-face="a"]', el)!;
    this.faceB = $('[data-face="b"]', el)!;
    this.rowsA = $$('.pf-row', this.faceA);
    this.rowsB = $$('.pf-row', this.faceB);
    this.ticksA = $$('.tick', this.faceA);
    this.ticksB = $$('.tick', this.faceB);
    this.verA = $('.pf-verdict', this.faceA)!;
    this.verB = $('.pf-verdict', this.faceB)!;
  }

  build(): void {
    const g = this.ctx.gsap;
    const el = this.el;
    const prog = this.tl ? this.tl.progress() : 0;
    const playing = this.tl ? !this.tl.paused() : false;
    this.tl?.kill();
    this.st?.kill();
    el.style.height = '';
    const cs = getComputedStyle(el);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const hA = this.faceA.offsetHeight + pad;
    const hB = this.faceB.offsetHeight + pad;
    if (this.slot) this.slot.style.minHeight = `${Math.max(hA, hB)}px`;
    const allRows = [...this.rowsA, ...this.rowsB];
    const allTicks = [...this.ticksA, ...this.ticksB];
    const verdicts = [this.verA, this.verB];
    g.set(allRows, { opacity: 0, x: -6 });
    g.set(allTicks, { scale: 0, transformOrigin: 'center' });
    g.set(verdicts, { opacity: 0, scale: 1.18 });
    g.set(this.faceB, { opacity: 0 });
    g.set(this.faceA, { opacity: 1 });
    const tl = (this.tl = g.timeline({ paused: true, repeat: -1 }));
    const rowsIn = (rows: HTMLElement[], ticks: HTMLElement[], at: number) => {
      tl.to(rows, { opacity: 1, x: 0, duration: 0.35, stagger: 0.16, ease: 'power2.out' }, at);
      tl.to(ticks, { scale: 1, duration: 0.35, stagger: 0.16, ease: 'back.out(3)' }, at + 0.05);
    };
    const stamp = (v: HTMLElement, at: number) => tl.to(v, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, at);
    rowsIn(this.rowsA, this.ticksA, 0.1);
    stamp(this.verA, 1.0);
    tl.to(this.faceA, { opacity: 0, duration: 0.3 }, 4.0);
    tl.fromTo(el, { height: hA }, { height: hB, duration: 0.45, ease: 'power2.inOut', immediateRender: false }, 4.0);
    tl.to(this.faceB, { opacity: 1, duration: 0.3 }, 4.2);
    rowsIn(this.rowsB, this.ticksB, 4.4);
    stamp(this.verB, 5.1);
    tl.to(this.faceB, { opacity: 0, duration: 0.3 }, 8.2);
    tl.to(el, { height: hA, duration: 0.45, ease: 'power2.inOut' }, 8.2);
    tl.set(allRows, { opacity: 0, x: -6 }, 8.5);
    tl.set(allTicks, { scale: 0 }, 8.5);
    tl.set(verdicts, { opacity: 0, scale: 1.18 }, 8.5);
    tl.to(this.faceA, { opacity: 1, duration: 0.3 }, 8.5);
    tl.set(el, { clearProps: 'height' }, 8.8);
    tl.to({}, { duration: 0.05 });
    this.st = this.ctx.ScrollTrigger.create({ trigger: el, start: 'top 85%', end: 'bottom 0%', onToggle: (st) => (st.isActive ? tl.play() : tl.pause()) });
    if (prog) tl.progress(prog);
    if (playing) tl.play();
  }

  destroy(): void {
    this.tl?.kill();
    this.st?.kill();
    this.tl = null;
    this.st = null;
    this.ctx.gsap.set([...this.rowsA, ...this.rowsB, ...this.ticksA, ...this.ticksB, this.verA, this.verB, this.faceA, this.faceB, this.el], { clearProps: 'all' });
    if (this.slot) this.slot.style.minHeight = '';
  }
}

export function mount(ctx: SiteCtx): Mounted {
  if (ctx.reduced) return { destroy() {} };
  const g = ctx.gsap;
  const cleanups: (() => void)[] = [];
  const lineFill = $('#roadmap-line-fill');
  const timeline = $('#timeline');
  if (lineFill && timeline) {
    const tw = g.to(lineFill, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: timeline, start: 'top 80%', end: 'bottom 30%', scrub: 0.4 } });
    cleanups.push(() => {
      tw.scrollTrigger?.kill();
      tw.kill();
      g.set(lineFill, { strokeDashoffset: 0 });
    });
  }
  const ms = $$('[data-ms]');
  const milestones = $('#milestones');
  if (ms.length && milestones) {
    const tw = g.from(ms, { scale: 0.9, opacity: 0, duration: 0.5, ease: 'back.out(1.4)', stagger: 0.1, scrollTrigger: { trigger: milestones, start: 'top 85%', once: true } });
    cleanups.push(() => {
      tw.scrollTrigger?.kill();
      tw.kill();
      g.set(ms, { clearProps: 'all' });
    });
  }
  const el = $('#preflight-roadmap');
  let pf: Preflight | null = null;
  if (el) {
    pf = new Preflight(ctx, el, $('#pf-stage') ?? $('#pf-slot'));
    pf.build();
    cleanups.push(ctx.on('resize', () => pf?.build()));
    const onVis = () => {
      if (!pf?.tl || !pf.st) return;
      if (document.hidden) pf.tl.pause();
      else if (pf.st.isActive) pf.tl.play();
    };
    document.addEventListener('visibilitychange', onVis);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVis));
  }
  return {
    destroy() {
      cleanups.splice(0).forEach((f) => f());
      pf?.destroy();
    },
  };
}
