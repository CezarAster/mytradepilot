// The motion system: gsap + ScrollTrigger + SplitText registration, Lenis driven by the gsap
// ticker, the reveal/split/count utilities, the debounced refresh and the kill switch.
// Imported only when html.motion is set, so reduced motion never downloads this chunk.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import Lenis from 'lenis';
import { money, pct } from '../../core/format.ts';
import type { MotionKit, Mounted } from './types.ts';
import { $, $$, byId, finePointer, revealAll, typographic } from './util.ts';

function counterFormat(f: string | undefined, v: number): string {
  switch (f) {
    case 'int':
      return String(Math.round(v));
    case 'pct0':
    case 'pctInt':
      return `${Math.round(v)}%`;
    case 'pct':
      return typographic(pct(v));
    case 'pct1':
      return typographic(pct(v, 1));
    case 'money':
      return typographic(money(v));
    case 'dec2':
    case 'fixed2':
      return typographic(v.toFixed(2));
    default:
      return String(v);
  }
}

export function createKit(): MotionKit {
  gsap.registerPlugin(ScrollTrigger, SplitText);
  gsap.defaults({ ease: 'expo.out', duration: 0.7 });
  ScrollTrigger.config({ ignoreMobileResize: true, limitCallbacks: true });

  const scrollCbs: ((y: number) => void)[] = [];
  const mods: Mounted[] = [];
  const splits: SplitText[] = [];
  let lenis: Lenis | null = null;
  try {
    lenis = new Lenis({ lerp: 0.1, autoRaf: false });
    lenis.on('scroll', (l) => {
      ScrollTrigger.update();
      const y = typeof l?.scroll === 'number' ? l.scroll : window.scrollY;
      for (const cb of scrollCbs) cb(y);
    });
    gsap.ticker.add((time) => lenis?.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  } catch {
    lenis = null;
  }
  if (!lenis) window.addEventListener('scroll', () => scrollCbs.forEach((cb) => cb(window.scrollY)), { passive: true });

  let refreshTimer = 0;
  const refresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 100);
  };
  document.fonts?.ready.then(refresh);
  window.addEventListener('orientationchange', refresh);

  const kit: MotionKit = {
    gsap,
    ScrollTrigger,
    SplitText,
    lenis,
    splits,
    fine: finePointer(),
    reveal(root = document) {
      for (const el of $$<HTMLElement>('[data-reveal]', root)) {
        if (el.dataset.revealState) continue;
        el.dataset.revealState = 'on';
        const d = parseFloat(el.dataset.revealDelay ?? '0') || 0;
        gsap.fromTo(
          el,
          { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: 0.7, delay: d, ease: 'expo.out', scrollTrigger: { trigger: el, start: 'top 92%', once: true }, onComplete: () => gsap.set(el, { clearProps: 'transform' }) },
        );
      }
    },
    split(root = document) {
      for (const el of $$<HTMLElement>('[data-split]:not([data-hero-split])', root)) {
        if (el.dataset.splitState) continue;
        el.dataset.splitState = 'on';
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
              el.style.visibility = 'visible';
              const i = splits.indexOf(sp);
              if (i >= 0) splits.splice(i, 1);
            },
          });
        } catch {
          gsap.set(el, { visibility: 'visible' });
        }
      }
    },
    count(root = document) {
      const wire = (el: HTMLElement, attr: 'counter' | 'count', duration: number, ease: string) => {
        if (el.dataset.countState) return;
        el.dataset.countState = 'pending';
        const fmt = attr === 'counter' ? el.dataset.counterFormat : el.dataset.format;
        const from = parseFloat(el.dataset.countFrom ?? '0') || 0;
        el.textContent = counterFormat(fmt, from);
        ScrollTrigger.create({
          trigger: el,
          start: 'top 88%',
          once: true,
          onEnter: () => {
            const target = parseFloat(el.dataset[attr] ?? '0') || 0;
            const o = { v: from };
            gsap.to(o, {
              v: target,
              duration,
              ease,
              onUpdate: () => {
                el.textContent = counterFormat(fmt, o.v);
              },
              onComplete: () => {
                el.textContent = counterFormat(fmt, target);
                el.dataset.countState = 'done';
              },
            });
          },
        });
      };
      for (const el of $$<HTMLElement>('[data-counter]', root)) wire(el, 'counter', 1.4, 'power3.out');
      for (const el of $$<HTMLElement>('[data-count]', root)) wire(el, 'count', 1.1, 'power2.out');
    },
    refresh,
    scrollTo(target, offset = 0) {
      const el = typeof target === 'string' ? $(target) : target;
      if (!el) return;
      const y = target === '#top' || el.id === 'top' ? 0 : el.getBoundingClientRect().top + window.scrollY + offset;
      if (lenis) lenis.scrollTo(y, { duration: 1.1 });
      else window.scrollTo(0, y);
    },
    onScroll(cb) {
      scrollCbs.push(cb);
    },
    register(mod) {
      mods.push(mod);
    },
    disable() {
      ScrollTrigger.getAll().forEach((t) => t.kill());
      for (const m of mods.splice(0)) {
        try {
          m.destroy();
        } catch (e) {
          console.error(e);
        }
      }
      for (const s of splits.splice(0)) {
        try {
          s.revert();
        } catch {
          /* already reverted */
        }
      }
      gsap.globalTimeline.clear();
      lenis?.destroy();
      lenis = null;
      kit.lenis = null;
      revealAll();
      for (const el of $$<HTMLElement>('[data-counter],[data-count]')) {
        el.dataset.countState = 'done';
      }
      for (const el of $$<HTMLElement>('[data-split]')) el.style.visibility = 'visible';
      byId('signup-btn')?.classList.add('landed');
      window.addEventListener('scroll', () => scrollCbs.forEach((cb) => cb(window.scrollY)), { passive: true });
    },
  };
  return kit;
}
