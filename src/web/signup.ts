// Waitlist signup. Only the email address is sent; trades never leave the browser.
//
// To turn it on, set one provider below and push:
//   Buttondown: provider 'buttondown', id = your Buttondown username
//   Kit (ConvertKit): provider 'kit', id = the form ID (the number in the form's URL)
// While provider is null the signup box stays hidden.
export const SIGNUP: { provider: 'buttondown' | 'kit' | null; id: string } = {
  provider: 'buttondown',
  id: 'MyTradePilot',
};

function endpoint(): { url: string; field: string } | null {
  const id = encodeURIComponent(SIGNUP.id.trim());
  if (!id) return null;
  if (SIGNUP.provider === 'buttondown') return { url: `https://buttondown.com/api/emails/embed-subscribe/${id}`, field: 'email' };
  if (SIGNUP.provider === 'kit') return { url: `https://app.kit.com/forms/${id}/subscriptions`, field: 'email_address' };
  return null;
}

export function setupSignup(section: HTMLElement): void {
  const target = endpoint();
  if (!target) return;

  const form = section.querySelector('form')!;
  const input = section.querySelector<HTMLInputElement>('input[type=email]')!;
  const button = section.querySelector<HTMLButtonElement>('button')!;
  const message = section.querySelector<HTMLElement>('.signup-msg')!;

  // Plain form fallback (works without JavaScript): posts to the provider in a new tab.
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
      const body = new FormData();
      body.set(target.field, input.value.trim());
      // Providers don't send CORS headers, so the response can't be read; the
      // confirmation email they send is the real check.
      await fetch(target.url, { method: 'POST', body, mode: 'no-cors' });
      form.reset();
      message.textContent = "You're on the list. Check your inbox to confirm your email.";
    } catch {
      message.textContent = 'Opening the signup page in a new tab…';
      form.submit();
    } finally {
      button.disabled = false;
    }
  });
}
