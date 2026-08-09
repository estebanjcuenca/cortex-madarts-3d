import { el } from './dom.js';

/**
 * A labelled checkbox.
 *
 * Inputs:  { id, label, checked, hint, onChange }
 * Outputs: { el, get, set, destroy }
 * Effects: none beyond its own subtree
 *
 * The whole row is the `<label>`, so the text is part of the hit target rather than a
 * 13-pixel box being the only way to toggle a layer.
 */
export function toggle({ id, label, checked = false, hint, onChange }) {
  const input = el('input', { type: 'checkbox', id, checked });
  const row = el('label', { class: 'row ctl', for: id, title: hint }, [
    input,
    el('span', { text: label }),
  ]);

  input.addEventListener('change', () => onChange?.(input.checked));

  return {
    el: row,
    get: () => input.checked,
    set(next) { input.checked = !!next; },
    destroy() { row.remove(); },
  };
}
