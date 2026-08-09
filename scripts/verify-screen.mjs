/**
 * Headless checks for 003-screen-real-dimensions (SC-001…SC-003).
 * Requires: npm run dev (default http://localhost:5174)
 */
import { chromium } from 'playwright';

const url = process.env.CORTEX_URL || 'http://localhost:5174';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

const report = await page.evaluate(() => {
  const dims = document.getElementById('dims')?.innerText || '';
  const screenLayer = document.querySelector('[data-layer="screen"]');
  const curtainLayer = document.querySelector('[data-layer="curtain"]');
  const techLayer = document.querySelector('[data-layer="technical"]');
  return {
    dims,
    hasScreenLayer: !!screenLayer,
    hasTechLayer: !!techLayer,
    screenChecked: !!screenLayer?.checked,
    curtainChecked: !!curtainLayer?.checked,
  };
});

const scene = await page.evaluate(async () => {
  // Count screen meshes via raycast targets / groups if exposed — fall back to DOM dims + layer toggle
  const before = document.querySelector('[data-layer="screen"]').checked;
  document.querySelector('[data-layer="screen"]').checked = false;
  document.querySelector('[data-layer="screen"]').dispatchEvent(new Event('change'));
  await new Promise((r) => setTimeout(r, 100));
  document.querySelector('[data-layer="screen"]').checked = before;
  document.querySelector('[data-layer="screen"]').dispatchEvent(new Event('change'));
  return { toggled: true };
});

const dimsOk =
  /226/.test(report.dims) &&
  /10\.12/.test(report.dims) &&
  /22\.34/.test(report.dims) &&
  /4\.80/.test(report.dims);

// Projection study via selecting — open X panel and check overlay
await page.keyboard.press('x');
await page.waitForTimeout(400);
const panel = await page.evaluate(() => {
  const p = document.getElementById('floorplanPanel');
  const dims = document.getElementById('fpDims')?.textContent || '';
  return {
    open: p?.classList.contains('open'),
    screenPaths: p?.querySelectorAll('.fpScreen path').length ?? 0,
    ringGroups: p?.querySelectorAll('.fpRing').length ?? 0,
    dims,
  };
});

console.log('dims HUD:', report.dims.replace(/\s+/g, ' ').trim());
console.log('dimsOk:', dimsOk);
console.log('layers:', { screen: report.hasScreenLayer, technical: report.hasTechLayer });
console.log('panel:', panel);
console.log('toggle smoke:', scene);
console.log('page errors:', errors.length ? errors : 'none');

const ok =
  dimsOk &&
  report.hasScreenLayer &&
  report.hasTechLayer &&
  panel.open &&
  panel.screenPaths >= 2 &&
  panel.ringGroups >= 1 &&
  errors.length === 0;

await browser.close();
process.exit(ok ? 0 : 1);
