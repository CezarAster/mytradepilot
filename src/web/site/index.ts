// Boot: the motion gate, the fonts race, the always-on modules, and the lazy section modules (build spec 7.4, 8.2).
import { bindSampleNumbers, getSample } from './sample.ts';
import type { Mounted, SiteCtx } from './motion.ts';

declare global {
  interface Window {
    __booted: boolean;
  }
}

const html = document.documentElement;

/** Everything a module animates with inline styles; cleared when motion fails so nothing stays invisible (build notes). */
export const FALLBACK_SELECTORS =
  '[data-reveal],[data-hero],[data-split],.pf-row,.pf-row .tick,.pf-stamp,.pf-face,.pf-say,.milestone,#declaration,#decl-slot,#decl-stage,' +
  '#story-rule,#story-held,#story-held .held-row,#story-held .held-status,#story-held .held-link,#story-push,#story-clock';

function revealAllFallback(): void {
  html.classList.remove('motion');
  html.classList.remove('pilot-on');
  document.querySelectorAll<HTMLElement>(FALLBACK_SELECTORS).forEach((el) => {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.transform = '';
    el.style.height = '';
    el.style.minHeight = '';
  });
}
window.addEventListener('error', () => {
  if (!window.__booted) revealAllFallback();
});

type Section = { selector: string; load: () => Promise<{ mount: (ctx: SiteCtx) => Mounted }> };
const SECTIONS: Section[] = [
  { selector: '#story', load: () => import('./story.ts') },
  { selector: '#features', load: () => import('./tiles.ts') },
  { selector: '#shrink-lab', load: () => import('./labs.ts') },
  { selector: '#rulebook', load: () => import('./declaration.ts') },
  { selector: '#roadmap', load: () => import('./roadmap.ts') },
];

function lazySections(c: SiteCtx): void {
  const pending = new Map<Element, Section>();
  for (const s of SECTIONS) {
    const el = document.querySelector(s.selector);
    if (el) pending.set(el, s);
  }
  const load = (el: Element) => {
    const s = pending.get(el);
    if (!s) return;
    pending.delete(el);
    s.load()
      .then((m) => c.mounted.push(m.mount(c)))
      .catch((e) => console.error(`site: ${s.selector} failed to mount`, e));
  };
  if (!('IntersectionObserver' in window)) {
    pending.forEach((_, el) => load(el));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          io.unobserve(en.target);
          load(en.target);
        }
      }
    },
    { rootMargin: '150% 0px' },
  );
  pending.forEach((_, el) => io.observe(el));
}

async function boot(): Promise<void> {
  const sample = getSample();
  sample.catch(() => {
    /* every consumer has its own static fallback */
  });
  const reduced = !html.classList.contains('motion');
  const [motion, nav, reportMotion, river, pilot] = await Promise.all([import('./motion.ts'), import('./nav.ts'), import('./reportMotion.ts'), import('./river.ts'), import('./pilot.ts')]);
  const c = motion.createCtx(reduced, sample);
  try {
    c.mounted.push(nav.mount(c));
    c.mounted.push(reportMotion.mount(c));
    c.mounted.push(river.mount(c));
    c.mounted.push(pilot.mount(c));
    if (!reduced) {
      motion.mountHero(c);
      motion.mountSplits(c);
      motion.mountReveals(c);
      motion.mountCounts(c);
    }
    sample.then((data) => bindSampleNumbers(document, data)).catch(() => {});
    lazySections(c);
    window.__booted = true;
    if (!reduced) requestAnimationFrame(() => c.ScrollTrigger.refresh());
  } catch (e) {
    window.__booted = true;
    motion.revealAll();
    throw e;
  }
}

const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]).then(boot, boot).catch((e) => {
  revealAllFallback();
  console.error('site: boot failed', e);
});
