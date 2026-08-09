import * as THREE from 'three';
import { createCentralLightRig } from './centralLight.js';
import { emitsLight, sanitizeParams } from './fixtureTypes.js';

/**
 * Builds and updates the Three.js objects that represent a `Fixture` record.
 *
 * The record is the truth; everything here is a projection of it. `update()` mutates
 * existing objects in place and never recreates a light — recreating would drop the
 * shadow map and produce a visible hitch on every slider drag (FR-003).
 *
 * Budget (Constitution V): at most one light, one body mesh, and one beam mesh per fixture.
 */

const BODY_SIZE = { w: 0.45, h: 0.12, d: 0.45 };
const CONE_RADIUS = 0.7;
const CONE_FLOOR_GAP = 0.5; // cone stops short of the floor
const LIGHT_DROP = 0.1;     // light sits just below the body so it is not occluded by it

function makeBody() {
  return new THREE.Mesh(
    new THREE.BoxGeometry(BODY_SIZE.w, BODY_SIZE.h, BODY_SIZE.d),
    new THREE.MeshStandardMaterial({
      color: 0xffd23f, emissive: 0xffb800, emissiveIntensity: 1.2, roughness: 0.4,
    }),
  );
}

/** A visible downward glow cone, so that placing a fixture is obvious even in a bright scene. */
function makeCone(color, height) {
  return new THREE.Mesh(
    new THREE.ConeGeometry(CONE_RADIUS, height, 16, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
}

function coneHeightFor(y) {
  return Math.max(0.2, y - CONE_FLOOR_GAP);
}

function configureShadow(light) {
  if (light.shadow.mapSize.width === 1024) return;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.camera.near = 0.2;
  light.shadow.camera.far = 20;
  light.shadow.bias = -0.004;
}

function makeLight(fixture, params) {
  switch (fixture.type) {
    case 'ambient':
      return new THREE.AmbientLight(fixture.color, fixture.intensity);
    case 'directional':
      return new THREE.DirectionalLight(fixture.color, fixture.intensity);
    case 'point':
    case 'wash':
      return new THREE.PointLight(fixture.color, fixture.intensity, params.distance, params.decay);
    case 'spot':
      return new THREE.SpotLight(
        fixture.color, fixture.intensity, params.distance,
        THREE.MathUtils.degToRad(params.angleDeg), params.penumbra, params.decay,
      );
    default:
      return null;
  }
}

function applyLight(light, fixture, params) {
  light.color.set(fixture.color);
  light.intensity = fixture.enabled === false ? 0 : fixture.intensity;
  if (light.isAmbientLight) return;

  light.position.set(fixture.position.x, fixture.position.y, fixture.position.z);
  if (light.isPointLight || light.isSpotLight) {
    light.position.y -= LIGHT_DROP;
    light.distance = params.distance;
    light.decay = params.decay;
  }
  if (light.isSpotLight) {
    light.angle = THREE.MathUtils.degToRad(params.angleDeg);
    light.penumbra = params.penumbra;
  }
  if (light.castShadow !== !!fixture.castShadow) {
    light.castShadow = !!fixture.castShadow;
    if (light.castShadow) configureShadow(light);
  }
}

/**
 * @param {{parent: THREE.Object3D, wallHeight?: number}} ctx  the subset of the stage
 *   context this module needs: the group to add objects to, and the room height.
 * @param {object} fixture  a Fixture record (see data-model.md §3)
 * @returns {{objects: THREE.Object3D[], light: THREE.Light|null, body: THREE.Mesh|null,
 *   tick?: (t: number, occupancy: number) => void, update: (f: object) => void,
 *   dispose: () => void}}
 */
export function createFixtureObjects(ctx, fixture) {
  const { parent } = ctx;
  const type = fixture.type;

  // The central beam owns its own geometry, shader, and pulse animation.
  if (type === 'centralBeam') {
    const group = new THREE.Group();
    group.position.set(fixture.position.x, fixture.position.y, fixture.position.z);
    parent.add(group);
    const rig = createCentralLightRig(group, { wallHeight: ctx.wallHeight ?? 3 });
    const applyRig = (f) => {
      const p = sanitizeParams('centralBeam', f.params);
      rig.setMultipliers({
        intensity: f.enabled === false ? 0 : f.intensity,
        beam: p.beamScale,
        glow: p.glowScale,
      });
      rig.light.castShadow = !!f.castShadow;
      group.position.set(f.position.x, f.position.y, f.position.z);
    };
    applyRig(fixture);
    return {
      objects: [group],
      light: rig.light,
      body: null,
      rig,
      tick: (t, occupancy) => rig.update(t, occupancy),
      update: applyRig,
      dispose: () => {
        parent.remove(group);
        disposeTree(group);
      },
    };
  }

  // Projector throw cones are geometry owned by screenAssembly; the fixture record
  // exists so projectors are addressable and layer-switchable, but it adds no objects.
  if (!emitsLight(type)) {
    return {
      objects: [], light: null, body: null,
      update: () => {}, dispose: () => {},
    };
  }

  const params = sanitizeParams(type, fixture.params);
  const objects = [];

  const light = makeLight(fixture, params);
  applyLight(light, fixture, params);
  parent.add(light);
  objects.push(light);

  let target = null;
  if (light.isSpotLight || light.isDirectionalLight) {
    target = new THREE.Object3D();
    parent.add(target);
    light.target = target;
    objects.push(target);
  }

  // A `wash` is an invisible spill; a `point` or `spot` is a physical fixture with a housing.
  const wantsBody = type === 'point' || type === 'spot';
  let body = null;
  let cone = null;
  if (wantsBody) {
    body = makeBody();
    body.position.copy(fixture.position);
    body.userData = { kind: 'fixture', fixtureId: fixture.id, info: fixture.name };
    parent.add(body);
    objects.push(body);

    cone = makeCone(fixture.color, coneHeightFor(fixture.position.y));
    parent.add(cone);
    objects.push(cone);
  }

  function applyCone(f, y) {
    const h = coneHeightFor(y);
    cone.geometry.dispose();
    cone.geometry = new THREE.ConeGeometry(CONE_RADIUS, h, 16, 1, true);
    cone.position.set(f.position.x, y - h / 2, f.position.z);
    cone.material.color.set(f.color);
    cone.visible = f.enabled !== false;
  }
  if (cone) applyCone(fixture, fixture.position.y);

  function update(next) {
    if (next.type !== type) {
      throw new Error(
        `Fixture "${next.id}" changed type ${type} → ${next.type}; the rig must dispose and rebuild it.`,
      );
    }
    const p = sanitizeParams(type, next.params);
    applyLight(light, next, p);
    if (target && next.aim) target.position.set(next.aim.x, next.aim.y, next.aim.z);
    if (body) {
      body.position.copy(next.position);
      body.visible = next.enabled !== false;
      body.userData.info = next.name;
    }
    if (cone) applyCone(next, next.position.y);
  }

  function dispose() {
    for (const o of objects) {
      parent.remove(o);
      disposeTree(o);
    }
    if (light.shadow?.map) light.shadow.map.dispose();
    objects.length = 0;
  }

  return { objects, light, body, update, dispose };
}

function disposeTree(root) {
  root.traverse?.((o) => {
    o.geometry?.dispose?.();
    const m = o.material;
    if (Array.isArray(m)) m.forEach((x) => x.dispose?.());
    else m?.dispose?.();
  });
}
