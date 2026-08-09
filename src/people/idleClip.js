import * as THREE from 'three';

/** @param {THREE.Object3D} scene @returns {Map<string, THREE.Object3D>} */
function collectBones(scene) {
  const bones = new Map();
  scene.traverse((obj) => {
    if (obj.isBone && obj.name) bones.set(obj.name, obj);
    if (obj.isSkinnedMesh?.skeleton) {
      for (const bone of obj.skeleton.bones) {
        if (bone.name) bones.set(bone.name, bone);
      }
    }
  });
  return bones;
}

/** @param {string} path @param {Map<string, THREE.Object3D>} bones */
function resolveBoneName(path, bones) {
  const raw = path.split(/[/\\]/).pop() ?? path;
  if (bones.has(raw)) return raw;

  const normalized = raw.replace(/^mixamorig(?=\d|:|[A-Z])/i, 'mixamorig:');
  if (normalized !== raw && bones.has(normalized)) return normalized;

  for (const name of bones.keys()) {
    if (name === raw || name.endsWith(raw)) return name;
  }

  const colon = raw.lastIndexOf(':');
  const suffix = colon >= 0
    ? raw.slice(colon + 1)
    : raw.replace(/^mixamorig\d*/i, '');
  if (!suffix) return null;

  for (const name of bones.keys()) {
    if (name.endsWith(`:${suffix}`) || name.endsWith(suffix)) return name;
  }
  return null;
}

/** @param {THREE.KeyframeTrack} track @param {string} boneName */
function cloneTrackForBone(track, boneName) {
  const prop = track.name.slice(track.name.lastIndexOf('.') + 1);
  const Ctor = track.constructor;
  return new Ctor(`${boneName}.${prop}`, track.times.slice(), track.values.slice());
}

/** @param {THREE.AnimationClip} clip @param {THREE.Object3D} scene */
export function remapIdleClip(clip, scene) {
  const bones = collectBones(scene);
  const tracks = [];
  for (const track of clip.tracks) {
    const dot = track.name.lastIndexOf('.');
    if (dot <= 0) continue;
    const boneName = resolveBoneName(track.name.slice(0, dot), bones);
    if (!boneName) continue;
    tracks.push(cloneTrackForBone(track, boneName));
  }
  if (!tracks.length) return null;
  return new THREE.AnimationClip('Idle', clip.duration, tracks);
}

/** @param {THREE.Object3D} root @param {THREE.AnimationClip} clip */
export function clipMovesSkeleton(root, clip) {
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.play();
  mixer.update(0);
  const boxA = new THREE.Box3().setFromObject(root);
  mixer.update(Math.min(1.2, clip.duration * 0.2));
  const boxB = new THREE.Box3().setFromObject(root);
  mixer.stopAllAction();
  return (
    Math.abs(boxA.min.y - boxB.min.y) > 0.01
    || Math.abs(boxA.getSize(new THREE.Vector3()).y - boxB.getSize(new THREE.Vector3()).y) > 0.01
  );
}
