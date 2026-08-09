import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * The architect's drawing is git-ignored and therefore absent from any build made from a
 * clean checkout (see README). Decide here, once, whether this build has it: the floorplan
 * panel then offers the underlay or leaves it out entirely, without asking the network for
 * a file it already knows is not there.
 */
const underlay = fileURLToPath(new URL('public/floorplan2.svg', import.meta.url));

export default defineConfig({
  base: './',
  define: {
    __HAS_FLOORPLAN_UNDERLAY__: JSON.stringify(existsSync(underlay)),
  },
});
