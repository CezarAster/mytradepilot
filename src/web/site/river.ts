// The Equity River: 112 particles, one per closed sample trade, rain in and settle onto the
// cumulative-P&L curve while the curve draws itself in signal blue (spec section 5; port of the
// prototype's River). Also owns the hero load choreography, the pointer tooltip/tilt and the
// exit scrub. Canvas 2D; the rAF stops when the hero is off-screen, hidden or idle.
import type { Dot, SampleData } from './sample.ts';
import type { Mounted, SiteCtx } from './types.ts';
import { $, byId, clamp, easeInOutQuad, emit, fmtPct, fmtUsd, isMobile, lerp, on, rng } from './util.ts';

const COLORS = {
  accent: '91,156,255',
  pos: '46,191,119',
  neg: '229,83,75',
  gray: '138,147,160',
  text: '243,245,247',
  muted: '138,147,160',
  posHex: '#2EBF77',
  negHex: '#E5534B',
  grayHex: '#8A93A0',
};
const MONO = "500 12px 'JetBrains Mono', ui-monospace, 'DejaVu Sans Mono', monospace";
const MONO_11 = "500 11px 'JetBrains Mono', ui-monospace, 'DejaVu Sans Mono', monospace";

interface Pt {
  x: number;
  y: number;
  v: number;
}
interface Particle {
  i: number;
  r: number;
  pos: boolean;
  delay: number;
  amp: number;
  ang: number;
  jx: number;
  y0f: number;
  rnd: number;
  tx: number;
  ty: number;
  y0: number;
  x: number;
  y: number;
}
interface Sprite {
  c: HTMLCanvasElement;
  s: number;
}

export class River {
  readonly wrap: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly tip: HTMLElement | null;
  readonly endEl: HTMLElement | null;
  exit = 0;
  par = { x: 0, y: 0 };
  hover = -1;
  t0 = 0;
  done = false;
  visible = true;
  pilotActive = false;
  pointerOn = false;
  animate: boolean;
  needDraw = true;
  raf = 0;
  W = 0;
  H = 0;
  dpr = 1;
  inputRight = 0;
  sprites = new Map<string, Sprite>();
  P: Particle[] = [];
  dots: Dot[] = [];
  pts: Pt[] | null = null;
  path: Path2D | null = null;
  zeroY = 0;
  minI = 0;
  maxI = 0;
  totalReturn = 0;
  trades = 0;
  onDone: (() => void) | null = null;

