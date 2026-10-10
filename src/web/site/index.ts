// Site boot. main.ts (the analyzer) has already run: this file only adds the marketing page's
// behaviour. It waits for the fonts (≤ 900 ms), loads the motion system when html.motion is set,
// mounts the always-on modules and lazy-loads each section's module as it comes within 150% of
// the viewport. Anything that throws leaves the page in its static, fully readable state.
import { bindSampleNumbers, getSample } from './sample.ts';
import type { MotionKit, Mounted, SiteCtx } from './types.ts';
import { $, byId, debounce, emit, isMobile, revealAll } from './util.ts';

declare global {
  interface Window {
    __booted: boolean;
  }
}

const html = document.documentElement;
window.addEventListener('error', () => {
  if (!window.__booted) revealAll();
});

// The sample fetch starts at idle, right away; every set-piece shares this promise.
const sample = getSample();
sample.then((data) => bindSampleNumbers(document, data)).catch(() => undefined);

type Loader = () => Promise<{ mount: (ctx: SiteCtx) => Mounted }>;

async function boot(): Promise<void> {
  let kit: MotionKit | null = null;
  if (html.classList.contains('motion')) {
    try {
      kit = (await import('./motion.ts')).createKit();
    } catch (e) {
      console.error(e);
      revealAll();
    }
  }
  const ctx: SiteCtx = { kit, gsap: kit?.gsap ?? null, ScrollTrigger: kit?.ScrollTrigger ?? null, lenis: kit?.lenis ?? null, reduced: !kit, sample };

  const mount = async (load: Loader): Promise<Mounted | null> => {
    try {
      const m = (await load()).mount(ctx);
      kit?.register(m);
      return m;
    } catch (e) {
      console.error(e);
      return null;
    }
  };
  const lazy = (selector: string, load: Loader) => {
    const el = $(selector);
    if (!el) return;
    if (!('IntersectionObserver' in window)) {
      void mount(load).then(() => kit?.refresh());
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        void mount(load).then(() => kit?.refresh());
      },
      { rootMargin: '150% 0px' },
    );
    io.observe(el);
  };

  const base = await import('./base.ts');
  for (const m of [base.nav, base.reportMotion, base.river]) {
    try {
      kit?.register(m.mount(ctx));
    } catch (e) {
      console.error(e);
    }
  }
  if (kit && !isMobile()) {
    try {
      kit.register(base.pilot.mount(ctx));
    } catch (e) {
      console.error(e);
    }
  } else {
    byId('signup-btn')?.classList.add('landed');
  }
  if (kit) {
    kit.split();
    kit.reveal();
    kit.count();
  }

  lazy('#story', () => import('./story.ts'));
  lazy('#shrink-lab', () => import('./labs.ts'));
  if (kit) {
    lazy('#features', () => import('./tiles.ts'));
    lazy('#roadmap', () => import('./preflight.ts'));
  }

  window.addEventListener(
    'resize',
    debounce(() => {
      emit('site:resize');
      kit?.refresh();
    }, 200),
  );

  window.__booted = true;
  if (kit) requestAnimationFrame(() => kit?.ScrollTrigger.refresh());
}

const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 900))]).then(
  () => boot(),
  () => boot(),
);
