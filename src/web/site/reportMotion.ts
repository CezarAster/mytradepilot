// Report arrival (6.7): a MutationObserver on #report drives body.has-report, the report bar label, the
// follow-up with the contextual waitlist form, the Lenis take-over of main.ts's native scroll, the
// count-ups and staggers, and the pilot's suspension while a report is on screen. It never touches the
// report's HTML and never delays render().
import gsap from 'gsap';
import { countUp, navH, refresh, type Ctx, type Module } from './motion.ts';

const OWN = 'Your report · computed in this tab · nothing uploaded';
const SAMPLE = 'Sample report · 112 fictional trades generated to show what the analyzer finds · computed in this tab';

export function mount(ctx: Ctx): Module {
  const report = document.getElementById('report')!;
  const bar = document.getElementById('report-bar');
  const followup = document.getElementById('report-followup');
  const label = bar?.querySelector<HTMLElement>('[data-report-label]');
  const demo = document.getElementById('demo');
  const files = document.getElementById('files');
  const drop = document.getElementById('drop');

  let lastTrigger: 'sample' | 'own' = 'own';
  let pendingScroll = false;
  let hasReport = false;
  const arm = (kind: 'sample' | 'own') => () => {
    lastTrigger = kind;
    pendingScroll = true;
  };
  demo?.addEventListener('click', arm('sample'));
  files?.addEventListener('change', arm('own'));
  drop?.addEventListener('drop', arm('own'));

  const show = () => {
    const first = !hasReport;
    hasReport = true;
    document.body.classList.add('has-report');
    if (label) label.textContent = lastTrigger === 'sample' ? SAMPLE.replace('112', String(sampleTrades)) : OWN;
    if (bar) bar.hidden = false;
    if (followup) followup.hidden = false;
    ctx.pilot?.suspend(true);
    const scroll = pendingScroll;
    pendingScroll = false;
    if (!ctx.reduced) {
      if (scroll && ctx.lenis) ctx.lenis.scrollTo(report, { offset: -(navH() + 16), duration: 0.9 });
      gsap.from(report.querySelectorAll('.stats .stat'), { y: 8, opacity: 0, duration: 0.5, stagger: 0.04, ease: 'expo.out', clearProps: 'all' });
      gsap.from(report.querySelectorAll('.insight'), { y: 10, opacity: 0, duration: 0.5, delay: 0.1, stagger: 0.06, ease: 'expo.out', clearProps: 'all' });
      gsap.from(report.querySelectorAll('.conf'), { scale: 1.18, opacity: 0, duration: 0.4, delay: 0.25, stagger: 0.06, ease: 'power3.out', clearProps: 'transform,opacity' });
      report.querySelectorAll<HTMLElement>('.barcell .bar').forEach((b) => {
        gsap.from(b, { scaleX: 0, duration: 0.5, delay: 0.3, ease: 'power3.out', transformOrigin: b.classList.contains('neg') ? 'right center' : 'left center', clearProps: 'transform' });
      });
      report.querySelectorAll<HTMLElement>('.stat .value').forEach((v) => countUp(v, { duration: 0.9, ease: 'power2.out' }));
      if (scroll || first) gsap.fromTo([bar, followup].filter(Boolean), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.4, clearProps: 'all' });
    }
    refresh();
  };
  const hide = () => {
    hasReport = false;
    pendingScroll = false;
    document.body.classList.remove('has-report');
    if (bar) bar.hidden = true;
    if (followup) followup.hidden = true;
    ctx.pilot?.suspend(false);
    refresh();
  };

  let sampleTrades = 112;
  ctx.sample.then((d) => (sampleTrades = d.report.summary.trades)).catch(() => {});

  const mo = new MutationObserver(() => {
    requestAnimationFrame(() => (report.children.length ? show() : hasReport ? hide() : undefined));
  });
  mo.observe(report, { childList: true });
  if (report.children.length) show();

  const ro = 'ResizeObserver' in window ? new ResizeObserver(() => refresh()) : null;
  ro?.observe(report);

  return {
    destroy() {
      /* the observer keeps the has-report lifecycle alive after motion is turned off; tweens are gated on ctx.reduced */
    },
  };
}
