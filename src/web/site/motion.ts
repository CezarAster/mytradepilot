// GSAP + ScrollTrigger + SplitText registration, Lenis on the GSAP ticker, the shared site context,
// reveal/split/count utilities, the debounced refresh, and enable()/disable() (build spec 7.4, 8.3, 8.4).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import type { SampleData } from './sample.ts';

export interface Mounted {
  destroy(): void;
}

export type SiteEvent = 'resize' | 'refresh' | 'river:done' | 'report' | 'signup:done' | 'disable';

export interface RiverHandle {
  replay(): void;
  drawStatic(): void;
  layout(): void;
  setPilot(on: boolean): void;
  hasCurve(): boolean;
  kick(): void;
}

export interface PilotHandle {
  setActive(on: boolean): void;
  measure(): void;
  update(): void;
  active(): boolean;
}

export interface StoryHandle {
  setStatic(): void;
}

export interface SiteCtx {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  SplitText: typeof SplitText;
  lenis: Lenis | null;
  reduced: boolean;
  fine: boolean;
  sample: Promise<SampleData>;
  isMobile(): boolean;
  navH(): number;
  refresh(): void;
  scrollTo(target: string | Element, offset?: number, duration?: number): void;
  on(event: SiteEvent, fn: (detail?: unknown) => void): () => void;
  emit(event: SiteEvent, detail?: unknown): void;
  splits: SplitText[];
  mounted: Mounted[];
  river: RiverHandle | null;
  pilot: PilotHandle | null;
  story: StoryHandle | null;
}

const html = document.documentElement;
export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => Array.from(root.querySelectorAll<T>(sel));
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const debounce = (fn: () => void, ms: number) => {
  let t = 0;
  return () => {
    clearTimeout(t);
    t = window.setTimeout(fn, ms);
  };
};

let registered = false;

/** Cancels any native smooth scroll, syncs Lenis to the real position, then animates to y. */
export function lenisScrollTo(lenis: Lenis, y: number, duration: number): void {
  const cur = window.scrollY;
  window.scrollTo({ top: cur, behavior: 'instant' as ScrollBehavior });
  if (Math.abs(lenis.animatedScroll - cur) > 1) lenis.scrollTo(cur, { immediate: true, force: true });
  lenis.scrollTo(y, { duration, force: true });
}

export function createCtx(reduced: boolean, sample: Promise<SampleData>): SiteCtx {
  if (!reduced && !registered) {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    gsap.defaults({ ease: 'expo.out', duration: 0.7 });
    ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true });
    registered = true;
  }
  const listeners = new Map<SiteEvent, Set<(d?: unknown) => void>>();
  const navEl = $('.nav');
  const onScrollNav = (y: number) => navEl?.classList.toggle('is-scrolled', y > 40);
  let fine = false;
  try {
    fine = matchMedia('(pointer: fine)').matches;
  } catch {
    /* no matchMedia */
  }

  let lenis: Lenis | null = null;
  if (!reduced) {
    try {
      lenis = new Lenis({ lerp: 0.1, autoRaf: false });
      lenis.on('scroll', (e: { scroll?: number }) => {
        ScrollTrigger.update();
        onScrollNav(e && typeof e.scroll === 'number' ? e.scroll : window.scrollY);
      });
      gsap.ticker.add((time) => lenis!.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } catch {
      lenis = null;
    }
  }
  if (!lenis) window.addEventListener('scroll', () => onScrollNav(window.scrollY), { passive: true });
  onScrollNav(window.scrollY);

  const ctx: SiteCtx = {
    gsap,
    ScrollTrigger,
    SplitText,
    lenis,
    reduced,
    fine,
    sample,
    isMobile: () => window.innerWidth <= 768,
    navH: () => parseFloat(getComputedStyle(html).getPropertyValue('--nav-h')) || 64,
    refresh: debounce(() => {
      if (!ctx.reduced) ScrollTrigger.refresh();
      ctx.emit('refresh');
    }, 100),
    scrollTo(target, offset = 0, duration = 1.1) {
      const el = typeof target === 'string' ? $(target) : target;
      if (!el) return;
      const top = target === '#top' || el === navEl;
      // Document coordinates read in this frame, so an in-flight native smooth scroll cannot skew the target.
      const y = top ? 0 : Math.max(0, el.getBoundingClientRect().top + window.scrollY + offset);
      if (ctx.lenis && !ctx.reduced) lenisScrollTo(ctx.lenis, y, duration);
      else window.scrollTo({ top: y, behavior: 'auto' });
    },
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, (set = new Set()));
      set.add(fn);
      return () => set!.delete(fn);
    },
    emit(event, detail) {
      listeners.get(event)?.forEach((fn) => fn(detail));
    },
    splits: [],
    mounted: [],
    river: null,
    pilot: null,
    story: null,
  };

  // Window resize: modules re-lay out in registration order (river, story, declaration card), then one refresh.
  window.addEventListener(
    'resize',
    debounce(() => {
      ctx.emit('resize');
      ctx.refresh();
    }, 200),
  );
  window.addEventListener('orientationchange', () => ctx.refresh());
  document.fonts?.ready.then(() => ctx.refresh());
  return ctx;
}

