// Today: the state of the next trade before the click, plus everything that happened today.
import { money, pct } from '../../src/core/format.ts';
import type { Breach, Declaration, NextTrade, OpenPosition } from '../../src/engine/types.ts';
import type { DeclareRequest, EnforcementState, StateResponse, StatusResponse, TradeDto } from '../../src/server/api.ts';
import { tone } from '../../src/web/report.ts';
import { api, NOT_REACHABLE } from '../api.ts';
import { clockET, dateLabel, dateTimeET, money2, pctInt, price, shares, timeET } from '../format.ts';
import {
  enforcementMode,
  esc,
  field,
  MODE_LABEL,
  notify,
  reportError,
  setHtml,
  startCountdowns,
  store,
  subscribe,
  tickCountdowns,
  toast,
  type Mode,
  type View,
} from '../main.ts';
import { ruleLabel, rulesSummary } from './rules.ts';

export const view: View = { title: 'Today', render };

const SKELETON = `
<div class="today-grid">
  <div class="area-enf" data-section="enf"></div>
  <section class="panel next-trade area-next" data-section="next" aria-live="polite"></section>
  <div class="area-side">
    <section class="panel" data-section="day"></section>
    <section class="panel">
      <h2>I'm taking this</h2>
      <p class="muted">Declare before the click. The next entry fill inside the window counts as declared; any other entry is logged as undeclared.</p>
      <form data-form="declare" class="form-grid" novalidate>
        <label class="field">Symbol<input name="symbol" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="AAPL" /></label>
        <label class="field">Side<select name="side"><option value="">either</option><option value="long">long</option><option value="short">short</option></select></label>
        <label class="field">Shares<input name="qty" type="number" min="1" step="1" inputmode="numeric" /></label>
        <label class="field">Stop price<input name="stopPrice" type="number" min="0" step="0.01" inputmode="decimal" /></label>
        <label class="field wide">Note<input name="note" type="text" maxlength="200" /></label>
        <div class="actions wide"><button type="submit" class="btn primary">I'm taking this</button></div>
      </form>
      <div data-section="pending"></div>
    </section>
    <section class="panel" data-section="plan"></section>
  </div>
  <section class="panel area-positions" data-section="positions"></section>
  <section class="panel area-trades" data-section="trades"></section>
  <section class="panel area-breaches" data-section="breaches"></section>
</div>`;

// ---- pieces ----

const MODE_TEXT: Record<Mode, string> = {
  on: 'A fill that breaks a flatten rule is closed at market.',
  dry: 'Breaches are logged as "would have closed". Nothing is sent to the broker.',
  off: 'Breaches are shown and logged. Nothing is sent to the broker.',
  killed: 'Kill switch pressed. Nothing is sent to the broker until you turn enforcement back on.',
};

function enforcementHtml(status: StatusResponse): string {
  const mode = enforcementMode(status);
  const e = status.enforcement;
  const killed = mode === 'killed' && e.killedAt ? ` <span class="muted">(at ${esc(timeET(e.killedAt, false))})</span>` : '';
  const unconfigured = status.configured
    ? ''
    : '<span class="enf-text">Alpaca keys are not set, so no account is being watched. <a href="#/settings">Add them in Settings</a>.</span>';
  return `<div class="enf enf-${mode}">
    <div class="enf-main">
      <span class="enf-mode">Enforcement ${MODE_LABEL[mode]}</span>
      <span class="enf-text">${esc(MODE_TEXT[mode])}${killed}</span>
      ${unconfigured}
    </div>
    <div class="enf-controls">
      <label class="switch"><input type="checkbox" data-action="enabled"${e.enabled ? ' checked' : ''} /> Enforcement on</label>
      <label class="switch"><input type="checkbox" data-action="dryRun"${e.dryRun ? ' checked' : ''} /> Dry run</label>
      <button type="button" class="btn danger" data-action="kill" title="Turns enforcement off at once. Nothing else changes.">KILL SWITCH</button>
    </div>
  </div>`;
}

