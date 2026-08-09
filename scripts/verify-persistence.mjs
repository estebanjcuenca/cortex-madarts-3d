/**
 * Headless checks for autosave and the default screen media (005, US5 subset).
 * Requires: npm run dev
 *
 * Usage: node scripts/verify-persistence.mjs [url]
 */
import { chromium } from 'playwright';

const url = process.argv[2] || process.env.CORTEX_URL || 'http://localhost:5174/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const settle = () => page.waitForTimeout(3500);
const readState = () => page.evaluate(() => ({
  ltIntensity: document.getElementById('ltIntensity').value,
  fbWash: document.getElementById('fbWash').value,
  scAmbient: document.getElementById('scAmbient').value,
  mirror: document.getElementById('screenMediaMirror').checked,
  status: document.getElementById('screenMediaStatus').textContent.trim(),
  record: JSON.parse(localStorage.getItem('cortex.stage.autosave.v1') || 'null'),
}));

await page.goto(url, { waitUntil: 'networkidle' });
await settle();
await page.click('summary:has-text("Screen content")');

// Build a distinctive lighting scene: sliders, two ceiling fixtures, an image, mirror off.
await page.evaluate(() => {
  const set = (id, v) => {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  set('ltIntensity', '1.75');
  set('fbWash', '0.85');
  set('scAmbient', '0.35');
});
await page.click('#ceilingModeBtn');
await page.mouse.click(600, 300);
await page.waitForTimeout(300);
await page.mouse.click(700, 350);
await page.waitForTimeout(300);
await page.click('#ceilingModeBtn');

await page.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 200;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e91e63'; ctx.fillRect(0, 0, 400, 200);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const dt = new DataTransfer();
  dt.items.add(new File([blob], 'default.png', { type: 'image/png' }));
  document.getElementById('canvas-wrap')
    .dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
});
await page.waitForTimeout(2000);
await page.uncheck('#screenMediaMirror');
await page.waitForTimeout(1200); // outlast the 500 ms debounce

const before = await readState();
check('a record is written', !!before.record, before.record ? `schema ${before.record.schemaVersion}` : 'nothing stored');

await page.reload({ waitUntil: 'networkidle' });
await settle();
await page.click('summary:has-text("Screen content")');
await page.waitForTimeout(1500);
const after = await readState();

check('central light intensity survives', before.ltIntensity === after.ltIntensity, `${before.ltIntensity} → ${after.ltIntensity}`);
check('fabric wash survives', before.fbWash === after.fbWash, `${before.fbWash} → ${after.fbWash}`);
check('room ambient survives', before.scAmbient === after.scAmbient, `${before.scAmbient} → ${after.scAmbient}`);
check('mirror setting survives', before.mirror === after.mirror, `${before.mirror} → ${after.mirror}`);
check('ceiling fixtures survive', after.record?.fixtures?.length === 2, `${after.record?.fixtures?.length} restored`);
check('the default image reloads', /image 400×200/.test(after.status), after.status);

// Clearing must remove the default for good.
await page.click('#screenMediaClear');
await page.waitForTimeout(1200);
await page.reload({ waitUntil: 'networkidle' });
await settle();
await page.click('summary:has-text("Screen content")');
const cleared = await readState();
check('a cleared default stays cleared', /deep-space still/.test(cleared.status), cleared.status);

check('no page errors', errors.length === 0, errors.join(' | '));
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
await browser.close();
process.exit(failures === 0 ? 0 : 1);
