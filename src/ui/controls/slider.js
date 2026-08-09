import { clamp, el, formatValue } from './dom.js';

/**
 * A labelled range input with a live numeric readout.
 *
 * Inputs:  { id, label, min, max, step, value, unit, onInput }
 * Outputs: { el, get, set, destroy }
 * Effects: none beyond its own subtree — the caller decides where to mount it
 *
 * `onInput` fires on every drag frame, not on release: fixture edits must apply live
 * (FR-003), and a light that only updates on mouse-up cannot be tuned by eye.
 */
export function slider({
  id, label, min = 0, max = 1, step = 0.01, value = 0, unit = '', onInput,
}) {
  const input = el('input', {
    type: 'range', id, min, max, step, value: clamp(value, min, max),
  });
  const readout = el('output', { class: 'ctlval', for: id });
  const row = el('div', { class: 'numrow ctl' }, [
    el('label', { for: id, text: label }),
    input,
    readout,
  ]);

  const sync = () => { readout.textContent = formatValue(input.value, step, unit); };
  sync();

  input.addEventListener('input', () => {
    sync();
    onInput?.(parseFloat(input.value));
  });

  return {
    el: row,
    get: () => parseFloat(input.value),
    /** Programmatic set is silent — it reflects state the caller already knows about. */
    set(next) {
      input.value = clamp(Number(next), min, max);
      sync();
    },
    destroy() { row.remove(); },
  };
}
