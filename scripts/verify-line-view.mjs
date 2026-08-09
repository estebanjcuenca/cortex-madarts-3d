/**
 * Verifies the line-drawing render mode.
 *
 * A screenshot only shows that the mode looks right. What actually matters is that it is
 * reversible: every material it swaps must come back, and every edge object it creates
 * must be removed. Those counts are what this asserts.
 *
 * Usage: npm run dev, then `node scripts/verify-line-view.mjs [url]`
 */
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5176/';
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);

const stats = () => page.evaluate(() => window.__cortexDebug.lineView.stats());
const enabled = () => page.evaluate(() => window.__cortexDebug.lineView.isEnabled());

const before = await stats();
check('starts clean', before.converted === 0 && before.edges === 0, JSON.stringify(before));

await page.click('#btnLineView');
await page.waitForTimeout(1200);
const on = await stats();
check('mode is on', await enabled() === true);
check('materials swapped', on.converted > 50, `converted=${on.converted}`);
check('edges built', on.edges > 50, `edges=${on.edges}`);

check('nothing left unconverted', on.unconverted === 0, `unconverted=${on.unconverted}`);

// A ring rebuild replaces geometry while the mode is live; the new geometry has to join in.
// Mesh totals are not a useful signal here (ring count does not map to mesh count once
// rings are trimmed to the walls), so assert the invariant directly: no mesh is left
// rendering in full colour inside the drawing.
// The Rings section ships collapsed, so the button is present but not clickable.
await page.evaluate(() => document.getElementById('addRing').closest('details').open = true);
await page.click('#addRing');
await page.waitForTimeout(1500);
const afterRebuild = await stats();
check('rebuilt geometry joins the drawing', afterRebuild.unconverted === 0,
  `unconverted=${afterRebuild.unconverted}`);

await page.click('#btnLineView');
await page.waitForTimeout(1200);
const off = await stats();
check('mode is off', await enabled() === false);
check('all materials restored', off.converted === 0, `converted=${off.converted}`);
check('all edges removed', off.edges === 0, `edges=${off.edges}`);
check('meshes survive the round trip', off.meshes === afterRebuild.meshes,
  `${afterRebuild.meshes} -> ${off.meshes}`);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
