import type gsap from 'gsap';
import type { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { SplitText } from 'gsap/SplitText';
import type Lenis from 'lenis';
import type { SampleData } from './sample.ts';

export interface Mounted {
  destroy(): void;
}

/** Everything the motion system provides. Absent (null) under reduced motion. */
export interface MotionKit {
  gsap: typeof gsap;
  ScrollTrigger: typeof ScrollTrigger;
  SplitText: typeof SplitText;
  lenis: Lenis | null;
  splits: SplitText[];
  fine: boolean;
  /** `[data-reveal]` elements under `root` not yet wired: fade up once when they enter. */
  reveal(root?: ParentNode): void;
  /** `[data-split]` headlines under `root`: SplitText lines rising out of masks, once. */
  split(root?: ParentNode): void;
  /** `[data-counter]` and `[data-count]` numbers under `root`: count up once when they enter. */
  count(root?: ParentNode): void;
  /** `ScrollTrigger.refresh()`, debounced 100ms. */
  refresh(): void;
  scrollTo(target: Element | string, offset?: number): void;
  onScroll(cb: (y: number) => void): void;
  register(mod: Mounted): void;
  /** Kills every tween and trigger and leaves the page in its static state. */
  disable(): void;
}

export interface SiteCtx {
  gsap: typeof gsap | null;
  ScrollTrigger: typeof ScrollTrigger | null;
  lenis: Lenis | null;
  reduced: boolean;
  sample: Promise<SampleData>;
  kit: MotionKit | null;
}

export type Mount = (ctx: SiteCtx) => Mounted;
