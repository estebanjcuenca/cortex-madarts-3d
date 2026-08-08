import * as THREE from 'three';
import { createPersonMesh, placePersonOnFloor } from './personFactory.js';
import { isHumanoidReady } from './modelLoader.js';

export function createPeopleManager({
  gPeople,
  getCircleCenter,
  circD,
  getRaycastTargets,
  setRaycastTargets,
  updateOccupancyUI,
}) {
  const people = [];
  let template = null;

  function setTemplate(scene) {
    template = scene;
  }

  function isInsideDisc(worldPoint) {
    const center = getCircleCenter();
    const local = worldPoint.clone().sub(center);
    return local.length() <= circD / 2;
  }

  function registerPerson(group) {
    gPeople.add(group);
    people.push(group);
    setRaycastTargets([...getRaycastTargets(), group]);
    updateOccupancyUI(people.length);
    return group;
  }

  function addPersonAtPoint(worldPoint) {
    if (!isHumanoidReady() || !template) return null;
    if (!isInsideDisc(worldPoint)) return null;

    const person = createPersonMesh(template);
    if (!person) return null;

    placePersonOnFloor(person, worldPoint);
    return registerPerson(person);
  }

  function addRandomPerson() {
    const center = getCircleCenter();
    const r = (circD / 2 - 0.15) * Math.sqrt(Math.random());
    const a = Math.random() * Math.PI * 2;
    const pt = new THREE.Vector3(
      center.x + r * Math.cos(a),
      0,
      center.z + r * Math.sin(a),
    );
    return addPersonAtPoint(pt);
  }

  function removePerson(personGroup) {
    gPeople.remove(personGroup);
    const idx = people.indexOf(personGroup);
    if (idx >= 0) people.splice(idx, 1);
    setRaycastTargets(getRaycastTargets().filter((m) => m !== personGroup));
    updateOccupancyUI(people.length);
  }

  function clearAllPeople() {
    [...people].forEach((p) => removePerson(p));
  }

  function setOccupancy(targetN) {
    clearAllPeople();
    const n = Math.max(0, Math.min(60, targetN | 0));
    for (let i = 0; i < n; i++) addRandomPerson();
  }

  function getPeopleCount() {
    return people.length;
  }

  return {
    setTemplate,
    addPersonAtPoint,
    addRandomPerson,
    removePerson,
    clearAllPeople,
    setOccupancy,
    getPeopleCount,
  };
}
