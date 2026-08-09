import { el, normalizeHex } from './dom.js';

/**
 * A colour swatch picker paired with an editable hex field.
 *
 * Inputs:  { id, label, value, onInput }
 * Outputs: { el, get, set, destroy }
 * Effects: none beyond its own subtree
 *
 * The text field exists because gel colours and brand colours arrive as hex strings in an
 * email, and picking them out of a colour wheel by eye is guesswork. Invalid text reverts
 * to the last good colour on blur rather than rejecting the keystroke, so a half-typed
 * value is never fought with mid-edit.
 */
export function colorField({ id, label, value = '#ffffff', onInput }) {
  let current = normalizeHex(value) ?? '#ffffff';

  const picker = el('input', { type: 'color', id, value: current });
  const hex = el('input', {
    type: 'text', id: `${id}-hex`, class: 'ctlhex', value: current,
    maxlength: 7, spellcheck: 'false', 'aria-label': `${label} hex value`,
  });
  const row = el('div', { class: 'numrow ctl' }, [
    el('label', { for: id, text: label }),
    el('span', { class: 'ctlcolor' }, [picker, hex]),
  ]);

  function commit(next, { silent = false } = {}) {
    current = next;
    picker.value = current;
    hex.value = current;
    if (!silent) onInput?.(current);
  }

  picker.addEventListener('input', () => commit(picker.value));

  hex.addEventListener('input', () => {
    const parsed = normalizeHex(hex.value);
    if (!parsed) return;          // keep typing; only blur decides it was a mistake
    current = parsed;
    picker.value = parsed;
    onInput?.(parsed);
  });
  hex.addEventListener('blur', () => { hex.value = current; });
  hex.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') hex.blur();
    if (e.key === 'Escape') { hex.value = current; hex.blur(); }
  });

  return {
    el: row,
    get: () => current,
    set(next) { commit(normalizeHex(next) ?? current, { silent: true }); },
    destroy() { row.remove(); },
  };
}
