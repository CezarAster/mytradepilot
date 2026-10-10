// Nav and page plumbing: the stuck nav, data-action / data-scroll-to delegation, the dock, the export
// tabs, details/tab refresh hooks, the motion toggle, the drop pulse, file-card adoption, the second
// signup form and signup:done, the magnetic buttons and the band's submit pop.
import gsap from 'gsap';
import { setupSignup } from '../signup.ts';
import { clamp, disable, fine, isMobile, navH, refresh, scrollToEl, type Ctx, type Module } from './motion.ts';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const navEl = document.querySelector<HTMLElement>('.nav');

export function onScroll(y: number): void {
  navEl?.classList.toggle('is-scrolled', y > 40);
}

const DONE_TEXT = "You're on the list.";
const SUCCESS = "You're on the list. Check your inbox to confirm your email.";

export function mount(ctx: Ctx): Module {
  const files = $<HTMLInputElement>('files')!;
  const drop = $<HTMLLabelElement>('drop')!;
  const input = $<HTMLElement>('input')!;
  const demo = $<HTMLButtonElement>('demo')!;
  const help = $<HTMLDetailsElement>('help');
  const cleanups: (() => void)[] = [];
  const on = (target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean) => {
    target.addEventListener(type, fn, opts);
    cleanups.push(() => target.removeEventListener(type, fn, opts));
  };

  // ----- actions -----
  let pulseTimer = 0;
  const pulse = () => {
    drop.classList.add('pulse');
    clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => drop.classList.remove('pulse'), 1400);
  };
  const inputOnScreen = () => {
    const r = input.getBoundingClientRect();
    return r.bottom > navH() + 40 && r.top < window.innerHeight - 40;
  };
  const pick = () => {
    files.click(); // synchronously, inside the user gesture: the OS picker opens in one click
    if (isMobile() || !inputOnScreen()) scrollToEl(input, -(navH() + 16));
    drop.focus({ preventScroll: true });
    pulse();
  };
  const openHelp = () => {
    if (!help) return;
    help.open = true;
    scrollToEl(help, -(navH() + 24));
    refresh();
  };
  on(document, 'click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-action],[data-scroll-to],a[href^="#"]');
    if (!t) return;
    const action = t.dataset.action;
    if (action === 'pick') {
      e.preventDefault();
      pick();
    } else if (action === 'demo') {
      e.preventDefault();
      demo.click();
    } else if (action === 'help') {
      e.preventDefault();
      openHelp();
    } else {
      const href = t.getAttribute('href') ?? '';
      if (!href.startsWith('#') || href.length < 2) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      scrollToEl(href, href === '#top' ? 0 : -(navH() + 8));
    }
  });
  // the drop zone is a <label>: Enter/Space open the picker like a click would
  on(drop, 'keydown', (e) => {
    const k = (e as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      e.preventDefault();
      files.click();
    }
  });

  // ----- file card adoption + river replay after a pick/drop -----
  const name = $<HTMLElement>('file-card-name');
  const meta = $<HTMLElement>('file-card-meta');
  const adopt = (list: FileList | null | undefined) => {
    if (!list || !list.length || !name || !meta) return;
    const arr = [...list];
    const kb = Math.max(1, Math.round(arr.reduce((a, f) => a + f.size, 0) / 1024));
    name.textContent = arr[0].name;
    meta.textContent = arr.length === 1 ? `${kb} KB` : `${arr.length} files · ${kb} KB`;
    ctx.river?.replay();
  };
  on(files, 'change', () => adopt(files.files));
  on(drop, 'drop', (e) => adopt((e as DragEvent).dataTransfer?.files));

  // ----- details / tabs → refresh -----
  on(document, 'toggle', () => refresh(), true);
  const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const selectTab = (tab: HTMLButtonElement, focus = false) => {
    tabs.forEach((t) => {
      const selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') ?? '');
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus();
    refresh();
  };
  tabs.forEach((tab) => {
    on(tab, 'click', () => selectTab(tab));
    on(tab, 'keydown', (e) => {
      const k = (e as KeyboardEvent).key;
      const i = tabs.indexOf(tab);
      let next = -1;
      if (k === 'ArrowRight' || k === 'ArrowDown') next = (i + 1) % tabs.length;
      else if (k === 'ArrowLeft' || k === 'ArrowUp') next = (i - 1 + tabs.length) % tabs.length;
      else if (k === 'Home') next = 0;
      else if (k === 'End') next = tabs.length - 1;
      if (next >= 0) {
        e.preventDefault();
        selectTab(tabs[next], true);
      }
    });
  });
  // the TradingView menu path lights in sequence once (row 45)
  const path = [...document.querySelectorAll<HTMLElement>('#menu-path .mchip')];
  if (path.length && !ctx.reduced && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((en) => {
      if (!en[0].isIntersecting) return;
      io.disconnect();
      path.forEach((chip, i) => setTimeout(() => chip.classList.add('lit'), 300 + i * 400));
    });
    io.observe(path[0]);
    cleanups.push(() => io.disconnect());
  }

  // ----- second signup form, signup:done -----
  const mini = $<HTMLElement>('signup-report');
  if (mini) setupSignup(mini);
  const forms = [document.getElementById('signup'), mini].filter((s): s is HTMLElement => !!s);
  const markDone = (except: HTMLElement) => {
    forms.forEach((section) => {
      if (section === except) return;
      const form = section.querySelector('form');
      const msg = section.querySelector<HTMLElement>('.signup-msg');
      if (form) form.hidden = true;
      if (msg) {
        msg.textContent = DONE_TEXT;
        msg.classList.add('signup-done');
      }
    });
  };
  forms.forEach((section) => {
    const msg = section.querySelector<HTMLElement>('.signup-msg');
    if (!msg) return;
    const mo = new MutationObserver(() => {
      if (msg.textContent === SUCCESS) {
        section.dispatchEvent(new CustomEvent('signup:done', { bubbles: true }));
        markDone(section);
      }
    });
    mo.observe(msg, { childList: true, characterData: true, subtree: true });
    cleanups.push(() => mo.disconnect());
    const btn = section.querySelector<HTMLButtonElement>('button[type=submit]');
    const form = section.querySelector('form');
    if (form && btn) on(form, 'submit', () => !ctx.reduced && gsap.fromTo(btn, { scale: 0.97 }, { scale: 1, duration: 0.2, clearProps: 'transform' }));
  });

  // ----- motion toggle (8.4.11) -----
  const toggle = $<HTMLButtonElement>('motion-toggle');
  const store = (v: string) => {
    try {
      localStorage.setItem('motion', v);
    } catch {
      /* private mode */
    }
  };
  const label = () => {
    if (!toggle) return;
    toggle.textContent = `Motion: ${ctx.reduced ? 'off' : 'on'}`;
    toggle.setAttribute('aria-pressed', String(!ctx.reduced));
  };
  label();
  if (toggle)
    on(toggle, 'click', () => {
      if (!ctx.reduced) {
        store('off');
        disable();
        label();
      } else {
        store('on');
        const report = document.getElementById('report');
        if (report && report.children.length) {
          toggle.textContent = 'Motion: on next load';
          toggle.setAttribute('aria-pressed', 'true');
        } else location.reload();
      }
    });

  // ----- dock (3.16) -----
  const dock = $<HTMLElement>('dock');
  const blockers = new Set<Element>();
  let inputAbove = false;
  let scrolled = false;
  let focused = false;
  const updateDock = () => {
    if (!dock) return;
    const show = scrolled && inputAbove && blockers.size === 0 && !document.body.classList.contains('has-report') && !focused;
    dock.dataset.visible = String(show);
  };
  if (dock && 'IntersectionObserver' in window) {
    const watched = ['#input', '#report-followup', '#roadmap .roadmap-foot', '#signup', '#final'].map((s) => document.querySelector(s)).filter((e): e is Element => !!e);
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) blockers.add(en.target);
        else blockers.delete(en.target);
        if (en.target === input) inputAbove = !en.isIntersecting && en.boundingClientRect.bottom < 0;
      });
      updateDock();
    });
    watched.forEach((el) => io.observe(el));
    cleanups.push(() => io.disconnect());
    on(window, 'scroll', () => {
      if (!scrolled) {
        scrolled = true;
        updateDock();
      }
    }, { passive: true });
    on(document, 'focusin', (e) => {
      focused = (e.target as Element).matches?.('input,select,textarea') ?? false;
      updateDock();
    });
    on(document, 'focusout', () => {
      focused = false;
      updateDock();
    });
    const mo = new MutationObserver(updateDock);
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    cleanups.push(() => mo.disconnect());
  }

  // ----- magnetic buttons (fine pointers, motion only) -----
  if (!ctx.reduced && fine()) {
    document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((btn) => {
      const mx = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3' });
      const my = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3' });
      on(btn, 'pointermove', (e) => {
        if (ctx.reduced) return;
        const r = btn.getBoundingClientRect();
        const ev = e as PointerEvent;
        mx(clamp((ev.clientX - (r.left + r.width / 2)) * 0.3, -12, 12));
        my(clamp((ev.clientY - (r.top + r.height / 2)) * 0.4, -12, 12));
      });
      on(btn, 'pointerleave', () => {
        mx(0);
        my(0);
      });
    });
  }

  return {
    destroy() {
      // the actions, tabs, toggle and dock keep working after motion is turned off; only tweens stop
      document.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((b) => gsap.set(b, { clearProps: 'transform' }));
      updateDock();
    },
  };
}
