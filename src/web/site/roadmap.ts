// Rungs (content spec 2.15): the roadmap line scrub and the milestone pop. Split out of build-2's preflight module;
// the card slot that used to sit under the timeline is gone.
import { $, $$, type Mounted, type SiteCtx } from './motion.ts';

export function mount(ctx: SiteCtx): Mounted {
  if (ctx.reduced) return { destroy() {} };
  const g = ctx.gsap;
  const cleanups: (() => void)[] = [];
  const lineFill = $('#roadmap-line-fill');
  const timeline = $('#timeline');
  if (lineFill && timeline) {
    const tw = g.to(lineFill, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: timeline, start: 'top 80%', end: 'bottom 30%', scrub: 0.4 } });
    cleanups.push(() => {
      tw.scrollTrigger?.kill();
      tw.kill();
      g.set(lineFill, { strokeDashoffset: 0 });
    });
  }
  const ms = $$('[data-ms]');
  const milestones = $('#milestones');
  if (ms.length && milestones) {
    const tw = g.from(ms, { scale: 0.9, opacity: 0, duration: 0.5, ease: 'back.out(1.4)', stagger: 0.1, scrollTrigger: { trigger: milestones, start: 'top 85%', once: true } });
    cleanups.push(() => {
      tw.scrollTrigger?.kill();
      tw.kill();
      g.set(ms, { clearProps: 'all' });
    });
  }
  return {
    destroy() {
      cleanups.splice(0).forEach((f) => f());
    },
  };
}
