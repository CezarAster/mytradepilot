// Roadmap (6.3): the scrubbed line fill, the milestones popping once, and the pre-trade check card that
// ticks in the ORBX short, stamps the red verdict, flips to the LUMN long and back, looping only while
// on screen. The slot keeps the taller face's height so nothing below the card moves during the flip.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { Ctx, Module } from './motion.ts';

const $$ = <T extends Element>(sel: string, root: ParentNode) => [...root.querySelectorAll<T>(sel)];

export class Preflight {
  el: HTMLElement;
  slot: HTMLElement | null;
  tl: gsap.core.Timeline | null = null;
  st: ScrollTrigger | null = null;
  faceA: HTMLElement;
  faceB: HTMLElement;
  rowsA: HTMLElement[];
  rowsB: HTMLElement[];
  ticksA: HTMLElement[];
  ticksB: HTMLElement[];
  verA: HTMLElement;
  verB: HTMLElement;

  constructor(el: HTMLElement, slot: HTMLElement | null) {
    this.el = el;
    this.slot = slot;
    this.faceA = el.querySelector<HTMLElement>('[data-face="a"]')!;
    this.faceB = el.querySelector<HTMLElement>('[data-face="b"]')!;
    this.rowsA = $$('.pf-row', this.faceA);
    this.rowsB = $$('.pf-row', this.faceB);
    this.ticksA = $$('.tick', this.faceA);
    this.ticksB = $$('.tick', this.faceB);
    this.verA = this.faceA.querySelector<HTMLElement>('.pf-verdict')!;
    this.verB = this.faceB.querySelector<HTMLElement>('.pf-verdict')!;
  }

  build(): void {
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
    if (this.slot) {
      // the slot also holds the note under the card: keep its total height at the taller face's
      this.slot.style.minHeight = '';
      const extra = Math.max(0, this.slot.offsetHeight - el.offsetHeight);
      this.slot.style.minHeight = `${Math.max(hA, hB) + extra}px`;
    }
    const allRows = [...this.rowsA, ...this.rowsB];
    const allTicks = [...this.ticksA, ...this.ticksB];
    const verdicts = [this.verA, this.verB];
    gsap.set(allRows, { opacity: 0, x: -6 });
    gsap.set(allTicks, { scale: 0, transformOrigin: 'center' });
    gsap.set(verdicts, { opacity: 0, scale: 1.18 });
    gsap.set(this.faceB, { opacity: 0 });
    gsap.set(this.faceA, { opacity: 1 });
    const tl = (this.tl = gsap.timeline({ paused: true, repeat: -1 }));
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
    this.st = ScrollTrigger.create({ trigger: el, start: 'top 85%', end: 'bottom 0%', onToggle: (st) => (st.isActive ? tl.play() : tl.pause()) });
    if (prog) tl.progress(prog);
    if (playing) tl.play();
  }

  destroy(): void {
    this.tl?.kill();
    this.st?.kill();
    this.tl = null;
    this.st = null;
    [...this.rowsA, ...this.rowsB, ...this.ticksA, ...this.ticksB, this.verA, this.verB, this.faceA, this.faceB, this.el].forEach((n) => {
      n.style.opacity = '';
      n.style.transform = '';
      n.style.height = '';
    });
    if (this.slot) this.slot.style.minHeight = '';
  }
}

export function mount(ctx: Ctx): Module {
  if (ctx.reduced) return { destroy() {} };
  const card = document.getElementById('preflight-roadmap');
  const slot = document.getElementById('pf-slot');
  const line = gsap.to('#roadmap-line-fill', { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '#timeline', start: 'top 80%', end: 'bottom 30%', scrub: 0.4 } });
  const ms = gsap.from('[data-ms]', { scale: 0.9, opacity: 0, duration: 0.5, ease: 'back.out(1.4)', stagger: 0.1, clearProps: 'transform', scrollTrigger: { trigger: '#milestones', start: 'top 85%', once: true } });
  let pf: Preflight | null = null;
  if (card) {
    pf = new Preflight(card, slot);
    const build = () => pf?.build();
    // measure after the fonts settled, so hA/hB are the faces' real heights
    document.fonts?.ready.then(build).catch(build);
    build();
  }
  const relayout = () => pf?.build();
  window.addEventListener('site:relayout', relayout);
  return {
    destroy() {
      window.removeEventListener('site:relayout', relayout);
      line.kill();
      ms.kill();
      pf?.destroy();
      document.querySelectorAll<HTMLElement>('[data-ms]').forEach((m) => {
        m.style.opacity = '';
        m.style.transform = '';
      });
      const fill = document.getElementById('roadmap-line-fill');
      if (fill) fill.style.strokeDashoffset = '0';
    },
  };
}
