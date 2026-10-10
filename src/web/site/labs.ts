// The two labs (6.4, 6.5): the shrink lab (the engine's shrinkage rule, interactive) and the stop lab
// (three price paths drawn by scroll, counts and the hard-stop ladder counted up by motion.ts).
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp, type Ctx, type Module } from './motion.ts';
import { shrink, typo } from './sample.ts';

const fmt2 = (v: number) => typo(`${v > 0 ? '+' : ''}${v.toFixed(2)}%`);
/** The number line: -3% … +5% over x = 40 … 520 (viewBox 560). */
const X0 = 40;
const X1 = 520;
const vx = (v: number) => X0 + ((clamp(v, -3, 5) + 3) / 8) * (X1 - X0);
const NS = 'http://www.w3.org/2000/svg';

function mountShrink(ctx: Ctx): Module {
  const root = document.getElementById('shrink-lab');
  const slider = document.getElementById('shrink-n') as HTMLInputElement | null;
  if (!root || !slider) return { destroy() {} };
  const out = document.getElementById('shrink-n-out');
  const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-example]')];
  const axis = document.getElementById('shrink-axis')!;
  const avg = document.getElementById('shrink-avg')!;
  const tether = document.getElementById('shrink-tether')!;
  const rawG = document.getElementById('shrink-raw')!;
  const adjG = document.getElementById('shrink-adj')!;
  const readout = document.getElementById('shrink-readout')!;
  const badge = document.getElementById('shrink-badge')!;
  const verdictEl = document.getElementById('shrink-verdict')!;
  const typedOverall = parseFloat((document.querySelector('[data-sample="summary.avgReturn"]')?.textContent ?? '0.33').replace('−', '-')) || 0.33;
  let overall = typedOverall;
  const state = { n: Number(slider.value) || 3, raw: -1.17, label: '9:45–10:15 ET' };

  // axis: 1% ticks with labels (built once; the SVG ships without them so the no-JS page stays honest)
  if (!axis.childElementCount) {
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', String(X0));
    line.setAttribute('x2', String(X1));
    line.setAttribute('y1', '180');
    line.setAttribute('y2', '180');
    axis.appendChild(line);
    for (let v = -3; v <= 5; v++) {
      const t = document.createElementNS(NS, 'line');
      t.setAttribute('class', 'tick');
      t.setAttribute('x1', String(vx(v)));
      t.setAttribute('x2', String(vx(v)));
      t.setAttribute('y1', '174');
      t.setAttribute('y2', '186');
      axis.appendChild(t);
      const l = document.createElementNS(NS, 'text');
      l.setAttribute('x', String(vx(v)));
      l.setAttribute('y', '204');
      l.setAttribute('text-anchor', 'middle');
      l.textContent = typo(`${v > 0 ? '+' : ''}${v}%`);
      axis.appendChild(l);
    }
  }
  const pos = { raw: vx(state.raw), adj: vx(shrink(state.raw, state.n, overall).adjusted) };
  const paint = () => {
    rawG.setAttribute('transform', `translate(${pos.raw.toFixed(1)} 180)`);
    adjG.setAttribute('transform', `translate(${pos.adj.toFixed(1)} 180)`);
    tether.setAttribute('x1', pos.raw.toFixed(1));
    tether.setAttribute('x2', pos.adj.toFixed(1));
  };
  const placeAvg = () => {
    avg.setAttribute('transform', `translate(${vx(overall).toFixed(1)} 0)`);
  };
  let tween: gsap.core.Tween | null = null;
  const update = (animate: boolean) => {
    const r = shrink(state.raw, state.n, overall);
    readout.textContent = `n = ${state.n} · raw ${fmt2(state.raw)} · adjusted ${fmt2(r.adjusted)}`;
    badge.className = `pill ${r.badge}`;
    badge.textContent = r.badge === 'few' ? 'too few' : r.badge === 'early' ? 'early signal' : 'solid';
    verdictEl.textContent = `The report would call this: ${r.label}.`;
    if (out) out.textContent = String(state.n);
    slider.setAttribute('aria-valuetext', `${state.n} trades: adjusted ${fmt2(r.adjusted)}`);
    tween?.kill();
    const target = { raw: vx(state.raw), adj: vx(r.adjusted) };
    if (animate && !ctx.reduced) tween = gsap.to(pos, { ...target, duration: 0.32, ease: 'power2.out', onUpdate: paint });
    else {
      pos.raw = target.raw;
      pos.adj = target.adj;
      paint();
    }
  };
  // the chip's raw value may be re-bound to the engine's unrounded average
  const pick = (chip: HTMLButtonElement) => {
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    state.raw = Number(chip.dataset.raw) || 0;
    state.n = Number(chip.dataset.n) || 1;
    state.label = chip.dataset.label ?? '';
    slider.value = String(state.n);
    update(true);
  };
  let sweep: gsap.core.Timeline | null = null;
  const killSweep = () => {
    sweep?.kill();
    sweep = null;
  };
  chips.forEach((c) =>
    c.addEventListener('click', () => {
      killSweep();
      pick(c);
    }),
  );
  slider.addEventListener('input', () => {
    state.n = Number(slider.value) || 1;
    update(true);
  });
  slider.addEventListener('pointerdown', killSweep);
  slider.addEventListener('keydown', killSweep);
  placeAvg();
  update(false);
  ctx.sample
    .then((d) => {
      overall = d.report.summary.avgReturn;
      const active = chips.find((c) => c.getAttribute('aria-pressed') === 'true');
      if (active) state.raw = Number(active.dataset.raw) || state.raw;
      placeAvg();
      update(false);
    })
    .catch(() => {});

  // one-shot sweep when the diagram is half visible: n 3 → 45 and back to the chip's n (row 38)
  let io: IntersectionObserver | null = null;
  if (!ctx.reduced && 'IntersectionObserver' in window) {
    const diagram = document.getElementById('shrink-diagram')!;
    io = new IntersectionObserver(
      (en) => {
        if (!en[0].isIntersecting) return;
        io?.disconnect();
        const back = state.n;
        const o = { n: state.n };
        sweep = gsap.timeline({ onComplete: () => (sweep = null) });
        const step = () => {
          const n = Math.round(o.n);
          if (n !== Number(slider.value)) {
            slider.value = String(n);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
          }
        };
        sweep.to(o, { n: 45, duration: 1.2, ease: 'power2.inOut', onUpdate: step }).to(o, { n: back, duration: 1.2, ease: 'power2.inOut', onUpdate: step });
      },
      { threshold: 0.5 },
    );
    io.observe(diagram);
  }
  return {
    destroy() {
      io?.disconnect();
      killSweep();
      tween?.kill();
      update(false);
    },
  };
}

