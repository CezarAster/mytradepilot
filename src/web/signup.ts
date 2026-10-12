// Waitlist signup. The post carries the email address, the platform tag and the partner-in-mind tag, and nothing
// else: trades and rules never leave the browser. After success on the band, the form is replaced by the invite
// block (the trader sends the invite; the site never takes the partner's address).
//
// To turn it on, set one provider below and push:
//   Buttondown: provider 'buttondown', id = your Buttondown username
//   Kit (ConvertKit): provider 'kit', id = the form ID (the number in the form's URL)
// While provider is null the signup box stays hidden.
export const SIGNUP: { provider: 'buttondown' | 'kit' | null; id: string } = {
  provider: 'buttondown',
  id: 'MyTradePilot',
};

export const SUCCESS_TEXT = "You're on the list. Check your inbox to confirm your email.";

/** The invite the trader copies or mails (content spec 2.16). Typed in index.html's textarea too; a test keeps them equal. */
export const INVITE_TEXT =
  "I'm joining the Referee pilot on MyTradePilot. If I break one of my own trading rules, you'd get the push, nothing else. Here's the page: https://cezaraster.github.io/mytradepilot/#partner";

export const INVITE_MAILTO = `mailto:?subject=Be%20my%20Referee%20partner&body=${encodeURIComponent(INVITE_TEXT)}`;

function endpoint(): { url: string; field: string } | null {
  const id = encodeURIComponent(SIGNUP.id.trim());
  if (!id) return null;
  if (SIGNUP.provider === 'buttondown') return { url: `https://buttondown.com/api/emails/embed-subscribe/${id}`, field: 'email' };
  if (SIGNUP.provider === 'kit') return { url: `https://app.kit.com/forms/${id}/subscriptions`, field: 'email_address' };
  return null;
}

/** Clipboard write with the textarea + execCommand fallback. Nothing leaves the tab. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the textarea */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Swaps a button's label for `text` for `ms`, then restores it. */
export function flashLabel(btn: HTMLElement, text = 'Copied', ms = 1600): void {
  const original = btn.dataset.label ?? btn.textContent ?? '';
  btn.dataset.label = original;
  btn.textContent = text;
  clearTimeout(Number(btn.dataset.flashTimer));
  btn.dataset.flashTimer = String(
    window.setTimeout(() => {
      btn.textContent = original;
      delete btn.dataset.label;
      delete btn.dataset.flashTimer;
    }, ms),
  );
}

/** Replaces the band's form with the invite block (#signup-invite). No-op on a section without one. */
export function showInvite(section: HTMLElement): void {
  const invite = section.querySelector<HTMLElement>('#signup-invite');
  if (!invite) return;
  const form = section.querySelector('form');
  if (form) form.hidden = true;
  invite.hidden = false;
  const ta = invite.querySelector<HTMLTextAreaElement>('textarea');
  if (ta) ta.value = INVITE_TEXT;
  const mail = invite.querySelector<HTMLAnchorElement>('a[href^="mailto:"]');
  if (mail) mail.href = INVITE_MAILTO;
  const copy = invite.querySelector<HTMLButtonElement>('[data-action="copy-invite"]');
  if (copy && !copy.dataset.bound) {
    copy.dataset.bound = '1';
    copy.addEventListener('click', () => {
      copyText(ta?.value ?? INVITE_TEXT).then((ok) => {
        if (ok) flashLabel(copy);
      });
    });
  }
}

/** Every non-empty field of the form (the email plus the repeated `tag` fields), trimmed. */
function formBody(form: HTMLFormElement): FormData {
  const body = new FormData();
  for (const [k, v] of new FormData(form)) {
    if (typeof v === 'string') {
      if (v.trim()) body.append(k, v.trim());
    } else body.append(k, v);
  }
  return body;
}

export function setupSignup(section: HTMLElement): void {
  const target = endpoint();
  if (!target) return;

  const form = section.querySelector('form')!;
  const input = section.querySelector<HTMLInputElement>('input[type=email]')!;
  const button = section.querySelector<HTMLButtonElement>('button[type=submit]') ?? section.querySelector<HTMLButtonElement>('button')!;
  const message = section.querySelector<HTMLElement>('.signup-msg')!;

  // Plain form fallback (works without JavaScript): posts every field to the provider in a new tab.
  form.action = target.url;
  form.method = 'post';
  form.target = '_blank';
  input.name = target.field;
  section.hidden = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.checkValidity()) {
      input.reportValidity();
      return;
    }
    button.disabled = true;
    message.textContent = 'Signing you up…';
    try {
      const body = formBody(form);
      if (!body.has(target.field)) body.set(target.field, input.value.trim());
      // Providers don't send CORS headers, so the response can't be read; the
      // confirmation email they send is the real check.
      await fetch(target.url, { method: 'POST', body, mode: 'no-cors' });
      form.reset();
      message.textContent = SUCCESS_TEXT;
      showInvite(section);
    } catch {
      message.textContent = 'Opening the signup page in a new tab…';
      form.submit();
    } finally {
      button.disabled = false;
    }
  });
}
