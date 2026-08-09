import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { getTargetStandingHeightM, isHumanoidReady } from './modelLoader.js';
import { createPersonNameLabel, syncPersonNameLabel } from './personLabel.js';

const MODEL_YAW_OFFSET = 0;

/** @param {THREE.Object3D} mixerRoot @param {THREE.AnimationClip} idleClip */
function attachIdleAnimation(mixerRoot, idleClip) {
  const mixer = new THREE.AnimationMixer(mixerRoot);
  const action = mixer.clipAction(idleClip);
  action.setLoop(THREE.LoopRepeat, Infinity);
  action.play();
  action.time = Math.random() * idleClip.duration;
  mixer.update(0);
  return mixer;
}

export function faceTowardCentralLight(person, circleCenter) {
  const dx = circleCenter.x - person.position.x;
  const dz = circleCenter.z - person.position.z;
  if (dx * dx + dz * dz < 1e-8) return;
  person.rotation.y = Math.atan2(dx, dz) + MODEL_YAW_OFFSET;
}

/**
 * Clone a loaded template as-is. Only uniform height normalization on the wrapper.
 *
 * @param {import('./modelLoader.js').CivilianVariant} variant
 */
export function createPersonMesh(variant) {
  if (!variant?.scene || !variant.idleClip || !isHumanoidReady()) return null;

  const group = new THREE.Group();
  const model = cloneSkinned(variant.scene);

  group.scale.setScalar(getTargetStandingHeightM() / variant.baseHeightM);

  const mixer = attachIdleAnimation(model, variant.idleClip.clone());

  const nameLabel = createPersonNameLabel(variant.label);
  group.add(model);
  group.add(nameLabel);

  group.userData = {
    kind: 'person',
    info: `${variant.label} — click to remove`,
    variantId: variant.id,
    variantLabel: variant.label,
    mixer,
    nameLabel,
  };

  return group;
}

export function placePersonOnFloor(person, worldPoint) {
  const box = new THREE.Box3().setFromObject(person);
  const minY = box.min.y;
  person.position.set(worldPoint.x, -minY + 0.02, worldPoint.z);
  syncPersonNameLabel(person);
}
