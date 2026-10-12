// Rules: the trader writes them, the Referee enforces them.
import { DEFAULT_RULES, type RuleAction, type RuleId, type RuleSet } from '../../src/engine/types.ts';
import { api, ApiError } from '../api.ts';
import { money2 } from '../format.ts';
import { esc, field, notify, reportError, store, toast, type View } from '../main.ts';

export const view: View = { title: 'Rules', render };

export const RULE_LABELS: Record<RuleId | 'locked', string> = {
  maxTradesPerDay: 'Max trades a day',
  noReentryAfterLoss: 'No re-entry after a loss',
  cooldownAfterLosses: 'Cooldown after losses',
  stopRequired: 'Stop required',
  stopNotWidened: 'Stop not widened',
  maxPositionDollars: 'Position size cap',
  dailyLossLimit: 'Daily loss limit',
  sessionWindow: 'Session window',
  maxOpenPositions: 'Max open positions',
  sizeMatchesDeclaration: 'Size matches declaration',
  maxBreachesPerDay: 'Max breaches a day',
  locked: 'Locked out',
};

export function ruleLabel(id: string): string {
  return (RULE_LABELS as Record<string, string | undefined>)[id] ?? id;
}

/** One plain sentence per enabled rule, in the "your rule says" form. */
export function rulesSummary(r: RuleSet): string[] {
  const act = (a: RuleAction) => (a === 'flatten' ? 'the Referee closes it' : 'warn only');
  const out: string[] = [];
  if (r.maxTradesPerDay.enabled) out.push(`Max ${r.maxTradesPerDay.count} ${r.maxTradesPerDay.count === 1 ? 'trade' : 'trades'} a day (${act(r.maxTradesPerDay.action)}).`);
  if (r.noReentryAfterLoss.enabled) {
    out.push(
      `No entry within ${r.noReentryAfterLoss.minutes} min of a losing exit${r.noReentryAfterLoss.sameSymbolOnly ? ', same symbol only' : ''} (${act(r.noReentryAfterLoss.action)}).`,
    );
  }
  if (r.cooldownAfterLosses.enabled) {
    out.push(`After ${r.cooldownAfterLosses.losses} losses in a row, no entry for ${r.cooldownAfterLosses.minutes} min (${act(r.cooldownAfterLosses.action)}).`);
  }
  if (r.stopRequired.enabled) out.push(`A stop order within ${r.stopRequired.withinSeconds} s of every entry, kept working (${act(r.stopRequired.action)}).`);
  if (r.stopNotWidened.enabled) out.push(`Never move a stop further from the entry (${act(r.stopNotWidened.action)}).`);
  if (r.maxPositionDollars.enabled) out.push(`Position value at most ${money2(r.maxPositionDollars.dollars)} (${act(r.maxPositionDollars.action)}).`);
  if (r.dailyLossLimit.enabled) {
    out.push(
      `Stop for the day at ${money2(-r.dailyLossLimit.dollars)}, realized plus unrealized${r.dailyLossLimit.lockRestOfDay ? ', then locked for the rest of the day' : ''} (${act(r.dailyLossLimit.action)}).`,
    );
  }
  if (r.sessionWindow.enabled) out.push(`Entries only ${r.sessionWindow.start} to ${r.sessionWindow.end} ET (${act(r.sessionWindow.action)}).`);
  if (r.maxOpenPositions.enabled) {
    out.push(`At most ${r.maxOpenPositions.count} open ${r.maxOpenPositions.count === 1 ? 'position' : 'positions'} (${act(r.maxOpenPositions.action)}).`);
  }
  if (r.sizeMatchesDeclaration.enabled) out.push(`Filled size within ${r.sizeMatchesDeclaration.tolerancePct}% of the declared size (${act(r.sizeMatchesDeclaration.action)}).`);
  if (r.maxBreachesPerDay.enabled) out.push(`After ${r.maxBreachesPerDay.count} breaches in a day, locked for the rest of the day.`);
  if (!out.length) out.push('No rules enabled.');
  return out;
}

// ---- form ----

interface NumSpec {
  key: string;
  label: string;
  min: number;
  step: number;
}

interface RuleSpec {
  id: RuleId;
  help: string;
  numbers?: NumSpec[];
  flags?: { key: string; label: string }[];
  window?: boolean;
  action: boolean;
}

