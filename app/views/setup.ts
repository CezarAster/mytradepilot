// Setup: check a symbol against the strategy's numbers, and edit the strategy itself.
import { DEFAULT_STRATEGY, type SetupCheckResponse, type StrategyDefinition } from '../../src/server/api.ts';
import { api, ApiError } from '../api.ts';
import { price, timeET } from '../format.ts';
import { errorText, esc, field, reportError, setHtml, startCountdowns, store, toast, type View } from '../main.ts';
import { nextTradeHtml } from './today.ts';

export const view: View = { title: 'Setup', render };

function resultHtml(r: SetupCheckResponse): string {
  const lines = r.lines
    .map((l) => {
      const cls = l.pass === null ? 'na' : l.pass ? 'pass' : 'fail';
      const mark = l.pass === null ? '·' : l.pass ? '✓' : '✗';
      const word = l.pass === null ? 'no data' : l.pass ? 'pass' : 'fail';
      return `<li class="${cls}"><span class="mark" aria-hidden="true">${mark}</span><span><span class="sr-only">${word}: </span><b>${esc(l.label)}</b> ${esc(l.value)}${
        l.target ? ` <span class="muted">(target ${esc(l.target)})</span>` : ''
      }${l.pass === null ? ' <span class="muted">no data</span>' : ''}</span></li>`;
    })
    .join('');
  return `<div class="panel-head">
      <h2>${esc(r.symbol)} ${esc(r.side)}</h2>
      <span class="muted">${r.price !== null ? `$${esc(price(r.price))}` : 'no price'}, as of ${esc(timeET(r.asOf))}</span>
    </div>
    <p class="score">${r.score.pass} of ${r.score.total} lines pass</p>
    <ul class="checklist">${lines}</ul>
    ${r.warnings.length ? `<ul class="warnings">${r.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <p class="muted" style="margin-top:12px">A setup that matches your strategy is still subject to your rules. This is what they say about the next trade right now:</p>
    <div class="next-trade-inline ${r.nextTrade.allowed ? 'allowed' : 'blocked'}">${nextTradeHtml(r.nextTrade)}</div>`;
}

const TIMEFRAMES: StrategyDefinition['timeframe'][] = ['1Min', '5Min', '15Min'];

function fillStrategy(form: HTMLFormElement, s: StrategyDefinition): void {
  field(form, 'name').value = s.name;
  field(form, 'description').value = s.description;
  field(form, 'indicators').value = s.indicators;
  field(form, 'timeframe').value = s.timeframe;
  field(form, 'emaFast').value = String(s.emaFast);
  field(form, 'emaSlow').value = String(s.emaSlow);
  field(form, 'pullbackMaxPct').value = String(s.pullbackMaxPct);
  field(form, 'minDayChangePct').value = String(s.minDayChangePct);
  field(form, 'minRelativeVolume').value = String(s.minRelativeVolume);
  field(form, 'minPrice').value = String(s.minPrice);
  field(form, 'requireTrend').checked = s.requireTrend;
  field(form, 'requireVwapSide').checked = s.requireVwapSide;
}

function collectStrategy(form: HTMLFormElement): StrategyDefinition | string {
  const num = (name: string, label: string, min: number, whole = false): number | string => {
    const v = Number(field(form, name).value);
    if (!Number.isFinite(v) || v < min || (whole && !Number.isInteger(v))) return `${label} must be a ${whole ? 'whole ' : ''}number of at least ${min}.`;
    return v;
  };
  const tfRaw = field(form, 'timeframe').value;
  const timeframe = TIMEFRAMES.find((t) => t === tfRaw) ?? DEFAULT_STRATEGY.timeframe;
  const values = {
    emaFast: num('emaFast', 'Fast EMA', 1, true),
    emaSlow: num('emaSlow', 'Slow EMA', 1, true),
    pullbackMaxPct: num('pullbackMaxPct', 'Pullback max %', 0),
    minDayChangePct: num('minDayChangePct', 'Min day change %', 0),
    minRelativeVolume: num('minRelativeVolume', 'Min relative volume', 0),
    minPrice: num('minPrice', 'Min price', 0),
  };
  for (const v of Object.values(values)) if (typeof v === 'string') return v;
  const n = values as Record<keyof typeof values, number>;
  return {
    name: field(form, 'name').value.trim() || DEFAULT_STRATEGY.name,
    description: field(form, 'description').value.trim(),
    indicators: field(form, 'indicators').value.trim(),
    timeframe,
    emaFast: n.emaFast,
    emaSlow: n.emaSlow,
    requireTrend: field(form, 'requireTrend').checked,
    pullbackMaxPct: n.pullbackMaxPct,
    minDayChangePct: n.minDayChangePct,
    minRelativeVolume: n.minRelativeVolume,
    minPrice: n.minPrice,
    requireVwapSide: field(form, 'requireVwapSide').checked,
  };
}

function render(root: HTMLElement): () => void {
  const configured = store.state?.status.configured ?? true;
  root.innerHTML = `
    <section class="page-head">
      <h1>Check a setup</h1>
      <p class="lede">Compare a symbol with your strategy's numbers, then read what your rules say about the next trade.</p>
    </section>
    <section class="panel">
      <form data-form="check" class="form-row" novalidate>
        <label class="field">Symbol<input name="symbol" type="text" required maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="AAPL" /></label>
        <fieldset class="radios">
          <legend>Side</legend>
          <label><input type="radio" name="side" value="long" checked /> long</label>
          <label><input type="radio" name="side" value="short" /> short</label>
        </fieldset>
        <button type="submit" class="btn primary">Check setup</button>
      </form>
      ${configured ? '' : '<p class="warn-box" style="margin-top:12px">Market data comes from Alpaca, and no keys are saved yet. <a href="#/settings">Add them in Settings</a> to check setups.</p>'}
      <p class="status" role="status" data-section="check-status"></p>
    </section>
    <section class="panel" data-section="result" hidden></section>
    <section class="panel">
      <h2>Your strategy</h2>
      <p class="muted">Plain English for you and for Claude, plus the numbers the setup check uses.</p>
      <form data-form="strategy" class="form-grid" novalidate>
        <label class="field wide">Name<input name="name" type="text" maxlength="80" /></label>
        <label class="field wide">Description (plain English)<textarea name="description" rows="4" placeholder="What you look for, what you avoid, and how you manage the trade."></textarea></label>
        <label class="field wide">Indicators<input name="indicators" type="text" maxlength="200" placeholder="EMA 9, EMA 20, VWAP, relative volume" /></label>
        <label class="field">Timeframe<select name="timeframe"><option value="1Min">1 minute</option><option value="5Min">5 minutes</option><option value="15Min">15 minutes</option></select></label>
        <label class="field">Fast EMA<input name="emaFast" type="number" min="1" step="1" /><span class="hint">Periods, e.g. 9.</span></label>
        <label class="field">Slow EMA<input name="emaSlow" type="number" min="1" step="1" /><span class="hint">Periods, e.g. 20.</span></label>
        <label class="field">Pullback max %<input name="pullbackMaxPct" type="number" min="0" step="0.1" /><span class="hint">Price within this % of the fast EMA.</span></label>
        <label class="field">Min day change %<input name="minDayChangePct" type="number" min="0" step="0.5" /><span class="hint">Move from the prior close, either direction.</span></label>
        <label class="field">Min relative volume<input name="minRelativeVolume" type="number" min="0" step="0.1" /><span class="hint">Today versus the 20-day average.</span></label>
        <label class="field">Min price<input name="minPrice" type="number" min="0" step="1" /><span class="hint">Prefer stocks above this price.</span></label>
        <label class="switch wide"><input type="checkbox" name="requireTrend" /> Require trend: price above the slow EMA for longs, below it for shorts</label>
        <label class="switch wide"><input type="checkbox" name="requireVwapSide" /> Require VWAP side: longs above VWAP, shorts below</label>
        <div class="actions wide">
          <button type="submit" class="btn primary">Save strategy</button>
          <button type="button" class="btn" data-action="strategy-defaults">Reset to defaults</button>
          <span class="status" role="status" data-section="strategy-status"></span>
        </div>
      </form>
    </section>`;

  const checkForm = root.querySelector<HTMLFormElement>('form[data-form="check"]') as HTMLFormElement;
  const checkStatus = root.querySelector<HTMLElement>('[data-section="check-status"]') as HTMLElement;
  const result = root.querySelector<HTMLElement>('[data-section="result"]') as HTMLElement;
  const strategyForm = root.querySelector<HTMLFormElement>('form[data-form="strategy"]') as HTMLFormElement;
  const strategyStatus = root.querySelector<HTMLElement>('[data-section="strategy-status"]') as HTMLElement;
  let alive = true;

  checkForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const symbol = field(checkForm, 'symbol').value.trim().toUpperCase();
    if (!symbol) {
      checkStatus.textContent = 'Enter a symbol.';
      return;
    }
    const side = field(checkForm, 'side').value === 'short' ? 'short' : 'long';
    const button = checkForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    checkStatus.textContent = `Checking ${symbol}.`;
    checkStatus.classList.remove('error');
    try {
      const r = await api.setupCheck(symbol, side);
      if (!alive) return;
      checkStatus.textContent = '';
      setHtml(result, resultHtml(r));
      result.hidden = false;
      result.classList.toggle('next-ok', r.nextTrade.allowed);
    } catch (err) {
      if (!alive) return;
      checkStatus.textContent = errorText(err);
      checkStatus.classList.add('error');
      if (err instanceof ApiError && err.network) reportError(err);
    } finally {
      if (button) button.disabled = false;
    }
  });

  fillStrategy(strategyForm, DEFAULT_STRATEGY);
  api
    .getStrategy()
    .then((s) => {
      if (alive) fillStrategy(strategyForm, s);
    })
    .catch((err: unknown) => {
      if (!alive) return;
      strategyStatus.textContent = `${errorText(err)}. Showing defaults.`;
      strategyStatus.classList.add('error');
    });

  strategyForm.addEventListener('input', () => {
    strategyStatus.textContent = 'Unsaved changes.';
    strategyStatus.classList.remove('error');
  });
  strategyForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const collected = collectStrategy(strategyForm);
    if (typeof collected === 'string') {
      strategyStatus.textContent = collected;
      strategyStatus.classList.add('error');
      return;
    }
    const button = strategyForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const saved = await api.putStrategy(collected);
      if (!alive) return;
      fillStrategy(strategyForm, saved);
      strategyStatus.textContent = 'Saved.';
      strategyStatus.classList.remove('error');
      toast('Strategy saved.', 'ok');
    } catch (err) {
      if (!alive) return;
      strategyStatus.textContent = errorText(err);
      strategyStatus.classList.add('error');
      reportError(err);
    } finally {
      if (button) button.disabled = false;
    }
  });
  root.querySelector<HTMLButtonElement>('[data-action="strategy-defaults"]')?.addEventListener('click', () => {
    fillStrategy(strategyForm, DEFAULT_STRATEGY);
    strategyStatus.textContent = 'Defaults filled in. Save to apply them.';
    strategyStatus.classList.remove('error');
  });

  const stopCountdowns = startCountdowns(root);
  return () => {
    alive = false;
    stopCountdowns();
  };
}