/** The next-trade panel body. Also used on the Setup page. */
export function nextTradeHtml(nt: NextTrade): string {
  const blockers = nt.blockers.length
    ? `<ul class="blockers">${nt.blockers
        .map(
          (b) =>
            `<li><span class="rule-name">${esc(ruleLabel(b.rule))}</span><span>${esc(b.message)}</span>${
              b.until !== null ? `<b class="countdown" data-until="${b.until}" data-tpl="clears in {t}" data-done="clearing now"></b>` : ''
            }</li>`,
        )
        .join('')}</ul>`
    : '<p class="nt-ok">No rule blocks the next entry.</p>';

  const c = nt.context;
  const context = [
    `${esc(c.tradeOfDay)} trade of the day`,
    esc(c.afterPrev),
    esc(c.timeBucket),
    `${c.consecutiveLosses} ${c.consecutiveLosses === 1 ? 'loss' : 'losses'} in a row`,
    c.minutesSinceLastLoss !== null ? `${Math.round(c.minutesSinceLastLoss)} min since the last loss` : 'no loss yet today',
  ].join(' · ');

  const record = nt.record.length
    ? `<ul class="record">${nt.record
        .map(
          (l) => `<li>
          <span class="rec-label">${esc(l.label)}</span>
          <span class="rec-stats">${l.n} ${l.n === 1 ? 'trade' : 'trades'}, win ${pctInt(l.winRate)} (${pctInt(l.winLow)} to ${pctInt(l.winHigh)}), avg <span class="${tone(l.avgReturn)}">${esc(pct(l.avgReturn))}</span>, total <span class="${tone(l.totalPnl)}">${esc(money(l.totalPnl))}</span></span>
          <span class="conf">${esc(l.confidence)}</span>
        </li>`,
        )
        .join('')}</ul>`
    : '<p class="muted">Your record has no closed trades for this situation yet.</p>';

  const g = nt.lateDayGiveBack;
  const giveBack = g
    ? `<p class="giveback">On ${g.days} ${g.days === 1 ? 'day' : 'days'} with 4+ trades you held ${esc(money(g.profitAtTrade3))} after trade 3 and gave back ${esc(money(g.givenBack))}${
        g.share !== null ? ` (${Math.round(g.share * 100)}%)` : ''
      }.</p>`
    : '';

  return `<p class="eyebrow">Next trade</p>
    <div class="nt-head"><h2>Trade ${nt.number} of the day</h2><span class="nt-state ${nt.allowed ? 'ok' : 'blocked'}">${nt.allowed ? 'ALLOWED' : 'BLOCKED'}</span></div>
    ${blockers}
    <p class="nt-context">${context}</p>
    <h3>Your record shows</h3>
    ${record}
    ${giveBack}`;
}

function statBox(label: string, value: string, cls = ''): string {
  return `<div class="stat"><span class="label">${esc(label)}</span><span class="value ${cls}">${esc(value)}</span></div>`;
}

