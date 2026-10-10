// The Equity River (section 5): 112 particles rain in and settle onto the real cumulative-P&L curve,
// drawn on a canvas 2D context. Port of the prototype's River; the data comes from sample.ts, never
// from a baked array. If the sample cannot load the grid is drawn alone and the caption says so.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp, isMobile, type Ctx, type Module } from './motion.ts';
import type { Dot, SampleData } from './sample.ts';

// the tokens of 2.2, in one place (the canvas cannot read CSS variables cheaply per frame)
const colors = {
  grid: 'rgba(243,245,247,0.05)',
  pos: { rgb: '46,191,119', fill: '#2EBF77' },
  neg: { rgb: '229,83,75', fill: '#E5534B' },
  gray: { rgb: '138,147,160', fill: '#8A93A0' },
  accentRgb: '91,156,255',
  mutedRgb: '138,147,160',
  textRgb: '243,245,247',
};
type Tone = 'pos' | 'neg' | 'gray';
const MONO = "500 12px 'JetBrains Mono', ui-monospace, 'DejaVu Sans Mono', monospace";
const MONO_S = "500 11px 'JetBrains Mono', ui-monospace, 'DejaVu Sans Mono', monospace";

/** mulberry32: the same choreography on every load. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fmtPct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)}%`;
const fmtUsd = (v: number) => `${v < 0 ? '−$' : '$'}${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
const easeInOutQuad = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

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
interface Pt {
  x: number;
  y: number;
  v: number;
}
interface Sprite {
  c: HTMLCanvasElement;
  s: number;
}

export class River {
  wrap: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tip: HTMLElement | null;
  endEl: HTMLElement | null;
  inputEl: HTMLElement | null;
  exit = 0;
  par = { x: 0, y: 0 };
  pointerOn = false;
  hover = -1;
  t0 = 0;
  done = false;
  visible = true;
  pilotActive = false;
  sprites: Record<string, Sprite> = {};
  raf = 0;
  animate: boolean;
  needDraw = true;
  W = 0;
  H = 0;
  dpr = 1;
  dots: Dot[] = [];
  equity: number[] = [];
  P: Particle[] = [];
  pts: Pt[] = [];
  path: Path2D | null = null;
  zeroY = 0;
  minI = 0;
  maxI = 0;
  inputRight = Infinity;
  totalReturn = 0;
  onDone: (() => void) | null = null;

  constructor(wrap: HTMLElement, canvas: HTMLCanvasElement, tooltip: HTMLElement | null, endEl: HTMLElement | null, animate: boolean) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.tip = tooltip;
    this.endEl = endEl;
    this.inputEl = document.getElementById('input');
    this.animate = animate;
    this.layout();
  }

  setData(data: SampleData): void {
    this.dots = data.dots;
    this.equity = data.equity;
    this.totalReturn = data.report.summary.totalReturn;
    const r = rng(7);
    const n = this.dots.length;
    this.P = this.dots.map((d, i) => {
      const mag = Math.min(1, Math.abs(d.ret) / data.maxAbsRet);
      return { i, r: 3 + 4 * mag, pos: d.pnl > 0, delay: (i / n) * 0.6 + r() * 0.25, amp: 18 + r() * 40, ang: r() * Math.PI * 2, jx: (r() - 0.5) * 120, y0f: -(0.05 + r() * 0.5), rnd: r(), tx: 0, ty: 0, y0: 0, x: 0, y: 0 };
    });
    this.layout();
  }

  get hasData(): boolean {
    return this.pts.length > 1;
  }

  layout(): void {
    const rect = this.wrap.getBoundingClientRect();
    const W = (this.W = Math.max(1, Math.round(rect.width)));
    const H = (this.H = Math.max(1, Math.round(rect.height)));
    const dpr = (this.dpr = Math.min(window.devicePixelRatio || 1, W <= 768 ? 1.5 : 2));
    this.canvas.width = Math.round(W * dpr);
    this.canvas.height = Math.round(H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.sprites = {};
    this.inputRight = this.inputEl ? this.inputEl.getBoundingClientRect().right - rect.left : Infinity;
    this.needDraw = true;
    if (this.equity.length < 2) {
      this.pts = [];
      this.path = null;
      return;
    }
    const mob = isMobile();
    const padL = mob ? 14 : Math.max(24, W * 0.035);
    const padR = mob ? 14 : 30;
    const yTop = mob ? H * 0.1 : H * 0.4;
    const yBot = mob ? H * 0.62 : H * 0.92;
    const vals = this.equity;
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
    this.P.forEach((p) => {
      const q = pts[Math.min(pts.length - 1, p.i + 1)];
      p.tx = q.x;
      p.ty = q.y;
      p.y0 = p.y0f * H;
    });
    const end = pts[pts.length - 1];
    if (this.endEl) {
      this.endEl.style.left = `${end.x}px`;
      this.endEl.style.top = `${end.y}px`;
    }
  }

  sprite(color: Tone, r: number): Sprite {
    const key = `${color}|${r}`;
    const hit = this.sprites[key];
    if (hit) return hit;
    const glow = r * 2.6;
    const s = Math.ceil((r + glow) * 2);
    const d = this.dpr;
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(s * d);
    const x = c.getContext('2d')!;
    x.scale(d, d);
    const cx = s / 2;
    const g = x.createRadialGradient(cx, cx, r * 0.6, cx, cx, r + glow);
    const { rgb, fill } = colors[color];
    g.addColorStop(0, `rgba(${rgb},.55)`);
    g.addColorStop(0.45, `rgba(${rgb},.16)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cx, r + glow, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = fill;
    x.beginPath();
    x.arc(cx, cx, r, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(255,255,255,.45)';
    x.beginPath();
    x.arc(cx - r * 0.28, cx - r * 0.3, r * 0.38, 0, Math.PI * 2);
    x.fill();
    return (this.sprites[key] = { c, s });
  }

  start(): void {
    this.t0 = performance.now();
    this.done = false;
    this.needDraw = true;
    if (this.animate && this.hasData) this.loop();
    else this.drawStatic();
  }
  replay(): void {
    if (!this.animate || !this.hasData || !this.visible) return;
    this.setPilot(false);
    this.start();
  }
  drawStatic(): void {
    this.done = true;
    this.draw(10);
  }
  requestDraw(): void {
    this.needDraw = true;
    if (!this.raf && this.visible && this.animate) this.loop();
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
      this.draw(t);
      // after the rain: keep drawing only while the pointer is over, the end marker pulses, or something changed
      if (this.done && !this.pointerOn && this.pilotActive && !this.needDraw) {
        this.raf = 0;
        return;
      }
      this.needDraw = false;
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
  setExit(p: number): void {
    if (p === this.exit) return;
    this.exit = p;
    this.requestDraw();
  }
  setPilot(on: boolean): void {
    this.pilotActive = on;
    this.requestDraw();
  }
  headAt(prog: number): { x: number; y: number } {
    const pts = this.pts;
    const f = prog * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const u = f - i;
    return { x: lerp(pts[i].x, pts[i + 1].x, u), y: lerp(pts[i].y, pts[i + 1].y, u) };
  }

  draw(t: number): void {
    const { ctx, W, H, pts, exit } = this;
    ctx.clearRect(0, 0, W, H);
    // the faint 12x8 grid, parallaxed up 10% as the hero scrolls out
    const ga = this.animate ? clamp(t / 0.4, 0, 1) : 1;
    if (ga > 0) {
      ctx.save();
      ctx.translate(0, -exit * 0.1 * H);
      ctx.globalAlpha = ga;
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.grid;
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
    if (!this.hasData || !this.path) return;
    ctx.save();
    ctx.translate(this.par.x * 6, this.par.y * 6);
    let cp = this.done || t >= 2.4 ? 1 : clamp((t - 0.9) / 1.5, 0, 1);
    cp = easeInOutQuad(cp);
    const alpha = 1 - exit;
    const last = pts[pts.length - 1];
    if (cp > 0 && alpha > 0.01) {
      const head = this.headAt(cp);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, head.x + 1, H);
      ctx.clip();
      const zy = this.zeroY;
      const curveTo = (yBase: number) => {
        ctx.beginPath();
        ctx.moveTo(pts[0].x, yBase);
        ctx.lineTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
        ctx.lineTo(last.x, last.y);
        ctx.lineTo(last.x, yBase);
        ctx.closePath();
      };
      let top = Infinity;
      for (const p of pts) if (p.y < top) top = p.y;
      const grad = ctx.createLinearGradient(0, top, 0, H);
      grad.addColorStop(0, `rgba(${colors.accentRgb},${0.1 * alpha})`);
      grad.addColorStop(1, `rgba(${colors.accentRgb},0)`);
      curveTo(H);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, zy);
      ctx.clip();
      curveTo(zy);
      ctx.fillStyle = `rgba(${colors.pos.rgb},${0.08 * alpha})`;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, zy, W, H - zy);
      ctx.clip();
      curveTo(zy);
      ctx.fillStyle = `rgba(${colors.neg.rgb},${0.08 * alpha})`;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = `rgba(${colors.textRgb},${0.12 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, Math.round(zy) + 0.5);
      ctx.lineTo(last.x, Math.round(zy) + 0.5);
      ctx.stroke();
      ctx.shadowColor = `rgba(${colors.accentRgb},${0.6 * alpha})`;
      ctx.shadowBlur = 24;
      ctx.strokeStyle = `rgba(${colors.accentRgb},${alpha})`;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke(this.path);
      ctx.shadowBlur = 0;
      ctx.restore();
      if (cp < 1) {
        ctx.fillStyle = `rgba(${colors.accentRgb},.95)`;
        ctx.shadowColor = `rgba(${colors.accentRgb},.9)`;
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    // particles
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
        ctx.strokeStyle = `rgba(${colors.textRgb},.9)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, rr + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // labels last, so no particle sits on a number
    const la = clamp((cp - 0.85) / 0.15, 0, 1) * alpha;
    if (la > 0 && !isMobile()) this.labels(la);
    // the final point pulses until the pilot marker takes over
    if (cp >= 1 && !this.pilotActive && alpha > 0.01) {
      const pulse = this.animate ? 0.5 + 0.5 * Math.sin(t * 3.2) : 0.6;
      ctx.fillStyle = `rgba(${colors.accentRgb},${0.18 * alpha * (1 - pulse * 0.5)})`;
      ctx.beginPath();
      ctx.arc(last.x, last.y, 9 + 7 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${colors.accentRgb},${alpha})`;
      ctx.shadowColor = `rgba(${colors.accentRgb},.9)`;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(last.x, last.y - 7);
      ctx.lineTo(last.x + 7, last.y);
      ctx.lineTo(last.x, last.y + 7);
      ctx.lineTo(last.x - 7, last.y);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  /** Trough, peak and end labels, with the collision rule against the console (5, step 4). */
  labels(la: number): void {
    const { ctx, W, pts } = this;
    const lo = pts[this.minI];
    const hi = pts[this.maxI];
    const en = pts[pts.length - 1];
    const muted = `rgba(${colors.mutedRgb},${la})`;
    const white = `rgba(${colors.textRgb},${la})`;
    ctx.font = MONO;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = muted;
    ctx.fillText(`${fmtUsd(lo.v)} trough`, lo.x + 12, lo.y + 14);
    if (W < 1280) return;
    const peak = `${fmtUsd(hi.v)} peak`;
    const end = `${fmtUsd(en.v)} · ${this.totalReturn > 0 ? '+' : ''}${this.totalReturn.toFixed(1)}%`;
    const trades = `${this.dots.length} trades`;
    const widest = Math.max(...[peak, end, trades].map((s) => ctx.measureText(s).width));
    if (W - 12 - widest >= this.inputRight + 8) {
      ctx.textAlign = 'right';
      ctx.fillText(peak, W - 12, hi.y - 16);
      ctx.fillStyle = white;
      ctx.fillText(end, W - 12, en.y + 22);
      ctx.fillStyle = muted;
      ctx.fillText(trades, W - 12, en.y + 38);
      return;
    }
    // collision with the console: 11px, left-aligned from its right edge, on a dark backing so the
    // particles behind stay readable; if even that does not fit, keep only the end line
    ctx.font = MONO_S;
    const x = this.inputRight + 8;
    const w = Math.max(...[peak, end, trades].map((s) => ctx.measureText(s).width));
    ctx.textAlign = 'left';
    const backing = (text: string, y: number) => {
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = `rgba(10,12,16,${0.72 * la})`;
      ctx.fillRect(x - 4, y - 8, tw + 8, 16);
    };
    if (x + w <= W - 12) {
      backing(peak, hi.y - 16);
      ctx.fillStyle = muted;
      ctx.fillText(peak, x, hi.y - 16);
      backing(end, en.y + 22);
      ctx.fillStyle = white;
      ctx.fillText(end, x, en.y + 22);
      backing(trades, en.y + 38);
      ctx.fillStyle = muted;
      ctx.fillText(trades, x, en.y + 38);
    } else if (x + ctx.measureText(end).width <= W - 4) {
      backing(end, en.y + 22);
      ctx.fillStyle = white;
      ctx.fillText(end, x, en.y + 22);
    }
    // otherwise (1280-1366 wide) the end stack has no room between the console and the edge: the
    // counters below and #hero-sr carry the same numbers
  }

  pointerMove(cx: number, cy: number): void {
    if (!this.done || isMobile() || !this.tip || !this.hasData) return;
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
    if (best === this.hover) return;
    this.hover = best;
    this.requestDraw();
    if (best < 0) {
      this.tip.classList.remove('on');
      return;
    }
    const d = this.dots[best];
    const p = this.P[best];
    const sym = document.createElement('b');
    sym.textContent = `${d.sym} `;
    const ret = document.createElement('span');
    ret.className = d.ret >= 0 ? 'pos' : 'neg';
    ret.textContent = fmtPct(d.ret);
    sym.appendChild(ret);
    const small = document.createElement('small');
    small.textContent = `${d.dir === 'long' ? 'Long' : 'Short'} · ${d.date} · ${fmtUsd(d.pnl)}`;
    this.tip.replaceChildren(sym, small);
    const flip = p.x > this.W - 170;
    this.tip.classList.toggle('flip', flip);
    this.tip.style.left = `${Math.round(p.x + this.par.x * 6 + (flip ? -14 : 0))}px`;
    this.tip.style.top = `${Math.round(p.y + this.par.y * 6 - 16)}px`;
    this.tip.classList.add('on');
  }
  pointerLeave(): void {
    this.hover = -1;
    this.tip?.classList.remove('on');
    this.requestDraw();
  }
}

