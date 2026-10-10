// Bento loops gated by visibility, the privacy-wire pulse and the export menu-path sequence (spec 6.6, rows 43 and 45).
import { $, $$, type Mounted, type SiteCtx } from './motion.ts';

export function mount(ctx: SiteCtx): Mounted {
  if (ctx.reduced) return { destroy() {} };
  const cleanups: (() => void)[] = [];

  const tiles = $$('.tile');
  if (tiles.length) {
    const visible = new Set<Element>();
    const apply = () => tiles.forEach((t) => t.classList.toggle('is-visible', !document.hidden && visible.has(t)));
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.isIntersecting) visible.add(en.target);
          else visible.delete(en.target);
        }
        apply();
      },
      { threshold: 0.15 },
    );
    tiles.forEach((t) => io.observe(t));
    document.addEventListener('visibilitychange', apply);
    cleanups.push(() => {
      io.disconnect();
      document.removeEventListener('visibilitychange', apply);
      tiles.forEach((t) => t.classList.remove('is-visible'));
    });
  }

  const pulse = $('#wire-pulse');
  const wire = $('#privacy-wire');
  if (pulse && wire) {
    const tw = ctx.gsap.fromTo(pulse, { strokeDashoffset: 640 }, { strokeDashoffset: 0, duration: 2.4, ease: 'none', repeat: -1, paused: true });
    const io = new IntersectionObserver((en) => (en[0].isIntersecting && !document.hidden ? tw.play() : tw.pause()), { threshold: 0.2 });
    io.observe(wire);
    const onVis = () => (document.hidden ? tw.pause() : undefined);
    document.addEventListener('visibilitychange', onVis);
    cleanups.push(() => {
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      tw.kill();
      ctx.gsap.set(pulse, { strokeDashoffset: 320 });
    });
  }

  const menu = $('#menu-path');
  if (menu) {
    const chipEls = $$('.mchip', menu);
    const tl = ctx.gsap.timeline({ paused: true });
    chipEls.forEach((c, i) => tl.call(() => c.classList.add('lit'), [], i * 0.4));
    tl.to({}, { duration: 1.2 });
    const st = ctx.ScrollTrigger.create({ trigger: menu, start: 'top 85%', once: true, onEnter: () => tl.play() });
    cleanups.push(() => {
      st.kill();
      tl.kill();
      chipEls.forEach((c) => c.classList.add('lit'));
    });
  }

  return {
    destroy() {
      cleanups.splice(0).forEach((f) => f());
    },
  };
}