function dayHtml(s: StateResponse): string {
  const d = s.snapshot.day;
  const r = s.rules;
  const st = s.status;
  const total = d.realizedPnl + d.unrealizedPnl;

  let lossBar: string;
  const limit = r.dailyLossLimit;
  if (limit.enabled && limit.dollars > 0) {
    const used = total < 0 ? Math.min(1, -total / limit.dollars) : 0;
    const cls = used >= 1 ? 'full' : used >= 0.7 ? 'warn' : '';
    const text =
      total < 0
        ? `${money2(-total)} of your ${money2(limit.dollars)} daily loss limit used (${Math.round(used * 100)}%).`
        : `Your rule says stop at ${money2(-limit.dollars)} for the day. Nothing lost against it yet.`;
    lossBar = `<div class="meter" role="meter" aria-label="Daily loss used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(used * 100)}"><span class="${cls}" style="width:${(used * 100).toFixed(1)}%"></span></div><p class="muted">${esc(text)}</p>`;
  } else {
    lossBar = '<p class="muted">No daily loss limit in your rules.</p>';
  }

  const lock = s.snapshot.lock
    ? `<span class="neg">Locked: ${esc(s.snapshot.lock.reason)}. <b class="countdown" data-until="${s.snapshot.lock.until}" data-tpl="Clears in {t}" data-done="clearing now"></b></span>`
    : 'Not locked';

  const account: string[] = [];
  if (st.account) account.push(`Equity ${money2(st.account.equity)}, buying power ${money2(st.account.buyingPower)}, account ${st.account.status}.`);
  if (st.clock) {
    const next = Date.parse(st.clock.isOpen ? st.clock.nextClose : st.clock.nextOpen);
    account.push(`Market ${st.clock.isOpen ? 'open' : 'closed'}${Number.isFinite(next) ? `, ${st.clock.isOpen ? 'closes' : 'opens'} ${dateTimeET(next)}` : ''}.`);
  }
  if (st.lastSync) account.push(`Last sync ${timeET(st.lastSync)}.`);

  return `<div class="panel-head"><h2>Today</h2><span class="muted">${esc(dateLabel(d.date))}</span></div>
    <div class="stats compact">
      ${statBox('Realized', money2(d.realizedPnl), tone(d.realizedPnl))}
      ${statBox('Unrealized', money2(d.unrealizedPnl), tone(d.unrealizedPnl))}
      ${statBox('Total', money2(total), tone(total))}
    </div>
    ${lossBar}
    <dl class="kv">
      <div><dt>Trades opened</dt><dd>${d.tradesOpened}${r.maxTradesPerDay.enabled ? ` of ${r.maxTradesPerDay.count}` : ''}</dd></div>
      <div><dt>Closed</dt><dd>${d.tradesClosed} (${d.wins} won, ${d.losses} lost)</dd></div>
      <div><dt>Breaches</dt><dd>${d.breaches}${r.maxBreachesPerDay.enabled ? ` of ${r.maxBreachesPerDay.count}` : ''}</dd></div>
      <div><dt>Entries</dt><dd>${d.declaredEntries} declared, ${d.undeclared} undeclared</dd></div>
      <div><dt>Lock</dt><dd>${lock}</dd></div>
    </dl>
    ${account.length ? `<p class="muted" style="margin-top:10px">${esc(account.join(' '))}</p>` : ''}`;
}

function stopStatus(p: OpenPosition): string {
  if (p.stop) return p.stop.price !== null ? `<span class="pos">stop at ${esc(price(p.stop.price))}</span>` : '<span class="pos">stop working</span>';
  if (p.stopDeadline !== null) return `<b class="neg countdown" data-until="${p.stopDeadline}" data-tpl="NO STOP, {s} s left" data-done="NO STOP, past the deadline"></b>`;
  return '<b class="neg">stop missing</b>';
}

