import { clamp, el } from './dom.js';

const AXES = ['x', 'y', 'z'];

/**
 * Three linked number inputs for a position or an aim point, in metres.
 *
 * Inputs:  { id, label, value: {x,y,z}, step, min, max, onInput }
 * Outputs: { el, get, set, destroy }
 * Effects: none beyond its own subtree
 *
 * `onInput` receives the whole vector, not the edited axis, so callers can pass it
 * straight to a fixture update without reassembling it.
 */
export function vectorField({
  id, label, value = { x: 0, y: 0, z: 0 }, step = 0.05, min, max, onInput,
}) {
  const current = { x: 0, y: 0, z: 0, ...value };
  const inputs = {};

  const axisCells = AXES.map((axis) => {
    const input = el('input', {
      type: 'number', id: `${id}-${axis}`, step, value: current[axis], min, max,
    });
    inputs[axis] = input;
    input.addEventListener('input', () => {
      const parsed = parseFloat(input.value);
      if (!Number.isFinite(parsed)) return;
      current[axis] = clamp(parsed, min, max);
      onInput?.({ ...current });
    });
    return el('span', { class: 'ctlaxis' }, [
      el('label', { for: `${id}-${axis}`, text: axis.toUpperCase() }),
      input,
    ]);
  });

  const row = el('div', { class: 'ctl ctlvec' }, [
    el('div', { class: 'ctlveclabel', text: label }),
    el('div', { class: 'ctlvecrow' }, axisCells),
  ]);

  return {
    el: row,
    get: () => ({ ...current }),
    set(next) {
      for (const axis of AXES) {
        if (typeof next?.[axis] !== 'number') continue;
        current[axis] = clamp(next[axis], min, max);
        inputs[axis].value = current[axis];
      }
    },
    destroy() { row.remove(); },
  };
}
