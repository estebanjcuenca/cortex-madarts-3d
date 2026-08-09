// Headless maze-route verification (quickstart V1 / SC-001, SC-002).
// Requires: dev server running (npm run dev) and playwright installed (npm i --no-save playwright).
// Usage: node scripts/verify-maze.mjs [url]
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5174/';
const RUNS = 10;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__cortexDebug, null, { timeout: 60000 });
await page.waitForTimeout(3000); // let models/scene settle

// The genMaze button lives in a collapsed menu section — expand all sections.
await page.evaluate(() => {
  document.querySelectorAll('#legend details').forEach((d) => { d.open = true; });
});

let passed = 0;
for (let run = 1; run <= RUNS; run++) {
  await page.click('#genMaze');
  await page.waitForTimeout(400); // walk starts; route is final at this point

  const result = await page.evaluate(() => {
    const check = window.__cortexDebug.validateCurrentRoute();
    return { valid: check.valid, issues: check.issues.slice(0, 5), walking: window.__cortexDebug.isWalking() };
  });

  // Stop the walk cleanly and confirm controls are restored.
  await page.click('#btnWalk');
  await page.waitForTimeout(300);
  const stopped = await page.evaluate(() => !window.__cortexDebug.isWalking());

  const ok = result.valid && result.walking && stopped;
  if (ok) passed++;
  console.log(
    `run ${String(run).padStart(2)}: route ${result.valid ? 'VALID' : 'INVALID'} | walk started: ${result.walking} | stopped cleanly: ${stopped}${result.issues.length ? ` | issues: ${result.issues.join('; ')}` : ''}`,
  );
}

console.log(`\n${passed}/${RUNS} runs passed`);
if (pageErrors.length) console.log('page errors:', pageErrors);
await browser.close();
process.exit(passed === RUNS && pageErrors.length === 0 ? 0 : 1);