const SPECS: RuleSpec[] = [
  { id: 'maxTradesPerDay', help: 'Opening more round trips than this in one New York trading day is a breach.', numbers: [{ key: 'count', label: 'Trades a day', min: 1, step: 1 }], action: true },
  {
    id: 'noReentryAfterLoss',
    help: 'No new entry within this many minutes of a losing exit.',
    numbers: [{ key: 'minutes', label: 'Minutes', min: 1, step: 1 }],
    flags: [{ key: 'sameSymbolOnly', label: 'Same symbol only' }],
    action: true,
  },
  {
    id: 'cooldownAfterLosses',
    help: 'After this many losing trades in a row, no entry until the cooldown is over.',
    numbers: [
      { key: 'losses', label: 'Losses in a row', min: 1, step: 1 },
      { key: 'minutes', label: 'Cooldown minutes', min: 1, step: 1 },
    ],
    action: true,
  },
  {
    id: 'stopRequired',
    help: 'A protective stop order must be working within this many seconds of the entry fill, and stay there.',
    numbers: [{ key: 'withinSeconds', label: 'Seconds', min: 1, step: 1 }],
    action: true,
  },
  { id: 'stopNotWidened', help: 'Moving the stop further from the entry than where it was first placed is a breach.', action: true },
  {
    id: 'maxPositionDollars',
    help: 'Position value (shares times average entry) above this is a breach.',
    numbers: [{ key: 'dollars', label: 'Dollars', min: 1, step: 100 }],
    action: true,
  },
  {
    id: 'dailyLossLimit',
    help: 'Realized plus unrealized loss for the day beyond this. Flatten closes everything.',
    numbers: [{ key: 'dollars', label: 'Dollars', min: 1, step: 50 }],
    flags: [{ key: 'lockRestOfDay', label: 'Lock the rest of the day' }],
    action: true,
  },
  { id: 'sessionWindow', help: 'Entries only between these times, New York time.', window: true, action: true },
  { id: 'maxOpenPositions', help: 'Holding more symbols than this at once is a breach.', numbers: [{ key: 'count', label: 'Positions', min: 1, step: 1 }], action: true },
  {
    id: 'sizeMatchesDeclaration',
    help: 'A filled size more than this far above the declared size is a breach. Only applies to declared trades.',
    numbers: [{ key: 'tolerancePct', label: 'Tolerance %', min: 0, step: 1 }],
    action: true,
  },
  {
    id: 'maxBreachesPerDay',
    help: 'After this many breaches in a day, the rest of the day is locked: every further entry is flattened.',
    numbers: [{ key: 'count', label: 'Breaches', min: 1, step: 1 }],
    action: false,
  },
];

function ruleHtml(s: RuleSpec): string {
  const n = (k: string) => `${s.id}.${k}`;
  const numbers = (s.numbers ?? [])
    .map((f) => `<label class="field">${esc(f.label)}<input type="number" name="${n(f.key)}" min="${f.min}" step="${f.step}" inputmode="decimal" required /></label>`)
    .join('');
  const window = s.window
    ? `<label class="field">Start (ET)<input type="time" name="${n('start')}" required /></label><label class="field">End (ET)<input type="time" name="${n('end')}" required /></label>`
    : '';
  const action = s.action
    ? `<label class="field">When broken<select name="${n('action')}"><option value="flatten">close the position (flatten)</option><option value="warn">warn only</option></select></label>`
    : '';
  const flags = (s.flags ?? []).map((f) => `<label class="switch"><input type="checkbox" name="${n(f.key)}" /> ${esc(f.label)}</label>`).join('');
  return `<fieldset class="rule" data-rule="${s.id}">
    <legend><label><input type="checkbox" name="${n('enabled')}" /> ${esc(RULE_LABELS[s.id])}</label></legend>
    <p class="help">${esc(s.help)}</p>
    <div class="fields">${numbers}${window}${action}${flags}</div>
  </fieldset>`;
}

/** "9:30" -> "09:30", which is what a time input accepts. */
function clock(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : value;
}

function fill(form: HTMLFormElement, rules: RuleSet): void {
  for (const s of SPECS) {
    const rule = rules[s.id] as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(rule)) {
      const el = form.elements.namedItem(`${s.id}.${k}`);
      if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = Boolean(v);
      else if (el instanceof HTMLInputElement && el.type === 'time') el.value = clock(String(v));
      else if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) el.value = String(v);
    }
  }
  markDisabled(form);
}

function markDisabled(form: HTMLFormElement): void {
  for (const fs of form.querySelectorAll<HTMLFieldSetElement>('fieldset.rule')) {
    const enabled = fs.querySelector<HTMLInputElement>('legend input[type="checkbox"]')?.checked ?? true;
    fs.classList.toggle('off', !enabled);
  }
}

