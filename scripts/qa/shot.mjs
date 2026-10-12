// Screenshot a page at desktop and phone widths, at several scroll depths, and collect console errors.
// Usage: node scripts/qa/shot.mjs <url> <outDir> [--scrolls=0,0.15,0.3,0.45,0.6,0.75,0.9,1] [--reduced-motion]
// Needs Playwright and Chromium:  npm install --no-save playwright && npx playwright install chromium
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const [url, outDir, ...flags] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: node scripts/qa/shot.mjs <url> <outDir> [--scrolls=0,0.25,0.5,0.75,1] [--reduced-motion]');
  process.exit(2);
}
const scrollsFlag = flags.find((f) => f.startsWith('--scrolls='));
const scrolls = scrollsFlag ? scrollsFlag.slice(10).split(',').map(Number) : [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
const reducedMotion = flags.includes('--reduced-motion') ? 'reduce' : 'no-preference';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const report = { url, viewports: {}, consoleErrors: [], pageErrors: [], requestsFailed: [] };
for (const [name, viewport] of Object.entries({ desktop: { width: 1440, height: 900 }, phone: { width: 375, height: 812 } })) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && report.consoleErrors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => report.pageErrors.push(`${name}: ${e.message}`));
  page.on('requestfailed', (r) => report.requestsFailed.push(`${name}: ${r.url()} ${r.failure()?.errorText ?? ''}`));
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const docH = await page.evaluate(() => document.documentElement.scrollHeight);
  const bodyW = await page.evaluate(() => document.documentElement.scrollWidth);
  report.viewports[name] = { documentHeight: docH, documentScrollWidth: bodyW, horizontalOverflow: bodyW > viewport.width };
  for (const s of scrolls) {
    const y = Math.round((docH - viewport.height) * s);
    // Scroll in steps so scroll-triggered animations fire like they would for a person.
    await page.evaluate(async (target) => {
      const step = 400;
      let cur = window.scrollY;
      while (Math.abs(target - cur) > step) {
        cur += Math.sign(target - cur) * step;
        window.scrollTo(0, cur);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, target);
    }, y);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(outDir, `${name}-${String(Math.round(s * 100)).padStart(3, '0')}.png`) });
  }
  await ctx.close();
}
await browser.close();
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
