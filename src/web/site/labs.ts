// The shrink lab (spec 6.4) and the stop lab (spec 6.5). The shrink rule is the pure function in sample.ts,
// which mirrors analyze.ts; the slider is the source of truth for n.
import { pct } from '../../core/format.ts';
import { $, $$, type Mounted, type SiteCtx } from './motion.ts';
import { marketingMinus, resolvePath, shrinkAdjusted, shrinkConfidence, shrinkVerdict } from './sample.ts';

const X0 = 40;
const PER_PCT = 60;
const RAW_Y = 112;
const ADJ_Y = 180;
const xOf = (v: number) => X0 + (Math.min(5, Math.max(-3, v)) + 3) * PER_PCT;
const fmt = (v: number) => marketingMinus(pct(v));

function shrinkLab(ctx: SiteCtx): () => void {
  const slider = $<HTMLInputElement>('#shrink-n');
  const out = $('#shrink-n-out');
  const readout = $('#shrink-readout');
  const badge = $('#shrink-badge');
  const verdict = $('#shrink-verdict');
  const chips = $$<HTMLButtonElement>('#shrink-examples [data-example]');
  const rawDot = $<SVGCircleElement>('#shrink-raw-dot');
  const rawLbl = $<SVGTextElement>('#shrink-raw-lbl');
  const adjDot = $<SVGCircleElement>('#shrink-adj-dot');
  const adjLbl = $<SVGTextElement>('#shrink-adj-lbl');
  const tether = $<SVGLineElement>('#shrink-tether');
  const ticks = $<SVGGElement>('#shrink-ticks');
  const avgG = $<SVGGElement>('#shrink-avg');
  const avgLabel = $('#shrink-avg-label');
  if (!slider || !readout || !badge || !verdict || !rawDot || !adjDot || !tether) return () => {};

  let overall = 0.33327;
  const state = { n: 3, raw: -1.17, label: '9:45–10:15 ET' };
  const ns = 'http://www.w3.org/2000/svg';
  if (ticks && !ticks.childElementCount) {
    for (let v = -3; v <= 5; v++) {
      const x = xOf(v);
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', String(x));
      l.setAttribute('x2', String(x));
      l.setAttribute('y1', String(ADJ_Y - 5));
      l.setAttribute('y2', String(ADJ_Y + 5));
      l.setAttribute('class', 'tick');
      ticks.appendChild(l);
      const t = document.createElementNS(ns, 'text');
      t.setAttribute('x', String(x));
      t.setAttribute('y', String(ADJ_Y + 20));
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('class', 'lbl');
      t.textContent = v === 0 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v)}%`;
      ticks.appendChild(t);
    }
  }

  const placeAvg = () => {
    const x = xOf(overall);
    avgG?.querySelector('line')?.setAttribute('x1', String(x));
    avgG?.querySelector('line')?.setAttribute('x2', String(x));
    avgG?.querySelector('text')?.setAttribute('x', String(x));
    if (avgLabel) avgLabel.textContent = fmt(overall);
  };
  placeAvg();

  const render = (animate: boolean) => {
    const { n, raw } = state;
    const adj = shrinkAdjusted(n, raw, overall);
    const conf = shrinkConfidence(n);
    readout.childNodes[0].textContent = `n = ${n} · raw ${fmt(raw)} · adjusted ${fmt(adj)} `;
    badge.textContent = conf;
    badge.className = `pill ${conf === 'too few' ? 'few' : conf === 'early signal' ? 'early' : 'solid'}`;
    verdict.textContent = `The report would call this: ${shrinkVerdict(n, raw, overall)}.`;
    if (out) out.textContent = String(n);
    const rx = xOf(raw);
    const ax = xOf(adj);
    const targets = { raw: rx, adj: ax };
    const apply = (r: number, a: number) => {
      rawDot.setAttribute('cx', r.toFixed(1));
      rawLbl?.setAttribute('x', r.toFixed(1));
      adjDot.setAttribute('cx', a.toFixed(1));
      adjLbl?.setAttribute('x', a.toFixed(1));
      tether.setAttribute('x1', r.toFixed(1));
      tether.setAttribute('x2', a.toFixed(1));
    };
    if (!animate || ctx.reduced) {
      apply(rx, ax);
      return;
    }
    const cur = { raw: parseFloat(rawDot.getAttribute('cx') || String(rx)), adj: parseFloat(adjDot.getAttribute('cx') || String(ax)) };
    ctx.gsap.killTweensOf(cur);
    ctx.gsap.to(cur, { ...targets, duration: 0.32, ease: 'power2.out', onUpdate: () => apply(cur.raw, cur.adj) });
  };

  let sweep: gsap.core.Tween | null = null;
  const killSweep = () => {
    sweep?.kill();
    sweep = null;
  };
  const onInput = () => {
    state.n = Number(slider.value);
    render(true);
  };
  slider.addEventListener('input', onInput);
  slider.addEventListener('pointerdown', killSweep);
  slider.addEventListener('keydown', killSweep);
  const onChip = (e: Event) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('[data-example]');
    if (!b) return;
    killSweep();
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
    state.n = Number(b.dataset.n);
    state.raw = Number(b.dataset.raw);
    state.label = b.dataset.label || '';
    slider.value = String(state.n);
    render(true);
  };
  const chipWrap = $('#shrink-examples');
  chipWrap?.addEventListener('click', onChip);

  ctx.sample
    .then((data) => {
      overall = data.report.summary.avgReturn;
      chips.forEach((c) => {
        const path = c.dataset.sampleRaw;
        if (!path) return;
        const v = resolvePath(data, path);
        if (typeof v === 'number') c.dataset.raw = String(v);
      });
      const pressed = chips.find((c) => c.getAttribute('aria-pressed') === 'true');
      if (pressed) state.raw = Number(pressed.dataset.raw);
      placeAvg();
      render(false);
    })
    .catch(() => render(false));
  render(false);

  const cleanups: (() => void)[] = [];
  if (!ctx.reduced) {
    const lab = $('#shrink-lab');
    const diagram = $('#shrink-diagram');
    if (lab && diagram) {
      const st = ctx.ScrollTrigger.create({
        trigger: diagram,
        start: 'top 60%',
        once: true,
        onEnter: () => {
          const home = state.n;
          const o = { n: 3 };
          sweep = ctx.gsap.to(o, {
            keyframes: [
              { n: 45, duration: 1.3, ease: 'power2.inOut' },
              { n: home, duration: 1.1, ease: 'power2.inOut' },
            ],
            onUpdate: () => {
              const v = String(Math.round(o.n));
              if (slider.value !== v) {
                slider.value = v;
                slider.dispatchEvent(new Event('input'));
              }
            },
            onComplete: () => {
              sweep = null;
              slider.value = String(home);
              slider.dispatchEvent(new Event('input'));
            },
          });
        },
      });
      cleanups.push(() => st.kill());
    }
    const formula = $('#shrink-formula');
    if (formula) {
      try {
        const sp = ctx.SplitText.create(formula, { type: 'chars' });
        ctx.splits.push(sp);
        const tw = ctx.gsap.from(sp.chars, {
          opacity: 0,
          duration: 0.6,
          stagger: 0.012,
          ease: 'none',
          scrollTrigger: { trigger: formula, start: 'top 90%', once: true },
          onComplete: () => {
            sp.revert();
            ctx.splits = ctx.splits.filter((s) => s !== sp);
          },
        });
        cleanups.push(() => {
          tw.scrollTrigger?.kill();
          tw.kill();
        });
      } catch {
        /* no SplitText: the formula is simply shown */
      }
    }
  }
  return () => {
    killSweep();
    cleanups.forEach((f) => f());
    slider.removeEventListener('input', onInput);
    slider.removeEventListener('pointerdown', killSweep);
    slider.removeEventListener('keydown', killSweep);
    chipWrap?.removeEventListener('click', onChip);
    render(false);
  };
}

function stopLab(ctx: SiteCtx): () => void {
  if (ctx.reduced) return () => {};
  const section = $('#stop-lab');
  const none = $('[data-stop-path="none"]');
  const back1 = $('[data-stop-path="back"][data-seg="1"]');
  const back2 = $('[data-stop-path="back"][data-seg="2"]');
  const stay = $('[data-stop-path="stay"]');
  const lineG = $('#stop-line-g');
  if (!section || !none || !back1 || !back2 || !stay) return () => {};
  const g = ctx.gsap;
  const tl = g.timeline({ paused: true, defaults: { ease: 'none' } });
  if (lineG) tl.fromTo(lineG, { x: 700, opacity: 0 }, { x: 0, opacity: 1, duration: 0.2 }, 0);
  tl.to(none, { strokeDashoffset: 0, duration: 0.25 }, 0.2);
  tl.to(back1, { strokeDashoffset: 0, duration: 0.15 }, 0.45);
  tl.to(back2, { strokeDashoffset: 0, duration: 0.15 }, 0.6);
  tl.to(stay, { strokeDashoffset: 0, duration: 0.25 }, 0.75);
  const st = ctx.ScrollTrigger.create({ trigger: section, start: 'top 70%', end: 'bottom 60%', scrub: 0.5, animation: tl });
  return () => {
    st.kill();
    tl.kill();
    g.set([none, back1, back2, stay], { strokeDashoffset: 0 });
    if (lineG) g.set(lineG, { clearProps: 'all' });
  };
}

export function mount(ctx: SiteCtx): Mounted {
  const offShrink = shrinkLab(ctx);
  const offStop = stopLab(ctx);
  return {
    destroy() {
      offShrink();
      offStop();
    },
  };
}