  constructor(wrap: HTMLElement, canvas: HTMLCanvasElement, tip: HTMLElement | null, endEl: HTMLElement | null, animate: boolean) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.tip = tip;
    this.endEl = endEl;
    this.animate = animate;
    this.layout();
  }

  setData(data: SampleData): void {
    this.dots = data.dots;
    this.totalReturn = data.report.summary.totalReturn;
    this.trades = data.report.summary.trades;
    const r = rng(7);
    const n = data.dots.length;
    const maxAbs = data.maxAbsRet;
    this.P = data.dots.map((d, i) => {
      const mag = Math.min(1, Math.abs(d.ret) / maxAbs);
      return { i, r: 3 + 4 * mag, pos: d.pnl > 0, delay: (i / n) * 0.6 + r() * 0.25, amp: 18 + r() * 40, ang: r() * Math.PI * 2, jx: (r() - 0.5) * 120, y0f: -(0.05 + r() * 0.5), rnd: r(), tx: 0, ty: 0, y0: 0, x: 0, y: 0 };
    });
    this.layout();
  }

  layout(): void {
    const rect = this.wrap.getBoundingClientRect();
    const W = (this.W = Math.max(1, Math.round(rect.width)));
    const H = (this.H = Math.max(1, Math.round(rect.height)));
    const dpr = (this.dpr = Math.min(window.devicePixelRatio || 1, W <= 768 ? 1.5 : 2));
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sprites.clear();
    const inp = byId('input');
    this.inputRight = inp ? inp.getBoundingClientRect().right - rect.left : 0;
    this.needDraw = true;
    if (!this.dots.length) {
      this.pts = null;
      this.path = null;
      return;
    }
    const mob = isMobile();
    const padL = mob ? 14 : Math.max(24, W * 0.035);
    const padR = mob ? 14 : 30;
    const yTop = mob ? H * 0.1 : H * 0.4;
    const yBot = mob ? H * 0.62 : H * 0.92;
    const vals = [0, ...this.dots.map((d) => d.cum)];
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const span = mx - mn || 1;
    const pts = (this.pts = vals.map((v, i) => ({ x: padL + ((W - padL - padR) * i) / (vals.length - 1), y: yBot - ((v - mn) / span) * (yBot - yTop), v })));
    this.zeroY = yBot - ((0 - mn) / span) * (yBot - yTop);
    this.minI = vals.indexOf(mn);
    this.maxI = vals.indexOf(mx);
    const p2 = new Path2D();
    p2.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) p2.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    p2.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    this.path = p2;
    for (const p of this.P) {
      const q = pts[p.i + 1];
      p.tx = q.x;
      p.ty = q.y;
      p.y0 = p.y0f * H;
    }
    const end = pts[pts.length - 1];
    if (this.endEl) {
      this.endEl.style.left = `${end.x}px`;
      this.endEl.style.top = `${end.y}px`;
    }
  }

  sprite(color: 'pos' | 'neg' | 'gray', r: number): Sprite {
    const key = `${color}|${r}`;
    const hit = this.sprites.get(key);
    if (hit) return hit;
    const glow = r * 2.6;
    const s = Math.ceil((r + glow) * 2);
    const d = this.dpr;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(s * d);
    const x = c.getContext('2d')!;
    x.scale(d, d);
    const cx = s / 2;
    const rgb = color === 'pos' ? COLORS.pos : color === 'neg' ? COLORS.neg : COLORS.gray;
    const g = x.createRadialGradient(cx, cx, r * 0.6, cx, cx, r + glow);
    g.addColorStop(0, `rgba(${rgb},.55)`);
    g.addColorStop(0.45, `rgba(${rgb},.16)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cx, r + glow, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = color === 'pos' ? COLORS.posHex : color === 'neg' ? COLORS.negHex : COLORS.grayHex;
    x.beginPath();
    x.arc(cx, cx, r, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.45)';
    x.beginPath();
    x.arc(cx - r * 0.28, cx - r * 0.3, r * 0.38, 0, Math.PI * 2);
    x.fill();
    const sp = { c, s };
    this.sprites.set(key, sp);
    return sp;
  }

  start(): void {
    this.t0 = performance.now();
    this.done = false;
    this.needDraw = true;
    if (this.animate) this.loop();
    else this.drawStatic();
  }

  replay(): void {
    this.setPilot(false);
    this.start();
  }

  drawStatic(): void {
    this.draw(10);
  }

  loop(): void {
    cancelAnimationFrame(this.raf);
    const tick = (now: number) => {
      if (!this.visible || document.hidden) {
        this.raf = 0;
        return;
      }
      const t = (now - this.t0) / 1000;
      if (t > 2.7 && !this.done) {
        this.done = true;
        this.onDone?.();
      }
      const idle = this.done && this.pilotActive && !this.pointerOn && !this.needDraw;
      if (idle) {
        this.raf = 0;
        return;
      }
      this.needDraw = false;
      this.draw(t);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Restarts the rAF if it stopped (visibility, idle) and there is something to draw. */
  wake(): void {
    if (!this.animate) {
      this.drawStatic();
      return;
    }
    if (!this.raf && this.visible && !document.hidden) this.loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setExit(p: number): void {
    if (p === this.exit) return;
    this.exit = p;
    this.needDraw = true;
    this.wake();
  }

  setPilot(onFlag: boolean): void {
    this.pilotActive = onFlag;
    this.needDraw = true;
    this.wake();
  }

  headAt(prog: number): { x: number; y: number } {
    const pts = this.pts!;
    const f = prog * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const u = f - i;
    return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
  }

  draw(t: number): void {
    const { ctx, W, H, pts, exit } = this;
    ctx.clearRect(0, 0, W, H);
    const ga = this.animate ? clamp(t / 0.4, 0, 1) : 1;
    if (ga > 0) {
      ctx.save();
      ctx.translate(0, -exit * 0.1 * H);
      ctx.globalAlpha = ga;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(243,245,247,0.05)';
      ctx.beginPath();
      for (let gc = 1; gc < 12; gc++) {
        const gx = Math.round((gc / 12) * W) + 0.5;
        ctx.moveTo(gx, -H * 0.2);
        ctx.lineTo(gx, H * 1.2);
      }
      for (let gr = 1; gr < 8; gr++) {
        const gy = Math.round((gr / 8) * H) + 0.5;
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (!pts || !this.path) return;
    ctx.save();
    ctx.translate(this.par.x * 6, this.par.y * 6);
    let cp = this.done || t >= 2.4 ? 1 : clamp((t - 0.9) / 1.5, 0, 1);
    cp = easeInOutQuad(cp);
    const alpha = 1 - exit;
    if (cp > 0 && alpha > 0.01) {
      const head = this.headAt(cp);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, head.x + 1, H);
      ctx.clip();
      const zy = this.zeroY;
      const lastP = pts[pts.length - 1];
      const curveTo = (yBase: number) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, yBase);
        ctx.lineTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        ctx.lineTo(lastP.x, lastP.y);
        ctx.lineTo(lastP.x, yBase);
        ctx.closePath();
      };
      let top = Infinity;
      for (const p of pts) if (p.y < top) top = p.y;
      const grad = ctx.createLinearGradient(0, top, 0, H);
      grad.addColorStop(0, `rgba(${COLORS.accent},${0.1 * alpha})`);
      grad.addColorStop(1, `rgba(${COLORS.accent},0)`);
      curveTo(H);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, zy);
      ctx.clip();
      curveTo(zy);
      ctx.fillStyle = `rgba(${COLORS.pos},${0.08 * alpha})`;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, zy, W, H - zy);
      ctx.clip();
      curveTo(zy);
      ctx.fillStyle = `rgba(${COLORS.neg},${0.08 * alpha})`;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = `rgba(${COLORS.text},${0.12 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, Math.round(zy) + 0.5);
      ctx.lineTo(lastP.x, Math.round(zy) + 0.5);
      ctx.stroke();
      ctx.shadowColor = `rgba(${COLORS.accent},${0.6 * alpha})`;
      ctx.shadowBlur = 24;
      ctx.strokeStyle = `rgba(${COLORS.accent},${alpha})`;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(this.path);
      ctx.shadowBlur = 0;
      ctx.restore();
      if (cp < 1) {
        ctx.fillStyle = `rgba(${COLORS.accent},.95)`;
        ctx.shadowColor = `rgba(${COLORS.accent},.9)`;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      const la = clamp((cp - 0.85) / 0.15, 0, 1) * alpha;
      if (la > 0 && !isMobile()) this.drawLabels(la);
    }
    const hov = this.hover;
    for (let k = 0; k < this.P.length; k++) {
      const p = this.P[k];
      const u = this.done ? 1 : clamp((t - p.delay) / 1.7, 0, 1);
      if (u <= 0) continue;
      const e = 1 - Math.pow(1 - u, 3);
      const sw = (1 - u) * (1 - u);
      let x = p.tx + p.amp * sw * Math.cos(p.ang + t * 2.6) + p.jx * (1 - e);
      let y = p.y0 + (p.ty - p.y0) * e + p.amp * 0.6 * sw * Math.sin(p.ang + t * 2.6);
      if (exit > 0) {
        y += exit * (H * 0.45 + p.rnd * H * 0.5);
        x += exit * (p.rnd - 0.5) * 40;
      }
      p.x = x;
      p.y = y;
      const fade = clamp(u / 0.18, 0, 1);
      let rr = Math.round(p.r * 2) / 2;
      if (k === hov) rr = Math.round(p.r * 1.7 * 2) / 2;
      const sp = this.sprite(p.pos ? 'pos' : 'neg', rr);
      ctx.globalAlpha = fade * (1 - exit * 0.75);
      ctx.drawImage(sp.c, x - sp.s / 2, y - sp.s / 2, sp.s, sp.s);
      if (exit > 0) {
        const sg = this.sprite('gray', rr);
        ctx.globalAlpha = fade * exit * 0.5;
        ctx.drawImage(sg.c, x - sg.s / 2, y - sg.s / 2, sg.s, sg.s);
      }
      ctx.globalAlpha = 1;
      if (k === hov) {
        ctx.strokeStyle = `rgba(${COLORS.text},.9)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, rr + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    if (cp >= 1 && !this.pilotActive && alpha > 0.01) {
      const en = pts[pts.length - 1];
      const pulse = this.animate ? 0.5 + 0.5 * Math.sin(t * 3.2) : 0.6;
      ctx.fillStyle = `rgba(${COLORS.accent},${0.18 * alpha * (1 - pulse * 0.5)})`;
      ctx.beginPath();
      ctx.arc(en.x, en.y, 9 + 7 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${COLORS.accent},${alpha})`;
      ctx.shadowColor = `rgba(${COLORS.accent},.9)`;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(en.x, en.y - 7);
      ctx.lineTo(en.x + 7, en.y);
      ctx.lineTo(en.x, en.y + 7);
      ctx.lineTo(en.x - 7, en.y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  private drawLabels(la: number): void {
    const { ctx, W, pts } = this;
    if (!pts) return;
    const lo = pts[this.minI];
    const hi = pts[this.maxI];
    const en = pts[pts.length - 1];
    const muted = `rgba(${COLORS.muted},${la})`;
    const text = `rgba(${COLORS.text},${la})`;
    ctx.font = MONO;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = muted;
    ctx.fillText(`${fmtUsd(lo.v)} trough`, lo.x + 12, lo.y + 14);
    if (W < 1280) return;
    const peakLine = `${fmtUsd(hi.v)} peak`;
    const endLine = `${fmtUsd(en.v)} · ${fmtPct(this.totalReturn, 1)}`;
    const tradesLine = `${this.trades} trades`;
    const widest = (font: string) => {
      ctx.font = font;
      return Math.max(ctx.measureText(peakLine).width, ctx.measureText(endLine).width, ctx.measureText(tradesLine).width);
    };
    let font = MONO;
    let x = W - 12;
    let align: CanvasTextAlign = 'right';
    let lines: [string, number, string][] = [
      [peakLine, hi.y - 16, muted],
      [endLine, en.y + 22, text],
      [tradesLine, en.y + 38, muted],
    ];
    // Collision rule: the stack must clear the console's right edge; else shrink and left-align from it.
    if (x - widest(MONO) < this.inputRight + 8) {
      font = MONO_11;
      x = this.inputRight + 8;
      align = 'left';
      if (x + widest(MONO_11) > W - 12) {
        ctx.font = MONO_11;
        lines = x + ctx.measureText(endLine).width <= W - 4 ? [[endLine, en.y + 22, text]] : [];
      }
    }
    ctx.font = font;
    ctx.textAlign = align;
    for (const [s, y, c] of lines) {
      ctx.fillStyle = c;
      ctx.fillText(s, x, y);
    }
  }

  pointerMove(cx: number, cy: number): void {
    this.pointerOn = true;
    if (!this.done || isMobile() || !this.pts) return;
    const px = cx - this.par.x * 6;
    const py = cy - this.par.y * 6;
    let best = -1;
    let bd = 24 * 24;
    for (let k = 0; k < this.P.length; k++) {
      const p = this.P[k];
      const dx = p.x - px;
      const dy = p.y - py;
      const dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    }
    if (best !== this.hover) {
      this.hover = best;
      this.needDraw = true;
      if (best >= 0 && this.tip) {
        const d = this.dots[best];
        const p2 = this.P[best];
        this.tip.innerHTML = `<b>${d.sym} <span class="${d.ret >= 0 ? 'pos' : 'neg'}">${fmtPct(d.ret)}</span></b><small>${d.dir === 'long' ? 'Long' : 'Short'} · ${d.date} · ${fmtUsd(d.pnl)}</small>`;
        const flip = p2.x > this.W - 170;
        this.tip.classList.toggle('flip', flip);
        this.tip.style.left = `${Math.round(p2.x + this.par.x * 6 + (flip ? -14 : 0))}px`;
        this.tip.style.top = `${Math.round(p2.y + this.par.y * 6 - 16)}px`;
        this.tip.classList.add('on');
      } else this.tip?.classList.remove('on');
    }
    this.wake();
  }

  pointerLeave(): void {
    this.pointerOn = false;
    this.hover = -1;
    this.needDraw = true;
    this.tip?.classList.remove('on');
    this.wake();
  }
}

export function mount(ctx: SiteCtx): Mounted {
  const kit = ctx.kit;
  const wrap = byId('hero-river')!;
  const canvas = byId<HTMLCanvasElement>('hero-canvas')!;
  const hero = byId('hero')!;
  const river = new River(wrap, canvas, byId('hero-tooltip'), byId('hero-end'), !!kit);
  river.drawStatic(); // the grid, at once
  const cleanups: (() => void)[] = [];
  const triggers: { kill(): void }[] = [];
  const tweens: { kill(): void }[] = [];
  let hasData = false;

  // --- hero load choreography (rows 1–7) --------------------------------------------------
  if (kit) {
    const { gsap, SplitText } = kit;
    const h1 = $<HTMLElement>('[data-hero-split]');
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.fromTo('.nav', { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.5, clearProps: 'transform' }, 0.1);
    tl.fromTo('.hero-text .eyebrow', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5 }, 0.1);
    if (h1) {
      try {
        const split = SplitText.create(h1, { type: 'words', mask: 'words' });
        kit.splits.push(split);
        gsap.set(h1, { visibility: 'visible' });
        tl.from(
          split.words,
          {
            yPercent: 100,
            duration: 0.9,
            ease: 'power4.out',
            stagger: 0.045,
            onComplete: () => {
              split.revert();
              h1.style.visibility = 'visible';
              const i = kit.splits.indexOf(split);
              if (i >= 0) kit.splits.splice(i, 1);
            },
          },
          0.2,
        );
      } catch {
        tl.fromTo(h1, { opacity: 0, y: 20, visibility: 'visible' }, { opacity: 1, y: 0, duration: 0.9 }, 0.2);
      }
    }
    tl.fromTo(['.hero-text .lede', '.hero-ctas'], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.7, stagger: 0.06 }, 0.5);
    tl.fromTo('#input', { opacity: 0, scale: 0.98, filter: 'blur(8px)' }, { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out', clearProps: 'filter,transform' }, 0.55);
    tweens.push(tl);
    const float = gsap.to('#file-card', { y: 3, duration: 2, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    tweens.push(float);
    cleanups.push(on('hero:visible', (v: boolean) => (v ? float.play() : float.pause())));
  }

  // --- visibility: the rAF runs only while the hero is on screen ----------------------------
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (en) => {
        river.visible = en[0].isIntersecting;
        emit('hero:visible', river.visible);
        if (river.visible) river.wake();
      },
      { threshold: 0 },
    );
    io.observe(hero);
    cleanups.push(() => io.disconnect());
  }
  const onVis = () => {
    if (!document.hidden) river.wake();
  };
  document.addEventListener('visibilitychange', onVis);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

  // --- data: start the rain when the sample arrives; grid only if it never does ------------
  ctx.sample
    .then((data) => {
      hasData = true;
      river.setData(data);
      river.onDone = () => emit('river:done');
      river.start();
    })
    .catch(() => {
      const cap = byId('hero-caption');
      if (cap) cap.textContent = "The sample couldn't load. The analyzer still works: drop a file.";
      byId('signup-btn')?.classList.add('landed');
      river.drawStatic();
      emit('river:failed');
    });

  // --- desktop motion: exit scrub, tilt, parallax, tooltip ------------------------------------
  if (kit && !isMobile()) {
    const { gsap, ScrollTrigger } = kit;
    triggers.push(ScrollTrigger.create({ trigger: '#hero', start: 'top top', end: 'bottom top', scrub: true, onUpdate: (st) => river.setExit(st.progress) }));
    if (kit.fine) {
      gsap.set(wrap, { transformPerspective: 1400 });
      const rx = gsap.quickTo(wrap, 'rotationX', { duration: 0.6, ease: 'power3' });
      const ry = gsap.quickTo(wrap, 'rotationY', { duration: 0.6, ease: 'power3' });
      const px = gsap.quickTo(river.par, 'x', { duration: 0.5, ease: 'power3', onUpdate: () => river.wake() });
      const py = gsap.quickTo(river.par, 'y', { duration: 0.5, ease: 'power3' });
      const move = (e: PointerEvent) => {
        const r = hero.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
        const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
        rx(-ny * 1.6);
        ry(nx * 1.6);
        px(nx);
        py(ny);
        river.needDraw = true;
        river.pointerMove(e.clientX - r.left, e.clientY - r.top);
      };
      const leave = () => {
        rx(0);
        ry(0);
        px(0);
        py(0);
        river.pointerLeave();
      };
      hero.addEventListener('pointermove', move);
      hero.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        hero.removeEventListener('pointermove', move);
        hero.removeEventListener('pointerleave', leave);
        gsap.set(wrap, { clearProps: 'transform' });
      });
    }
  }

  cleanups.push(
    on('pilot:active', (onFlag: boolean) => river.setPilot(onFlag)),
    on('river:replay', () => {
      if (kit && hasData && river.visible) river.replay();
    }),
    on('site:resize', () => {
      river.layout();
      if (!river.animate || river.done) river.needDraw = true;
      river.wake();
      if (!river.animate) river.drawStatic();
    }),
  );

  return {
    destroy() {
      triggers.forEach((t) => t.kill());
      tweens.forEach((t) => t.kill());
      cleanups.forEach((f) => f());
      river.stop();
      river.animate = false;
      river.exit = 0;
      river.par.x = river.par.y = 0;
      river.setPilot(false);
      river.drawStatic();
      byId('signup-btn')?.classList.add('landed');
    },
  };
}