function positionsHtml(ps: OpenPosition[]): string {
  const head = `<div class="panel-head"><h2>Positions</h2>${
    ps.length ? '<button type="button" class="btn small danger" data-action="flatten-all">Flatten all</button>' : ''
  }</div>`;
  if (!ps.length) return `${head}<p class="muted">Flat. No open positions.</p>`;
  const rows = ps
    .map((p) => {
      const unreal = p.mark !== null ? (p.mark - p.avgEntry) * p.qty : null;
      return `<tr>
        <th scope="row">${esc(p.symbol)} <span class="muted small">#${p.tradeOfDay}</span></th>
        <td>${esc(p.direction)}</td>
        <td class="num">${esc(shares(p.qty))}</td>
        <td class="num">${esc(price(p.avgEntry))}</td>
        <td class="num">${p.mark !== null ? esc(price(p.mark)) : '<span class="muted">no mark</span>'}</td>
        <td class="num ${unreal !== null ? tone(unreal) : ''}">${unreal !== null ? esc(money2(unreal)) : ''}</td>
        <td>${stopStatus(p)}</td>
        <td>${p.declared ? '<span class="tag ok">declared</span>' : '<span class="tag warn">undeclared</span>'}${
          p.refereeClosed ? ' <span class="tag bad">referee closing</span>' : ''
        }</td>
        <td class="num"><button type="button" class="btn small" data-action="flatten" data-symbol="${esc(p.symbol)}">Flatten</button></td>
      </tr>`;
    })
    .join('');
  return `${head}<div class="table-wrap"><table>
    <thead><tr><th scope="col">Symbol</th><th scope="col">Side</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Avg entry</th><th scope="col" class="num">Mark</th><th scope="col" class="num">Unrealized</th><th scope="col">Stop</th><th scope="col">Flags</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function pendingHtml(d: Declaration | null): string {
  if (!d) return '';
  const windowMin = store.settings?.declarationWindowMinutes ?? 10;
  const until = d.time + windowMin * 60000;
  const what = [d.symbol, d.side, d.qty !== null ? `${shares(d.qty)} shares` : null, d.stopPrice !== null ? `stop ${price(d.stopPrice)}` : null]
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
    .join(' ');
  const tail = d.consumedBy
    ? '<span class="tag ok">matched to an entry</span>'
    : `<b class="countdown" data-until="${until}" data-tpl="window closes in {t}" data-done="window closed"></b> <button type="button" class="btn small" data-action="cancel-declare">Cancel</button>`;
  return `<div class="pending">
    <p><b>Declared</b> at ${esc(timeET(d.time))}${what ? `: ${esc(what)}` : ''}${d.note ? ` <span class="muted">"${esc(d.note)}"</span>` : ''}</p>
    <div class="actions">${tail}</div>
  </div>`;
}

function planHtml(s: StateResponse): string {
  const today = s.snapshot.day.date;
  const plan = s.plan && (!today || s.plan.date === today) ? s.plan : null;
  if (plan) {
    return `<h2>Today's plan</h2>
      <p class="plan-ok">Confirmed at ${esc(timeET(plan.confirmedAt, false))}.</p>
      ${plan.note ? `<p class="plan-note">${esc(plan.note)}</p>` : ''}
      <details class="help"><summary>Your rules at confirmation</summary><ul class="rule-summary">${rulesSummary(plan.rules)
        .map((line) => `<li>${esc(line)}</li>`)
        .join('')}</ul></details>`;
  }
  return `<h2>Today's plan</h2>
    <p class="muted">Not confirmed yet. Your rules say:</p>
    <ul class="rule-summary">${rulesSummary(s.rules)
      .map((line) => `<li>${esc(line)}</li>`)
      .join('')}</ul>
    <form data-form="plan" class="form-grid" novalidate>
      <label class="field wide">Note for today (optional)<input name="note" type="text" maxlength="300" /></label>
      <div class="actions wide"><button type="submit" class="btn primary">Confirm today's plan</button></div>
    </form>`;
}

function tradesHtml(trades: TradeDto[]): string {
  const head = `<h2>Today's trades</h2>`;
  if (!trades.length) return `${head}<p class="muted">No trades today.</p>`;
  const rows = [...trades]
    .sort((a, b) => a.entryTime - b.entryTime)
    .map(
      (t) => `<tr>
      <td class="num">${t.tradeOfDay ?? ''}</td>
      <td>${esc(clockET(t.entryTime))}</td>
      <th scope="row">${esc(t.symbol)}</th>
      <td>${esc(t.direction)}</td>
      <td class="num">${esc(shares(t.qty))}</td>
      <td class="num">${esc(price(t.entryPrice))}</td>
      <td class="num">${t.exitPrice !== null ? esc(price(t.exitPrice)) : '<span class="muted">open</span>'}</td>
      <td class="num ${t.exitTime !== null ? tone(t.pnl) : ''}">${t.exitTime !== null ? esc(money2(t.pnl)) : ''}</td>
      <td>${t.declared === null ? '' : t.declared ? 'yes' : '<span class="neg">no</span>'}</td>
      <td>${t.refereeClosed ? '<span class="tag bad">referee closed</span>' : ''}</td>
    </tr>`,
    )
    .join('');
  return `${head}<div class="table-wrap"><table>
    <thead><tr><th scope="col" class="num">#</th><th scope="col">Time (ET)</th><th scope="col">Symbol</th><th scope="col">Side</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Entry</th><th scope="col" class="num">Exit</th><th scope="col" class="num">P&amp;L</th><th scope="col">Declared</th><th scope="col"><span class="sr-only">Tags</span></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

function breachesHtml(bs: Breach[]): string {
  const head = `<h2>Today's breaches</h2>`;
  if (!bs.length) return `${head}<p class="muted">No breaches today.</p>`;
  const items = [...bs]
    .sort((a, b) => b.time - a.time)
    .map(
      (b) => `<li>
      <span class="time">${esc(clockET(b.time))} ET</span>
      <span class="rule-name">${esc(ruleLabel(b.rule))}</span>
      <span class="detail">${esc(b.message)}${b.symbol ? ` <span class="muted">(${esc(b.symbol)})</span>` : ''}</span>
      <span class="tag ${b.action === 'flatten' ? 'bad' : 'warn'}">${esc(b.action)}</span>
    </li>`,
    )
    .join('');
  return `${head}<ul class="breaches">${items}</ul>`;
}

