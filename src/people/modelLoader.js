import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let templateScene = null;
let loadPromise = null;
let baseHeightM = 1.7;

export function isHumanoidReady() {
  return templateScene !== null;
}

export function getBaseHeightM() {
  return baseHeightM;
}

export async function loadHumanoidTemplate() {
  if (templateScene) return templateScene;
  if (!loadPromise) {
    const loader = new GLTFLoader();
    loadPromise = loader
      .loadAsync(`${import.meta.env.BASE_URL}models/humanoid-lowpoly.glb`)
      .then((gltf) => {
        templateScene = gltf.scene;
        const box = new THREE.Box3().setFromObject(templateScene);
        const size = box.getSize(new THREE.Vector3());
        baseHeightM = size.y > 0.01 ? size.y : 1.7;
        templateScene.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = false;
            obj.receiveShadow = false;
          }
        });
        return templateScene;
      })
      .catch((err) => {
        loadPromise = null;
        throw err;
      });
  }
  return loadPromise;
}
