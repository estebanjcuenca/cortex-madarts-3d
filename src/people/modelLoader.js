import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { clipMovesSkeleton, remapIdleClip } from './idleClip.js';

/** @typedef {{ id: string, label: string, scene: THREE.Group, idleClip: THREE.AnimationClip, mixerRoot: THREE.Object3D, baseHeightM: number }} CivilianVariant */

/** @type {CivilianVariant[]} */
let variants = [];
let loadPromise = null;
let spawnIndex = 0;

/** @type {THREE.AnimationClip|null} */
let sharedIdleSource = null;

const CIVILIAN_CATALOG = [
  { id: 'sophie', file: 'civilians/sophie.glb', label: 'Sophie' },
  { id: 'kate', file: 'civilians/kate.glb', label: 'Kate' },
  { id: 'megan', file: 'civilians/megan.glb', label: 'Megan' },
  { id: 'elizabeth', file: 'civilians/elizabeth.glb', label: 'Elizabeth' },
  { id: 'jody', file: 'civilians/jody.glb', label: 'Jody' },
  { id: 'martha', file: 'civilians/martha.glb', label: 'Martha' },
];

const TARGET_STANDING_HEIGHT_M = 1.68;

function createLoader() {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  return loader;
}

function pickSharedIdleClip(animations) {
  if (!animations?.length) return null;
  let best = null;
  let bestScore = -Infinity;
  for (const clip of animations) {
    let score = clip.duration;
    const n = clip.name.toLowerCase();
    if (n.includes('idle') || n.includes('breathing') || n.includes('mixamo.com')) score += 100;
    if (n.includes('tpose')) score -= 200;
    if (score > bestScore) {
      bestScore = score;
      best = clip;
    }
  }
  return best?.duration > 0.05 ? best : null;
}

/**
 * FBX2glTF exports Mixamo hair materials with baseColorFactor alpha = 0 (alphaMode BLEND),
 * which makes the hair fully invisible. Restore full opacity — the hair texture's own
 * alpha channel still applies, so this recovers the authored look rather than changing it.
 * @param {THREE.Object3D} scene
 */
function restoreInvisibleMaterials(scene) {
  scene.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.castShadow = true;
    obj.receiveShadow = true;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (mat?.transparent && mat.opacity === 0) {
        mat.opacity = 1;
        mat.side = THREE.DoubleSide;
      }
    }
  });
}

/** @param {THREE.Object3D} scene @param {THREE.AnimationClip} idleClip @param {THREE.Object3D} mixerRoot */
function measureStandingHeight(scene, idleClip, mixerRoot) {
  const mixer = new THREE.AnimationMixer(mixerRoot);
  mixer.clipAction(idleClip).play();
  mixer.update(0);
  const height = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).y;
  mixer.stopAllAction();
  return height || TARGET_STANDING_HEIGHT_M;
}

/** Minimum remapped tracks to treat idle as usable (Mixamo bodies use ~47–53). */
const MIN_IDLE_TRACKS = 40;

/** @param {THREE.Object3D} scene @param {THREE.AnimationClip} sourceClip */
function buildCharacterIdle(scene, sourceClip) {
  const mixerRoot = scene;
  const remapped = remapIdleClip(sourceClip, scene);
  if (remapped?.tracks.length >= MIN_IDLE_TRACKS) {
    return { idleClip: remapped, mixerRoot };
  }

  const direct = sourceClip.clone();
  direct.name = 'Idle';
  if (direct.tracks.length >= MIN_IDLE_TRACKS && clipMovesSkeleton(mixerRoot, direct)) {
    return { idleClip: direct, mixerRoot };
  }

  if (remapped?.tracks.length) {
    return { idleClip: remapped, mixerRoot };
  }

  throw new Error(`idle clip could not be retargeted (${remapped?.tracks.length ?? 0} tracks)`);
}

export function isHumanoidReady() {
  return variants.length > 0;
}

export function getTargetStandingHeightM() {
  return TARGET_STANDING_HEIGHT_M;
}

/** Round-robin through loaded characters. */
export function pickSpawnVariant() {
  if (!variants.length) return null;
  const variant = variants[spawnIndex % variants.length];
  spawnIndex += 1;
  return variant;
}

export async function loadHumanoidTemplates() {
  if (variants.length) return variants;
  if (!loadPromise) {
    const loader = createLoader();
    const base = import.meta.env.BASE_URL;
    loadPromise = (async () => {
      const idleGltf = await loader.loadAsync(`${base}models/mixamo-idle.glb`);
      sharedIdleSource = pickSharedIdleClip(idleGltf.animations);
      if (!sharedIdleSource) throw new Error('mixamo-idle.glb has no idle animation');

      const results = await Promise.allSettled(
        CIVILIAN_CATALOG.map(async (entry) => {
          const gltf = await loader.loadAsync(`${base}models/${entry.file}`);
          restoreInvisibleMaterials(gltf.scene);
          const { idleClip, mixerRoot } = buildCharacterIdle(gltf.scene, sharedIdleSource);
          const baseHeightM = measureStandingHeight(gltf.scene, idleClip, mixerRoot);
          return { ...entry, scene: gltf.scene, idleClip, mixerRoot, baseHeightM };
        }),
      );

      const loaded = [];
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
          loaded.push(result.value);
        } else {
          console.error(`Failed to load ${CIVILIAN_CATALOG[i].label}:`, result.reason);
        }
      }

      if (!loaded.length) throw new Error('No Mixamo characters could be loaded');
      variants = loaded;
      spawnIndex = 0;
      return variants;
    })().catch((err) => {
      loadPromise = null;
      throw err;
    });
  }
  return loadPromise;
}

/** @deprecated */
export async function loadHumanoidTemplate() {
  await loadHumanoidTemplates();
  return variants[0]?.scene ?? null;
}