// ---- actions ----

function applyEnforcement(e: EnforcementState): void {
  if (store.state) {
    store.state.status.enforcement = e;
    notify();
  }
}

async function runAction(btn: HTMLButtonElement): Promise<void> {
  const action = btn.dataset.action;
  btn.disabled = true;
  try {
    if (action === 'kill') {
      applyEnforcement(await api.kill());
      toast('Enforcement is off. Nothing will be sent to the broker until you turn it back on.', 'ok');
    } else if (action === 'flatten') {
      const symbol = btn.dataset.symbol ?? '';
      if (!symbol || !window.confirm(`Close your ${symbol} position at market now?`)) return;
      const r = await api.flatten(symbol);
      toast(r.detail || `Flatten sent for ${symbol}.`, r.ok ? 'ok' : 'error');
    } else if (action === 'flatten-all') {
      if (!window.confirm('Close every open position at market now?')) return;
      const r = await api.flatten();
      toast(r.detail || 'Flatten sent for every position.', r.ok ? 'ok' : 'error');
    } else if (action === 'cancel-declare') {
      await api.cancelDeclaration();
      if (store.state) store.state.snapshot.pendingDeclaration = null;
      notify();
      toast('Declaration cancelled.');
    }
  } catch (err) {
    reportError(err);
  } finally {
    btn.disabled = false;
  }
}

async function toggleEnforcement(input: HTMLInputElement): Promise<void> {
  const body = input.dataset.action === 'enabled' ? { enabled: input.checked } : { dryRun: input.checked };
  try {
    applyEnforcement(await api.setEnforcement(body));
    const e = store.state?.status.enforcement;
    if (e) toast(e.enabled ? (e.dryRun ? 'Dry run: breaches are logged, nothing is sent.' : 'Enforcement on.') : 'Enforcement off.', 'ok');
  } catch (err) {
    input.checked = !input.checked;
    reportError(err);
  }
}

