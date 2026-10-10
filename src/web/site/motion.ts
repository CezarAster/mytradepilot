// The motion system: gsap + ScrollTrigger + SplitText registration, Lenis on the gsap ticker, the
// reveal/split/count utilities, the module registry, resize/refresh plumbing and enable()/disable().
// Under reduced motion (no html.motion) it still boots the interactive parts (nav, dock, tabs,
// toggle, report follow-up) but creates no Lenis, no ScrollTrigger and no SplitText.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { getSample, bindSampleNumbers, type SampleData } from './sample.ts';
import type { River } from './river.ts';
import type { Pilot } from './pilot.ts';

export interface Ctx {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  lenis: Lenis | null;
  /** Live: flips to true when the footer toggle or the OS setting turns motion off. */
  reduced: boolean;
  sample: Promise<SampleData>;
  /** Set once the hero has loaded: nav.ts replays the rain after a pick/drop. */
  river: River | null;
  pilot: Pilot | null;
}

export interface Module {
  destroy(): void;
}

export const html = document.documentElement;
export const isMobile = (): boolean => window.innerWidth <= 768;
export const fine = (): boolean => {
  try {
    return matchMedia('(pointer:fine)').matches;
  } catch {
    return false;
  }
};
export const navH = (): number => parseFloat(getComputedStyle(html).getPropertyValue('--nav-h')) || 64;
export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const debounce = <A extends unknown[]>(fn: (...a: A) => void, ms: number) => {
  let t = 0;
  return (...a: A) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...a), ms);
  };
};

export const ctx: Ctx = { gsap, ScrollTrigger, lenis: null, reduced: !html.classList.contains('motion'), sample: null as unknown as Promise<SampleData>, river: null, pilot: null };

const modules: Module[] = [];
export const register = <M extends Module>(m: M): M => {
  modules.push(m);
  return m;
};
export const splits: SplitText[] = [];

/** ScrollTrigger.refresh, debounced 100 ms, no-op without motion. */
export const refresh = debounce(() => {
  if (!ctx.reduced) ScrollTrigger.refresh();
}, 100);

/** Scrolls to an element (or '#id') with Lenis, or natively under reduced motion. */
export function scrollToEl(target: string | Element | null, offset = 0): void {
  const el = typeof target === 'string' ? document.querySelector(target) : target;
  if (!el) return;
  const y = target === '#top' || el.id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY + offset;
  if (ctx.lenis && !ctx.reduced) ctx.lenis.scrollTo(Math.max(0, y), { duration: 1.1 });
  else window.scrollTo(0, Math.max(0, y));
}

// ---------- numbers: one parser for the report values, the hero counters and every data-count ----------
const NUM_RE = /^([+\-−])?(\$)?([\d,]+)(?:\.(\d+))?(k|M|%)?$/;

export interface ParsedNumber {
  value: number;
  format: (v: number) => string;
}

/** Parses "+37.3%", "-$1,686", "$12.3k", "1.45"; returns null when the text is not a plain number. */
export function parseNumber(text: string): ParsedNumber | null {
  const m = NUM_RE.exec(text.trim());
  if (!m) return null;
  const sign = m[1] ?? '';
  const dollar = m[2] ?? '';
  const int = m[3];
  const dec = m[4] ?? '';
  const suffix = m[5] ?? '';
  const comma = int.includes(',');
  const value = Number(int.replace(/,/g, '')) + (dec ? Number(`0.${dec}`) : 0);
  const decimals = dec.length;
  return {
    value,
    format: (v) => {
      let s = Math.abs(v).toFixed(decimals);
      if (comma) {
        const [i, d] = s.split('.');
        s = Number(i).toLocaleString('en-US') + (d ? `.${d}` : '');
      }
      return `${sign}${dollar}${s}${suffix}`;
    },
  };
}

export interface CountOptions {
  duration: number;
  ease: string;
  from?: number;
  delay?: number;
  snap?: number;
  trigger?: ScrollTrigger.Vars;
}

/** Counts an element's own text up from `from` (default 0) and ends on the exact original string. */
export function countUp(el: HTMLElement, opts: CountOptions): gsap.core.Tween | null {
  const original = (el.textContent ?? '').trim();
  const parsed = parseNumber(original);
  if (!parsed || ctx.reduced) return null;
  const o = { v: opts.from ?? 0 };
  el.textContent = parsed.format(o.v);
  return gsap.to(o, {
    v: parsed.value,
    duration: opts.duration,
    ease: opts.ease,
    delay: opts.delay ?? 0,
    snap: opts.snap ? { v: opts.snap } : undefined,
    onUpdate: () => {
      el.textContent = parsed.format(o.v);
    },
    onComplete: () => {
      el.textContent = original;
    },
    scrollTrigger: opts.trigger,
  });
}