function mountStop(ctx: Ctx): Module {
  const section = document.getElementById('stop-lab');
  const figure = document.getElementById('stop-figure');
  if (!section || !figure || ctx.reduced) return { destroy() {} };
  const lineG = figure.querySelector<SVGGElement>('#stop-line-g');
  const path = (sel: string) => figure.querySelector<SVGPathElement>(sel);
  const none = path('[data-stop-path="none"]');
  const back1 = path('[data-stop-path="back"][data-seg="1"]');
  const back2 = path('[data-stop-path="back"][data-seg="2"]');
  const stay = path('[data-stop-path="stay"]');
  const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
  if (lineG) tl.fromTo(lineG, { xPercent: 120, opacity: 0 }, { xPercent: 0, opacity: 1, duration: 0.2 }, 0);
  if (none) tl.fromTo(none, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.25 }, 0.2);
  if (back1) tl.fromTo(back1, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.15 }, 0.45);
  if (back2) tl.fromTo(back2, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.15 }, 0.6);
  if (stay) tl.fromTo(stay, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.25 }, 0.75);
  const st = ScrollTrigger.create({ trigger: section, start: 'top 70%', end: 'bottom 60%', scrub: 0.5, animation: tl });
  return {
    destroy() {
      st.kill();
      tl.kill();
      [none, back1, back2, stay].forEach((p) => p && (p.style.strokeDashoffset = '0'));
      if (lineG) gsap.set(lineG, { clearProps: 'all' });
    },
  };
}

export function mount(ctx: Ctx): Module {
  const a = mountShrink(ctx);
  const b = mountStop(ctx);
  return {
    destroy() {
      a.destroy();
      b.destroy();
    },
  };
}
