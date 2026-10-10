// Small DOM and number helpers shared by the site modules. No gsap here, so the
// reduced-motion path never pulls the motion vendor chunk in.

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T | null => root.querySelector(sel) as T | null;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] => Array.from(root.querySelectorAll(sel)) as T[];
export const byId = <T extends HTMLElement = HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

export const isMobile = (): boolean => window.innerWidth <= 768;
export const finePointer = (): boolean => {
  try {
    return matchMedia('(pointer: fine)').matches;
  } catch {
    return false;
  }
};
export const navH = (): number => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 64;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeInOutQuad = (p: number): number => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let t = 0;
  return (...args: A) => {
    clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

/** Marketing copy uses U+2212 for minus; the report keeps what format.ts prints. */
export const MINUS = '−';
export const typographic = (s: string): string => s.replace(/-(?=[\d$])/g, MINUS);
export const fmtUsd = (v: number): string => {
  const a = Math.abs(Math.round(v)).toLocaleString('en-US');
  return (v < 0 ? `${MINUS}$` : '$') + a;
};
export const fmtPct = (v: number, digits = 2): string => (v > 0 ? '+' : v < 0 ? MINUS : '') + Math.abs(v).toFixed(digits) + '%';

/** mulberry32: a seeded PRNG so the hero choreography is identical on every load. */
export function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const idle = (cb: () => void): void => {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
  if (typeof ric === 'function') ric(cb);
  else setTimeout(cb, 200);
};

/** Puts the page in its static final state: used when the motion system fails or is switched off. */
export function revealAll(): void {
  const html = document.documentElement;
  html.classList.remove('motion', 'pilot-on');
  for (const el of $$<HTMLElement>('[data-reveal],[data-hero],[data-split]')) {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.transform = '';
  }
  for (const el of $$<HTMLElement>('.pf-row,.pf-row .tick,.pf-verdict,.pf-face,.milestone,#preflight-roadmap,#pf-slot,.story-steps,.step')) {
    el.style.opacity = '';
    el.style.transform = '';
    el.style.height = '';
    el.style.minHeight = '';
  }
  byId('signup-btn')?.classList.add('landed');
}

/** Dispatches a page-level event the site modules use to talk to each other. */
export function emit<T>(name: string, detail?: T): void {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}
export function on<T = unknown>(name: string, cb: (detail: T) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<T>).detail);
  document.addEventListener(name, h);
  return () => document.removeEventListener(name, h);
}