async function declare(form: HTMLFormElement): Promise<void> {
  const symbol = field(form, 'symbol').value.trim().toUpperCase();
  const side = field(form, 'side').value;
  const qtyRaw = field(form, 'qty').value.trim();
  const stopRaw = field(form, 'stopPrice').value.trim();
  const note = field(form, 'note').value.trim();
  const qty = qtyRaw ? Number(qtyRaw) : null;
  const stopPrice = stopRaw ? Number(stopRaw) : null;
  if (qty !== null && !(Number.isInteger(qty) && qty > 0)) {
    toast('Shares must be a whole number above zero.', 'error');
    return;
  }
  if (stopPrice !== null && !(Number.isFinite(stopPrice) && stopPrice > 0)) {
    toast('Stop price must be a number above zero.', 'error');
    return;
  }
  const body: DeclareRequest = {
    symbol: symbol || null,
    side: side === 'long' || side === 'short' ? side : null,
    qty,
    stopPrice,
    note: note || null,
  };
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const d = await api.declare(body);
    if (store.state) store.state.snapshot.pendingDeclaration = d;
    notify();
    form.reset();
    toast('Declared. Your next entry fill inside the window counts as this trade.', 'ok');
  } catch (err) {
    reportError(err);
  } finally {
    if (button) button.disabled = false;
  }
}

async function confirmPlan(form: HTMLFormElement): Promise<void> {
  const note = field(form, 'note').value.trim();
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;
  try {
    const plan = await api.confirmPlan(note || undefined);
    if (store.state) store.state.plan = plan;
    notify();
    toast("Today's plan is confirmed.", 'ok');
  } catch (err) {
    reportError(err);
  } finally {
    if (button) button.disabled = false;
  }
}

// ---- view ----

function render(root: HTMLElement): () => void {
  root.innerHTML = SKELETON;
  const sec = (name: string): HTMLElement => root.querySelector<HTMLElement>(`[data-section="${name}"]`) as HTMLElement;
  const nextEl = sec('next');

  const update = (): void => {
    const s = store.state;
    if (!s) {
      const msg =
        store.connection === 'down'
          ? `<p class="muted">${esc(NOT_REACHABLE)}. The Referee is not watching your account until the service is back. Retrying.</p>`
          : '<p class="muted">Connecting to the service.</p>';
      setHtml(sec('enf'), '');
      nextEl.classList.remove('allowed', 'blocked');
      setHtml(nextEl, `<p class="eyebrow">Next trade</p>${msg}`);
      setHtml(sec('day'), `<h2>Today</h2>${msg}`);
      setHtml(sec('pending'), '');
      setHtml(sec('plan'), `<h2>Today's plan</h2>${msg}`);
      setHtml(sec('positions'), `<h2>Positions</h2>${msg}`);
      setHtml(sec('trades'), `<h2>Today's trades</h2>${msg}`);
      setHtml(sec('breaches'), `<h2>Today's breaches</h2>${msg}`);
      return;
    }
    setHtml(sec('enf'), enforcementHtml(s.status));
    const nt = s.snapshot.nextTrade;
    nextEl.classList.toggle('allowed', nt.allowed);
    nextEl.classList.toggle('blocked', !nt.allowed);
    setHtml(nextEl, nextTradeHtml(nt));
    setHtml(sec('day'), dayHtml(s));
    setHtml(sec('pending'), pendingHtml(s.snapshot.pendingDeclaration));
    setHtml(sec('plan'), planHtml(s));
    setHtml(sec('positions'), positionsHtml(s.snapshot.positions));
    setHtml(sec('trades'), tradesHtml(s.todayTrades));
    setHtml(sec('breaches'), breachesHtml(s.todayBreaches));
    tickCountdowns(root);
  };

  root.addEventListener('click', (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
    if (btn && root.contains(btn)) void runAction(btn);
  });
  root.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    if (input.type === 'checkbox' && (input.dataset.action === 'enabled' || input.dataset.action === 'dryRun')) void toggleEnforcement(input);
  });
  root.addEventListener('submit', (ev) => {
    const form = ev.target as HTMLFormElement;
    if (form.dataset.form === 'declare') {
      ev.preventDefault();
      void declare(form);
    } else if (form.dataset.form === 'plan') {
      ev.preventDefault();
      void confirmPlan(form);
    }
  });

  const unsubscribe = subscribe(update);
  const stopCountdowns = startCountdowns(root);
  update();
  return () => {
    unsubscribe();
    stopCountdowns();
  };
}
