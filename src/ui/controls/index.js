/**
 * The shared control primitives, re-exported as one import.
 *
 * Inputs:  none
 * Outputs: slider, colorField, numberField, vectorField, toggle, namedList
 * Effects: none
 *
 * Every primitive returns the same shape — `{ el, get, set, destroy }`, with `namedList`
 * substituting `setItems`/`setSelected`/`getSelected` — so a panel can hold a bag of
 * controls and sync them all the same way. `set()` never fires the change callback:
 * reflecting state the caller already knows about must not be mistaken for a user edit.
 */

export { slider } from './slider.js';
export { colorField } from './colorField.js';
export { numberField } from './numberField.js';
export { vectorField } from './vectorField.js';
export { toggle } from './toggle.js';
export { namedList } from './namedList.js';
