// The declaration card in #rulebook (content spec 4.2): face A is the morning declaration (five rows tick in, the
// Declared stamp presses), face B is the breach moment on the sample's Apr 9 record (the "your rule says" paragraph,
// four timed rows, the Breached stamp). Timing is build-2's Preflight class; the slot keeps max(hA, hB).
import { $, $$, type Mounted, type SiteCtx } from './motion.ts';

class Declaration {
  private faceA: HTMLElement;
  private faceB: HTMLElement;
  private rowsA: HTMLElement[];
  private rowsB: HTMLElement[];
  private ticksA: HTMLElement[];
  private ticksB: HTMLElement[];
  private stampA: HTMLElement | null;
  private stampB: HTMLElement | null;
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
    // On the breach face the "your rule says" paragraph enters with the rows, first.
    this.rowsB = [...$$('.pf-say', this.faceB), ...$$('.pf-row', this.faceB)];
    this.ticksA = $$('.tick', this.faceA);
    this.ticksB = $$('.tick', this.faceB);
    this.stampA = $('.pf-stamp', this.faceA);
    this.stampB = $('.pf-stamp', this.faceB);
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
    const stamps = [this.stampA, this.stampB].filter((s): s is HTMLElement => !!s);
    if (allRows.length) g.set(allRows, { opacity: 0, x: -6 });
    if (allTicks.length) g.set(allTicks, { scale: 0, transformOrigin: 'center' });
    if (stamps.length) g.set(stamps, { opacity: 0, scale: 1.18 });
    g.set(this.faceB, { opacity: 0 });
    g.set(this.faceA, { opacity: 1 });
    const tl = (this.tl = g.timeline({ paused: true, repeat: -1 }));
    const rowsIn = (rows: HTMLElement[], ticks: HTMLElement[], at: number) => {
      if (rows.length) tl.to(rows, { opacity: 1, x: 0, duration: 0.35, stagger: 0.16, ease: 'power2.out' }, at);
      if (ticks.length) tl.to(ticks, { scale: 1, duration: 0.35, stagger: 0.16, ease: 'back.out(3)' }, at + 0.05);
    };
    const press = (s: HTMLElement | null, at: number) => s && tl.to(s, { opacity: 1, scale: 1, duration: 0.4, ease: 'power3.out' }, at);
    rowsIn(this.rowsA, this.ticksA, 0.1);
    press(this.stampA, 1.0);
    tl.to(this.faceA, { opacity: 0, duration: 0.3 }, 4.0);
    tl.fromTo(el, { height: hA }, { height: hB, duration: 0.45, ease: 'power2.inOut', immediateRender: false }, 4.0);
    tl.to(this.faceB, { opacity: 1, duration: 0.3 }, 4.2);
    rowsIn(this.rowsB, this.ticksB, 4.4);
    press(this.stampB, 5.1);
    tl.to(this.faceB, { opacity: 0, duration: 0.3 }, 8.2);
    tl.to(el, { height: hA, duration: 0.45, ease: 'power2.inOut' }, 8.2);
    if (allRows.length) tl.set(allRows, { opacity: 0, x: -6 }, 8.5);
    if (allTicks.length) tl.set(allTicks, { scale: 0 }, 8.5);
    if (stamps.length) tl.set(stamps, { opacity: 0, scale: 1.18 }, 8.5);
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
    const stamps = [this.stampA, this.stampB].filter((s): s is HTMLElement => !!s);
    this.ctx.gsap.set([...this.rowsA, ...this.rowsB, ...this.ticksA, ...this.ticksB, ...stamps, this.faceA, this.faceB, this.el], { clearProps: 'all' });
    if (this.slot) this.slot.style.minHeight = '';
  }
}

export function mount(ctx: SiteCtx): Mounted {
  if (ctx.reduced) return { destroy() {} };
  const cleanups: (() => void)[] = [];
  const el = $('#declaration');
  let card: Declaration | null = null;
  if (el && $('[data-face="a"]', el) && $('[data-face="b"]', el)) {
    card = new Declaration(ctx, el, $('#decl-stage') ?? $('#decl-slot'));
    card.build();
    cleanups.push(ctx.on('resize', () => card?.build()));
    const onVis = () => {
      if (!card?.tl || !card.st) return;
      if (document.hidden) card.tl.pause();
      else if (card.st.isActive) card.tl.play();
    };
    document.addEventListener('visibilitychange', onVis);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVis));
  }
  return {
    destroy() {
      cleanups.splice(0).forEach((f) => f());
      card?.destroy();
    },
  };
}
