// The pilot marker (6.2): a fixed SVG diamond that leaves the curve end, sits in the +37.3% counter,
// rides the sticky story frame's head, becomes the verdict dot and flies into the waitlist button.
// No pins anywhere: anchors are read with getBoundingClientRect() every frame while active, and the
// scroll stops are re-measured on every ScrollTrigger.refresh.
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clamp, isMobile, type Ctx, type Module } from './motion.ts';

interface Stop {
  el: Element;
  arrive: number;
  leave: number;
}
const easeInOutQuad = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
const NS = 'http://www.w3.org/2000/svg';

export class Pilot {
  g: SVGGElement;
  tailG: SVGGElement;
  els: Record<'hero' | 'numbers' | 'frame' | 'story' | 'waitlist', Element>;
  btn: HTMLElement | null;
  stops: Stop[] | null = null;
  /** The river finished: the marker may show whenever it is not suspended. */
  armed = false;
  /** A report is on screen (or the page is on a phone / reduced): the marker stays hidden. */
  suspended = false;
  on = false;
  landed = false;
  tail: { x: number; y: number }[] = [];
  tailEls: SVGCircleElement[] = [];
  private ticking = false;
  private readonly tick = () => this.update();

  constructor() {
    this.g = document.getElementById('pilot-g') as unknown as SVGGElement;
    this.tailG = document.getElementById('pilot-tail') as unknown as SVGGElement;
    this.els = {
      hero: document.getElementById('hero-end')!,
      numbers: document.getElementById('num-pilot')!,
      frame: document.getElementById('frame-pilot')!,
      story: document.getElementById('story-dot')!,
      waitlist: document.getElementById('wl-pilot')!,
    };
    this.btn = document.getElementById('signup-btn');
    for (let i = 0; i < 9; i++) {
      const c = document.createElementNS(NS, 'circle');
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
    const storyR = document.getElementById('story')!.getBoundingClientRect();
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

  arm(): void {
    this.armed = true;
    this.apply();
  }
  suspend(yes: boolean): void {
    this.suspended = yes;
    this.apply();
    if (yes) {
      // a report is on screen: the layer is off and the band's button shows the diamond
      this.landed = true;
      this.btn?.classList.add('landed');
    }
  }
  private apply(): void {
    this.setActive(this.armed && !this.suspended && !isMobile());
  }
  setActive(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    document.documentElement.classList.toggle('pilot-on', on);
    if (on) {
      this.measure();
      gsap.to(this.g, { opacity: 1, duration: 0.6 });
      if (!this.ticking) {
        gsap.ticker.add(this.tick);
        this.ticking = true;
      }
      this.update();
    } else {
      gsap.killTweensOf(this.g);
      this.g.style.opacity = '0';
      if (this.ticking) {
        gsap.ticker.remove(this.tick);
        this.ticking = false;
      }
      this.tail = [];
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
        const p = easeInOutQuad(clamp((s - st[i].leave) / (st[i + 1].arrive - st[i].leave), 0, 1));
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

  land(yes: boolean): void {
    if (yes === this.landed) return;
    this.landed = yes;
    this.btn?.classList.toggle('landed', yes);
    this.g.style.visibility = yes ? 'hidden' : 'visible';
    this.tailG.style.visibility = yes ? 'hidden' : 'visible';
  }
}

export function mount(ctx: Ctx): Module & { pilot: Pilot } {
  const pilot = new Pilot();
  let st: ScrollTrigger | null = null;
  const btn = document.getElementById('signup-btn');
  if (ctx.reduced || isMobile() || !pilot.g) {
    btn?.classList.add('landed');
  } else {
    st = ScrollTrigger.create({
      start: 0,
      end: 'max',
      onRefresh: () => {
        pilot.measure();
        pilot.update();
      },
    });
  }
  const relayout = () => {
    if (ctx.reduced) return;
    if (isMobile()) {
      pilot.setActive(false);
      btn?.classList.add('landed');
    } else if (pilot.armed && !pilot.suspended) {
      pilot.setActive(true);
      pilot.measure();
    }
  };
  window.addEventListener('site:relayout', relayout);
  return {
    pilot,
    destroy() {
      window.removeEventListener('site:relayout', relayout);
      st?.kill();
      pilot.setActive(false);
      pilot.armed = false;
      btn?.classList.add('landed');
    },
  };
}
