// Stuck nav, data-action / data-scroll-to delegation (pick, demo, help, enforce, copy-rules, copy-invite), the dock,
// export tabs, details and tab refresh hooks, the motion toggle, the drop pulse, file-card adoption, the second signup
// form and magnetic buttons (build spec 3.16, 6.8, 8.4; content spec 2.2 and 2.16).
import { copyText, flashLabel, setupSignup, showInvite } from '../signup.ts';
import { $, $$, clamp, disable, type Mounted, type SiteCtx } from './motion.ts';

const html = document.documentElement;

function fileCardAdopt(files: FileList | File[] | null): void {
  const list = files ? Array.from(files) : [];
  if (!list.length) return;
  const name = $('#file-card-name');
  const meta = $('#file-card-meta');
  if (name) name.textContent = list[0].name;
  if (meta) {
    const kb = Math.max(1, Math.round(list.reduce((a, f) => a + f.size, 0) / 1024));
    meta.textContent = list.length > 1 ? `${list.length} files · ${kb} KB` : `${kb} KB`;
  }
}

function tabs(ctx: SiteCtx): () => void {
  const list = $('[role="tablist"]');
  if (!list) return () => {};
  const tabEls = $$<HTMLButtonElement>('[role="tab"]', list);
  const select = (tab: HTMLButtonElement, focus = false) => {
    tabEls.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls') || '');
      if (panel) panel.hidden = !on;
    });
    if (focus) tab.focus();
    ctx.refresh();
  };
  const onClick = (e: Event) => {
    const t = (e.target as Element).closest<HTMLButtonElement>('[role="tab"]');
    if (t) select(t);
  };
  const onKey = (e: KeyboardEvent) => {
    const i = tabEls.findIndex((t) => t === document.activeElement);
    if (i < 0) return;
    let j = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabEls.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabEls.length) % tabEls.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabEls.length - 1;
    if (j >= 0) {
      e.preventDefault();
      select(tabEls[j], true);
    }
  };
  list.addEventListener('click', onClick);
  list.addEventListener('keydown', onKey);
  return () => {
    list.removeEventListener('click', onClick);
    list.removeEventListener('keydown', onKey);
  };
}

/** The dock shows once the console has scrolled away and hides near every other call to action (spec 3.16). */
function dock(ctx: SiteCtx): () => void {
  const dockEl = $('#dock');
  const input = $('#input');
  if (!dockEl || !input) return () => {};
  const blockers = ['#input', '#report-followup', '#pricing .pricing-cards', '#roadmap .roadmap-foot', '#signup', '#final']
    .map((s) => $(s) ?? (s.startsWith('#pricing') ? $('#pricing') : null))
    .filter((el): el is HTMLElement => !!el);
  const intersecting = new Set<Element>();
  let scrolled = false;
  let focused = false;
  let raf = 0;
  const evaluate = () => {
    raf = 0;
    const inputAbove = input.getBoundingClientRect().bottom < 0;
    const show = scrolled && inputAbove && !intersecting.size && !document.body.classList.contains('has-report') && !focused;
    dockEl.setAttribute('data-visible', String(show));
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(evaluate);
  };
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (en.isIntersecting) intersecting.add(en.target);
        else intersecting.delete(en.target);
      }
      queue();
    },
    { threshold: 0 },
  );
  blockers.forEach((el) => io.observe(el));
  const onScroll = () => {
    scrolled = true;
    queue();
  };
  const onFocus = (e: FocusEvent) => {
    const t = e.target as Element | null;
    focused = !!t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    queue();
  };
  const onBlur = () => {
    focused = false;
    queue();
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('focusin', onFocus);
  document.addEventListener('focusout', onBlur);
  const off = ctx.on('report', queue);
  return () => {
    io.disconnect();
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('focusin', onFocus);
    document.removeEventListener('focusout', onBlur);
    off();
    dockEl.setAttribute('data-visible', 'false');
  };
}

