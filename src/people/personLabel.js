import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/** @param {string} name */
export function createPersonNameLabel(name) {
  const el = document.createElement('div');
  el.className = 'person-name-label';
  el.textContent = name;
  const label = new CSS2DObject(el);
  label.center.set(0.5, 1, 0.5);
  label.position.set(0, 1.85, 0);
  return label;
}

/** @param {THREE.Object3D} person */
export function syncPersonNameLabel(person) {
  const label = person.userData.nameLabel;
  if (!label) return;
  const box = new THREE.Box3().setFromObject(person);
  label.position.y = box.max.y - person.position.y + 0.06;
}
