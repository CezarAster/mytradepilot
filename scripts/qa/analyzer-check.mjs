// Verify the analyzer works on the built site: click the sample button, wait for the report, screenshot it.
// Usage: node scripts/qa/analyzer-check.mjs <url> <outDir>
// Exit code 0 when #report gets children within 15 s on desktop and no page errors occurred.
// Needs Playwright and Chromium:  npm install --no-save playwright && npx playwright install chromium
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: node scripts/qa/analyzer-check.mjs <url> <outDir>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const result = { url, ok: false, consoleErrors: [], pageErrors: [], requestsFailed: [], reportChildren: 0, statusText: '', elapsedMs: 0 };
for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 375, height: 812 } })) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && result.consoleErrors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => result.pageErrors.push(`${name}: ${e.message}`));
  page.on('requestfailed', (r) => result.requestsFailed.push(`${name}: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const demo = page.locator('#demo');
  if ((await demo.count()) === 0) {
    result.pageErrors.push(`${name}: #demo not found`);
    await ctx.close();
    continue;
  }
  const t0 = Date.now();
  await demo.first().click({ force: true });
  try {
    await page.waitForFunction(() => {
      const r = document.getElementById('report');
      return r && r.children.length > 0;
    }, null, { timeout: 15000 });
    result.reportChildren = await page.evaluate(() => document.getElementById('report').children.length);
    result.elapsedMs = Date.now() - t0;
    result.ok = result.ok || name === 'desktop';
  } catch {
    result.pageErrors.push(`${name}: #report stayed empty after clicking #demo`);
  }
  result.statusText = await page.evaluate(() => document.getElementById('status')?.textContent ?? '');
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.getElementById('report')?.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(outDir, `report-${name}.png`) });
  await page.screenshot({ path: join(outDir, `report-${name}-full.png`), fullPage: true });
  await ctx.close();
}
await browser.close();
result.ok = result.ok && result.pageErrors.length === 0;
writeFileSync(join(outDir, 'analyzer-check.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