export function mount(ctx: Ctx): Module & { river: River } {
  const wrap = document.getElementById('hero-river') as HTMLElement;
  const canvas = document.getElementById('hero-canvas') as HTMLCanvasElement;
  const hero = document.getElementById('hero') as HTMLElement;
  const caption = document.getElementById('hero-caption');
  const river = new River(wrap, canvas, document.getElementById('hero-tooltip'), document.getElementById('hero-end'), !ctx.reduced);
  river.draw(0); // the grid is on screen before the sample arrives
  let exitST: ScrollTrigger | null = null;
  const cleanups: (() => void)[] = [];

  const io = new IntersectionObserver(
    (en) => {
      river.visible = en[0].isIntersecting;
      if (river.visible && !river.raf) river.requestDraw();
    },
    { threshold: 0 },
  );
  io.observe(hero);
  cleanups.push(() => io.disconnect());
  const onVis = () => {
    if (!document.hidden && river.visible) river.requestDraw();
  };
  document.addEventListener('visibilitychange', onVis);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

  ctx.sample.then(
    (data) => {
      river.setData(data);
      river.animate = !ctx.reduced;
      if (!ctx.reduced && !isMobile()) {
        river.onDone = () => {
          if (isMobile() || ctx.reduced) return;
          river.setPilot(true);
          ctx.pilot?.arm();
        };
        exitST = ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', scrub: true, onUpdate: (st) => river.setExit(st.progress) });
      }
      if (ctx.reduced || isMobile()) document.getElementById('signup-btn')?.classList.add('landed');
      river.start();
    },
    () => {
      if (caption) caption.textContent = "The sample couldn't load. The analyzer still works: drop a file.";
      document.getElementById('signup-btn')?.classList.add('landed');
      river.drawStatic();
    },
  );

  // pointer: tilt + parallax + nearest-trade tooltip (fine pointers, desktop, motion)
  if (!ctx.reduced && matchMedia('(pointer:fine)').matches) {
    gsap.set(wrap, { transformPerspective: 1400 });
    const rx = gsap.quickTo(wrap, 'rotationX', { duration: 0.6, ease: 'power3' });
    const ry = gsap.quickTo(wrap, 'rotationY', { duration: 0.6, ease: 'power3' });
    const px = gsap.quickTo(river.par, 'x', { duration: 0.5, ease: 'power3', onUpdate: () => river.requestDraw() });
    const py = gsap.quickTo(river.par, 'y', { duration: 0.5, ease: 'power3' });
    const move = (e: PointerEvent) => {
      if (isMobile() || ctx.reduced) return;
      const r = hero.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
      river.pointerOn = true;
      rx(-ny * 1.6);
      ry(nx * 1.6);
      px(nx);
      py(ny);
      river.pointerMove(e.clientX - r.left, e.clientY - r.top);
    };
    const leave = () => {
      river.pointerOn = false;
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
    });
  }

  const relayout = () => {
    river.layout();
    if (!river.animate || river.done) river.requestDraw();
    if (!river.animate) river.drawStatic();
  };
  window.addEventListener('site:relayout', relayout);
  cleanups.push(() => window.removeEventListener('site:relayout', relayout));

  return {
    river,
    destroy() {
      exitST?.kill();
      exitST = null;
      river.stop();
      river.animate = false;
      river.exit = 0;
      river.par.x = river.par.y = 0;
      gsap.set(wrap, { clearProps: 'transform' });
      river.pointerLeave();
      river.drawStatic();
      document.getElementById('signup-btn')?.classList.add('landed');
      cleanups.forEach((c) => c());
    },
  };
}