/* ---------- hero load choreography (spec 4, rows 1–7) ---------- */

export function mountHero(ctx: SiteCtx): void {
  if (ctx.reduced) return;
  const g = ctx.gsap;
  const h1 = $('[data-hero-split]');
  const tl = g.timeline({ defaults: { ease: 'expo.out' } });
  const nav = $('.nav');
  if (nav) tl.fromTo(nav, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.5, clearProps: 'transform' }, 0.1);
  const eyebrow = $('.hero-text .eyebrow');
  if (eyebrow) tl.fromTo(eyebrow, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 }, 0.1);
  if (h1) {
    try {
      const split = ctx.SplitText.create(h1, { type: 'words', mask: 'words' });
      ctx.splits.push(split);
      g.set(h1, { visibility: 'visible' });
      tl.from(
        split.words,
        {
          yPercent: 100,
          duration: 0.9,
          ease: 'power4.out',
          stagger: 0.045,
          onComplete: () => {
            split.revert();
            ctx.splits = ctx.splits.filter((s) => s !== split);
          },
        },
        0.2,
      );
    } catch {
      tl.fromTo(h1, { opacity: 0, y: 20, visibility: 'visible' }, { opacity: 1, y: 0, visibility: 'visible', duration: 0.9 }, 0.2);
    }
  }
  const rest = ['.hero-text .lede', '.hero-ctas'].map((s) => $(s)).filter((el): el is HTMLElement => !!el);
  if (rest.length) tl.fromTo(rest, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06 }, 0.5);
  const console_ = $('#input');
  if (console_) tl.fromTo(console_, { opacity: 0, scale: 0.98, filter: 'blur(8px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out', clearProps: 'filter,transform' }, 0.55);
  const card = $('#file-card');
  const hero = $('#hero');
  if (card && hero) {
    const float = g.to(card, { y: 3, duration: 2, ease: 'sine.inOut', yoyo: true, repeat: -1, paused: true });
    ScrollTrigger.create({ trigger: hero, start: 'top bottom', end: 'bottom top', onToggle: (st) => (st.isActive && !document.hidden ? float.play() : float.pause()) });
    document.addEventListener('visibilitychange', () => (document.hidden ? float.pause() : float.play()));
  }
}

/* ---------- reveal / split / count (spec 4, rows 22–24, 57) ---------- */

export function mountReveals(ctx: SiteCtx, root: ParentNode = document): void {
  if (ctx.reduced) return;
  $$('[data-reveal]:not([data-revealed])', root).forEach((el) => {
    el.setAttribute('data-revealed', '');
    const delay = parseFloat(el.getAttribute('data-reveal-delay') || '0');
    ctx.gsap.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, delay, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });
}

export function mountSplits(ctx: SiteCtx, root: ParentNode = document): void {
  if (ctx.reduced) return;
  $$('[data-split]:not([data-hero-split]):not([data-splitted])', root).forEach((el) => {
    el.setAttribute('data-splitted', '');
    try {
      const sp = ctx.SplitText.create(el, { type: 'lines', mask: 'lines' });
      ctx.splits.push(sp);
      ctx.gsap.set(el, { visibility: 'visible' });
      ctx.gsap.from(sp.lines, {
        yPercent: 110,
        opacity: 0,
        duration: 0.9,
        stagger: 0.07,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onComplete: () => {
          sp.revert();
          ctx.splits = ctx.splits.filter((s) => s !== sp);
        },
      });
    } catch {
      ctx.gsap.set(el, { visibility: 'visible' });
    }
  });
}

/** Count-up parser (spec 6.7): anything it cannot parse is left alone. */
const NUM_RE = /^([+\-−])?(\$)?([\d,]+)(?:\.(\d+))?(k|M|%)?$/;

export interface NumberShape {
  value: number;
  sign: string;
  dollar: boolean;
  decimals: number;
  comma: boolean;
  suffix: string;
}