function magnetic(ctx: SiteCtx): () => void {
  if (ctx.reduced || !ctx.fine) return () => {};
  const cleanups: (() => void)[] = [];
  $$('[data-magnetic]').forEach((btn) => {
    const mx = ctx.gsap.quickTo(btn, 'x', { duration: 0.4, ease: 'power3' });
    const my = ctx.gsap.quickTo(btn, 'y', { duration: 0.4, ease: 'power3' });
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
    cleanups.push(() => {
      btn.removeEventListener('pointermove', move);
      btn.removeEventListener('pointerleave', leave);
      ctx.gsap.set(btn, { clearProps: 'x,y' });
    });
  });
  return () => cleanups.forEach((f) => f());
}

/** Both waitlist forms: signup.ts handles the post; here each success marks the other form done. */
function secondSignup(ctx: SiteCtx): () => void {
  const band = $('#signup');
  const mini = $('#signup-report');
  if (mini) setupSignup(mini);
  const forms = [band, mini].filter((s): s is HTMLElement => !!s);
  const observers: MutationObserver[] = [];
  let done = false;
  const markOthers = (source: HTMLElement) => {
    if (done) return;
    done = true;
    forms
      .filter((s) => s !== source)
      .forEach((s) => {
        const form = s.querySelector('form');
        const msg = s.querySelector<HTMLElement>('.signup-msg');
        if (form) form.hidden = true;
        if (msg) msg.textContent = "You're on the list.";
        // The invite block lives only on the band; the mini form just says "You're on the list."
        if (s === band) showInvite(s);
      });
    ctx.emit('signup:done', source);
  };
  forms.forEach((s) => {
    const msg = s.querySelector<HTMLElement>('.signup-msg');
    if (!msg) return;
    const mo = new MutationObserver(() => {
      if (/^You're on the list/.test(msg.textContent ?? '')) markOthers(s);
    });
    mo.observe(msg, { childList: true, characterData: true, subtree: true });
    observers.push(mo);
  });
  const btn = $('#signup-btn');
  const form = $('#signup-form');
  const pop = () => {
    if (!ctx.reduced && btn) ctx.gsap.fromTo(btn, { scale: 0.97 }, { scale: 1, duration: 0.2, clearProps: 'scale' });
  };
  form?.addEventListener('submit', pop);
  return () => {
    observers.forEach((o) => o.disconnect());
    form?.removeEventListener('submit', pop);
  };
}

export function mount(ctx: SiteCtx): Mounted {
  const files = $<HTMLInputElement>('#files');
  const drop = $('#drop');
  const demo = $('#demo');
  const input = $('#input');
  const help = $<HTMLDetailsElement>('#help');
  let pulseTimer = 0;

  const pulse = () => {
    if (!drop) return;
    drop.classList.add('pulse');
    clearTimeout(pulseTimer);
    pulseTimer = window.setTimeout(() => drop.classList.remove('pulse'), 1400);
  };
  const pick = () => {
    files?.click();
    if (input && (ctx.isMobile() || input.getBoundingClientRect().bottom < 0 || input.getBoundingClientRect().top > window.innerHeight)) {
      ctx.scrollTo(input, -(ctx.navH() + 16), 0.9);
    }
    drop?.focus({ preventScroll: true });
    pulse();
  };
  const openHelp = () => {
    if (!help) return;
    help.open = true;
    ctx.scrollTo(help, -(ctx.navH() + 24), 0.9);
    ctx.refresh();
  };
  /** The three draft sentences as rendered in the report. */
  const draftSentences = () => $$('[data-draft-sentence]', $('#drafts') ?? document).map((el) => (el.textContent ?? '').trim()).filter(Boolean);
  /** "Have the Referee enforce these": the drafts stay in this tab; the band is told how many, the email field gets focus. Nothing is posted. */
  const enforce = () => {
    const sentences = draftSentences();
    try {
      sessionStorage.setItem('mtp-drafts', JSON.stringify(sentences));
    } catch {
      /* storage blocked: the sentences still stay on the page */
    }
    const context = $('#signup-context');
    if (context) {
      context.textContent = `Joining with ${sentences.length} draft rule${sentences.length === 1 ? '' : 's'}. They stay in this tab; we get your email.`;
      context.hidden = false;
    }
    const band = $('#signup');
    if (band) ctx.scrollTo(band, -(ctx.navH() + 8));
    $<HTMLInputElement>('#signup-email')?.focus({ preventScroll: true });
  };
  const copyRules = (btn: HTMLElement) => {
    copyText(draftSentences().join('\n')).then((ok) => {
      if (ok) flashLabel(btn);
    });
  };
  const copyInvite = (btn: HTMLElement) => {
    const ta = $<HTMLTextAreaElement>('#signup-invite textarea');
    if (!ta) return;
    copyText(ta.value).then((ok) => {
      if (ok) flashLabel(btn);
    });
  };

  const onClick = (e: MouseEvent) => {
    const target = e.target as Element | null;
    if (!target) return;
    const action = target.closest<HTMLElement>('[data-action]');
    if (action) {
      const kind = action.dataset.action;
      if (kind === 'pick') pick();
      else if (kind === 'demo') demo?.click();
      else if (kind === 'help') openHelp();
      else if (kind === 'enforce') enforce();
      else if (kind === 'copy-rules') copyRules(action);
      else if (kind === 'copy-invite' && !action.dataset.bound) copyInvite(action);
      return;
    }
    const link = target.closest<HTMLAnchorElement>('a[href^="#"]');
    if (link && link.closest('#report') === null) {
      const id = link.getAttribute('href') || '';
      if (id.length > 1 && document.querySelector(id)) {
        e.preventDefault();
        ctx.scrollTo(id, id === '#top' ? 0 : -(ctx.navH() + 8));
        // The skip link hands focus to the drop zone, as a plain anchor jump would.
        if (link.id === 'skip') $<HTMLElement>(id)?.focus({ preventScroll: true });
      }
    }
  };
  document.addEventListener('click', onClick);

  const onDropKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      files?.click();
    }
  };
  drop?.addEventListener('keydown', onDropKey);
  const onFilesChange = () => {
    fileCardAdopt(files?.files ?? null);
    ctx.river?.replay();
  };
  const onDrop = (e: DragEvent) => {
    fileCardAdopt(e.dataTransfer?.files ?? null);
    ctx.river?.replay();
  };
  files?.addEventListener('change', onFilesChange);
  drop?.addEventListener('drop', onDrop);

  const onToggle = () => ctx.refresh();
  $$('details').forEach((d) => d.addEventListener('toggle', onToggle));

  const toggle = $<HTMLButtonElement>('#motion-toggle');
  const setToggleLabel = () => {
    if (!toggle) return;
    toggle.textContent = `Motion: ${ctx.reduced ? 'off' : 'on'}`;
    toggle.setAttribute('aria-pressed', String(!ctx.reduced));
  };
  setToggleLabel();
  const onToggleClick = () => {
    if (!toggle) return;
    if (!ctx.reduced) {
      try {
        localStorage.setItem('motion', 'off');
      } catch {
        /* storage blocked: the switch still applies to this load */
      }
      disable(ctx);
      setToggleLabel();
      return;
    }
    try {
      localStorage.setItem('motion', 'on');
    } catch {
      /* ignore */
    }
    const report = $('#report');
    if (report && report.children.length) {
      toggle.textContent = 'Motion: on next load';
      toggle.setAttribute('aria-pressed', 'true');
    } else location.reload();
  };
  toggle?.addEventListener('click', onToggleClick);

  let mq: MediaQueryList | null = null;
  const onMq = (e: MediaQueryListEvent) => {
    if (e.matches && !ctx.reduced) {
      disable(ctx);
      setToggleLabel();
    }
  };
  try {
    mq = matchMedia('(prefers-reduced-motion: reduce)');
    mq.addEventListener('change', onMq);
  } catch {
    mq = null;
  }

  const offTabs = tabs(ctx);
  const offDock = dock(ctx);
  const offSignup = secondSignup(ctx);
  let offMagnetic = magnetic(ctx);
  const offDisable = ctx.on('disable', () => {
    offMagnetic();
    offMagnetic = () => {};
    setToggleLabel();
  });

  return {
    destroy() {
      // The nav keeps working after the motion switch; only the motion-dependent craft is torn down.
      offMagnetic();
      offDisable();
      void offTabs;
      void offDock;
      void offSignup;
    },
  };
}
