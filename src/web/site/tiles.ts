// Bento loops (6.6) and the privacy-wire pulse (row 43): CSS keyframes run only under .is-visible, which
// an IntersectionObserver toggles; both stop while the document is hidden.
import gsap from 'gsap';
import type { Ctx, Module } from './motion.ts';

export function mount(ctx: Ctx): Module {
  if (ctx.reduced) return { destroy() {} };
  const tiles = [...document.querySelectorAll<HTMLElement>('.tile')];
  const visible = new Set<Element>();
  const apply = () => tiles.forEach((t) => t.classList.toggle('is-visible', !document.hidden && visible.has(t)));
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
      apply();
    },
    { threshold: 0.15 },
  );
  tiles.forEach((t) => io.observe(t));

  let pulse: gsap.core.Tween | null = null;
  let wireIO: IntersectionObserver | null = null;
  const wire = document.querySelector<SVGPathElement>('#privacy-wire .wire-pulse');
  if (wire) {
    pulse = gsap.fromTo(wire, { strokeDashoffset: 640 }, { strokeDashoffset: 0, duration: 2.4, ease: 'none', repeat: -1, paused: true });
    wireIO = new IntersectionObserver((en) => (en[0].isIntersecting && !document.hidden ? pulse?.play() : pulse?.pause()), { threshold: 0.15 });
    wireIO.observe(wire.ownerSVGElement ?? wire);
  }
  const onVis = () => {
    apply();
    if (document.hidden) pulse?.pause();
  };
  document.addEventListener('visibilitychange', onVis);

  return {
    destroy() {
      io.disconnect();
      wireIO?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      tiles.forEach((t) => t.classList.remove('is-visible'));
      pulse?.kill();
      if (wire) wire.style.strokeDashoffset = '320';
    },
  };
}
