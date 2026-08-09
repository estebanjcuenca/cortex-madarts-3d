/**
 * Element construction and value formatting shared by the control primitives.
 *
 * Inputs:  tag names, attribute maps, numeric values with their step and unit
 * Outputs: detached DOM elements, formatted display strings
 * Effects: none — nothing here touches the document
 *
 * Internal to `ui/controls/`. Panels import the primitives, never this file.
 */

/** Build a detached element. `class`/`for`/`text` are spelled as they are in HTML. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'text') node.textContent = v;
    else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

/** Decimal places implied by a step, so 0.05 reads as "1.00" and 1 reads as "3". */
export function decimalsFor(step) {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** Display string for a slider or number readout: value at the step's precision, plus unit. */
export function formatValue(value, step, unit) {
  const text = Number(value).toFixed(decimalsFor(step));
  return unit ? `${text} ${unit}` : text;
}

/**
 * Normalise typed hex to `#rrggbb`, or null when it is not a colour.
 * Accepts `abc`, `#abc`, `aabbcc`, `#AABBCC` — everything a designer plausibly pastes.
 */
export function normalizeHex(input) {
  const raw = String(input ?? '').trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return null;
}

/** Clamp to a range, ignoring absent bounds. */
export function clamp(value, min, max) {
  let v = value;
  if (typeof min === 'number' && v < min) v = min;
  if (typeof max === 'number' && v > max) v = max;
  return v;
}
