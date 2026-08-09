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

/** Every field the autosave record is supposed to carry, and the value we set it to. */
const TUNED = {
  // the eight lighting sliders
  ltIntensity: '1.75', ltBeam: '0.4', ltGlow: '1.55', ltBloom: '0.25',
  fbBrightness: '1.85', fbWash: '0.85', scAmbient: '0.35', scFill: '1.6',
  // placement — these move lights, not just geometry
  offX: '0.4', offZ: '7.2', doorX: '4.2', doorZ: '22',
  // the background light box: position, orientation and size are all editable
  boxX: '3.9', boxY: '1.6', boxZ: '18.5',
  boxYaw: '135', boxPitch: '10', boxRoll: '5',
  boxW: '1.4', boxH: '2', boxD: '0.5',
  boxIntensity: '6.5', boxReach: '18', boxFalloff: '1.2',
  boxSpread: '75', boxSoftness: '0.4',
};
const FIELDS = Object.keys(TUNED);

const readState = () => page.evaluate((fields) => {
  const out = {};
  for (const id of fields) out[id] = document.getElementById(id).value;
  out.mirror = document.getElementById('screenMediaMirror').checked;
  out.status = document.getElementById('screenMediaStatus').textContent.trim();
  out.record = JSON.parse(localStorage.getItem('cortex.stage.autosave.v1') || 'null');
  return out;
}, FIELDS);

await page.goto(url, { waitUntil: 'networkidle' });
await settle();
await page.click('summary:has-text("Screen content")');

// Build a distinctive scene: every tunable field, two ceiling fixtures, an image, mirror off.
await page.evaluate((tuned) => {
  for (const [id, v] of Object.entries(tuned)) {
    const el = document.getElementById(id);
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}, TUNED);
await page.waitForTimeout(800); // the placement fields rebuild rings and circulation
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

// Asserted field by field rather than in bulk: a single "settings survive" check passing
// on three of fourteen fields is how five sliders stayed untested for so long.
for (const id of FIELDS) {
  const want = String(parseFloat(TUNED[id]));
  check(`${id} survives`, before[id] === after[id] && after[id] === want,
    `set ${TUNED[id]} → saved ${before[id]} → reloaded ${after[id]}`);
}
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
