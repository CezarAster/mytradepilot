// The Equity River: 112 particles rain in and settle onto the sample's real equity curve (build spec section 5).
// A port of the prototype's River class; the data comes from sample.ts, never from a baked table.
import { $, clamp, type Mounted, type RiverHandle, type SiteCtx } from './motion.ts';
import type { Dot } from './sample.ts';

/** The tokens of spec 2.2, as the canvas needs them (rgb triplets for alpha composition). */
const COLORS = {
  accent: '91,156,255',
  pos: '46,191,119',
  neg: '229,83,75',
  grey: '138,147,160',
  text: '243,245,247',
  muted: '138,147,160',
  posDisc: '#2EBF77',
  negDisc: '#E5534B',
  greyDisc: '#8A93A0',
};
const MONO = (px: number) => `500 ${px}px 'JetBrains Mono', ui-monospace, 'DejaVu Sans Mono', monospace`;

/** mulberry32: the same seed gives the same choreography on every load. */
function rng(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fmtUsd = (v: number) => (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US');
const fmtPct = (v: number, digits = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits) + '%';

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

export class River {
  private ctx: CanvasRenderingContext2D;
  private dots: Dot[] = [];
  private equity: number[] = [];
  private P: Particle[] = [];
  private pts: Pt[] = [];
  private path: Path2D | null = null;
  private sprites = new Map<string, { c: HTMLCanvasElement; s: number }>();
  private zeroY = 0;
  private minI = 0;
  private maxI = 0;
  private totalReturn = 0;
  private inputLeft = 0;
  private inputRight = 0;
  private W = 1;
  private H = 1;
  private dpr = 1;
  private raf = 0;
  private t0 = 0;
  private finishTimer = 0;
  private hover = -1;
  private needDraw = true;
  private pointerOn = false;
  private hidden = false;
  animate = true;
  done = false;
  visible = true;
  pilotActive = false;
  exit = 0;
  par = { x: 0, y: 0 };
  onDone: (() => void) | null = null;
  private wrap: HTMLElement;
  private canvas: HTMLCanvasElement;
  private tip: HTMLElement | null;
  private endEl: HTMLElement | null;
  private input: HTMLElement | null;
  private isMobile: () => boolean;

  constructor(wrap: HTMLElement, canvas: HTMLCanvasElement, tip: HTMLElement | null, endEl: HTMLElement | null, input: HTMLElement | null, isMobile: () => boolean) {
    this.wrap = wrap;
    this.canvas = canvas;
    this.tip = tip;
    this.endEl = endEl;
    this.input = input;
    this.isMobile = isMobile;
    this.ctx = canvas.getContext('2d')!;
    this.layout();
  }

  hasCurve(): boolean {
    return this.pts.length > 1;
  }

  setData(dots: Dot[], equity: number[], maxAbsRet: number, totalReturn: number): void {
    this.dots = dots;
    this.equity = equity;
    this.totalReturn = totalReturn;
    const r = rng(7);
    const N = dots.length;
    const scale = maxAbsRet || 1;
    this.P = dots.map((d, i) => ({
      i,
      r: 3 + 4 * Math.min(1, Math.abs(d.ret) / scale),
      pos: d.pnl > 0,
      delay: (i / N) * 0.6 + r() * 0.25,
      amp: 18 + r() * 40,
      ang: r() * Math.PI * 2,
      jx: (r() - 0.5) * 120,
      y0f: -(0.05 + r() * 0.5),
      rnd: r(),
      tx: 0,
      ty: 0,
      y0: 0,
      x: 0,
      y: 0,
    }));
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
    if (this.input) {
      const ir = this.input.getBoundingClientRect();
      this.inputLeft = ir.left - rect.left;
      this.inputRight = ir.right - rect.left;
    }
    this.needDraw = true;
    if (this.equity.length < 2) {
      this.pts = [];
      this.path = null;
      return;
    }
    const mob = this.isMobile();
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

  private sprite(color: 'pos' | 'neg' | 'gray', r: number) {
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
    const rgb = color === 'pos' ? COLORS.pos : color === 'neg' ? COLORS.neg : COLORS.grey;
    const g = x.createRadialGradient(cx, cx, r * 0.6, cx, cx, r + glow);
    g.addColorStop(0, `rgba(${rgb},.55)`);
    g.addColorStop(0.45, `rgba(${rgb},.16)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cx, r + glow, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = color === 'pos' ? COLORS.posDisc : color === 'neg' ? COLORS.negDisc : COLORS.greyDisc;
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
    this.clearFinish();
    this.t0 = performance.now();
    this.done = false;
    this.needDraw = true;
    if (this.animate && this.hasCurve()) this.loop();
    else this.drawStatic();
  }

  replay(): void {
    if (!this.animate || !this.hasCurve()) return;
    this.setPilot(false);
    this.start();
  }

  drawStatic(): void {
    this.draw(10);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) this.kick();
  }

  setHidden(h: boolean): void {
    this.hidden = h;
    if (!h) this.kick();
  }

  /** Restarts the frame loop if it stopped (something changed and the canvas needs a frame). */
  kick(): void {
    this.needDraw = true;
    if (!this.raf && this.animate && this.visible && !this.hidden) this.loop();
  }

  private loop(): void {
    cancelAnimationFrame(this.raf);
    const tick = (now: number) => {
      if (!this.visible || this.hidden) {
        this.raf = 0;
        this.finishLater();
        return;
      }
      const t = (now - this.t0) / 1000;
      if (t > 2.7 && !this.done) {
        this.done = true;
        this.onDone?.();
      }
      this.needDraw = false;
      this.draw(t);
      // After the rain, keep drawing only while something on screen still moves.
      const pulsing = !this.pilotActive && this.exit < 0.99;
      if (!this.done || this.pointerOn || this.needDraw || pulsing) this.raf = requestAnimationFrame(tick);
      else this.raf = 0;
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.clearFinish();
  }

  /** The hero left the screen (or the tab hid) before the rain ended: end it on a timer so the pilot marker still starts. */
  private finishLater(): void {
    if (this.done || this.finishTimer || !this.t0) return;
    const left = Math.max(0, 2.7 - (performance.now() - this.t0) / 1000);
    this.finishTimer = window.setTimeout(() => {
      this.finishTimer = 0;
      if (this.done) return;
      this.done = true;
      this.needDraw = true;
      this.onDone?.();
    }, left * 1000 + 50);
  }

  private clearFinish(): void {
    if (this.finishTimer) {
      clearTimeout(this.finishTimer);
      this.finishTimer = 0;
    }
  }

  setExit(p: number): void {
    if (p === this.exit) return;
    this.exit = p;
    this.kick();
  }

  setPilot(on: boolean): void {
    this.pilotActive = on;
    this.kick();
  }

  private headAt(prog: number): { x: number; y: number } {
    const pts = this.pts;
    const f = prog * (pts.length - 1);
    const i = Math.min(pts.length - 2, Math.floor(f));
    const u = f - i;
    return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * u, y: pts[i].y + (pts[i + 1].y - pts[i].y) * u };
  }

  private curveTo(ctx: CanvasRenderingContext2D, yBase: number): void {
    const pts = this.pts;
    const last = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(pts[0].x, yBase);
    ctx.lineTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    ctx.lineTo(last.x, last.y);
    ctx.lineTo(last.x, yBase);
    ctx.closePath();
  }

  /** The hero end labels, with the collision rule of spec 5.4: never under the console. */
  private drawLabels(la: number): void {
    const ctx = this.ctx;
    const W = this.W;
    const pts = this.pts;
    const lo = pts[this.minI];
    const hi = pts[this.maxI];
    const en = pts[pts.length - 1];
    const muted = (a: number) => `rgba(${COLORS.muted},${a})`;
    const white = (a: number) => `rgba(${COLORS.text},${a})`;
    ctx.textBaseline = 'middle';
    ctx.font = MONO(12);
    ctx.fillStyle = muted(la);
    ctx.textAlign = 'left';
    ctx.fillText(`${fmtUsd(lo.v)} trough`, lo.x + 12, lo.y + 14);
    if (W < 1280) return;
    const lines: { text: string; y: number; strong: boolean }[] = [
      { text: `${fmtUsd(hi.v)} peak`, y: hi.y - 16, strong: false },
      { text: `${fmtUsd(en.v)} · ${fmtPct(this.totalReturn, 1)}`, y: en.y + 22, strong: true },
      { text: `${this.dots.length} trades`, y: en.y + 38, strong: false },
    ];
    const widest = (px: number) => {
      ctx.font = MONO(px);
      return Math.max(...lines.map((l) => ctx.measureText(l.text).width));
    };
    let px = 12;
    let x = W - 12;
    let align: CanvasTextAlign = 'right';
    let keep = lines;
    if (W - 12 - widest(12) < this.inputRight + 8) {
      px = 11;
      x = this.inputRight + 8;
      align = 'left';
      if (x + widest(11) > W - 12) {
        ctx.font = MONO(11);
        keep = [lines[1]];
        if (x + ctx.measureText(lines[1].text).width > W - 12) {
          // Not even the end line fits beside the console: sit the stack to its left, at the curve-end height.
          px = 12;
          x = this.inputLeft - 12;
          align = 'right';
          keep = lines;
        }
      }
    }
    ctx.font = MONO(px);
    ctx.textAlign = align;
    for (const l of keep) {
      ctx.fillStyle = l.strong ? white(la) : muted(la);
      ctx.fillText(l.text, x, l.y);
    }
  }

  draw(t: number): void {
    const ctx = this.ctx;
    const W = this.W;
    const H = this.H;
    const exit = this.exit;
    ctx.clearRect(0, 0, W, H);
    const ga = this.animate ? clamp(t / 0.4, 0, 1) : 1;
    if (ga > 0) {
      ctx.save();
      ctx.translate(0, -exit * 0.1 * H);
      ctx.globalAlpha = ga;
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${COLORS.text},0.05)`;
      ctx.beginPath();
      for (let c = 1; c < 12; c++) {
        const gx = Math.round((c / 12) * W) + 0.5;
        ctx.moveTo(gx, -H * 0.2);
        ctx.lineTo(gx, H * 1.2);
      }
      for (let r = 1; r < 8; r++) {
        const gy = Math.round((r / 8) * H) + 0.5;
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
      }
      ctx.stroke();
      ctx.restore();
    }
    if (!this.hasCurve() || !this.path) return;
    const pts = this.pts;
    ctx.save();
    ctx.translate(this.par.x * 6, this.par.y * 6);
    let cp = this.done || t >= 2.4 ? 1 : clamp((t - 0.9) / 1.5, 0, 1);
    cp = cp < 0.5 ? 2 * cp * cp : 1 - Math.pow(-2 * cp + 2, 2) / 2;
    const alpha = 1 - exit;
    if (cp > 0 && alpha > 0.01) {
      const head = this.headAt(cp);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, head.x + 1, H);
      ctx.clip();
      const zy = this.zeroY;
      const last = pts[pts.length - 1];
      let topY = Infinity;
      for (const p of pts) if (p.y < topY) topY = p.y;
      const grad = ctx.createLinearGradient(0, topY, 0, H);
      grad.addColorStop(0, `rgba(${COLORS.accent},${0.1 * alpha})`);
      grad.addColorStop(1, `rgba(${COLORS.accent},0)`);
      this.curveTo(ctx, H);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, zy);
      ctx.clip();
      this.curveTo(ctx, zy);
      ctx.fillStyle = `rgba(${COLORS.pos},${0.08 * alpha})`;
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, zy, W, H - zy);
      ctx.clip();
      this.curveTo(ctx, zy);
      ctx.fillStyle = `rgba(${COLORS.neg},${0.08 * alpha})`;
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = `rgba(${COLORS.text},${0.12 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, Math.round(zy) + 0.5);
      ctx.lineTo(last.x, Math.round(zy) + 0.5);
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
    }
    const P = this.P;
    const hov = this.hover;
    for (let k = 0; k < P.length; k++) {
      const p = P[k];
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
    const la = clamp((cp - 0.85) / 0.15, 0, 1) * alpha;
    if (la > 0 && !this.isMobile()) this.drawLabels(la);
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

  pointerMove(cx: number, cy: number): void {
    this.pointerOn = true;
    if (!this.done || this.isMobile() || !this.tip) return;
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
      if (best >= 0) {
        const d = this.dots[best];
        const p = this.P[best];
        // The context line (content spec 2.1): the engine's tags on this trade, so the river reads as the record the rule is written from.
        const tags = [d.prev === 'quick-after-loss' ? 'quick re-entry' : '', d.tradeOfDay === 3 ? '3rd of the day' : d.tradeOfDay >= 4 ? '4th+ of the day' : ''].filter(Boolean);
        this.tip.innerHTML =
          `<b>${d.sym} <span class="${d.ret >= 0 ? 'pos' : 'neg'}">${fmtPct(d.ret)}</span></b><small>${d.dir === 'long' ? 'Long' : 'Short'} · ${d.date} · ${fmtUsd(d.pnl)}</small>` +
          (tags.length ? `<small class="ctx">${tags.join(' · ')}</small>` : '');
        const flip = p.x > this.W - 170;
        this.tip.classList.toggle('flip', flip);
        this.tip.style.left = `${Math.round(p.x + this.par.x * 6 + (flip ? -14 : 0))}px`;
        this.tip.style.top = `${Math.round(p.y + this.par.y * 6 - 16)}px`;
        this.tip.classList.add('on');
      } else this.tip.classList.remove('on');
      this.kick();
    }
  }

  pointerLeave(): void {
    this.pointerOn = false;
    this.hover = -1;
    this.tip?.classList.remove('on');
    this.kick();
  }
}

export function mount(ctx: SiteCtx): Mounted {
  const wrap = $('#hero-river');
  const canvas = $<HTMLCanvasElement>('#hero-canvas');
  const hero = $('#hero');
  if (!wrap || !canvas || !hero) return { destroy() {} };
  const river = new River(wrap, canvas, $('#hero-tooltip'), $('#hero-end'), $('#input'), ctx.isMobile);
  river.animate = !ctx.reduced;
  river.drawStatic(); // the grid is on screen before the data arrives
  const cleanups: (() => void)[] = [];

  const handle: RiverHandle = {
    replay: () => river.replay(),
    drawStatic: () => river.drawStatic(),
    layout: () => river.layout(),
    setPilot: (on) => river.setPilot(on),
    hasCurve: () => river.hasCurve(),
    kick: () => river.kick(),
  };
  ctx.river = handle;

  river.onDone = () => {
    if (!ctx.isMobile() && !ctx.reduced) ctx.emit('river:done');
  };

  ctx.sample
    .then((data) => {
      river.setData(data.dots, data.equity, data.maxAbsRet, data.report.summary.totalReturn);
      river.animate = !ctx.reduced;
      river.start();
    })
    .catch(() => {
      const cap = $('#hero-caption');
      if (cap) cap.textContent = "The sample couldn't load. The analyzer still works: drop a file.";
      $('#signup-btn')?.classList.add('landed');
      river.drawStatic();
    });

  if (!ctx.reduced) {
    const io = new IntersectionObserver((en) => river.setVisible(en[0].isIntersecting), { threshold: 0 });
    io.observe(hero);
    cleanups.push(() => io.disconnect());
    const onVis = () => river.setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

    if (!ctx.isMobile()) {
      const st = ctx.ScrollTrigger.create({ trigger: hero, start: 'top top', end: 'bottom top', scrub: true, onUpdate: (s) => river.setExit(s.progress) });
      cleanups.push(() => st.kill());
      if (ctx.fine) {
        ctx.gsap.set(wrap, { transformPerspective: 1400 });
        const rx = ctx.gsap.quickTo(wrap, 'rotationX', { duration: 0.6, ease: 'power3' });
        const ry = ctx.gsap.quickTo(wrap, 'rotationY', { duration: 0.6, ease: 'power3' });
        const px = ctx.gsap.quickTo(river.par, 'x', { duration: 0.5, ease: 'power3', onUpdate: () => river.kick() });
        const py = ctx.gsap.quickTo(river.par, 'y', { duration: 0.5, ease: 'power3' });
        const move = (e: PointerEvent) => {
          const r = hero.getBoundingClientRect();
          const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
          const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
          rx(-ny * 1.6);
          ry(nx * 1.6);
          px(nx);
          py(ny);
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
          ctx.gsap.set(wrap, { clearProps: 'transform' });
        });
      }
    }
  }

  cleanups.push(
    ctx.on('resize', () => {
      river.layout();
      if (!river.animate || river.done) river.kick();
      if (!river.animate) river.drawStatic();
    }),
  );

  return {
    destroy() {
      cleanups.splice(0).forEach((f) => f());
      river.stop();
      river.animate = false;
      river.exit = 0;
      river.par.x = river.par.y = 0;
      river.pilotActive = false;
      river.pointerLeave();
      river.drawStatic();
    },
  };
}
