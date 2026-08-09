import { clamp, el } from './dom.js';

/**
 * A labelled number input with a unit suffix.
 *
 * Inputs:  { id, label, value, step, unit, min, max, onInput }
 * Outputs: { el, get, set, destroy }
 * Effects: none beyond its own subtree
 *
 * An empty or half-typed field ("-", "1.") reports nothing rather than reporting NaN —
 * a stray NaN reaching a Three.js position removes the object from the visible scene with
 * no error, which is a genuinely hard bug to trace back to a keystroke.
 */
export function numberField({
  id, label, value = 0, step = 0.01, unit = '', min, max, onInput,
}) {
  const input = el('input', { type: 'number', id, step, value, min, max });
  const row = el('div', { class: 'numrow ctl' }, [
    el('label', { for: id, text: label }),
    el('span', { class: 'ctlnum' }, [
      input,
      unit ? el('em', { class: 'ctlunit', text: unit }) : null,
    ]),
  ]);

  input.addEventListener('input', () => {
    const parsed = parseFloat(input.value);
    if (!Number.isFinite(parsed)) return;
    onInput?.(clamp(parsed, min, max));
  });
  input.addEventListener('blur', () => {
    const parsed = parseFloat(input.value);
    if (!Number.isFinite(parsed)) return;
    input.value = clamp(parsed, min, max);
  });

  return {
    el: row,
    get: () => {
      const parsed = parseFloat(input.value);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    set(next) { input.value = clamp(Number(next), min, max); },
    destroy() { row.remove(); },
  };
}
