// Report arrival (spec 6.7): a MutationObserver on #report toggles body.has-report, the report bar and the followup,
// hands the scroll to Lenis after a pick/drop/demo, animates the rendered stats, and keeps ScrollTrigger fresh.
import { $, $$, countUp, lenisScrollTo, type Mounted, type SiteCtx } from './motion.ts';

const SAMPLE_LABEL = 'Sample record · 112 fictional trades generated to show what the analyzer finds · computed in this tab';
const OWN_LABEL = 'Your record · computed in this tab · nothing uploaded';

export function mount(ctx: SiteCtx): Mounted {
  const report = $('#report');
  if (!report) return { destroy() {} };
  const bar = $('#report-bar');
  const followup = $('#report-followup');
  const label = $('[data-report-label]');
  const demo = $('#demo');
  const files = $('#files');
  const drop = $('#drop');
  let lastTrigger: 'sample' | 'own' = 'own';
  let pendingScroll = false;
  let raf = 0;
  let hadReport = false;

  const onDemo = () => {
    lastTrigger = 'sample';
    pendingScroll = true;
  };
  const onOwn = () => {
    lastTrigger = 'own';
    pendingScroll = true;
  };
  demo?.addEventListener('click', onDemo);
  files?.addEventListener('change', onOwn);
  drop?.addEventListener('drop', onOwn);

  const sampleLabel = () => {
    ctx.sample
      .then((d) => {
        if (label && lastTrigger === 'sample') label.textContent = `Sample record · ${d.report.summary.trades} fictional trades generated to show what the analyzer finds · computed in this tab`;
      })
      .catch(() => {});
    return SAMPLE_LABEL;
  };

  const arrive = () => {
    document.body.classList.add('has-report');
    if (label) label.textContent = lastTrigger === 'sample' ? sampleLabel() : OWN_LABEL;
    if (bar) bar.hidden = false;
    if (followup) followup.hidden = false;
    ctx.emit('report', { has: true, trigger: lastTrigger });
    const scroll = pendingScroll;
    pendingScroll = false;
    if (!ctx.reduced) {
      const g = ctx.gsap;
      const stats = $$('.stats .stat', report);
      if (stats.length) g.from(stats, { y: 8, opacity: 0, duration: 0.5, stagger: 0.04, ease: 'expo.out', clearProps: 'all' });
      $$('.stat .value', report).forEach((v) => countUp(ctx, v, { duration: 0.9, ease: 'power2.out', trigger: false }));
      const insights = $$('.insight', report);
      if (insights.length) g.from(insights, { y: 10, opacity: 0, duration: 0.5, stagger: 0.06, delay: 0.1, ease: 'expo.out', clearProps: 'all' });
      const drafts = $$('.draft', report);
      if (drafts.length) g.from(drafts, { y: 10, opacity: 0, duration: 0.5, stagger: 0.08, delay: 0.2, ease: 'expo.out', clearProps: 'all' });
      const pills = $$('.conf', report);
      if (pills.length) g.from(pills, { scale: 1.18, opacity: 0, duration: 0.4, stagger: 0.06, delay: 0.2, ease: 'power3.out', clearProps: 'all' });
      const bars = $$<HTMLElement>('.barcell .bar', report);
      bars.forEach((b) => g.set(b, { transformOrigin: b.classList.contains('neg') ? 'right center' : 'left center' }));
      if (bars.length) g.from(bars, { scaleX: 0, duration: 0.5, stagger: 0.01, delay: 0.15, ease: 'power3.out', clearProps: 'all' });
      if (bar || followup) g.from([bar, followup].filter(Boolean), { opacity: 0, y: 12, duration: 0.6, delay: 0.4, clearProps: 'all' });
      if (scroll && ctx.lenis) lenisScrollTo(ctx.lenis, report.getBoundingClientRect().top + window.scrollY - (ctx.navH() + 16), 0.9);
    }
    ctx.refresh();
  };

  const clear = () => {
    document.body.classList.remove('has-report');
    if (bar) bar.hidden = true;
    if (followup) followup.hidden = true;
    pendingScroll = false;
    ctx.emit('report', { has: false, trigger: lastTrigger });
    ctx.refresh();
  };

  const mo = new MutationObserver(() => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const has = report.children.length > 0;
      if (has) arrive();
      else if (hadReport) clear();
      hadReport = has;
    });
  });
  mo.observe(report, { childList: true });

  let ro: ResizeObserver | null = null;
  if ('ResizeObserver' in window) {
    ro = new ResizeObserver(() => ctx.refresh());
    ro.observe(report);
  }

  return {
    destroy() {
      // The observer keeps the has-report lifecycle alive after the motion switch; only the tweens stop (ctx.reduced).
      void mo;
      void ro;
    },
  };
}
