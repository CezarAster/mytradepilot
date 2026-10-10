// Site boot. Runs after main.ts (document order), never imports it, and never blocks the analyzer.
// The head gate added html.motion when motion is allowed; if this file fails to boot within 2 s the
// gate removes it again and revealAll() leaves every reveal target in its final state.
declare global {
  interface Window {
    __booted: boolean;
  }
}

const html = document.documentElement;

/** Static final state for everything motion would otherwise hide or offset. */
export function revealAll(): void {
  html.classList.remove('motion', 'pilot-on');
  document.querySelectorAll<HTMLElement>('[data-reveal],[data-hero],[data-split],[data-ms],[data-count],[data-counter]').forEach((el) => {
    el.style.opacity = '';
    el.style.visibility = '';
    el.style.transform = '';
  });
  document
    .querySelectorAll<HTMLElement>('.pf-row,.pf-row .tick,.pf-verdict,.pf-face,.milestone,#preflight-roadmap,#pf-slot,.story-steps .step')
    .forEach((el) => {
      el.style.opacity = '';
      el.style.transform = '';
      el.style.height = '';
      el.style.minHeight = '';
    });
  document.getElementById('signup-btn')?.classList.add('landed');
}

window.addEventListener('error', () => {
  if (!window.__booted) revealAll();
});

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const fontsReady: Promise<unknown> = document.fonts?.ready ?? Promise.resolve();

async function boot(): Promise<void> {
  try {
    const motion = await import('./motion.ts');
    await motion.boot({ revealAll });
    window.__booted = true;
  } catch (err) {
    revealAll();
    html.classList.add('motion-failed');
    window.__booted = true;
    throw err;
  }
}

Promise.race([fontsReady, delay(900)]).then(boot, boot);

export {};