/** [data-reveal]: opacity 0, y 18 → 0, 0.7 s expo.out, once, start 'top 92%', optional data-reveal-delay. */
export function reveal(root: ParentNode = document): void {
  if (ctx.reduced) return;
  root.querySelectorAll<HTMLElement>('[data-reveal]:not([data-revealed])').forEach((el) => {
    el.dataset.revealed = '';
    const d = parseFloat(el.dataset.revealDelay ?? '0') || 0;
    gsap.fromTo(el, { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.7, delay: d, ease: 'expo.out', clearProps: 'transform', scrollTrigger: { trigger: el, start: 'top 92%', once: true } });
  });
}

/** [data-split] (not the hero h1): lines in masks rising 110%, once, reverted on complete. */
export function split(root: ParentNode = document): void {
  if (ctx.reduced) return;
  root.querySelectorAll<HTMLElement>('[data-split]:not([data-hero-split]):not([data-splitted])').forEach((el) => {
    el.dataset.splitted = '';
    try {
      const sp = SplitText.create(el, { type: 'lines', mask: 'lines' });
      splits.push(sp);
      gsap.set(el, { visibility: 'visible' });
      gsap.from(sp.lines, {
        yPercent: 110,
        opacity: 0,
        duration: 0.9,
        stagger: 0.07,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        onComplete: () => {
          sp.revert();
          const i = splits.indexOf(sp);
          if (i >= 0) splits.splice(i, 1);
        },
      });
    } catch {
      gsap.set(el, { visibility: 'visible' });
    }
  });
}

/** The hero counters (1.4 s power3.out) and every other [data-count] (1.1 s power2.out, optional data-count-from). */
export function counters(root: ParentNode = document): void {
  if (ctx.reduced) return;
  root.querySelectorAll<HTMLElement>('[data-counter]:not([data-counted])').forEach((el) => {
    el.dataset.counted = '';
    countUp(el, { duration: 1.4, ease: 'power3.out', trigger: { trigger: el, start: 'top 88%', once: true } });
  });
  root.querySelectorAll<HTMLElement>('[data-count]:not([data-counted])').forEach((el) => {
    el.dataset.counted = '';
    const from = el.dataset.countFrom ? parseNumber(el.dataset.countFrom)?.value : undefined;
    countUp(el, { duration: 1.1, ease: 'power2.out', from, trigger: { trigger: el, start: 'top 88%', once: true } });
  });
}

// ---------- lazy section modules ----------
type Loader = () => Promise<{ mount(c: Ctx): Module }>;
const lazyIO: IntersectionObserver[] = [];
function lazy(selector: string, load: Loader): void {
  const el = document.querySelector(selector);
  if (!el) return;
  const go = () => load().then((m) => register(m.mount(ctx))).catch((e) => console.error(e));
  if (!('IntersectionObserver' in window)) {
    go();
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        go();
      }
    },
    { rootMargin: '150% 0px 150% 0px' },
  );
  io.observe(el);
  lazyIO.push(io);
}

let revealAllFn: () => void = () => {};
let navModule: typeof import('./nav.ts') | null = null;

/** Turns motion off live: kills everything and leaves the page in the reduced-motion state. */
export function disable(): void {
  if (ctx.reduced) return;
  ctx.reduced = true;
  ScrollTrigger.getAll().forEach((t) => t.kill());
  modules.forEach((m) => m.destroy());
  splits.splice(0).forEach((s) => s.revert());
  gsap.globalTimeline.clear();
  ctx.lenis?.destroy();
  ctx.lenis = null;
  const lenisClasses = ['lenis', 'lenis-smooth', 'lenis-scrolling', 'lenis-stopped', 'lenis-autoToggle'];
  html.classList.remove('motion', 'pilot-on', ...lenisClasses);
  requestAnimationFrame(() => html.classList.remove(...lenisClasses));
  revealAllFn();
  html.classList.remove('motion-failed');
  window.addEventListener('scroll', onNativeScroll, { passive: true });
  onNativeScroll();
  document.getElementById('signup-btn')?.classList.add('landed');
}

