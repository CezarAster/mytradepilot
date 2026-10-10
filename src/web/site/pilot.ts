// The pilot marker (build spec 6.2): leaves the curve end, sits in the +37.3% counter, rides the sticky story frame,
// becomes the verdict dot and lands in the waitlist button. Anchor rects are read per frame; no pins anywhere.
import { $, clamp, type Mounted, type PilotHandle, type SiteCtx } from './motion.ts';

interface Stop {
  el: Element;
  arrive: number;
  leave: number;
}

class Pilot {
  private g: SVGGElement;
  private tailG: SVGGElement;
  private els: Record<'hero' | 'numbers' | 'frame' | 'story' | 'waitlist', Element>;
  private btn: HTMLElement | null;
  private stops: Stop[] | null = null;
  private tail: { x: number; y: number }[] = [];
  private tailEls: SVGCircleElement[] = [];
  private landed = false;
  private ctx: SiteCtx;
  on = false;

  constructor(ctx: SiteCtx) {
    this.ctx = ctx;
    this.g = $<SVGGElement>('#pilot-g')!;
    this.tailG = $<SVGGElement>('#pilot-tail')!;
    this.els = { hero: $('#hero-end')!, numbers: $('#num-pilot')!, frame: $('#frame-pilot')!, story: $('#story-dot')!, waitlist: $('#wl-pilot')! };
    this.btn = $('#signup-btn');
    for (let i = 0; i < 9; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', String(3.2 - i * 0.3));
      c.setAttribute('class', 'tail');
      c.style.opacity = String(0.5 - i * 0.05);
      c.style.display = 'none';
      this.tailG.appendChild(c);
      this.tailEls.push(c);
    }
  }

  measure(): void {
    const vh = window.innerHeight;
    const sy = window.scrollY;
    const e = this.els;
    const docC = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.top + sy + r.height / 2;
    };
    const story = $('#story');
    const storyR = story ? story.getBoundingClientRect() : new DOMRect(0, 0, 0, 0);
    const storyTop = storyR.top + sy;
    const span = Math.max(0, storyR.height - vh);
    const maxS = document.documentElement.scrollHeight - vh;
    const kNum = docC(e.numbers) - vh * 0.5;
    const stops: Stop[] = [
      { el: e.hero, arrive: 0, leave: vh * 0.1 },
      { el: e.numbers, arrive: kNum, leave: kNum + 180 },
      { el: e.frame, arrive: storyTop + span * 0.1, leave: storyTop + span * 0.72 },
      { el: e.story, arrive: storyTop + span * 0.9, leave: storyTop + span + vh * 0.3 },
      { el: e.waitlist, arrive: Math.min(docC(e.waitlist) - vh * 0.5, maxS - 2), leave: Infinity },
    ];
    let last = -1e9;
    for (const st of stops) {
      if (st.arrive < last + 10) st.arrive = last + 10;
      if (st.leave < st.arrive + 10) st.leave = st.arrive + 10;
      last = st.leave;
    }
    this.stops = stops;
  }

  setActive(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    document.documentElement.classList.toggle('pilot-on', on);
    this.ctx.river?.setPilot(on);
    if (on) {
      this.measure();
      this.ctx.gsap.to(this.g, { opacity: 1, duration: 0.6 });
      this.update();
    } else {
      this.ctx.gsap.killTweensOf(this.g);
      this.g.style.opacity = '0';
      this.tail = [];
      this.tailEls.forEach((c) => (c.style.display = 'none'));
    }
  }

  update(): void {
    if (!this.on || !this.stops) return;
    const s = window.scrollY;
    const st = this.stops;
    const n = st.length;
    const vp = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    if (s >= st[n - 1].arrive) {
      this.land(true);
      return;
    }
    this.land(false);
    let pos: { x: number; y: number } | null = null;
    let flying = false;
    for (let i = 0; i < n - 1; i++) {
      if (s < st[i].leave) {
        pos = vp(st[i].el);
        break;
      }
      if (s < st[i + 1].arrive) {
        let p = clamp((s - st[i].leave) / (st[i + 1].arrive - st[i].leave), 0, 1);
        p = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        const A = vp(st[i].el);
        const B = vp(st[i + 1].el);
        const dx = B.x - A.x;
        const dy = B.y - A.y;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const sign = i % 2 ? -1 : 1;
        const C = { x: (A.x + B.x) / 2 + (-dy / len) * len * 0.3 * sign, y: (A.y + B.y) / 2 + (dx / len) * len * 0.3 * sign };
        const q = 1 - p;
        pos = { x: q * q * A.x + 2 * q * p * C.x + p * p * B.x, y: q * q * A.y + 2 * q * p * C.y + p * p * B.y };
        flying = true;
        break;
      }
    }
    if (!pos) return;
    this.g.setAttribute('transform', `translate(${pos.x.toFixed(1)} ${pos.y.toFixed(1)})`);
    if (flying) {
      const lp = this.tail[0];
      if (!lp || Math.abs(lp.x - pos.x) + Math.abs(lp.y - pos.y) > 6) {
        this.tail.unshift(pos);
        if (this.tail.length > 9) this.tail.pop();
      }
    } else this.tail = [];
    for (let j = 0; j < this.tailEls.length; j++) {
      const t = this.tail[j + 1];
      const el = this.tailEls[j];
      if (t) {
        el.setAttribute('cx', t.x.toFixed(1));
        el.setAttribute('cy', t.y.toFixed(1));
        el.style.display = '';
      } else el.style.display = 'none';
    }
  }

  private land(yes: boolean): void {
    if (yes === this.landed) return;
    this.landed = yes;
    this.btn?.classList.toggle('landed', yes);
    this.g.style.visibility = yes ? 'hidden' : 'visible';
    this.tailG.style.visibility = yes ? 'hidden' : 'visible';
  }
}

