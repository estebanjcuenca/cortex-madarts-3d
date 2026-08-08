import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { getBaseHeightM, isHumanoidReady } from './modelLoader.js';

const TINTS = [0x2d3540, 0x3a2f45, 0x1f3a3a, 0x402a2a, 0x2a2a40, 0x333333];

function rollAgeBand() {
  const ageRoll = Math.random();
  if (ageRoll < 0.15) return 'child';
  if (ageRoll < 0.25) return 'teen';
  return 'adult';
}

function heightForBand(band) {
  if (band === 'child') return 0.9 + Math.random() * 0.35;
  if (band === 'teen') return 1.35 + Math.random() * 0.25;
  return 1.55 + Math.random() * 0.35;
}

function rollBuildVariant() {
  return Math.random() < 0.5 ? 'broad' : 'narrow';
}

function cloneTemplate(template) {
  return cloneSkinned(template);
}

function applyTint(root, tintHex) {
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    if (Array.isArray(obj.material)) {
      obj.material = obj.material.map((m) => {
        const c = m.clone();
        c.color?.setHex(tintHex);
        return c;
      });
    } else {
      const c = obj.material.clone();
      c.color?.setHex(tintHex);
      obj.material = c;
    }
  });
}

export function createPersonMesh(template) {
  if (!template || !isHumanoidReady()) return null;

  const ageBand = rollAgeBand();
  const buildVariant = rollBuildVariant();
  const heightM = heightForBand(ageBand);
  const baseH = getBaseHeightM();
  const uniform = heightM / baseH;
  const widthScale = buildVariant === 'broad' ? 1.08 : 0.92;

  const group = new THREE.Group();
  const model = cloneTemplate(template);
  model.scale.set(uniform * widthScale, uniform, uniform * widthScale);
  group.add(model);

  const tint = TINTS[Math.floor(Math.random() * TINTS.length)];
  applyTint(group, tint);

  group.userData = {
    kind: 'person',
    info: 'Person — click to remove',
    ageBand,
    buildVariant,
    heightM,
  };

  return group;
}

export function placePersonOnFloor(person, worldPoint) {
  const box = new THREE.Box3().setFromObject(person);
  const minY = box.min.y;
  person.position.set(worldPoint.x, -minY + 0.02, worldPoint.z);
}