const onNativeScroll = () => navModule?.onScroll(window.scrollY);

export async function boot(opts: { revealAll: () => void }): Promise<void> {
  revealAllFn = opts.revealAll;
  // The gate may have timed out while this chunk loaded: trust the class, not the earlier read.
  ctx.reduced = !html.classList.contains('motion');
  ctx.sample = getSample();
  ctx.sample.then((data) => bindSampleNumbers(document, data)).catch(() => {});

  gsap.config({ nullTargetWarn: false });
  if (!ctx.reduced) {
    gsap.registerPlugin(ScrollTrigger, SplitText);
    gsap.defaults({ ease: 'expo.out', duration: 0.7 });
    ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true });
    try {
      const lenis = new Lenis({ lerp: 0.1, autoRaf: false });
      ctx.lenis = lenis;
      lenis.on('scroll', (e: { scroll: number }) => {
        ScrollTrigger.update();
        navModule?.onScroll(e.scroll ?? window.scrollY);
      });
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } catch {
      ctx.lenis = null;
    }
  }
  if (!ctx.lenis) window.addEventListener('scroll', onNativeScroll, { passive: true });

  const [nav, reportMotion, river, pilot] = await Promise.all([import('./nav.ts'), import('./reportMotion.ts'), import('./river.ts'), import('./pilot.ts')]);
  navModule = nav;
  register(nav.mount(ctx));
  onNativeScroll();
  const riverMod = register(river.mount(ctx));
  ctx.river = riverMod.river;
  const pilotMod = register(pilot.mount(ctx));
  ctx.pilot = pilotMod.pilot;
  register(reportMotion.mount(ctx));

  if (!ctx.reduced) {
    // hero load choreography (row 1-6); the river started at t = 0 on its own
    const h1 = document.querySelector<HTMLElement>('[data-hero-split]');
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo('.nav', { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.5, clearProps: 'transform' }, 0.1);
    tl.fromTo('.hero-text .eyebrow', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 }, 0.1);
    if (h1) {
      try {
        const sp = SplitText.create(h1, { type: 'words', mask: 'words' });
        splits.push(sp);
        gsap.set(h1, { visibility: 'visible' });
        tl.from(
          sp.words,
          {
            yPercent: 100,
            duration: 0.9,
            ease: 'power4.out',
            stagger: 0.045,
            onComplete: () => {
              sp.revert();
              const i = splits.indexOf(sp);
              if (i >= 0) splits.splice(i, 1);
            },
          },
          0.2,
        );
      } catch {
        tl.fromTo(h1, { opacity: 0, y: 20, visibility: 'visible' }, { opacity: 1, y: 0, visibility: 'visible', duration: 0.9 }, 0.2);
      }
    }
    tl.fromTo(['.hero-text .lede', '.hero-ctas'], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06 }, 0.5);
    tl.fromTo('#input', { opacity: 0, scale: 0.98, filter: 'blur(8px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out', clearProps: 'filter,transform' }, 0.55);
    const float = gsap.to('#file-card', { y: 3, duration: 2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    const heroIO = new IntersectionObserver((en) => (en[0].isIntersecting ? float.play() : float.pause()), { threshold: 0 });
    heroIO.observe(document.getElementById('hero')!);

    split();
    reveal();
    counters();
    lazy('#features', () => import('./tiles.ts'));
    lazy('#roadmap', () => import('./preflight.ts'));
  }
  lazy('#story', () => import('./story.ts'));
  lazy('#shrink-lab', () => import('./labs.ts'));

  // refresh plumbing (gotcha 4)
  document.fonts?.ready.then(() => refresh());
  window.addEventListener('orientationchange', () => refresh());
  window.addEventListener(
    'resize',
    debounce(() => {
      window.dispatchEvent(new CustomEvent('site:relayout'));
      refresh();
    }, 200),
  );
  document.addEventListener('visibilitychange', () => {
    if (ctx.reduced) return;
    if (document.hidden) gsap.globalTimeline.pause();
    else gsap.globalTimeline.resume();
  });

  // the OS setting flipping to reduce turns motion off live (no store)
  try {
    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', () => {
      if (mq.matches) disable();
    });
  } catch {
    /* no matchMedia */
  }
  if (!ctx.reduced) requestAnimationFrame(() => ScrollTrigger.refresh());
}
