/**
 * Headless checks for the fixture model (005-stage-visualizer-components, US1).
 * Runs in Node without a browser — the rig and the type catalogue never touch the DOM.
 *
 * Usage: node scripts/verify-lighting.mjs
 */
import * as THREE from 'three';
import { createLightingRig } from '../src/lighting/lightingRig.js';
import {
  defaultsFor, paramSchema, sanitizeParams, shadowPassCost,
} from '../src/lighting/fixtureTypes.js';

let failures = 0;
const check = (label, cond) => {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
};

// --- type catalogue ---------------------------------------------------------
check('point light costs 6 shadow passes (cube map)', shadowPassCost('point') === 6);
check('spot light costs 1 shadow pass', shadowPassCost('spot') === 1);
check('ambient light costs no shadow passes', shadowPassCost('ambient') === 0);
check('spot exposes 4 editable params', paramSchema('spot').length === 4);
check('params are clamped to the schema range', sanitizeParams('spot', { angleDeg: 500 }).angleDeg === 89);
check('unknown params are dropped', !('bogus' in sanitizeParams('spot', { bogus: 1 })));
check('defaults are fresh copies, not shared', defaultsFor('spot').params !== defaultsFor('spot').params);

// --- shadow budget ----------------------------------------------------------
const parent = new THREE.Group();
const rig = createLightingRig({ parent, wallHeight: 3.2, shadowPassBudget: 12 });

rig.add({ id: 'ambient', type: 'ambient', origin: 'installation' });
const central = rig.add({ id: 'central', type: 'point', castShadow: true, position: { x: 0, y: 2, z: 0 } });
check('first shadow caster is accepted', central.fixture.castShadow && !central.warning && !central.reason);
check('a single point light spends 6 of 12 passes', rig.shadowBudget().used === 6);

const spot = rig.add({ id: 's1', type: 'spot', castShadow: true, position: { x: 1, y: 2.5, z: 0 } });
check('a second caster is allowed when it is a cheap spot', spot.fixture.castShadow && !spot.warning);

for (let i = 2; i <= 6; i++) {
  rig.add({ id: `s${i}`, type: 'spot', castShadow: true, position: { x: i, y: 2.5, z: 0 } });
}
check('six spots plus the point light reach the budget exactly', rig.shadowBudget().used === 12);

const overBudget = rig.add({ id: 's7', type: 'spot', castShadow: true, position: { x: 0, y: 2.5, z: 1 } });
check('one pass over budget warns but still allows', overBudget.fixture.castShadow && !!overBudget.warning);

const refused = rig.add({ id: 'p2', type: 'point', castShadow: true, position: { x: 0, y: 2.5, z: 2 } });
check('a point light past the hard ceiling is refused and downgraded',
  !refused.fixture.castShadow && !!refused.reason);

// --- record lifecycle -------------------------------------------------------
const spotLightBefore = parent.children.find((c) => c.isSpotLight);
const updated = rig.update('s1', { intensity: 5, params: { angleDeg: 40 } });
check('update applies the patch', updated.fixture.params.angleDeg === 40);
check('update mutates in place, it does not recreate the light',
  parent.children.find((c) => c.isSpotLight) === spotLightBefore);

check('installation fixtures cannot be deleted', rig.remove('ambient').ok === false);
check('user fixtures can be deleted', rig.remove('s7').ok === true);

rig.setMood({ exposure: 0.5 });
check('mood leaves the fixture record untouched',
  rig.get('ambient').intensity === defaultsFor('ambient').intensity);
const ambientLight = parent.children.find((c) => c.isAmbientLight);
check('mood scales the rendered light', Math.abs(ambientLight.intensity - 0.275) < 1e-9);

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
