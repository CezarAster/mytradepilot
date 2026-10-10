// UI smoke test for the Referee. Needs the built UI (npm run build:app) and playwright-core:
//   npm install --no-save playwright-core && node scripts/ui-smoke.cjs
// Uses your installed Google Chrome (channel "chrome"); set CHROMIUM_PATH to use another Chromium.
// Starts the referee on a temp data dir, opens every page, and fails on console errors, failed requests
// or missing landmark text; screenshots land next to this script.
const { spawn } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const REPO = require('node:path').resolve(__dirname, '..');
const PORT = 4311;

async function waitFor(url, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('service did not start');
}

(async () => {
  const home = mkdtempSync(join(tmpdir(), 'ui-smoke-'));
  const svc = spawn(process.execPath, ['src/server/main.ts'], { cwd: REPO, env: { ...process.env, MYTRADEPILOT_HOME: home, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let svcLog = '';
  svc.stdout.on('data', (d) => (svcLog += d));
  svc.stderr.on('data', (d) => (svcLog += d));
  const problems = [];
  try {
    await waitFor(`http://127.0.0.1:${PORT}/api/health`, 15000);
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console error: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
    page.on('requestfailed', (r) => { if (!r.url().includes('/api/events')) problems.push(`request failed: ${r.url()} ${r.failure()?.errorText}`); });
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().includes('/api/setup-check')) problems.push(`HTTP ${r.status()} ${r.url()}`); });

    const base = `http://127.0.0.1:${PORT}/`;
    const routes = ['#/', '#/rules', '#/record', '#/setup', '#/settings', '#/log', '#/ask'];
    const seen = {};
    for (const route of routes) {
      await page.goto(base + route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600);
      const text = await page.evaluate(() => document.body.innerText);
      seen[route] = text.slice(0, 4000);
      if (text.trim().length < 40) problems.push(`${route}: page is nearly empty`);
      await page.screenshot({ path: join(__dirname, `shot-${route.replace(/[#/]/g, '') || 'today'}.png`), fullPage: true });
    }
    const today = seen['#/'];
    for (const needle of ['Trade 1', 'rule', 'Settings']) if (!new RegExp(needle, 'i').test(today)) problems.push(`Today page lacks "${needle}"`);
    if (!/not configured|Alpaca|keys/i.test(today)) problems.push('Today page does not point the user at Settings when unconfigured');
    if (!/dry run/i.test(today)) problems.push('Today page does not show the dry run state');
    await page.goto(base + '#/rules', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const windowStart = await page.locator('input[name="sessionWindow.start"]').inputValue().catch(() => '');
    if (windowStart !== '09:30') problems.push(`Rules page session window start is "${windowStart}", expected 09:30`);
    if (!/MCP|Claude/i.test(seen['#/ask'])) problems.push('Ask page lacks MCP instructions');

    // Interactions: save bad keys -> error toast; declare -> pending shown; confirm plan.
    await page.goto(base + '#/settings', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const keyInputs = await page.locator('input').count();
    if (keyInputs < 2) problems.push('Settings page has fewer than 2 inputs');

    // Import the sample fills through the Record page and expect the report to render.
    await page.goto(base + '#/record', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const fileInput = page.locator('input[type="file"]').first();
    if (await fileInput.count()) {
      await fileInput.setInputFiles(join(REPO, 'public', 'sample-trades.csv'));
      const importBtn = page.getByRole('button', { name: /^import/i }).first();
      if (await importBtn.count()) await importBtn.click();
      await page.waitForTimeout(1500);
      const rec = await page.evaluate(() => document.body.innerText);
      if (!/win rate/i.test(rec)) problems.push('Record page did not render the report after importing the sample CSV');
      if (!/imported/i.test(rec)) problems.push('Record page did not confirm the import');
    } else problems.push('Record page has no file input');

    await page.goto(base + '#/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const declareBtn = page.getByRole('button', { name: /taking this/i }).first();
    if (await declareBtn.count()) {
      await declareBtn.click();
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => document.body.innerText);
      if (!/declar/i.test(after)) problems.push('after declaring, the page does not show the declaration');
    } else problems.push('no "I\'m taking this" button on Today');
    const planBtn = page.getByRole('button', { name: /confirm today/i }).first();
    if (await planBtn.count()) {
      await planBtn.click();
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => document.body.innerText);
      if (!/confirmed/i.test(after)) problems.push('after confirming the plan, the page does not say confirmed');
    } else problems.push('no "Confirm today\'s plan" button on Today');
    const kill = page.getByRole('button', { name: /kill/i }).first();
    if (await kill.count()) {
      await kill.click();
      await page.waitForTimeout(600);
      const st = await (await fetch(`http://127.0.0.1:${PORT}/api/state`)).json();
      if (st.status.enforcement.enabled) problems.push('kill switch did not turn enforcement off');
      // Each button press must reach the server exactly once (listeners must not stack across page visits).
      const kills = st.recentActions.filter((a) => /kill switch/i.test(a.detail)).length;
      if (kills !== 1) problems.push(`kill switch produced ${kills} actions, expected 1`);
    } else problems.push('no kill switch button on Today');
    // Second pass: a scripted trading day against a fake Alpaca (positions, breaches, a flatten, a lock).
    const scen = spawn(process.execPath, ['test/helpers/ui-scenario.ts'], { cwd: REPO, env: { ...process.env, PORT: String(PORT + 1) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let scenLog = '';
    scen.stdout.on('data', (d) => (scenLog += d));
    scen.stderr.on('data', (d) => (scenLog += d));
    try {
      await waitFor(`http://127.0.0.1:${PORT + 1}/api/health`, 20000);
      const t0 = Date.now();
      while (!/READY/.test(scenLog) && Date.now() - t0 < 20000) await new Promise((r) => setTimeout(r, 200));
      const base2 = `http://127.0.0.1:${PORT + 1}/`;
      const expect2 = {
        '#/': [/MSFT/, /Locked|LOCKED|locked out/i, /closed by the referee|referee/i, /NVDA/, /AMD/, /stop at 410|410\.00/],
        '#/log': [/flatten/i, /lock/i],
        '#/record': [/win rate/i, /AAPL|TSLA/],
      };
      for (const [route, needles] of Object.entries(expect2)) {
        await page.goto(base2 + route, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(800);
        const text = await page.evaluate(() => document.body.innerText);
        for (const n of needles) if (!n.test(text)) problems.push(`scenario ${route}: missing ${n}`);
        await page.screenshot({ path: join(__dirname, `scenario-${route.replace(/[#/]/g, '') || 'today'}.png`), fullPage: true });
      }
    } finally {
      scen.kill('SIGINT');
    }
    if (/Error|TypeError/.test(scenLog)) problems.push('scenario runner logged an error: ' + scenLog.split('\n').filter((l) => /Error/.test(l)).slice(0, 3).join(' | '));

    await browser.close();
  } catch (err) {
    problems.push(`fatal: ${err.message}`);
  } finally {
    svc.kill('SIGINT');
    rmSync(home, { recursive: true, force: true });
  }
  if (problems.length) {
    console.log('PROBLEMS:\n' + problems.map((p) => ' - ' + p).join('\n'));
    console.log('--- service log ---\n' + svcLog.slice(-2000));
    process.exit(1);
  }
  console.log('UI smoke: OK');
})();