export function parseNumber(text: string): NumberShape | null {
  const m = NUM_RE.exec(text.trim());
  if (!m) return null;
  const digits = m[3].replace(/,/g, '');
  const value = Number(digits + (m[4] ? `.${m[4]}` : ''));
  if (!Number.isFinite(value)) return null;
  const neg = m[1] === '-' || m[1] === '−';
  return { value: neg ? -value : value, sign: m[1] ?? '', dollar: !!m[2], decimals: m[4] ? m[4].length : 0, comma: m[3].includes(','), suffix: m[5] ?? '' };
}

export function formatLike(shape: NumberShape, v: number): string {
  const abs = Math.abs(v);
  let s = abs.toFixed(shape.decimals);
  if (shape.comma) {
    const [i, d] = s.split('.');
    s = Number(i).toLocaleString('en-US') + (d ? `.${d}` : '');
  }
  const sign = v < 0 ? (shape.sign === '−' ? '−' : '-') : shape.sign === '+' ? '+' : '';
  return `${sign}${shape.dollar ? '$' : ''}${s}${shape.suffix}`;
}

export function countUp(ctx: SiteCtx, el: HTMLElement, opts: { from?: number; duration?: number; ease?: string; snap?: number; trigger?: boolean; start?: string } = {}): void {
  const original = (el.textContent ?? '').trim();
  const shape = parseNumber(original);
  if (!shape || ctx.reduced) return;
  // The final string is kept on the element so a later sample binding can replace it without fighting the tween.
  el.dataset.countFinal = original;
  const o = { v: opts.from ?? 0 };
  const update = () => {
    el.textContent = formatLike(shape, o.v);
  };
  update();
  ctx.gsap.to(o, {
    v: shape.value,
    duration: opts.duration ?? 1.1,
    ease: opts.ease ?? 'power2.out',
    snap: opts.snap ? { v: opts.snap } : undefined,
    onUpdate: update,
    onComplete: () => {
      el.textContent = el.dataset.countFinal ?? original;
      delete el.dataset.countFinal;
    },
    scrollTrigger: opts.trigger === false ? undefined : { trigger: el, start: opts.start ?? 'top 88%', once: true },
  });
}

export function mountCounts(ctx: SiteCtx, root: ParentNode = document): void {
  if (ctx.reduced) return;
  $$('[data-counter]:not([data-counted])', root).forEach((el) => {
    el.setAttribute('data-counted', '');
    countUp(ctx, el, { duration: 1.4, ease: 'power3.out' });
  });
  $$('[data-count]:not([data-counted])', root).forEach((el) => {
    el.setAttribute('data-counted', '');
    const from = el.getAttribute('data-count-from');
    countUp(ctx, el, { from: from ? parseFloat(from) : 0, duration: 1.1, ease: 'power2.out' });
  });
}

/* ---------- reduced-motion switch (spec 8.4) ---------- */

export function revealAll(): void {
  html.classList.remove('motion');
  html.classList.remove('pilot-on');
  $$('[data-reveal],[data-hero],[data-split]').forEach((el) => {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.transform = '';
  });
  $$(
    '.pf-row,.pf-row .tick,.pf-stamp,.pf-face,.pf-say,.milestone,#declaration,#decl-slot,#decl-stage,' +
      '#story-held,#story-held .held-row,#story-held .held-status,#story-held .held-link,#story-push,#story-clock,' +
      '.stat,.insight,.draft,.conf,.barcell .bar,#report-bar,#report-followup',
  ).forEach((el) => {
    el.style.opacity = '';
    el.style.transform = '';
    el.style.height = '';
    el.style.minHeight = '';
  });
}

/** Turns the motion system off in place: the page ends in the reduced-motion state without a reload. */
export function disable(ctx: SiteCtx): void {
  if (ctx.reduced) return;
  ctx.reduced = true;
  ctx.ScrollTrigger.getAll().forEach((t) => t.kill());
  ctx.mounted.splice(0).forEach((m) => {
    try {
      m.destroy();
    } catch {
      /* a module that fails to tear down must not block the switch */
    }
  });
  ctx.splits.splice(0).forEach((s) => s.revert());
  ctx.gsap.globalTimeline.clear();
  ctx.lenis?.destroy();
  ctx.lenis = null;
  // Lenis re-adds its state classes from a pending velocity timeout after destroy(); sweep them twice.
  const sweep = () => Array.from(html.classList).forEach((c) => (c === 'lenis' || c.startsWith('lenis-')) && html.classList.remove(c));
  sweep();
  setTimeout(sweep, 600);
  window.addEventListener('scroll', () => $('.nav')?.classList.toggle('is-scrolled', window.scrollY > 40), { passive: true });
  revealAll();
  ctx.river?.drawStatic();
  ctx.story?.setStatic();
  $('#signup-btn')?.classList.add('landed');
  ctx.emit('disable');
}