function collect(form: HTMLFormElement): RuleSet {
  const num = (name: string) => Number(field(form, name).value);
  const bool = (name: string) => field(form, name).checked;
  const str = (name: string) => field(form, name).value.trim();
  const action = (name: string): RuleAction => (str(name) === 'warn' ? 'warn' : 'flatten');
  return {
    maxTradesPerDay: { enabled: bool('maxTradesPerDay.enabled'), count: num('maxTradesPerDay.count'), action: action('maxTradesPerDay.action') },
    noReentryAfterLoss: {
      enabled: bool('noReentryAfterLoss.enabled'),
      minutes: num('noReentryAfterLoss.minutes'),
      sameSymbolOnly: bool('noReentryAfterLoss.sameSymbolOnly'),
      action: action('noReentryAfterLoss.action'),
    },
    cooldownAfterLosses: {
      enabled: bool('cooldownAfterLosses.enabled'),
      losses: num('cooldownAfterLosses.losses'),
      minutes: num('cooldownAfterLosses.minutes'),
      action: action('cooldownAfterLosses.action'),
    },
    stopRequired: { enabled: bool('stopRequired.enabled'), withinSeconds: num('stopRequired.withinSeconds'), action: action('stopRequired.action') },
    stopNotWidened: { enabled: bool('stopNotWidened.enabled'), action: action('stopNotWidened.action') },
    maxPositionDollars: { enabled: bool('maxPositionDollars.enabled'), dollars: num('maxPositionDollars.dollars'), action: action('maxPositionDollars.action') },
    dailyLossLimit: {
      enabled: bool('dailyLossLimit.enabled'),
      dollars: num('dailyLossLimit.dollars'),
      action: action('dailyLossLimit.action'),
      lockRestOfDay: bool('dailyLossLimit.lockRestOfDay'),
    },
    sessionWindow: { enabled: bool('sessionWindow.enabled'), start: str('sessionWindow.start'), end: str('sessionWindow.end'), action: action('sessionWindow.action') },
    maxOpenPositions: { enabled: bool('maxOpenPositions.enabled'), count: num('maxOpenPositions.count'), action: action('maxOpenPositions.action') },
    sizeMatchesDeclaration: {
      enabled: bool('sizeMatchesDeclaration.enabled'),
      tolerancePct: num('sizeMatchesDeclaration.tolerancePct'),
      action: action('sizeMatchesDeclaration.action'),
    },
    maxBreachesPerDay: { enabled: bool('maxBreachesPerDay.enabled'), count: num('maxBreachesPerDay.count') },
  };
}

/** First problem found, or null. The server validates again; this just gives a clearer message faster. */
function validate(form: HTMLFormElement): string | null {
  for (const s of SPECS) {
    for (const f of s.numbers ?? []) {
      const v = Number(field(form, `${s.id}.${f.key}`).value);
      const whole = f.step === 1;
      if (!Number.isFinite(v) || v < f.min || (whole && !Number.isInteger(v))) {
        return `${RULE_LABELS[s.id]}: ${f.label} must be a ${whole ? 'whole ' : ''}number of at least ${f.min}.`;
      }
    }
    if (s.window) {
      for (const k of ['start', 'end']) {
        if (!/^\d{2}:\d{2}$/.test(field(form, `${s.id}.${k}`).value)) return 'Session window needs a start and an end time (HH:MM, New York time).';
      }
    }
  }
  return null;
}

function render(root: HTMLElement): () => void {
  root.innerHTML = `
    <section class="page-head">
      <h1>Rules</h1>
      <p class="lede">Your rules say what the Referee enforces on your account. "Close the position" sends a market order to flatten when enforcement is on; "warn only" logs the breach and shows it.</p>
    </section>
    <form data-form="rules" novalidate>
      ${SPECS.map(ruleHtml).join('')}
      <div class="actions sticky-actions">
        <button type="submit" class="btn primary">Save rules</button>
        <button type="button" class="btn" data-action="reset">Reset to defaults</button>
        <span class="status" role="status" data-status></span>
      </div>
    </form>`;
  const form = root.querySelector<HTMLFormElement>('form[data-form="rules"]') as HTMLFormElement;
  const status = root.querySelector<HTMLElement>('[data-status]') as HTMLElement;
  const say = (text: string, error = false) => {
    status.textContent = text;
    status.classList.toggle('error', error);
  };

  if (store.state) fill(form, store.state.rules);
  api
    .getRules()
    .then((rules) => {
      fill(form, rules);
      if (store.state) store.state.rules = rules;
    })
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.network) say(`${err.message}. Showing the last rules this page saw.`, true);
      else reportError(err);
    });

  form.addEventListener('input', () => say('Unsaved changes.'));
  form.addEventListener('change', () => markDisabled(form));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const problem = validate(form);
    if (problem) {
      say(problem, true);
      return;
    }
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const saved = await api.putRules(collect(form));
      fill(form, saved);
      if (store.state) {
        store.state.rules = saved;
        notify();
      }
      say('Saved.');
      toast('Rules saved. They apply to the next fill.', 'ok');
    } catch (err) {
      say(err instanceof Error ? err.message : 'Could not save.', true);
      reportError(err);
    } finally {
      if (button) button.disabled = false;
    }
  });
  root.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener('click', () => {
    fill(form, DEFAULT_RULES);
    say('Defaults filled in. Save to apply them.');
  });

  return () => undefined;
}
