// Stuck nav, data-action / data-scroll-to delegation, the dock, export tabs, details refresh
// hooks, the motion toggle, the drop pulse, file-card adoption, the second signup form and
// magnetic buttons. Never touches the analyzer's logic: data-action="demo" clicks #demo and
// data-action="pick" clicks #files, exactly as a visitor would.
import { setupSignup } from '../signup.ts';
import type { Mounted, SiteCtx } from './types.ts';
import { $, $$, byId, clamp, emit, isMobile, navH, on } from './util.ts';

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

export function mount(ctx: SiteCtx): Mounted {
  const html = document.documentElement;
  let kit = ctx.kit;
  const navEl = $<HTMLElement>('.nav')!;
  const files = byId<HTMLInputElement>('files')!;
  const drop = byId<HTMLLabelElement>('drop')!;
  const input = byId('input')!;
  const demo = byId<HTMLButtonElement>('demo')!;
  const dock = byId('dock')!;
  const cleanups: (() => void)[] = [];

  // --- stuck nav -------------------------------------------------------------------------
  const onScrollNav = (y: number) => navEl.classList.toggle('is-scrolled', y > 40);
  if (kit) kit.onScroll(onScrollNav);
  else window.addEventListener('scroll', () => onScrollNav(window.scrollY), { passive: true });
  onScrollNav(window.scrollY);

  // --- scrolling ---------------------------------------------------------------------------
  const scrollTo = (target: Element | string, offset = -(navH() + 8)) => {
    if (kit) {
      kit.scrollTo(target, offset);
      return;
    }
    const el = typeof target === 'string' ? $(target) : target;
    if (!el) return;
    const y = target === '#top' || el === navEl ? 0 : el.getBoundingClientRect().top + window.scrollY + offset;
    window.scrollTo(0, y);
  };

  // --- actions -----------------------------------------------------------------------------
  let pulseTimer = 0;
  const pulse = () => {
    drop.classList.add('pulse');
    clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => drop.classList.remove('pulse'), 1400);
  };
  const pick = () => {
    files.click();
    const r = input.getBoundingClientRect();
    const off = r.bottom < 0 || r.top > window.innerHeight;
    if (isMobile() || off) scrollTo(input, -(navH() + 16));
    drop.focus({ preventScroll: true });
    pulse();
  };
  const help = () => {
    const d = byId<HTMLDetailsElement>('help');
    if (!d) return;
    d.open = true;
    scrollTo(d, -(navH() + 24));
    kit?.refresh();
  };
  document.addEventListener('click', (e) => {
    const t = (e.target as Element | null)?.closest<HTMLElement>('[data-action],[data-scroll-to]');
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
      help();
    } else if (t.hasAttribute('data-scroll-to')) {
      const href = t.getAttribute('href') ?? '';
      if (href.startsWith('#') && (href === '#top' || byId(href.slice(1)))) {
        e.preventDefault();
        scrollTo(href, href === '#top' ? 0 : undefined);
        if (href !== '#top') byId(href.slice(1))?.focus?.({ preventScroll: true });
      }
    }
  });
  drop.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      files.click();
    }
  });

  // --- file card adoption + river replay --------------------------------------------------
  const cardName = byId('file-card-name');
  const cardMeta = byId('file-card-meta');
  const adopt = (list: FileList | null | undefined) => {
    if (!list || !list.length || !cardName || !cardMeta) return;
    const arr = Array.from(list);
    const kb = Math.max(1, Math.round(arr.reduce((a, f) => a + f.size, 0) / 1024));
    cardName.textContent = arr[0].name;
    cardMeta.textContent = arr.length === 1 ? `${kb} KB` : `${arr.length} files · ${kb} KB`;
    emit('river:replay');
  };
  files.addEventListener('change', () => adopt(files.files));
  drop.addEventListener('drop', (e) => adopt(e.dataTransfer?.files));

  // --- dock ---------------------------------------------------------------------------------
  let scrolledOnce = window.scrollY > 0;
  let inputAbove = false;
  const blockers = new Set<Element>();
  const updateDock = () => {
    const focusIn = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName ?? '');
    const visible = scrolledOnce && inputAbove && blockers.size === 0 && !document.body.classList.contains('has-report') && !focusIn;
    dock.dataset.visible = String(visible);
  };
  const watched = ['#input', '#report-followup', '#roadmap .roadmap-foot', '#signup', '#final'].map((s) => $(s)).filter((el): el is HTMLElement => !!el);
  if ('IntersectionObserver' in window) {
    const dockIo = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (en.target === input) inputAbove = !en.isIntersecting && en.boundingClientRect.bottom < 0;
          if (en.isIntersecting) blockers.add(en.target);
          else blockers.delete(en.target);
        }
        updateDock();
      },
      { threshold: 0 },
    );
    watched.forEach((el) => dockIo.observe(el));
    cleanups.push(() => dockIo.disconnect());
  }
  const firstScroll = () => {
    if (!scrolledOnce && window.scrollY > 0) {
      scrolledOnce = true;
      updateDock();
    }
  };
  if (kit) kit.onScroll(firstScroll);
  window.addEventListener('scroll', firstScroll, { passive: true });
  document.addEventListener('focusin', updateDock);
  document.addEventListener('focusout', () => setTimeout(updateDock, 0));
  cleanups.push(on('report:shown', updateDock), on('report:cleared', updateDock));

  // --- export tabs --------------------------------------------------------------------------
  const tablist = $('[role="tablist"]');
  if (tablist) {
    const tabs = $$<HTMLButtonElement>('[role="tab"]', tablist);
    const select = (i: number, focus = false) => {
      tabs.forEach((t, k) => {
        const onTab = k === i;
        t.setAttribute('aria-selected', String(onTab));
        t.tabIndex = onTab ? 0 : -1;
        const panel = byId(t.getAttribute('aria-controls') ?? '');
        if (panel) panel.hidden = !onTab;
        if (onTab && focus) t.focus();
      });
      kit?.refresh();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', (e) => {
        const n = tabs.length;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') select((i + 1) % n, true);
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') select((i - 1 + n) % n, true);
        else if (e.key === 'Home') select(0, true);
        else if (e.key === 'End') select(n - 1, true);
        else return;
        e.preventDefault();
      });
    });
  }

  // --- details toggles change the page height ----------------------------------------------
  document.addEventListener('toggle', () => kit?.refresh(), true);

  // --- motion toggle ------------------------------------------------------------------------
  const mt = byId<HTMLButtonElement>('motion-toggle');
  const motionOn = () => html.classList.contains('motion');
  const labelToggle = () => {
    if (!mt) return;
    mt.textContent = motionOn() ? 'Motion: on' : 'Motion: off';
    mt.setAttribute('aria-pressed', String(motionOn()));
  };
  labelToggle();
  mt?.addEventListener('click', () => {
    if (motionOn() && kit) {
      store('motion', 'off');
      kit.disable();
      labelToggle();
      return;
    }
    store('motion', 'on');
    const report = byId('report');
    if (!report || report.children.length === 0) {
      location.reload();
      return;
    }
    mt.textContent = 'Motion: on next load';
    mt.setAttribute('aria-pressed', 'true');
  });

  // --- second signup form + signup:done ---------------------------------------------------
  const sections = [byId('signup'), byId('signup-report')].filter((s): s is HTMLElement => !!s);
  const mini = byId('signup-report');
  if (mini) {
    try {
      setupSignup(mini);
    } catch (e) {
      console.error(e);
    }
  }
  for (const section of sections) {
    const msg = $<HTMLElement>('.signup-msg', section);
    const form = $<HTMLFormElement>('form', section);
    if (!msg || !form) continue;
    const mo = new MutationObserver(() => {
      if ((msg.textContent ?? '').startsWith("You're on the list")) emit('signup:done', section.id);
    });
    mo.observe(msg, { childList: true, characterData: true, subtree: true });
    cleanups.push(() => mo.disconnect());
    form.addEventListener('submit', () => {
      const btn = $<HTMLElement>('button[type=submit]', form);
      if (kit && btn) kit.gsap.fromTo(btn, { scale: 0.97 }, { scale: 1, duration: 0.2, ease: 'power2.out' });
    });
  }
  cleanups.push(
    on<string>('signup:done', (doneId) => {
      for (const section of sections) {
        if (section.id === doneId) continue;
        const form = $<HTMLFormElement>('form', section);
        const msg = $<HTMLElement>('.signup-msg', section);
        if (form && !form.hidden) {
          form.hidden = true;
          if (msg) msg.textContent = "You're on the list.";
        }
      }
    }),
  );

  // --- magnetic buttons (fine pointers, desktop, motion) ---------------------------------
  const magnets: (() => void)[] = [];
  if (kit && kit.fine && !isMobile()) {
    const { gsap } = kit;
    for (const btn of $$<HTMLElement>('[data-magnetic]')) {
      const mx = gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3' });
      const my = gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3' });
      const move = (e: PointerEvent) => {
        const r = btn.getBoundingClientRect();
        mx(clamp((e.clientX - (r.left + r.width / 2)) * 0.3, -12, 12));
        my(clamp((e.clientY - (r.top + r.height / 2)) * 0.4, -12, 12));
      };
      const leave = () => {
        mx(0);
        my(0);
      };
      btn.addEventListener('pointermove', move);
      btn.addEventListener('pointerleave', leave);
      magnets.push(() => {
        btn.removeEventListener('pointermove', move);
        btn.removeEventListener('pointerleave', leave);
        btn.style.transform = '';
      });
    }
  }

  return {
    destroy() {
      magnets.forEach((f) => f());
      magnets.length = 0;
      kit = null;
      window.addEventListener('scroll', () => onScrollNav(window.scrollY), { passive: true });
      labelToggle();
    },
  };
}
