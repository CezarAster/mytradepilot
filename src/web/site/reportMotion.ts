// Report arrival: a MutationObserver on #report toggles body.has-report, the report bar and
// the contextual waitlist, hands the scroll to Lenis after a pick/drop/demo, and counts the
// stat values up. It never changes report HTML and never delays main.ts's render().
import type { Mounted, SiteCtx } from './types.ts';
import { $, $$, byId, debounce, emit, navH } from './util.ts';

const NUM = /^([+\-−])?(\$)?([\d,]+)(?:\.(\d+))?(k|M|%)?$/;

export function mount(ctx: SiteCtx): Mounted {
  let kit = ctx.kit;
  const report = byId('report')!;
  const bar = byId('report-bar')!;
  const followup = byId('report-followup')!;
  const label = $<HTMLElement>('[data-report-label]', bar);
  let trades = 112;
  ctx.sample.then((d) => (trades = d.report.summary.trades)).catch(() => undefined);

  let lastTrigger: 'sample' | 'own' = 'own';
  let pendingScroll = false;
  byId('demo')?.addEventListener('click', () => {
    lastTrigger = 'sample';
    pendingScroll = true;
  });
  byId('files')?.addEventListener('change', () => {
    lastTrigger = 'own';
    pendingScroll = true;
  });
  byId('drop')?.addEventListener('drop', () => {
    lastTrigger = 'own';
    pendingScroll = true;
  });

  const countUp = (el: HTMLElement) => {
    if (!kit) return;
    const original = (el.textContent ?? '').trim();
    const m = NUM.exec(original);
    if (!m) return;
    const [, sign = '', dollar = '', intPart, dec, suffix = ''] = m;
    const target = parseFloat(intPart.replace(/,/g, '') + (dec ? `.${dec}` : ''));
    const decimals = dec ? dec.length : 0;
    const grouped = intPart.includes(',');
    const fmt = (v: number) => {
      const s = grouped ? Number(v.toFixed(decimals)).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : v.toFixed(decimals);
      return `${sign}${dollar}${s}${suffix}`;
    };
    const o = { v: 0 };
    kit.gsap.to(o, {
      v: target,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = fmt(o.v);
      },
      onComplete: () => {
        el.textContent = original;
      },
    });
  };

  const animate = () => {
    if (!kit) return;
    const { gsap } = kit;
    const stats = $$('.stats .stat', report);
    if (stats.length) gsap.from(stats, { y: 8, opacity: 0, duration: 0.45, stagger: 0.04, ease: 'power2.out', clearProps: 'transform' });
    $$<HTMLElement>('.stat .value', report).forEach(countUp);
    const insights = $$('.insight', report);
    if (insights.length) gsap.from(insights, { y: 10, opacity: 0, duration: 0.5, stagger: 0.06, delay: 0.1, ease: 'power2.out', clearProps: 'transform' });
    const confs = $$('.conf', report);
    if (confs.length) gsap.from(confs, { scale: 1.18, opacity: 0, duration: 0.4, delay: 0.25, ease: 'power3.out', transformOrigin: 'left center', clearProps: 'transform' });
    const bars = $$<HTMLElement>('.barcell .bar', report);
    if (bars.length) {
      gsap.from(bars, {
        scaleX: 0,
        duration: 0.5,
        delay: 0.2,
        stagger: 0.008,
        ease: 'power3.out',
        transformOrigin: (_i: number, el: Element) => (el.classList.contains('neg') ? 'right center' : 'left center'),
      });
    }
    gsap.fromTo([bar, followup], { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.6, delay: 0.4, ease: 'expo.out', clearProps: 'transform' });
  };

  let shown = false;
  const apply = () => {
    const has = report.children.length > 0;
    if (has) {
      document.body.classList.add('has-report');
      if (label) {
        label.textContent =
          lastTrigger === 'sample' ? `Sample report · ${trades} fictional trades generated to show what the analyzer finds · computed in this tab` : 'Your report · computed in this tab · nothing uploaded';
      }
      bar.hidden = false;
      followup.hidden = false;
      shown = true;
      emit('report:shown');
      if (kit) {
        animate();
        if (pendingScroll && kit.lenis) kit.lenis.scrollTo(report, { offset: -(navH() + 16), duration: 0.9 });
      }
      pendingScroll = false;
      kit?.refresh();
    } else if (shown || document.body.classList.contains('has-report')) {
      shown = false;
      document.body.classList.remove('has-report');
      bar.hidden = true;
      followup.hidden = true;
      pendingScroll = false;
      emit('report:cleared');
      kit?.refresh();
    }
  };
  const mo = new MutationObserver(() => requestAnimationFrame(apply));
  mo.observe(report, { childList: true });
  if (report.children.length) apply();

  const ro = new ResizeObserver(debounce(() => kit?.refresh(), 100));
  ro.observe(report);

  return {
    destroy() {
      kit = null;
    },
  };
}