export function mount(ctx: SiteCtx): Mounted {
  const btn = $('#signup-btn');
  const ready = !ctx.reduced && !ctx.isMobile() && $('#pilot-g') && $('#hero-end') && $('#num-pilot') && $('#frame-pilot') && $('#story-dot') && $('#wl-pilot');
  if (!ready) {
    btn?.classList.add('landed');
    return { destroy() {} };
  }
  const pilot = new Pilot(ctx);
  let riverDone = false;
  let hasReport = document.body.classList.contains('has-report');
  const want = () => riverDone && !hasReport && !!ctx.river?.hasCurve() && !ctx.reduced && !ctx.isMobile();
  const sync = () => pilot.setActive(want());

  const handle: PilotHandle = {
    setActive: (on) => pilot.setActive(on && want()),
    measure: () => pilot.measure(),
    update: () => pilot.update(),
    active: () => pilot.on,
  };
  ctx.pilot = handle;

  const offDone = ctx.on('river:done', () => {
    riverDone = true;
    sync();
  });
  const offReport = ctx.on('report', (d) => {
    hasReport = !!(d as { has: boolean }).has;
    sync();
  });
  const st = ctx.ScrollTrigger.create({
    start: 0,
    end: 'max',
    onRefresh: () => {
      if (pilot.on) {
        pilot.measure();
        pilot.update();
      }
    },
  });
  const tick = () => {
    if (pilot.on) pilot.update();
  };
  ctx.gsap.ticker.add(tick);
  const offResize = ctx.on('resize', () => {
    if (ctx.isMobile() && pilot.on) {
      pilot.setActive(false);
      btn?.classList.add('landed');
    }
  });

  return {
    destroy() {
      offDone();
      offReport();
      offResize();
      st.kill();
      ctx.gsap.ticker.remove(tick);
      pilot.setActive(false);
      document.documentElement.classList.remove('pilot-on');
      btn?.classList.add('landed');
      ctx.pilot = null;
    },
  };
}
