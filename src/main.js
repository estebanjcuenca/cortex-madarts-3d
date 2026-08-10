import * as THREE from 'three';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import './style.css';
import { createPickRegistry, CHANNEL } from './core/pickRegistry.js';
import { emit, on, EVENTS } from './core/eventBus.js';
import { loadHumanoidTemplates } from './people/modelLoader.js';
import { createPeopleManager } from './people/peopleManager.js';
import { computeMazeRoute, validateRoute } from './maze/route.js';
import {
  buildPassageGraph, listUsableDoorsDeg,
} from './maze/flowRoutes.js';
import { getVisualSettings, setVisualSettings, onVisualSettingsChange, heatmapOpacityForRing } from './settings/visualSettings.js';
import { initLayersPanel } from './ui/layersPanel.js';
import { initHeatmapControls } from './ui/heatmapControls.js';
import { initLightingControls } from './ui/lightingControls.js';
import { createLightingRig } from './lighting/lightingRig.js';
import { BEAM_COLOR_HEX, centralBeamPlanFootprint } from './lighting/centralLight.js';
import {
  FLOORPLAN_SVG, ROOM_M, CENTER_M, PLAN_RINGS, DOOR_M, BOX_X_M, SPRINKLER_Z_M,
  SCREEN, TECHNICAL, computeProjectionStudy, screenArcs,
} from './floorplan.js';
import { createScreenMedia } from './space/screenMedia.js';
import { initScreenMediaControls } from './ui/screenMediaControls.js';
import { createLineView } from './render/lineView.js';
import { startAutosave, restore as restoreAutosave } from './project/autosave.js';
import { saveDefaultMedia, loadDefaultMedia, clearDefaultMedia } from './project/mediaStore.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

  const wrap = document.getElementById('canvas-wrap');
  const W = () => window.innerWidth, H = () => window.innerHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d10);
  scene.fog = new THREE.Fog(0x0b0d10, 18, 48);
  const camera = new THREE.PerspectiveCamera(45, W()/H(), 0.1, 200);
  const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(W(), H());
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  wrap.appendChild(renderer.domElement);

  // Post-processing: bloom gives the central light its halo. The composer renders into
  // the same visible canvas (preserveDrawingBuffer), so video capture and Save-image keep
  // reading renderer.domElement unchanged (Constitution II).
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(W(), H()), 0.55, 0.35, 0.25);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(W(), H());
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.inset = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  wrap.appendChild(labelRenderer.domElement);

  // The lights themselves are fixture records owned by the lighting rig (created once the
  // layer groups exist, below). These stay as the 100% reference for the fill sliders.
  const BASE_AMBIENT = 0.55, BASE_KEY = 0.5, BASE_RIM = 0.25;

  // Room geometry from public/floorplan2.svg (src/floorplan.js): rectangle at labeled scale.
  // CIRC_D matches the screen outer Ø — central floor disc under the screen, not a curtain.
  const DEPTH = ROOM_M.depth, W_NEAR = ROOM_M.width, W_FAR = ROOM_M.width, WALL_H = 3.2, CIRC_D = SCREEN.outerDiameter, CURTAIN_H = 3.0;
  // Ø1.541m is NOT a curtain ring — flat marker inside the central floor. Curtains start at
  // confirmed Ø6.533m (ring 1). The Ø4.8 circle is the projection SCREEN (see SCREEN export).
  const CURTAIN_R0 = 3.267;               // ring 1 radius, Ø6.533m — confirmed
  const CONFIRMED_RADII = [3.267];
  const DEFAULT_GROWTH = 1.229;           // preserved from the original two-point fit; now a
                                           // judgment call rather than a fit, since we only have
                                           // one confirmed curtain-ring measurement to anchor on
  const CENTER_MARKER_D = 1.541;          // unidentified ring inside the floor — decorative only
  const MAX_PEOPLE_FOR_FULL_LIGHT = 20;

  let growthFactor = DEFAULT_GROWTH;
  let gapWidthM = 2.0; // drawn door gaps measure ≈1.5–2.7 m in the floorplan
  let openingSpacingDeg = 40;
  let clipToRoom = false;
  let circulationMode = 'flow';
  let cachedPassageGraph = null;
  let lastFlowCfgSig = '';
  let flowRouteIndex = 0;

  function genRadii(n, g){
    const arr = [];
    for(let i=0;i<n;i++) arr.push(+(CURTAIN_R0 * Math.pow(g,i)).toFixed(3));
    return arr;
  }
  function gapAngleDeg(r){
    const x = Math.min(0.98, (gapWidthM/2)/r);
    return 2*Math.asin(x)*180/Math.PI;
  }
  function deg2rad(d){ return d*Math.PI/180; }
  // winding step for generating new ring angles: 180° + a drift so consecutive rings never
  // realign to the same angle (a plain ±160° alternation collapses into a 2-cycle and re-aligns
  // every other ring, which defeats the maze — this drift avoids that)
  function nextWindingAngle(prevDeg){ return ((prevDeg + 205) % 360 + 360) % 360; }

  // ---- ring model ----
  // Every ring is fabric spanning its trim window(s), minus a door gap at each entry in
  // its explicit door-angle list. Radii + default door angles come from the architect's
  // floorplan (src/floorplan.js); everything is editable per ring in the UI.
  const norm360 = (a)=>((a % 360) + 360) % 360;
  let RING_RADII = PLAN_RINGS.map(p=>p.r);
  let ringDoors = PLAN_RINGS.map(p=>p.doors.map(norm360)); // per-ring entrance angles (deg)
  let baseAngles = ringDoors.map(d=>Math.round(d[0] ?? 90)); // first door — drives the row slider
  let ringVisible = baseAngles.map(()=>true);
  let ringDoorCount = ringDoors.map(d=>Math.max(1, d.length));
  let ringTrims = baseAngles.map(()=>null);    // null = auto (arcs inside room); else {start,end} degrees CCW
  let OPENINGS = ringDoors.map(d=>[...d]);

  function regenerateAllOpenings(){
    OPENINGS = ringDoors.map(d=>d.map(a=>norm360(Math.round(a))));
  }
  regenerateAllOpenings();

  // Re-aim a ring at angleDeg: the whole door set rotates rigidly (relative spacing kept).
  function rotateRingTo(i, angleDeg){
    const target = norm360(Math.round(angleDeg));
    const delta = target - (ringDoors[i][0] ?? 0);
    ringDoors[i] = ringDoors[i].map(a=>norm360(a + delta));
    baseAngles[i] = target;
  }
  // Resize a ring's door list, preserving existing angles; new doors continue from the
  // last one at the global spacing.
  function setRingDoorCount(i, count){
    const c = Math.min(8, Math.max(1, count));
    const d = ringDoors[i];
    while(d.length > c) d.pop();
    while(d.length < c) d.push(norm360((d[d.length-1] ?? baseAngles[i]) + openingSpacingDeg));
    ringDoorCount[i] = c;
  }

  function computeFabricArcs(openingsDeg, gapDeg){
    let events = openingsDeg.map(a=>({start:((a-gapDeg/2)%360+360)%360, end:((a+gapDeg/2)%360+360)%360}));
    events = events.filter(e=>e.end!==e.start);
    if(!events.length) return [[0, Math.PI*2]];
    const norm = [];
    events.forEach(e=>{
      if(e.end < e.start){ norm.push({start:e.start,end:360}); norm.push({start:0,end:e.end}); }
      else norm.push(e);
    });
    norm.sort((a,b)=>a.start-b.start);
    const merged = [];
    norm.forEach(e=>{
      if(merged.length && e.start <= merged[merged.length-1].end + 0.01){
        merged[merged.length-1].end = Math.max(merged[merged.length-1].end, e.end);
      } else merged.push({...e});
    });
    if(merged.length>1 && merged[0].start<0.01 && merged[merged.length-1].end>359.9){
      merged[0].start = merged[merged.length-1].start - 360;
      merged.pop();
    }
    const arcs = [];
    for(let i=0;i<merged.length;i++){
      const curEnd = merged[i].end;
      const nextStart = merged[(i+1)%merged.length].start + (i===merged.length-1?360:0);
      if(nextStart>curEnd+0.01) arcs.push([deg2rad(curEnd), deg2rad(nextStart-curEnd)]);
    }
    return arcs;
  }

  // Auto-trim: ALL contiguous arcs of this radius that lie inside the room (a ring that
  // crosses a side wall has fabric on BOTH remaining sides, not just the longest one).
  function autoTrimWindowsForRadius(r){
    const STEP = 2;
    const n = 360/STEP;
    const inside = [];
    // 0.5m wall clearance: a hung curtain would not touch the wall, and it guarantees the
    // walkway (which needs ~0.3m) always fits between the fabric edge and the wall.
    for(let k=0;k<n;k++){
      const rad = deg2rad(k*STEP);
      inside.push(isInsideRoomXZ(circleCenter.x + r*Math.cos(rad), circleCenter.z + r*Math.sin(rad), 0.5));
    }
    if(inside.every(Boolean)) return [{start:0, end:360}];
    if(!inside.some(Boolean)) return [];
    const anchor = inside.findIndex(v=>!v);
    const windows = [];
    let runStart = -1;
    for(let k=1;k<=n;k++){
      const idx=(anchor+k)%n;
      if(inside[idx]){
        if(runStart<0) runStart = idx;
      } else if(runStart>=0){
        const len = ((idx - runStart) % n + n) % n;
        windows.push({start:runStart*STEP, end:(runStart+len)*STEP});
        runStart = -1;
      }
    }
    if(runStart>=0){
      const len = ((anchor + n - runStart) % n + n) % n;
      windows.push({start:runStart*STEP, end:(runStart+len)*STEP});
    }
    // drop slivers too small to hang fabric in
    return windows.filter(w=>w.end - w.start >= 6);
  }
  // Trim windows for ring i: manual single window if set, else all inside-room arcs.
  function trimForRing(i){
    if(ringTrims[i]) return [ringTrims[i]];
    return autoTrimWindowsForRadius(RING_RADII[i]);
  }
  // Intersect fabric arcs with a LIST of trim windows (union of the per-window results).
  function trimArcsToWindows(arcs, windows){
    if(!windows.length) return [];
    if(windows.length === 1) return trimArcsToWindow(arcs, windows[0]);
    return windows.flatMap(w=>trimArcsToWindow(arcs, w));
  }
  // Intersect fabric arcs (radians, [start, length]) with a trim window (degrees, CCW,
  // may wrap through 0°). Fabric outside the window is not built at all.
  function trimArcsToWindow(arcs, win){
    let span = ((win.end - win.start) % 360 + 360) % 360;
    if(span === 0) span = (win.end !== win.start || win.end >= 360) ? 360 : 0;
    if(span >= 360) return arcs;
    if(span <= 0) return [];
    const ws = ((win.start) % 360 + 360) % 360;
    const out = [];
    arcs.forEach(([sRad, lenRad])=>{
      const s = sRad*180/Math.PI, len = lenRad*180/Math.PI;
      for(const k of [-360, 0, 360]){
        const lo = Math.max(s+k, ws), hi = Math.min(s+k+len, ws+span);
        if(hi - lo > 0.01) out.push([deg2rad(lo), deg2rad(hi-lo)]);
      }
    });
    return out;
  }

  // Ring-field center, entrance, and service box all come straight from the drawing.
  // Final fabric arcs (radians, [start, length]) for ring i — the single source of truth
  // shared by the 3D build, the route generator/validator, and the floorplan overlay.
  function ringFabricArcs(i){
    const r = RING_RADII[i];
    return trimArcsToWindows(computeFabricArcs(OPENINGS[i] || [0], gapAngleDeg(r)), trimForRing(i));
  }

  let circleCenter = new THREE.Vector3(CENTER_M.x, 0, CENTER_M.z);
  let doorPos = {x:DOOR_M.x, z:DOOR_M.z};

  /**
   * The background light box is freely placed: position, orientation and size are all
   * editable, because where it stands and which way it faces is the whole point of it.
   * Yaw 0° faces +z (down the room, away from the booth wall); the default sits it on the
   * far wall facing back toward the central space.
   */
  const BOX_WALL_STANDOFF_M = 1.4;   // distance from the wall it stands against
  const BOX_FACE_GAP_M = 0.02;       // the emitter sits just clear of the lit face, not inside it
  const boxDefaults = {
    x: BOX_X_M, y: 1.2, z: ROOM_M.depth - BOX_WALL_STANDOFF_M,
    yaw: 180, pitch: 0, roll: 0,
    width: 0.6, height: 2.4, depth: 0.35,
    // What the box throws into the room, straight out of its lit face.
    intensity: 3, spread: 60, softness: 0.85, reach: 14, falloff: 2,
  };
  let box = { ...boxDefaults };

  // The autosave record is read once, here, because the placement it holds has to seed the
  // first build rather than move things afterwards — the background light box carries a
  // real light, so restoring it late would rebuild the rig for nothing. Mood, fixtures and
  // screen media restore later, in restoreWorkingState().
  const savedState = restoreAutosave()?.state ?? null;
  if(savedState?.placement){
    const p = savedState.placement;
    if(p.center) circleCenter.set(p.center.x, 0, p.center.z);
    // Merged rather than replaced: records written before the box gained orientation and
    // size carry only x and y, and those should keep their saved position.
    if(p.box) box = { ...box, ...p.box };
    if(p.door) doorPos = {x:p.door.x, z:p.door.z};
  }

  const nearHalf = W_NEAR/2, farHalf = W_FAR/2;
  const corners = [
    new THREE.Vector2(-nearHalf, 0), new THREE.Vector2(nearHalf, 0),
    new THREE.Vector2(farHalf, DEPTH), new THREE.Vector2(-farHalf, DEPTH),
  ];
  function halfWidthAtZ(z){
    const t = Math.min(Math.max(z/DEPTH,0),1);
    return nearHalf + (farHalf-nearHalf)*t;
  }
  function computeClipPlanes(){
    const planes = [];
    for(let i=0;i<corners.length;i++){
      const a=corners[i], b=corners[(i+1)%corners.length];
      const edge = new THREE.Vector2(b.x-a.x, b.y-a.y).normalize();
      const inward = new THREE.Vector2(-edge.y, edge.x);
      const normal3 = new THREE.Vector3(inward.x, 0, inward.y);
      const p = new THREE.Vector3(a.x, 0, a.y);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal3, p);
      const centroid = new THREE.Vector3(0, 0, DEPTH/2);
      if(plane.distanceToPoint(centroid) < 0) plane.negate();
      planes.push(plane);
    }
    return planes;
  }
  const CLIP_PLANES = computeClipPlanes();
  function applyClipping(){
    renderer.clippingPlanes = clipToRoom ? CLIP_PLANES : [];
  }
  function isInsideRoomXZ(x, z, marginM){
    const m = marginM || 0.3; // keep a little clearance off the actual wall
    const pt = new THREE.Vector3(x, 0, z);
    return CLIP_PLANES.every(pl => pl.distanceToPoint(pt) >= m);
  }
  function clampPointToRoom(x, z){
    let px=x, pz=z;
    for(let i=0;i<30;i++){
      if(isInsideRoomXZ(px, pz)) return {x:px, z:pz};
      px = circleCenter.x + (px-circleCenter.x)*0.85;
      pz = circleCenter.z + (pz-circleCenter.z)*0.85;
    }
    return {x:px, z:pz};
  }

  const gRoom=new THREE.Group(), gFloorCentral=new THREE.Group(), gCurtain=new THREE.Group(),
        gCirculation=new THREE.Group(), gScreen=new THREE.Group(), gRig=new THREE.Group(),
        gBox=new THREE.Group(), gFixtures=new THREE.Group(), gTechnical=new THREE.Group(),
        gGrid=new THREE.Group(), gPeople=new THREE.Group(), gCeilingLights=new THREE.Group();
  scene.add(gRoom,gFloorCentral,gCurtain,gCirculation,gScreen,gRig,gBox,gFixtures,gTechnical,gGrid,gPeople,gCeilingLights);
  gTechnical.visible = false;

  // Every light in the scene is a fixture record from here on. Each one is parented into the
  // layer group it belongs to, so layer visibility toggles keep working untouched.
  const FIXTURE_PARENTS = {
    central: gRig,
    screenSpill: gScreen,
    boxSpill: gBox,
  };
  const lighting = createLightingRig({
    parent: scene,
    wallHeight: WALL_H,
    bloomPass,
    parentFor: (f) => FIXTURE_PARENTS[f.id] ?? (f.type === 'point' ? gCeilingLights : scene),
  });
  lighting.add({ id:'ambient', name:'Room ambient', type:'ambient', origin:'installation' });
  lighting.add({ id:'key', name:'Key light', type:'directional', origin:'installation',
    position:{x:10, y:18, z:8} });
  lighting.add({ id:'rim', name:'Rim light', type:'directional', origin:'installation',
    color:'#4fb3ff', intensity:BASE_RIM, position:{x:-10, y:6, z:-10} });

  const floorShape = new THREE.Shape(corners);
  const floorGeo = new THREE.ShapeGeometry(floorShape); floorGeo.rotateX(-Math.PI/2);
  const roomFloorMesh = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({color:0x1a1e24, roughness:0.9, metalness:0.05}));
  roomFloorMesh.receiveShadow = true;
  gRoom.add(roomFloorMesh);
  const wallMat = new THREE.MeshStandardMaterial({color:0x3a4048, roughness:0.85, metalness:0.05, transparent:true, opacity:0.30, side:THREE.DoubleSide});
  for(let i=0;i<corners.length;i++){
    const a=corners[i], b=corners[(i+1)%corners.length], len=a.distanceTo(b);
    const wallMesh = new THREE.Mesh(new THREE.PlaneGeometry(len, WALL_H), wallMat);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    wallMesh.position.set(mid.x, WALL_H/2, mid.y);
    wallMesh.rotation.y = -Math.atan2(b.y-a.y, b.x-a.x);
    gRoom.add(wallMesh);
    gRoom.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x,0.01,a.y),new THREE.Vector3(b.x,0.01,b.y)]), new THREE.LineBasicMaterial({color:0x555b64})));
    gRoom.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a.x,WALL_H,a.y),new THREE.Vector3(b.x,WALL_H,b.y)]), new THREE.LineBasicMaterial({color:0x2a2f37})));
  }

  // Clickable-object lifecycle lives in src/core/pickRegistry.js. Builders call
  // picks.unregisterGroup(kind) before rebuilding and picks.register(mesh) after, instead
  // of filtering and pushing a shared array.
  const picks = createPickRegistry();

  // invisible ceiling plane, purely for click-to-place ceiling lights
  const ceilingGeo = new THREE.PlaneGeometry(60, 60);
  ceilingGeo.rotateX(Math.PI/2);
  // side:DoubleSide is essential here — after this rotation the plane's front face normal
  // points away from a camera looking down into the room from above (the normal case), and
  // raycasting against a FrontSide-only material silently ignores back-face hits. Without
  // this, clicks would never register on the ceiling regardless of placement mode logic.
  const ceilingMesh = new THREE.Mesh(ceilingGeo, new THREE.MeshBasicMaterial({visible:false, side:THREE.DoubleSide}));
  ceilingMesh.position.set(0, WALL_H-0.05, DEPTH/2);
  ceilingMesh.userData = {kind:'ceiling', info:'Click to add a ceiling light'};
  gRoom.add(ceilingMesh);
  // kept OUT of the main pick channel deliberately: the camera usually sits above WALL_H,
  // so a full-room ceiling plane would intercept nearly every click before it ever reaches
  // the floor, rings, or people below. It's only tested in ceiling placement mode.
  picks.register(ceilingMesh, { channel: CHANNEL.CEILING });

  // Ceiling lights are `point` fixtures: the rig builds the housing, the downward glow cone
  // (so placing one is visibly obvious, not just an invisible light), and the light itself.
  let ceilingLightCount = 0;
  /**
   * @param {{x,y,z}} position
   * @param {object} [saved] a fixture record from autosave; its id and settings are reused
   *   so a restored scene is the same scene, not a fresh light in the same spot.
   */
  function placeCeilingLight(position, saved){
    ceilingLightCount++;
    // Keep the counter ahead of restored ids so a new light cannot collide with one.
    const savedIndex = Number.parseInt(String(saved?.id ?? '').replace(/^ceiling-/, ''), 10);
    if(Number.isFinite(savedIndex)) ceilingLightCount = Math.max(ceilingLightCount, savedIndex);

    const id = saved?.id && !lighting.get(saved.id) ? saved.id : `ceiling-${ceilingLightCount}`;
    const { fixture } = lighting.add({
      id,
      name: saved?.name ?? `Ceiling fixture ${ceilingLightCount}`,
      type: 'point',
      position,
      ...(saved ? {
        color: saved.color, intensity: saved.intensity, params: saved.params,
        enabled: saved.enabled, castShadow: saved.castShadow,
      } : {}),
    });
    const { body } = lighting.objectsFor(fixture.id);
    body.userData = {kind:'ceilingLight', fixtureId:fixture.id, info:'Ceiling light — click to remove'};
    picks.register(body, { channel: CHANNEL.CEILING });
    return fixture;
  }
  function addCeilingLight(worldPoint){
    placeCeilingLight({ x: worldPoint.x, y: WALL_H-0.1, z: worldPoint.z });
  }
  function removeCeilingLight(bodyMesh){
    const id = bodyMesh.userData?.fixtureId;
    if(!id || !lighting.remove(id).ok) return;
    picks.unregister(bodyMesh, CHANNEL.CEILING);
  }

  let selected = null;
  const tooltip = document.getElementById('tooltip');
  const selTitle = document.getElementById('selTitle');
  const selPanel = document.getElementById('selpanel');

  function clearSelection(){
    if(selected && selected.mesh && selected.mesh.material){
      if(selected.origColor!==undefined) selected.mesh.material.color.setHex(selected.origColor);
      if(selected.origEmissive!==undefined && selected.mesh.material.emissive) selected.mesh.material.emissive.setHex(selected.origEmissive);
    }
    document.querySelectorAll('.ringrow.flash').forEach(el=>el.classList.remove('flash'));
    selected = null;
    selTitle.textContent = 'Selected: none';
    selPanel.innerHTML = '';
    emit(EVENTS.SELECTION_CHANGED, null);
  }
  function selectObject(hitMesh){
    clearSelection();
    const ud = hitMesh.userData;
    selected = {mesh:hitMesh, kind:ud.kind, index:ud.index};
    emit(EVENTS.SELECTION_CHANGED, {kind:ud.kind, index:ud.index, object:hitMesh});
    if(hitMesh.material){
      selected.origColor = hitMesh.material.color.getHex();
      hitMesh.material.color.setHex(0xffd23f);
      if(hitMesh.material.emissive){ selected.origEmissive = hitMesh.material.emissive.getHex(); hitMesh.material.emissive.setHex(0x4a3a00); }
    }
    if(ud.kind==='ring'){
      selTitle.textContent = `Selected: Ring ${ud.index+1}`;
      const row = document.getElementById('ringrow-'+ud.index);
      if(row){
        const section = row.closest('details'); if(section) section.open = true;
        row.scrollIntoView({block:'nearest'}); row.classList.add('flash');
      }
      selPanel.innerHTML = `<div class="numrow"><span>Ø${(RING_RADII[ud.index]*2).toFixed(3)}m</span><span>${CONFIRMED_RADII.some(r=>Math.abs(r-RING_RADII[ud.index])<0.01)?'confirmed':'interpolated'}</span></div>`;
    } else if(ud.kind==='rig'){
      selTitle.textContent = 'Selected: Sensor / central light';
      selPanel.innerHTML = '<div class="numrow"><span>Use Central space position sliders below</span></div>';
    } else if(ud.kind==='box'){
      selTitle.textContent = 'Selected: Background light box';
      selPanel.innerHTML = '<div class="numrow"><span>Use Background light box fields below</span></div>';
    } else if(ud.kind==='screenCurtain'){
      selTitle.textContent = 'Selected: Screen-circle curtain';
      const study = computeProjectionStudy(SCREEN);
      selPanel.innerHTML =
        `<div class="numrow"><span>Sweep</span><span>${study.curtainSweepDeg.toFixed(1)}°</span></div>`+
        `<div class="numrow"><span>Length</span><span>${study.curtainArcLength.toFixed(2)} m</span></div>`+
        `<div class="numrow"><span>Height</span><span>${SCREEN.height.toFixed(2)} m</span></div>`+
        `<div class="numrow"><span>Area</span><span>${(study.curtainArcLength*SCREEN.height).toFixed(1)} m²</span></div>`+
        `<div style="font-size:10px;line-height:1.4;color:var(--dim);margin-top:4px">Fabric closing the screen circle — not projection surface, so no projector covers it. Responds to the fabric brightness and wash sliders.</div>`;
    } else if(ud.kind==='screen'){
      selTitle.textContent = 'Selected: Projection screen';
      const study = computeProjectionStudy(SCREEN);
      const arcsHtml = screenArcs(SCREEN).map((a)=>
        `<div class="numrow"><span>Screen arc</span><span>${Math.abs(a.sweepDeg).toFixed(0)}° · ${(study.faceRadius*Math.abs(a.sweepDeg)*Math.PI/180).toFixed(2)} m</span></div>`
      ).join('');
      selPanel.innerHTML =
        `<div class="numrow"><span>Outer Ø</span><span>${SCREEN.outerDiameter.toFixed(3)} m</span></div>`+
        `<div class="numrow"><span>Face Ø</span><span>${SCREEN.faceDiameter.toFixed(3)} m</span></div>`+
        `<div class="numrow"><span>Height</span><span>${SCREEN.height.toFixed(2)} m</span></div>`+
        arcsHtml+
        `<div class="numrow"><span>Curtain arc</span><span>${study.curtainSweepDeg.toFixed(0)}° · ${study.curtainArcLength.toFixed(2)} m</span></div>`+
        `<div class="numrow"><span>Main area</span><span>${study.mainArea.toFixed(1)} m²</span></div>`+
        `<div class="numrow"><span>Chord / sagitta</span><span>${study.chord.toFixed(2)} / ${study.sagitta.toFixed(2)} m</span></div>`+
        `<div class="numrow"><span>Projectors</span><span>${study.recommendedCount} (max ~${study.maxSingleCoverageDeg}° each)</span></div>`+
        `<div style="font-size:10px;line-height:1.4;color:var(--dim);margin-top:4px">${study.verdict}</div>`;
    } else if(ud.kind==='technical'){
      selTitle.textContent = `Selected: ${ud.label || 'Technical'}`;
      selPanel.innerHTML = `<div class="numrow"><span>${ud.info || ''}</span></div>`;
    }
  }

  function buildFloorCentral(){
    gFloorCentral.clear();
    picks.unregisterGroup('floor');
    const circGeo = new THREE.CircleGeometry(CIRC_D/2, 64); circGeo.rotateX(-Math.PI/2);
    const circMat = new THREE.MeshStandardMaterial({color:0xc0392b, roughness:0.6, metalness:0.1, transparent:true, opacity:0.5});
    const circMesh = new THREE.Mesh(circGeo, circMat);
    circMesh.receiveShadow = true;
    circMesh.userData = {kind:'floor', index:0, info:'Central floor (Ø4.8m) — click to add a person'};
    gFloorCentral.add(circMesh);
    picks.register(circMesh);
    const circOutline = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(CIRC_D/2,64)), new THREE.LineBasicMaterial({color:0xff6b5b}));
    circOutline.rotation.x = -Math.PI/2; circOutline.position.y = 0.03;
    // Lifted 3cm so it doesn't z-fight the disc. The line view outlines the disc itself at
    // y=0, so keeping this one would print the same circle twice, 3cm apart.
    circOutline.userData.lineViewSymbol = { kind: 'omit' };
    gFloorCentral.add(circOutline);

    // Ø1.541m unidentified marker — flat outline only (not a wall), so it never blocks clicks
    const markerOutline = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(CENTER_MARKER_D/2,48)), new THREE.LineDashedMaterial({color:0xd9a441, dashSize:0.06, gapSize:0.05}));
    markerOutline.computeLineDistances();
    markerOutline.rotation.x = -Math.PI/2; markerOutline.position.y = 0.035;
    gFloorCentral.add(markerOutline);

    gFloorCentral.position.set(circleCenter.x, 0, circleCenter.z);
  }

  // Snapshot of what buildRings last produced, consumed by the live vector floorplan
  // (X key) so the technical drawing always mirrors the 3D state. fpOverlay is assigned
  // when the panel initializes (see the panel section further down) — declared here so
  // the first buildRings() call, which runs earlier, doesn't hit a TDZ error.
  let builtRingArcs = [];
  let fpOverlay = null;

  function buildRings(){
    gCurtain.clear();
    picks.unregisterGroup('ring');
    builtRingArcs = [];

    RING_RADII.forEach((r, i)=>{
      const isConfirmed = CONFIRMED_RADII.some(cr=>Math.abs(cr-r)<0.01);
      const clearance = Math.min(circleCenter.x + halfWidthAtZ(circleCenter.z), halfWidthAtZ(circleCenter.z) - circleCenter.x);
      const exceeds = r > clearance;
      const h = Math.max(1.0, CURTAIN_H - Math.min(i,10)*0.06);
      // All curtains render identically white with the same weight — status (confirmed /
      // interpolated / exceeds-room) is still reported in the info text, just not by color.
      const col = 0xffffff;
      const op = 0.22;
      const gapDeg = gapAngleDeg(r);
      const openingsDeg = OPENINGS[i] || [0];
      const ringGroup = new THREE.Group();
      ringGroup.visible = ringVisible[i] !== false;

      // Fabric = trim window(s) minus a door gap at each entrance angle.
      const arcs = ringFabricArcs(i);
      const gapRanges = openingsDeg.map(c=>({start:c - gapDeg/2, end:c + gapDeg/2}));
      builtRingArcs[i] = { r, arcs, gaps: gapRanges };
      arcs.forEach(([aStart, aLen])=>{
        const arcDeg = aLen*180/Math.PI;
        // Tessellation scales with arc length (≈1 segment / 2°) and the edge lines reuse
        // the EXACT same angular sweep, so borders hug the fabric instead of cutting chords.
        const seg = Math.max(12, Math.ceil(arcDeg/2));
        // ALIGNMENT-CRITICAL: CylinderGeometry measures theta from +Z sweeping clockwise
        // in plan (x = r·sinθ, z = r·cosθ), while every other consumer of these arcs
        // (edge lines, maze route, floorplan overlay) uses world angles from +X
        // (x = r·cosα, z = r·sinα). World angle α maps to cylinder theta θ = π/2 − α,
        // which reverses direction, so a world arc [aStart, aStart+aLen] becomes the
        // cylinder sweep [π/2 − (aStart+aLen), length aLen].
        const cylStart = Math.PI/2 - (aStart + aLen);
        const geo = new THREE.CylinderGeometry(r, r, h, seg, 1, true, cylStart, aLen);
        const mat = new THREE.MeshStandardMaterial({color:col, roughness:0.7, transparent:true, opacity:op, side:THREE.DoubleSide});
        mat.userData.fabric = true;
        mat.userData.baseOpacity = op;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        mesh.position.set(0, h/2, 0);
        mesh.userData = {kind:'ring', index:i, info:`Ring ${i+1}: Ø${(r*2).toFixed(3)}m`+(isConfirmed?'  [confirmed]':'  [interpolated]')+(exceeds?'  [trimmed to walls]':'')+`  — ${openingsDeg.length} entrance(s)`};
        ringGroup.add(mesh);
        if(ringGroup.visible) picks.register(mesh);

        // Thin edge lines only — no gate-post tubes, no dashed door markers in 3D
        // (door openings read as the physical gaps in the fabric; the technical-drawing
        // panel still marks them explicitly).
        [0.02, h].forEach(y=>{
          const pts=[];
          for(let s=0;s<=seg;s++){ const a=aStart+aLen*(s/seg); pts.push(new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a))); }
          ringGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color:col, transparent:true, opacity:isConfirmed?0.9:0.5})));
        });
      });
      gCurtain.add(ringGroup);
    });

    gCurtain.position.set(circleCenter.x, 0, circleCenter.z);
    document.getElementById('ringCount').textContent = RING_RADII.length;
    applyFabricLighting();
    // These three are the historical rebuild cascade. They stay direct calls for now; the
    // event is emitted alongside so new components can subscribe without being wired into
    // this function. Task T021 inverts the relationship and removes the direct calls.
    buildScreen();
    buildCirculation();
    updateFloorplanOverlay();
    emit(EVENTS.RINGS_REBUILT, { count: RING_RADII.length });
  }

  // What the projection surface shows — generated deep-space still, or a streamed video.
  // Swapping the texture only re-maps the existing meshes; no scene rebuild.
  let autosave = null;        // assigned once the scene is built; see restoreWorkingState()
  let restoringMedia = false; // suppresses re-saving media we are in the middle of loading
  let screenSurfaces = [];
  const screenMedia = createScreenMedia({
    onChange: (tex) => {
      screenSurfaces.forEach((m) => { m.material.map = tex; m.material.needsUpdate = true; });
      // Also covers changes that keep the same source, the mirror toggle being the one
      // that matters — it alters the texture but never fires onSourceChange.
      autosave?.schedule();
    },
    onSourceChange: (src) => {
      // A loaded file becomes the default: the blob goes to IndexedDB, the descriptor to
      // the autosave record. A URL needs no blob; clearing removes both. Skipped while
      // restoring, which would only rewrite the blob we just read back.
      if(restoringMedia) return;
      if(src.kind === 'file') saveDefaultMedia(src.file);
      else clearDefaultMedia();
      autosave?.schedule();
    },
  });

  function buildScreen(){
    gScreen.clear();
    picks.unregisterGroup('screen');
    const study = computeProjectionStudy(SCREEN);
    const scx = SCREEN.center.x, scz = SCREEN.center.z;
    const rFace = SCREEN.faceDiameter / 2;
    const rOuter = SCREEN.outerDiameter / 2;
    const h = SCREEN.height;
    screenSurfaces = [];

    // Arcs at the fitted screen center (not parented to any curtain ring). Only the large
    // arc is projection surface; the small one closing the circle is fabric, so it gets the
    // same material as the curtain rings and is excluded from the projection study.
    // CylinderGeometry theta from +Z CW ↔ world α from +X: θ_start = π/2 − (α+len).
    SCREEN.arcs.forEach((arc, i)=>{
      const isCurtain = arc.role === 'curtain';
      const aStart = deg2rad(arc.startDeg);
      const aLen = deg2rad(Math.abs(arc.sweepDeg));
      const arcDeg = Math.abs(arc.sweepDeg);
      const seg = Math.max(16, Math.ceil(arcDeg / 2));
      const cylStart = Math.PI/2 - (aStart + aLen);
      const geo = new THREE.CylinderGeometry(rFace, rFace, h, seg, 1, true, cylStart, aLen);

      let mat;
      if(isCurtain){
        mat = new THREE.MeshStandardMaterial({color:0xffffff, roughness:0.7, transparent:true, opacity:0.22, side:THREE.DoubleSide});
        mat.userData.fabric = true;      // picked up by the fabric brightness / wash sliders
        mat.userData.baseOpacity = 0.22;
      } else {
        // u runs 0→1 across thetaLength, so the texture wraps the arc with no UV work.
        mat = new THREE.MeshBasicMaterial({map:screenMedia.getTexture(), transparent:true, opacity:0.95, side:THREE.DoubleSide});
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(scx, h/2, scz);
      if(isCurtain) mesh.receiveShadow = true;
      else screenSurfaces.push(mesh);
      mesh.userData = isCurtain
        ? { kind:'screenCurtain', index:i,
            info:`Curtain on the screen circle: ${arcDeg.toFixed(0)}° · ${(study.faceRadius*aLen).toFixed(2)} m long · ${h.toFixed(2)} m high — fabric, carries no image` }
        : { kind:'screen', index:i,
            info:`Projection screen arc: ${arcDeg.toFixed(0)}° · face Ø${SCREEN.faceDiameter} m · ${study.recommendedCount} projectors recommended` };
      gScreen.add(mesh);
      picks.register(mesh);

      // Gold trim reads as screen; the curtain arc gets the same white edge lines as the rings.
      const edgeColor = isCurtain ? 0xffffff : 0xd4af37;
      const edgeOpacity = isCurtain ? 0.6 : 0.75;
      [0.02, h].forEach(y=>{
        const pts=[];
        for(let s=0;s<=seg;s++){
          const a=aStart+aLen*(s/seg);
          pts.push(new THREE.Vector3(scx + rOuter*Math.cos(a), y, scz + rOuter*Math.sin(a)));
        }
        gScreen.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color:edgeColor, transparent:true, opacity:edgeOpacity})));
      });
    });

    const main = screenArcs(SCREEN).reduce((a,b)=>Math.abs(b.sweepDeg)>Math.abs(a.sweepDeg)?b:a);
    const mainMid = deg2rad(main.startDeg + Math.abs(main.sweepDeg)/2);
    const spillPos = {
      x: scx + (rFace-0.5)*Math.cos(mainMid),
      y: h*0.55,
      z: scz + (rFace-0.5)*Math.sin(mainMid),
    };
    // gScreen was cleared above, so the wash has to be rebuilt rather than merely moved.
    if(lighting.get('screenSpill')) lighting.rebuild('screenSpill', { position: spillPos });
    else lighting.add({ id:'screenSpill', name:'Screen wash', type:'wash', origin:'installation',
      position: spillPos });

    // Two projectors covering the main arc with an edge-blend overlap (research.md R4).
    const blend = deg2rad(study.blendOverlapDeg);
    const sweep = deg2rad(Math.abs(main.sweepDeg));
    const halfEach = (sweep + blend) / 2;
    const projAngles = [
      deg2rad(main.startDeg) + halfEach*0.45,
      deg2rad(main.startDeg) + sweep - halfEach*0.45,
    ];
    projAngles.forEach((aAim, pi)=>{
      const projPos = new THREE.Vector3(
        scx + (rFace - 1.85)*Math.cos(aAim), WALL_H-0.42,
        scz + (rFace - 1.85)*Math.sin(aAim),
      );
      const screenMid = new THREE.Vector3(
        scx + rFace*Math.cos(aAim), h*0.5,
        scz + rFace*Math.sin(aAim),
      );
      const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.42,8), new THREE.MeshStandardMaterial({color:0x2a2f37, roughness:0.6}));
      mount.position.set(projPos.x, WALL_H-0.21, projPos.z);
      gScreen.add(mount);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36,0.15,0.28), new THREE.MeshStandardMaterial({color:0x22262c, roughness:0.5, metalness:0.3}));
      body.position.copy(projPos);
      body.rotation.y = -aAim;
      body.userData = {kind:'screen', index:10+pi, info:`Projector ${pi+1}/${study.recommendedCount} — covers ~${(halfEach*180/Math.PI).toFixed(0)}° of the main arc with blend`};
      gScreen.add(body);
      picks.register(body);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,0.05,12), new THREE.MeshStandardMaterial({color:0x9fd7ff, emissive:0x2a5f8a, roughness:0.2}));
      lens.rotation.z = Math.PI/2; lens.rotation.y = -aAim;
      lens.position.set(projPos.x + 0.2*Math.cos(aAim), projPos.y, projPos.z + 0.2*Math.sin(aAim));
      gScreen.add(lens);
      const throwDir = new THREE.Vector3().subVectors(screenMid, projPos);
      const throwLen = throwDir.length();
      const coneGeo = new THREE.ConeGeometry(0.95, throwLen, 20, 1, true);
      coneGeo.translate(0, -throwLen/2, 0);
      const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({color:0x8fb4e8, transparent:true, opacity:0.045, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false}));
      cone.position.copy(projPos);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0), throwDir.normalize());
      gScreen.add(cone);
    });

    // Blend overlap band on the main arc (visual marker only).
    const blendStart = deg2rad(main.startDeg) + sweep/2 - blend/2;
    const blendSeg = 10;
    const blendCyl = Math.PI/2 - (blendStart + blend);
    const blendGeo = new THREE.CylinderGeometry(rFace+0.02, rFace+0.02, h*0.92, blendSeg, 1, true, blendCyl, blend);
    const blendMesh = new THREE.Mesh(blendGeo, new THREE.MeshBasicMaterial({color:0xffe08a, transparent:true, opacity:0.22, side:THREE.DoubleSide, depthWrite:false}));
    blendMesh.position.set(scx, h/2, scz);
    blendMesh.userData = {kind:'screen', index:99, info:`Edge-blend zone (~${study.blendOverlapDeg}°) — overlap of the two projector images`};
    gScreen.add(blendMesh);
    picks.register(blendMesh);

    // The curtain arc is created here, after buildRings() already ran its pass, so it needs
    // the current fabric settings applied or it would render at the material defaults.
    applyFabricLighting();
  }

  function buildTechnical(){
    gTechnical.clear();
    picks.unregisterGroup('technical');
    const halfW = ROOM_M.width/2;
    const nicheMat = new THREE.MeshStandardMaterial({color:0x6a7380, roughness:0.7, metalness:0.1});
    TECHNICAL.niches.forEach((n, i)=>{
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(n.depth, 0.9, n.width), nicheMat);
      mesh.position.set(-halfW + n.depth/2, 1.1, n.z);
      mesh.userData = {kind:'technical', index:i, label:'Wall niche', info:`Niche ${i+1}: ${n.width.toFixed(2)} m tall × ${n.depth.toFixed(2)} m deep @ z=${n.z.toFixed(2)} m`};
      gTechnical.add(mesh);
      picks.register(mesh);
    });
    const ductMat = new THREE.MeshStandardMaterial({color:0xb0b8c0, roughness:0.5, metalness:0.35});
    TECHNICAL.ducts.forEach((d, i)=>{
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(d.diameter/2, d.diameter/2, 0.12, 16), ductMat);
      mesh.rotation.z = Math.PI/2;
      mesh.position.set(halfW - 0.12, WALL_H-0.25, d.z);
      mesh.userData = {kind:'technical', index:10+i, label:'Duct / sprinkler', info:`Duct ${i+1}: Ø${d.diameter.toFixed(2)} m @ z=${d.z.toFixed(2)} m`};
      gTechnical.add(mesh);
      picks.register(mesh);
    });
    const b = TECHNICAL.booth;
    const booth = new THREE.Mesh(
      new THREE.BoxGeometry(b.width, 2.2, b.depth),
      new THREE.MeshStandardMaterial({color:0x4a5560, roughness:0.65, transparent:true, opacity:0.55}),
    );
    booth.position.set(b.x, 1.1, b.z);
    booth.userData = {kind:'technical', index:20, label:'Booth', info:`Booth ${b.width.toFixed(2)} × ${b.depth.toFixed(2)} m`};
    gTechnical.add(booth);
    picks.register(booth);
    // Entrance corridor helpers (threshold posts at opening ends)
    const ew = TECHNICAL.entrance.width;
    const ex = TECHNICAL.entrance.x, ez = TECHNICAL.entrance.z;
    [-ew/2, ew/2].forEach((dx, i)=>{
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.1, 0.12), new THREE.MeshStandardMaterial({color:0x2563eb, roughness:0.5}));
      post.position.set(ex+dx, 1.05, ez-0.06);
      post.userData = {kind:'technical', index:30+i, label:'Entrance', info:`Entrance opening ${ew.toFixed(2)} m wide`};
      gTechnical.add(post);
      picks.register(post);
    });
  }

  function buildRig(){
    gRig.clear();
    const sensorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.14,0.28), new THREE.MeshStandardMaterial({color:0xe7e9ec, roughness:0.4, metalness:0.4}));
    sensorMesh.position.set(0, WALL_H-0.15, 0);
    sensorMesh.userData = {kind:'rig', index:0, info:'Overhead mmWave sensor'};
    gRig.add(sensorMesh);
    picks.unregisterGroup('rig');
    picks.register(sensorMesh);

    const dashPts=[]; for(let t=0;t<=1;t+=0.06) dashPts.push(new THREE.Vector3(0, THREE.MathUtils.lerp(WALL_H-0.15,0.1,t), 0));
    gRig.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(dashPts), new THREE.PointsMaterial({color:0xe7e9ec, size:0.035})));

    // Beam, base glow, and the shadow-casting light live in src/lighting/centralLight.js,
    // driven through the rig as the `centralBeam` fixture. gRig was cleared, hence rebuild.
    if(lighting.get('central')) lighting.rebuild('central');
    else lighting.add({ id:'central', name:'Central beam', type:'centralBeam',
      origin:'installation', locked:true, castShadow:true });

    gRig.position.set(circleCenter.x, 0, circleCenter.z);
  }

  const occReadout = document.getElementById('occReadout');
  function updateOccupancyUI(count) {
    occReadout.textContent = count;
    updateFloorplanOverlay();   // occupancy sets the beam's width in the plan
  }

  const peopleManager = createPeopleManager({
    gPeople,
    getCircleCenter: () => circleCenter,
    circD: CIRC_D,
    // peopleManager still owns its own add/remove lifecycle; the registry backs the same
    // accessor contract so that module needs no change during this extraction.
    getRaycastTargets: () => picks.list(CHANNEL.MAIN),
    setRaycastTargets: (next) => { picks.setList(CHANNEL.MAIN, next); },
    updateOccupancyUI,
  });

  document.getElementById('clearPeople').addEventListener('click', () => {
    peopleManager.clearAllPeople();
  });
  document.getElementById('setOccupancy').addEventListener('click', () => {
    const targetN = parseInt(document.getElementById('occTarget').value, 10) || 0;
    peopleManager.setOccupancy(targetN);
  });

  loadHumanoidTemplates().catch((err) => {
    console.error('Civilian models failed to load:', err);
    const subtitle = document.querySelector('#title p');
    if (subtitle) subtitle.textContent += ' · 3D people unavailable (models failed to load)';
  });

  const BOX_FACE_COLOR_HEX = '#ff2418';

  /** Unit vector the lit face points along, from the box's yaw. */
  function boxFacing(){
    const y = deg2rad(box.yaw);
    return { x: Math.sin(y), z: Math.cos(y) };
  }

  /** The light's own settings, kept in one place so the record can never drift from `box`. */
  function boxSpillPatch(){
    return {
      intensity: box.intensity,
      params: {
        distance: box.reach, decay: box.falloff,
        angleDeg: box.spread, penumbra: box.softness,
      },
    };
  }

  function buildBox(){
    gBox.clear();
    picks.unregisterGroup('box');

    // Housing, lit face and wash all hang off one transformed group, so the face and the
    // light are positioned in the box's own space and inherit whatever orientation it has
    // — otherwise every rotation would need the offsets recomputed by hand.
    const rig = new THREE.Group();
    rig.position.set(box.x, box.y, box.z);
    rig.rotation.set(deg2rad(box.pitch), deg2rad(box.yaw), deg2rad(box.roll), 'YXZ');

    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(box.width, box.height, box.depth),
      new THREE.MeshStandardMaterial({color:0x9b59b6, emissive:0x3a1f45, roughness:0.5}),
    );
    boxMesh.userData = {kind:'box', index:0,
      info:`Background lighting box — ${box.width.toFixed(2)} × ${box.height.toFixed(2)} × ${box.depth.toFixed(2)} m, facing ${Math.round(box.yaw)}°`};
    rig.add(boxMesh);
    picks.register(boxMesh);

    // Red-lit front face on the box's +z side, plus a red spill light in front of it.
    // No shadows — the central light remains the scene's only shadow caster.
    const face = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.max(0.02, box.width-0.04), Math.max(0.02, box.height-0.06)),
      new THREE.MeshBasicMaterial({color:BOX_FACE_COLOR_HEX}),
    );
    face.position.set(0, 0, box.depth/2 + 0.005);
    // The face is the box's whole point, so the drawing keeps its colour instead of
    // flattening it to a white outline like the housing around it.
    face.userData.lineViewSymbol = { kind: 'accent', color: BOX_FACE_COLOR_HEX };
    rig.add(face);
    gBox.add(rig);

    // The light is a rig fixture parented to gBox rather than to the box, so it takes world
    // coordinates. Both the emitter and the point it aims at are local offsets along the
    // face normal put through the box's matrix, which is what makes the throw follow yaw,
    // pitch and roll without any of it being recomputed by hand.
    gBox.updateMatrixWorld(true);
    const onFaceAxis = (d) => {
      const p = new THREE.Vector3(0, 0, box.depth/2 + d).applyMatrix4(rig.matrixWorld);
      return { x: p.x, y: p.y, z: p.z };
    };
    const patch = {
      position: onFaceAxis(BOX_FACE_GAP_M),
      aim: onFaceAxis(BOX_FACE_GAP_M + 1),
      ...boxSpillPatch(),
    };
    if(lighting.get('boxSpill')) lighting.rebuild('boxSpill', patch);
    else lighting.add({ id:'boxSpill', name:'Background box light', type:'panel',
      origin:'installation', color:BOX_FACE_COLOR_HEX, ...patch });
  }

  const sprinklerMat = new THREE.MeshStandardMaterial({color:0xff4d4d, emissive:0x660000});
  SPRINKLER_Z_M.forEach(z=>{
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06,12,12), sprinklerMat);
    s.position.set(farHalf-0.15, WALL_H-0.1, z);
    gFixtures.add(s);
  });
  const exitMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1,2.1,0.08), new THREE.MeshStandardMaterial({color:0xff4d4d, transparent:true, opacity:0.5}));
  exitMesh.position.set(farHalf*0.6, 1.05, 0.02);
  gFixtures.add(exitMesh);

  const grid = new THREE.GridHelper(60,60,0x333944,0x21262c); grid.position.y=0.005; gGrid.add(grid); gGrid.visible=false;

  function entranceAngleDeg(){
    const dx = doorPos.x - circleCenter.x, dz = doorPos.z - circleCenter.z;
    return ((Math.atan2(dz, dx) * 180 / Math.PI % 360) + 360) % 360;
  }
  function mazeCfg(){
    return {
      ringRadii: RING_RADII,
      openings: OPENINGS,
      gapDeg: gapAngleDeg,
      center: {x: circleCenter.x, z: circleCenter.z},
      isInsideRoomXZ,
      trims: RING_RADII.map((_, i)=>trimForRing(i)[0] || {start:0, end:0}),
      panels: RING_RADII.map((_, i)=>ringFabricArcs(i).map(([s, len])=>({s: s*180/Math.PI, e: (s + len)*180/Math.PI}))),
    };
  }
  function mazeCfgSignature(){
    return JSON.stringify({
      r: RING_RADII,
      o: OPENINGS,
      cx: +circleCenter.x.toFixed(3),
      cz: +circleCenter.z.toFixed(3),
      gw: gapWidthM,
      dx: +doorPos.x.toFixed(2),
      dz: +doorPos.z.toFixed(2),
    });
  }
  function markFlowDirty(){
    lastFlowCfgSig = '';
    cachedPassageGraph = null;
    flowRouteIndex = 0;
  }
  function passageGraph(){
    const sig = mazeCfgSignature();
    if(sig === lastFlowCfgSig && cachedPassageGraph) return cachedPassageGraph;
    lastFlowCfgSig = sig;
    cachedPassageGraph = buildPassageGraph(mazeCfg(), {
      entrance: { x: doorPos.x, z: doorPos.z },
      exit: { x: farHalf * 0.6, z: 0.02 },
      floorY: 0.052,
      maxRoutes: 128,
    });
    return cachedPassageGraph;
  }
  // Route computation lives in src/maze/route.js — shared by circulation drawing and walkthrough.
  function currentMazeRoute(explicitChoices = undefined){
    const choices = explicitChoices !== undefined
      ? explicitChoices
      : null;
    return computeMazeRoute(mazeCfg(), choices);
  }
  function polarToWorld(pts, y){
    return pts.map(p=>{
      const wx = circleCenter.x + p.r*Math.cos(p.a);
      const wz = circleCenter.z + p.r*Math.sin(p.a);
      const c = clampPointToRoom(wx, wz); // guarantees the route never leaves the room
      return new THREE.Vector3(c.x, y, c.z);
    });
  }
  function computeCirculationPoints(){
    return currentMazeRoute().toWorldPoints(0.06);
  }
  // Circulation views:
  //  - Flow = flat 2D cable map: all passage links + post-center exit guidance
  //  - Path = single auto route as a sine-wave strand
  //  - Heatmap = passage markers only (outer → center, white → blue)
  const FLOW_Y = 0.055;
  function addSimplePath(points, color, { width = 0.024, y = FLOW_Y } = {}){
    if(points.length < 2) return;
    const col = color?.isColor ? color.clone() : new THREE.Color(color);
    const flat = points.map(p => new THREE.Vector3(p.x, y, p.z));
    const curve = new THREE.CatmullRomCurve3(flat);
    const N = Math.max(16, Math.round(curve.getLength() * 10));
    gCirculation.add(new THREE.Mesh(
      new THREE.TubeGeometry(curve, N, width, 5, false),
      new THREE.MeshBasicMaterial({ color: col }),
    ));
  }
  function updateFlowSliderUI(total){
    const wrap = document.getElementById('flowSliderWrap');
    const slider = document.getElementById('flowRouteSlider');
    const label = document.getElementById('flowRouteLabel');
    const stats = document.getElementById('flowRouteCount');
    const show = circulationMode === 'flow';
    if(wrap) wrap.hidden = !show;
    if(!show || !slider) return;
    const max = Math.max(0, total - 1);
    slider.max = String(max);
    slider.disabled = total <= 1;
    if(flowRouteIndex > max) flowRouteIndex = 0;
    slider.value = String(flowRouteIndex);
    if(label) label.textContent = total ? `${flowRouteIndex + 1} / ${total}` : '—';
    if(stats) stats.textContent = total
      ? `One route at a time · slide to compare · ${total} options to center`
      : 'No routes — check ring layout';
  }
  function heatmapDepth(ringIndex, n){
    if(ringIndex < 0) return 1;
    if(ringIndex >= n) return 0;
    return 1 - ringIndex / Math.max(1, n - 1);
  }
  function applyFabricLighting(){
    const { fabric } = getVisualSettings();
    // gScreen is included because the small arc closing the screen circle is curtain, not
    // screen — it must respond to the fabric sliders like every other piece of fabric.
    [gCurtain, gScreen].forEach(group=>group.traverse((obj)=>{
      const mat = obj.isMesh && obj.material;
      if(!mat?.userData?.fabric) return;
      const b = fabric.brightness;
      const w = fabric.wash;
      mat.color.setRGB(b, b, b);
      mat.emissive.setRGB(w, w * 0.98, w * 0.95);
      mat.emissiveIntensity = w * 0.55;
      mat.opacity = mat.userData.baseOpacity * (0.65 + b * 0.35);
    }));
  }
  function applySceneFillLights(){
    const { scene: sc } = getVisualSettings();
    lighting.update('ambient', { intensity: BASE_AMBIENT * sc.ambient });
    lighting.update('key', { intensity: BASE_KEY * sc.fill });
    lighting.update('rim', { intensity: BASE_RIM * sc.fill });
  }
  function applyCentralLightSettings(){
    if(!lighting.get('central')) return;
    const { centralLight: cl } = getVisualSettings();
    lighting.update('central', {
      intensity: cl.intensity,
      params: { beamScale: cl.beam, glowScale: cl.glow },
    });
  }
  function addHeatmapBlob(x, z, ringIndex, ringCount){
    const opacity = heatmapOpacityForRing(ringIndex, ringCount);
    const blobGeo = new THREE.CircleGeometry(1.0, 20);
    blobGeo.rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const blob = new THREE.Mesh(blobGeo, blobMat);
    blob.position.set(x, 0.05, z);
    gCirculation.add(blob);
  }
  function addFlowPassageDot(x, z, depth){
    const color = new THREE.Color(0xffffff).lerp(new THREE.Color(0x4fb3ff), depth);
    const geo = new THREE.CircleGeometry(0.22, 16);
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }));
    m.position.set(x, 0.054, z);
    gCirculation.add(m);
  }
  function buildCirculation(){
    gCirculation.clear();
    if(circulationMode === 'flow'){
      if(!gCirculation.visible){
        updateFlowSliderUI(passageGraph().routes.length);
        return;
      }
      const graph = passageGraph();
      const routes = graph.routes;
      updateFlowSliderUI(routes.length);

      if(routes.length){
        const rt = routes[flowRouteIndex] ?? routes[0];
        addSimplePath(rt.points, rt.color, { width: 0.026 });
        const egress = graph.edges.find(e => e.kind === 'egress');
        if(egress) addSimplePath(egress.points, 0xffb020, { width: 0.012, y: FLOW_Y + 0.002 });
        rt.edges.forEach(e=>{
          const p = e.points[e.points.length - 1];
          if(!p) return;
          addFlowPassageDot(p.x, p.z, heatmapDepth(e.ringTo ?? -1, RING_RADII.length));
        });
      }
    } else if(circulationMode === 'path'){
      updateFlowSliderUI(0);
      const base = new THREE.CatmullRomCurve3(computeCirculationPoints());
      const len = base.getLength();
      const N = Math.max(200, Math.round(len*10));
      // Vertical sine wave: the strand bounces up and down along the route, so a top-down
      // (plan) view reads as a clean flat line exactly on the walking path — like the flow
      // line drawn on 2D paper.
      const AMP = 0.3, WAVELENGTH = 1.4, FLOOR_Y = 0.05;
      const wavePts = [];
      for(let i=0;i<=N;i++){
        const u = i/N;
        const p = base.getPointAt(u);
        const s = u*len;
        const taper = Math.min(1, Math.min(s, len-s)/1.0); // settle onto the floor at both ends
        const lift = (Math.sin(s*Math.PI*2/WAVELENGTH)*0.5 + 0.5) * AMP * taper;
        wavePts.push(new THREE.Vector3(p.x, FLOOR_Y + lift, p.z));
      }
      const waveCurve = new THREE.CatmullRomCurve3(wavePts);
      const strand = new THREE.Mesh(
        new THREE.TubeGeometry(waveCurve, N, 0.018, 5, false),
        new THREE.MeshBasicMaterial({color:0xaacdf0}),
      );
      gCirculation.add(strand);
    } else {
      updateFlowSliderUI(0);
      const cfg = mazeCfg();
      const n = RING_RADII.length;
      for(let i = n - 1; i >= 0; i--){
        for(const deg of listUsableDoorsDeg(cfg, i)){
          const a = deg2rad(deg);
          const wx = circleCenter.x + RING_RADII[i] * Math.cos(a);
          const wz = circleCenter.z + RING_RADII[i] * Math.sin(a);
          addHeatmapBlob(wx, wz, i, n);
        }
      }
    }
  }

  buildFloorCentral();
  buildRings();
  buildRig();
  buildBox();
  buildTechnical();

  // Character name labels are hidden by default — the CSS2D layer stays rendered (cheap)
  // and is simply not shown until the "Show name labels" toggle is checked.
  const showNamesToggle = document.getElementById('showNames');
  labelRenderer.domElement.style.visibility = 'hidden';
  showNamesToggle.addEventListener('change', ()=>{
    labelRenderer.domElement.style.visibility = showNamesToggle.checked ? 'visible' : 'hidden';
  });

  const layers = {
    room:gRoom, floor:gFloorCentral, curtain:gCurtain, circulation:gCirculation,
    screen:gScreen, rig:gRig, box:gBox, fixtures:gFixtures, technical:gTechnical,
    grid:gGrid, ceilingLights:gCeilingLights,
  };
  gCirculation.visible = false;

  const circulationExtraHtml = `
    <div class="btnrow" style="margin:4px 0 6px;">
      <button class="smallbtn" id="circPath">Path</button>
      <button class="smallbtn" id="circHeat">Heatmap</button>
      <button class="smallbtn active" id="circFlow">Flow</button>
    </div>
    <div class="sectionhint">Flow = one route · slide or ← →</div>
    <div id="flowSliderWrap" class="flowslider">
      <div class="numrow"><span>Route option</span><span id="flowRouteLabel">1 / 1</span></div>
      <input type="range" id="flowRouteSlider" min="0" max="0" value="0" step="1">
      <div class="btnrow">
        <button type="button" class="smallbtn" id="flowPrev">‹ Prev</button>
        <button type="button" class="smallbtn" id="flowNext">Next ›</button>
      </div>
    </div>
    <div class="flowmeta" id="flowRouteCount"></div>
    <div class="btnrow" style="margin-top:6px;"><button class="smallbtn" id="ceilingModeBtn">Add ceiling light</button></div>
  `;

  initLayersPanel({
    root: document.getElementById('layersPanelRoot'),
    layers,
    circulationHtml: circulationExtraHtml,
    onLayerChange(id, visible){
      if(id === 'circulation') buildCirculation();
      if(id === 'technical' || id === 'rig') updateFloorplanOverlay();
    },
  });

  initHeatmapControls({
    root: document.getElementById('heatmapControlsRoot'),
    onChange: ()=>{ if(circulationMode === 'heat') buildCirculation(); },
  });

  initScreenMediaControls({
    root: document.getElementById('screenMediaRoot'),
    media: screenMedia,
    dropTarget: wrap,
  });

  initLightingControls({
    root: document.getElementById('lightingControlsRoot'),
    onFabricChange: applyFabricLighting,
    onSceneLightsChange: applySceneFillLights,
  });

  onVisualSettingsChange(()=>{
    applyCentralLightSettings();
    if(circulationMode === 'heat') buildCirculation();
    updateFloorplanOverlay();   // the beam slider changes the plan footprint
  });
  applySceneFillLights();
  applyCentralLightSettings();

  // Everything the user tunes is restored before autosave starts listening, so replaying
  // the saved state cannot be mistaken for fresh edits. Autosave must start *before* the
  // async media load: otherwise box / offset / door edits during that wait call
  // `autosave?.schedule()` while it is still null and never reach localStorage.
  async function restoreWorkingState(){
    const saved = savedState ? { state: savedState } : null;
    if(saved){
      const { state } = saved;
      if(state.mood) setVisualSettings(state.mood);
      if(typeof state.screen?.mirrored === 'boolean') screenMedia.setMirrored(state.screen.mirrored);
      (state.fixtures ?? []).forEach(f=>{
        if(f.type !== 'point') return;   // only ceiling fixtures are user-placed today
        placeCeilingLight(f.position, f);
      });
      applyFabricLighting();
      applySceneFillLights();
      applyCentralLightSettings();
    }

    autosave = startAutosave({
      collect: ()=>{
        const src = screenMedia.getSource();
        return {
          mood: getVisualSettings(),
          fixtures: lighting.list().filter(f=>f.origin === 'user'),
          // Placement moves lights, not just geometry: the background box carries the red
          // boxSpill wash, and the central offset carries the whole rig.
          placement: {
            center: { x:+circleCenter.x.toFixed(3), z:+circleCenter.z.toFixed(3) },
            box: { ...box },
            door: { ...doorPos },
          },
          // The File itself lives in IndexedDB; only its descriptor belongs in JSON.
          screen: {
            mirrored: screenMedia.isMirrored(),
            kind: src.kind,
            url: src.url ?? null,
            name: src.name ?? null,
          },
        };
      },
    });

    // A saved file wins over a saved URL: it is the one that always loads.
    restoringMedia = true;
    try {
      const media = await loadDefaultMedia();
      if(media?.blob) await screenMedia.loadFile(new File([media.blob], media.name, {type:media.type}));
      else if(saved?.state.screen?.url) await screenMedia.loadUrl(saved.state.screen.url);
    } finally {
      restoringMedia = false;
    }
  }
  restoreWorkingState();

  document.getElementById('clipToggle').addEventListener('change', e=>{
    clipToRoom = e.target.checked;
    applyClipping();
  });

  const lineView = createLineView({ scene, bloomPass });
  const lineViewBtn = document.getElementById('btnLineView');
  lineViewBtn.addEventListener('click', ()=>{
    lineView.setEnabled(!lineView.isEnabled());
    lineViewBtn.classList.toggle('active', lineView.isEnabled());
  });
  // Rebuilt geometry is new geometry, so it has to be drawn into the mode as well.
  on(EVENTS.RINGS_REBUILT, ()=>lineView.refresh());
  on(EVENTS.FIXTURES_CHANGED, ()=>lineView.refresh());

  const ceilingModeBtn = document.getElementById('ceilingModeBtn');
  ceilingModeBtn.addEventListener('click', ()=>{
    ceilingPlacementMode = !ceilingPlacementMode;
    ceilingModeBtn.classList.toggle('active', ceilingPlacementMode);
    ceilingModeBtn.textContent = ceilingPlacementMode ? 'Click room to place (click here to stop)' : 'Add ceiling light';
  });

  const circPathBtn = document.getElementById('circPath'), circHeatBtn = document.getElementById('circHeat'), circFlowBtn = document.getElementById('circFlow');
  function setCirculationMode(mode){
    circulationMode = mode;
    circPathBtn.classList.toggle('active', mode === 'path');
    circHeatBtn.classList.toggle('active', mode === 'heat');
    circFlowBtn.classList.toggle('active', mode === 'flow');
    if(mode === 'flow') markFlowDirty();
    buildCirculation();
  }
  circPathBtn.addEventListener('click', ()=> setCirculationMode('path'));
  circHeatBtn.addEventListener('click', ()=> setCirculationMode('heat'));
  circFlowBtn.addEventListener('click', ()=> setCirculationMode('flow'));

  const flowRouteSlider = document.getElementById('flowRouteSlider');
  const flowPrevBtn = document.getElementById('flowPrev');
  const flowNextBtn = document.getElementById('flowNext');
  function setFlowRouteIndex(idx){
    const graph = cachedPassageGraph || passageGraph();
    const total = graph.routes.length;
    if(!total) return;
    flowRouteIndex = ((idx % total) + total) % total;
    buildCirculation();
  }
  flowRouteSlider?.addEventListener('input', ()=>{
    flowRouteIndex = parseInt(flowRouteSlider.value, 10) || 0;
    buildCirculation();
  });
  flowPrevBtn?.addEventListener('click', ()=> setFlowRouteIndex(flowRouteIndex - 1));
  flowNextBtn?.addEventListener('click', ()=> setFlowRouteIndex(flowRouteIndex + 1));
  window.addEventListener('keydown', e=>{
    if(circulationMode !== 'flow' || !gCirculation.visible) return;
    if(e.key === 'ArrowLeft') setFlowRouteIndex(flowRouteIndex - 1);
    if(e.key === 'ArrowRight') setFlowRouteIndex(flowRouteIndex + 1);
  });

  // These three fields already hold the restored placement (seeded above), so the inputs
  // are synced from the model rather than the other way round; the markup values are only
  // the floorplan defaults.
  const offX = document.getElementById('offX'), offZ = document.getElementById('offZ');
  function applyOffset(){
    circleCenter = new THREE.Vector3(parseFloat(offX.value)||0, 0, parseFloat(offZ.value)||0);
    markFlowDirty();
    buildFloorCentral();
    buildRings();
    buildRig();
    rebuildRingSliders();
    peopleManager.refaceAllTowardCenter();
    autosave?.schedule();
  }
  offX.value = circleCenter.x; offZ.value = circleCenter.z;
  offX.addEventListener('input', applyOffset);
  offZ.addEventListener('input', applyOffset);

  const boxEls = Object.fromEntries(Object.entries({
    x:'boxX', y:'boxY', z:'boxZ', yaw:'boxYaw', pitch:'boxPitch', roll:'boxRoll',
    width:'boxW', height:'boxH', depth:'boxD',
    intensity:'boxIntensity', spread:'boxSpread', softness:'boxSoftness',
    reach:'boxReach', falloff:'boxFalloff',
  }).map(([key, id])=>[key, document.getElementById(id)]));
  const BOX_MIN_SIZE_M = 0.05;   // a zero-thickness housing has no face left to light
  const BOX_LIGHT_KEYS = ['intensity','spread','softness','reach','falloff'];

  function readBoxInputs(){
    for(const key in boxEls) box[key] = parseFloat(boxEls[key].value)||0;
    for(const key of ['width','height','depth']) box[key] = Math.max(BOX_MIN_SIZE_M, box[key]);
  }
  function syncBoxInputs(){
    for(const key in boxEls) boxEls[key].value = box[key];
  }
  /** Where it stands and how big it is — the geometry has to be rebuilt. */
  function applyBoxShape(){
    readBoxInputs();
    buildBox();
    updateFloorplanOverlay();
    autosave?.schedule();
  }
  /**
   * What it throws into the room. update() rather than rebuild(): these are slider drags,
   * and rebuilding would discard and recreate the light on every frame of the drag.
   */
  function applyBoxLight(){
    readBoxInputs();
    lighting.update('boxSpill', boxSpillPatch());
    autosave?.schedule();
  }
  syncBoxInputs();
  for(const [key, el] of Object.entries(boxEls)){
    el.addEventListener('input', BOX_LIGHT_KEYS.includes(key) ? applyBoxLight : applyBoxShape);
  }

  document.getElementById('boxFaceCenter').addEventListener('click', ()=>{
    // Yaw is measured from +z, so the aim angle is atan2(dx, dz), not the usual atan2(dz, dx).
    box.yaw = +(Math.atan2(circleCenter.x - box.x, circleCenter.z - box.z) * 180/Math.PI).toFixed(1);
    syncBoxInputs();
    applyBoxShape();
  });
  document.getElementById('boxReset').addEventListener('click', ()=>{
    box = { ...boxDefaults };
    syncBoxInputs();
    applyBoxShape();   // rebuilding the box re-applies the wash settings with it
  });

  const doorXInp = document.getElementById('doorX'), doorZInp = document.getElementById('doorZ');
  function applyDoorPos(){
    doorPos = {x:parseFloat(doorXInp.value)||0, z:parseFloat(doorZInp.value)||0};
    markFlowDirty();
    updateFloorplanOverlay();
    buildCirculation();
    autosave?.schedule();
  }
  doorXInp.value = doorPos.x; doorZInp.value = doorPos.z;
  doorXInp.addEventListener('input', applyDoorPos);
  doorZInp.addEventListener('input', applyDoorPos);

  document.getElementById('autoOrient').addEventListener('click', ()=>{
    // Point the outermost ring's opening toward the door, but only ever pick an angle
    // where that opening's actual position is inside the room's walls — a raw straight-line
    // angle to the door can land a huge outer ring's opening outside the building entirely.
    // Then wind the rest inward using the same non-repeating drift used elsewhere.
    const n = baseAngles.length;
    const outerR = RING_RADII[n-1];
    const dx = doorPos.x - circleCenter.x, dz = doorPos.z - circleCenter.z;
    let doorAngle = Math.atan2(dz, dx) * 180/Math.PI;
    doorAngle = ((doorAngle % 360) + 360) % 360;

    let bestAngle = doorAngle, found = false;
    for(let delta=0; delta<=180; delta+=2){
      for(const sign of (delta===0?[1]:[1,-1])){
        const cand = ((doorAngle + sign*delta) % 360 + 360) % 360;
        const rad = deg2rad(cand);
        const wx = circleCenter.x + outerR*Math.cos(rad), wz = circleCenter.z + outerR*Math.sin(rad);
        if(isInsideRoomXZ(wx, wz)){ bestAngle = cand; found = true; break; }
      }
      if(found) break;
    }
    rotateRingTo(n-1, bestAngle);
    for(let i=n-2;i>=0;i--){
      const next = baseAngles[i+1];
      rotateRingTo(i, nextWindingAngle(next));
    }
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
    if(!found){
      alert('No angle for the outermost ring\'s opening lands inside the room at its current radius — it may be too large for this room. Try a smaller "Growth /ring" value or move the central space closer to the door.');
    }
  });

  function reshuffleInnerOpenings(){
    // Entrance (outermost ring) is deliberately left untouched — this only reshuffles the
    // inner rings, each constrained to (a) land inside the room's walls and (b) sit at least
    // 50° away from the ring just outside it, so it never opens onto a straight sightline in
    // to the door. Since every ring's route still funnels through to ring index 0's opening
    // and on to the center by construction, every generated layout still leads to the middle.
    const n = baseAngles.length;
    for(let i=n-2;i>=0;i--){
      const outerAngle = baseAngles[i+1];
      const r = RING_RADII[i];
      let candidate = null;
      for(let tries=0; tries<50; tries++){
        const c = Math.floor(Math.random()*360);
        const diff = Math.min(Math.abs(c-outerAngle), 360-Math.abs(c-outerAngle));
        if(diff < 50) continue;
        const rad = deg2rad(c);
        const wx = circleCenter.x + r*Math.cos(rad), wz = circleCenter.z + r*Math.sin(rad);
        if(isInsideRoomXZ(wx, wz)){ candidate = c; break; }
      }
      rotateRingTo(i, candidate !== null ? candidate : nextWindingAngle(outerAngle));
    }
    regenerateAllOpenings();
  }

  function validateCurrentRoute(){
    const route = currentMazeRoute(null); // auto route for maze validation
    const curve = new THREE.CatmullRomCurve3(route.toWorldPoints(1.65));
    return validateRoute(curve, route);
  }

  document.getElementById('genMaze').addEventListener('click', ()=>{
    if(walking) stopWalk(); // never regenerate under an active walk — stop cleanly first
    markFlowDirty();
    // Generate-and-validate: reshuffle until the smoothed route passes validation (inside
    // room, threads every opening, no fabric contact). Bounded retries; on exhaustion keep
    // the attempt with the fewest issues and warn — never leave the maze in a broken state.
    let best = null, bestIssueCount = Infinity, valid = false;
    for(let attempt=0; attempt<25; attempt++){
      reshuffleInnerOpenings();
      const check = validateCurrentRoute();
      if(check.valid){ valid = true; break; }
      if(check.issues.length < bestIssueCount){
        bestIssueCount = check.issues.length;
        best = [...baseAngles];
      }
    }
    if(!valid && best){
      best.forEach((a, i)=>rotateRingTo(i, a)); // rigid restore — panel rings rotate back too
      regenerateAllOpenings();
      console.warn(`genMaze: no fully valid layout in 25 attempts — using best (${bestIssueCount} issues)`);
    }
    rebuildRingSliders();
    buildRings();
    beginWalkFlow();
  });

  // Debug hook for headless route verification (scripts/verify-maze.mjs).
  window.__cortexDebug = {
    // scripts/verify-line-view.mjs asserts on these counts to prove the mode restores
    // every material it swapped, rather than just looking right in a screenshot.
    scene, // headless checks that need to walk the graph directly
    lineView: {
      isEnabled: () => lineView.isEnabled(),
      stats(){
        let converted = 0, edges = 0, meshes = 0, unconverted = 0;
        scene.traverse((o)=>{
          if (o.name === '__lineEdges' || o.parent?.name === '__lineEdges'){ edges++; return; }
          if (o.isMesh) meshes++;
          if (o.userData.__lineView) converted++;
          else if (o.isMesh) unconverted++;
        });
        return { converted, edges, meshes, unconverted };
      },
    },
    // What a click at these screen coordinates would hit, nearest first. The central floor
    // being unreachable behind the curtain rings was invisible to every other check, so
    // picking needs to be inspectable from a headless run.
    pickAt: (x, y) => picks.pickAll(x, y, camera, { width: W(), height: H() })
      .map((h)=>({ kind: h.root.userData?.kind, distance: +h.distance.toFixed(2) })),
    validateCurrentRoute,
    isWalking: () => walking,
    passageGraph: ()=> passageGraph(),
    sampleRoute(ts){
      const route = currentMazeRoute(null);
      const curve = new THREE.CatmullRomCurve3(route.toWorldPoints(1.65));
      return ts.map(t=>{
        const p = curve.getPointAt(t);
        const dx = p.x - circleCenter.x, dz = p.z - circleCenter.z;
        return {t, x:+p.x.toFixed(2), z:+p.z.toFixed(2), r:+Math.hypot(dx,dz).toFixed(2),
          aDeg: Math.round(((Math.atan2(dz,dx)*180/Math.PI)%360+360)%360),
          chosen: route.chosenOpenings.map(a=>Math.round(a*180/Math.PI))};
      });
    },
  };

  const openPerRingInp = document.getElementById('openPerRing');
  const openSpacingInp = document.getElementById('openSpacing');
  function applyOpeningsConfig(){
    // Global controls act as "set all rings" — per-ring doors live in the ring rows.
    const count = Math.max(1, parseInt(openPerRingInp.value,10)||1);
    openingSpacingDeg = Math.max(1, parseFloat(openSpacingInp.value)||40);
    RING_RADII.forEach((_, i)=>{
      ringDoors[i] = [baseAngles[i]];
      setRingDoorCount(i, count);
    });
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
  }
  openPerRingInp.addEventListener('input', applyOpeningsConfig);
  openSpacingInp.addEventListener('input', applyOpeningsConfig);

  const ringControls = document.getElementById('ringControls');
  function rebuildRingSliders(){
    ringControls.innerHTML = '';
    const clearance = Math.min(circleCenter.x + halfWidthAtZ(circleCenter.z), halfWidthAtZ(circleCenter.z) - circleCenter.x);
    RING_RADII.forEach((radius, i)=>{
      if(ringVisible[i] === undefined) ringVisible[i] = true;
      if(ringDoors[i] === undefined) ringDoors[i] = [baseAngles[i] ?? 90];
      if(ringDoorCount[i] === undefined) ringDoorCount[i] = ringDoors[i].length;
      if(ringTrims[i] === undefined) ringTrims[i] = null;
      const deg = baseAngles[i];
      const row = document.createElement('div');
      row.className = 'ringrow' + (radius > clearance ? ' warn' : '');
      row.id = 'ringrow-'+i;
      const isConfirmed = CONFIRMED_RADII.some(cr=>Math.abs(cr-radius)<0.01);
      const trim = ringTrims[i] || trimForRing(i)[0] || {start:0, end:360};
      const doorInputs = ringDoors[i]
        .map((a, k)=>`<input class="doorAng" data-k="${k}" type="number" min="0" max="359" step="1" value="${Math.round(a)}" title="Entrance ${k+1} angle">`)
        .join('');
      row.innerHTML = `<div class="ringmain">
          <button class="eyeBtn" title="Show/hide this ring">${ringVisible[i] ? '\u{1F441}' : '\u{1F576}'}</button>
          <span class="lab" title="Rotate the whole ring (all entrances move together)">Ring ${i+1}${isConfirmed?' *':''} <em>Ø${(radius*2).toFixed(1)}</em></span>
          <input type="range" min="0" max="359" value="${deg}">
          <span class="deg">${deg}°</span>
        </div>
        <div class="ringsub">
          <span title="Number of entrances in this curtain">doors</span> <input class="doorsInp" type="number" min="1" max="8" step="1" value="${ringDoorCount[i]}">
          <span title="Entrance angles, degrees">@</span>${doorInputs}
        </div>
        <div class="ringsub">
          trim <input class="trimStart" type="number" min="0" max="359" step="1" value="${Math.round(trim.start)}">–<input class="trimEnd" type="number" min="0" max="360" step="1" value="${Math.round(trim.end)}">°
          <button class="autoBtn${ringTrims[i] ? '' : ' on'}" title="Trim automatically to the arcs inside the room (may be several)">auto</button>
        </div>`;
      const eyeBtn = row.querySelector('.eyeBtn');
      const slider = row.querySelector('input[type=range]'), label = row.querySelector('.deg');
      const doorsInp = row.querySelector('.doorsInp');
      const trimStartInp = row.querySelector('.trimStart'), trimEndInp = row.querySelector('.trimEnd');
      const autoBtn = row.querySelector('.autoBtn');
      eyeBtn.addEventListener('click', ()=>{
        ringVisible[i] = !ringVisible[i];
        eyeBtn.textContent = ringVisible[i] ? '\u{1F441}' : '\u{1F576}';
        row.classList.toggle('hiddenRing', !ringVisible[i]);
        buildRings();
      });
      if(!ringVisible[i]) row.classList.add('hiddenRing');
      slider.addEventListener('input', ()=>{
        // rotate the whole ring rigidly — every entrance keeps its relative position
        rotateRingTo(i, parseInt(slider.value,10));
        label.textContent = baseAngles[i]+'°';
        row.querySelectorAll('.doorAng').forEach((inp, k)=>{ inp.value = Math.round(ringDoors[i][k]); });
        regenerateAllOpenings();
        buildRings();
      });
      doorsInp.addEventListener('input', ()=>{
        setRingDoorCount(i, parseInt(doorsInp.value,10)||1);
        regenerateAllOpenings();
        rebuildRingSliders(); // door-angle inputs changed count — rebuild the row
        buildRings();
      });
      row.querySelectorAll('.doorAng').forEach(inp=>{
        inp.addEventListener('input', ()=>{
          const k = parseInt(inp.dataset.k, 10);
          ringDoors[i][k] = norm360(parseInt(inp.value,10)||0);
          if(k === 0){
            baseAngles[i] = Math.round(ringDoors[i][0]);
            slider.value = baseAngles[i];
            label.textContent = baseAngles[i]+'°';
          }
          regenerateAllOpenings();
          buildRings();
        });
      });
      const applyManualTrim = ()=>{
        ringTrims[i] = {
          start: Math.min(359, Math.max(0, parseInt(trimStartInp.value,10)||0)),
          end: Math.min(360, Math.max(0, parseInt(trimEndInp.value,10)||0)),
        };
        autoBtn.classList.remove('on');
        buildRings();
      };
      trimStartInp.addEventListener('input', applyManualTrim);
      trimEndInp.addEventListener('input', applyManualTrim);
      autoBtn.addEventListener('click', ()=>{
        ringTrims[i] = null;
        const t = trimForRing(i)[0] || {start:0, end:360};
        trimStartInp.value = Math.round(t.start);
        trimEndInp.value = Math.round(t.end);
        autoBtn.classList.add('on');
        buildRings();
      });
      ringControls.appendChild(row);
    });
  }
  rebuildRingSliders();

  document.getElementById('addRing').addEventListener('click', ()=>{
    const n = RING_RADII.length;
    const nextR = +(RING_RADII[n-1] * growthFactor).toFixed(3);
    RING_RADII.push(nextR);
    const lastAngle = baseAngles[n-1] ?? 90;
    const a = Math.round(nextWindingAngle(lastAngle));
    baseAngles.push(a);
    ringDoors.push([a]);
    ringVisible.push(true);
    ringDoorCount.push(1);
    ringTrims.push(null);
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
  });
  document.getElementById('removeRing').addEventListener('click', ()=>{
    if(RING_RADII.length<=1) return;
    RING_RADII.pop(); baseAngles.pop(); ringDoors.pop(); ringVisible.pop(); ringDoorCount.pop(); ringTrims.pop();
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
  });

  const growthInp = document.getElementById('growth');
  const gapWidthInp = document.getElementById('gapWidth');
  const gapPreview = document.getElementById('gapPreview');
  function updateGapPreview(){ gapPreview.textContent = (RING_RADII[0]*(growthFactor-1)).toFixed(3); }
  growthInp.addEventListener('input', ()=>{
    growthFactor = Math.max(1.0, parseFloat(growthInp.value)||DEFAULT_GROWTH);
    RING_RADII = genRadii(RING_RADII.length, growthFactor);
    updateGapPreview();
    rebuildRingSliders();
    buildRings();
  });
  gapWidthInp.addEventListener('input', ()=>{
    gapWidthM = Math.max(0.3, parseFloat(gapWidthInp.value)||1.2);
    buildRings();
  });
  document.getElementById('extendFar').addEventListener('click', ()=>{
    const targetR = DEPTH - circleCenter.z;
    let n = RING_RADII.length;
    let r = RING_RADII[n-1];
    while(r < targetR){
      n++;
      r = CURTAIN_R0 * Math.pow(growthFactor, n-1);
      RING_RADII.push(+r.toFixed(3));
      const lastAngle = baseAngles[baseAngles.length-1] ?? 90;
      const a = Math.round(nextWindingAngle(lastAngle));
      baseAngles.push(a);
      ringDoors.push([a]);
      ringVisible.push(true);
      ringDoorCount.push(1);
      ringTrims.push(null);
    }
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
  });
  updateGapPreview();
  applyClipping();

  // Start view: wide shot of the central space, slightly above eye level — pulled back
  // far enough that orbit drags read clearly (a camera buried inside the ring field made
  // orbiting look broken).
  const target = new THREE.Vector3(circleCenter.x, 1.35, circleCenter.z);
  let radius=9.5, theta=Math.PI*0.28, phi=Math.PI*0.42;
  let dragging=false, panMode=false, lastX=0, lastY=0, downX=0, downY=0, moved=false;
  let walking = false;

  function computeWalkCurve(){
    return new THREE.CatmullRomCurve3(currentMazeRoute(null).toWorldPoints(1.65));
  }
  let walkT = 0, walkCurve = null, walkRAF = null, walkOnStopCallback = null, walkCaptureCallback = null;
  let walkSpeedFrac = 1/28; // fraction of the route per second — recomputed per-walk from real route length

  // Single render entry point for ALL camera modes (orbit, plan, walk, central-orbit) and
  // the save-image button. The video recorder reads renderer.domElement, so every visible
  // frame must come through here — post-processing changes must stay inside this function.
  function renderFrame(){
    composer.render();
    labelRenderer.render(scene, camera);
  }

  function startWalk(){
    if(walking) return;
    walking = true;
    try {
      walkT = 0;
      walkCurve = computeWalkCurve();
      const routeLen = walkCurve.getLength();
      const HUMAN_WALK_MPS = 1.2; // slow, deliberate pace through a maze — brisk casual walking is ~1.4 m/s
      walkSpeedFrac = routeLen > 0 ? HUMAN_WALK_MPS / routeLen : 1/28;
    } catch(err){
      console.error('Could not start walkthrough, stopping cleanly:', err);
      stopWalk();
      return;
    }
    let last = performance.now();
    function step(now){
      if(!walking) return;
      try {
        // rAF timestamps are vsync-based and can be EARLIER than a performance.now() taken
        // just before — an unclamped negative dt made walkT negative and crashed
        // getPointAt on the first frame (the old "walk randomly never starts" bug).
        const dt = Math.max(0, (now-last)/1000); last = now;
        walkT = Math.min(1, walkT + dt*walkSpeedFrac);
        const pos = walkCurve.getPointAt(walkT);
        // look further ahead than the step size so turns are smooth rather than jittery,
        // and so the camera visibly rotates through each corridor turn like a person would
        const lookPos = walkCurve.getPointAt(Math.min(1, walkT + 0.012));
        camera.position.copy(pos);
        camera.lookAt(lookPos.x, pos.y, lookPos.z);
        renderFrame();
        if(walkCaptureCallback) walkCaptureCallback(walkT, now);
        if(walkT < 1){
          walkRAF = requestAnimationFrame(step);
        } else {
          stopWalk();
        }
      } catch(err){
        // a degenerate route or a bad curve sample must never leave the camera stuck —
        // always fall back to a clean stop so orbit controls come back
        console.error('Walkthrough step failed, stopping cleanly:', err);
        stopWalk();
      }
    }
    walkRAF = requestAnimationFrame(step);
  }
  function stopWalk(){
    walking = false;
    if(walkRAF) cancelAnimationFrame(walkRAF);
    walkRAF = null;
    camera.fov = 45; camera.updateProjectionMatrix();
    const cb = walkOnStopCallback;
    walkOnStopCallback = null;
    walkCaptureCallback = null;
    if(cb) cb();
  }

  // "Central space" mode: camera parked further back from the central floor, slowly orbiting
  // 360° to watch the people dots and the pulsing light — pulled back and widened so the full
  // space is in frame, not just a tight view of the floor.
  function startCentralOrbit(){
    if(walking) return;
    walking = true;
    const ORBIT_RADIUS = CIRC_D/2 + 5;
    const ORBIT_HEIGHT = 2.3;
    const ORBIT_PERIOD_SEC = 30; // slow, one full loop every 30s
    camera.fov = 62; camera.updateProjectionMatrix();
    let angle = 0;
    let last = performance.now();
    function step(now){
      if(!walking) return;
      try {
        const dt = Math.max(0, (now-last)/1000); last = now; // rAF timestamp can precede performance.now()
        angle += dt * (Math.PI*2/ORBIT_PERIOD_SEC);
        camera.position.set(circleCenter.x + ORBIT_RADIUS*Math.cos(angle), ORBIT_HEIGHT, circleCenter.z + ORBIT_RADIUS*Math.sin(angle));
        camera.lookAt(circleCenter.x, 0.6, circleCenter.z);
        renderFrame();
        if(walkCaptureCallback) walkCaptureCallback((angle % (Math.PI*2))/(Math.PI*2), now);
        walkRAF = requestAnimationFrame(step); // loops indefinitely — stop via stopWalk()
      } catch(err){
        console.error('Central-space orbit step failed, stopping cleanly:', err);
        stopWalk();
      }
    }
    walkRAF = requestAnimationFrame(step);
  }

  function updateCamera(){
    const x = target.x + radius*Math.sin(phi)*Math.sin(theta);
    const y = target.y + radius*Math.cos(phi);
    const z = target.z + radius*Math.sin(phi)*Math.cos(theta);
    camera.position.set(x,y,z); camera.lookAt(target);
  }
  updateCamera();

  renderer.domElement.addEventListener('mousedown', e=>{
    if(walking) return;
    dragging=true; panMode=e.shiftKey; lastX=e.clientX; lastY=e.clientY; downX=e.clientX; downY=e.clientY; moved=false;
  });
  window.addEventListener('mouseup', e=>{
    if(walking) return;
    dragging=false;
    if(!moved && e.target===renderer.domElement) handleClick(e);
  });
  window.addEventListener('mousemove', e=>{
    if(walking || !dragging) return;
    if(Math.abs(e.clientX-downX)>3 || Math.abs(e.clientY-downY)>3) moved=true;
    const dx=e.clientX-lastX, dy=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY;
    if(panMode){
      const panSpeed=radius*0.0016;
      const dir=new THREE.Vector3().subVectors(camera.position,target).normalize();
      const rightV=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();
      const upV=new THREE.Vector3().crossVectors(dir,rightV).normalize();
      target.addScaledVector(rightV,-dx*panSpeed); target.addScaledVector(upV,dy*panSpeed);
    } else {
      theta -= dx*0.006;
      phi = Math.min(Math.max(phi - dy*0.006, 0.08), Math.PI*0.49);
    }
    updateCamera();
  });
  renderer.domElement.addEventListener('wheel', e=>{
    e.preventDefault();
    radius = Math.min(Math.max(radius + e.deltaY*0.02, 6), 60);
    updateCamera();
  }, {passive:false});

  let ceilingPlacementMode = false;

  // The central floor and the people standing on it are ringed by 3 m curtain cylinders
  // and the screen circle, so from any orbit angle a ray reaches fabric before it reaches
  // them. Taking the nearest hit meant neither was ever clickable — adding and removing a
  // person simply did nothing. Fabric in the way doesn't change what the click was aimed
  // at, so the central space wins over the enclosure around it, and only over that:
  // anything else in front still takes the click, as does the enclosure itself when there
  // is nothing behind it.
  const ENCLOSURE = new Set(['ring', 'screen', 'screenCurtain']);
  const CENTRAL_SPACE = new Set(['floor', 'person']);
  function resolveClick(hits){
    if(!hits.length) return null;
    const central = hits.findIndex(h=> CENTRAL_SPACE.has(h.root.userData?.kind));
    if(central <= 0) return hits[0];
    return hits.slice(0, central).every(h=> ENCLOSURE.has(h.root.userData?.kind))
      ? hits[central]
      : hits[0];
  }

  function handleClick(e){
    const viewport = { width: W(), height: H() };

    if(ceilingPlacementMode){
      // dedicated mode, checked FIRST and exclusively — with up to a dozen large ring
      // cylinders often filling the frame, a "only check ceiling if nothing else was hit"
      // fallback almost never actually triggers, since some ring is nearly always hit first
      const chit = picks.pick(e.clientX, e.clientY, camera, {channel:CHANNEL.CEILING, ...viewport});
      if(chit){
        if(chit.root.userData.kind==='ceilingLight') removeCeilingLight(chit.root);
        else addCeilingLight(chit.point);
      }
      return;
    }

    const hit = resolveClick(picks.pickAll(e.clientX, e.clientY, camera, viewport));
    if(!hit){ tooltip.style.display='none'; clearSelection(); return; }
    const hitRoot = hit.root;
    const kind = hitRoot.userData.kind;

    if(kind==='person'){ peopleManager.removePerson(hitRoot); tooltip.style.display='none'; return; }
    if(kind==='floor'){ peopleManager.addPersonAtPoint(hit.point); tooltip.style.display='none'; return; }

    tooltip.textContent = hit.object.userData.info || 'Element';
    tooltip.style.left = (e.clientX+14)+'px'; tooltip.style.top = (e.clientY+14)+'px';
    tooltip.style.display = 'block';
    clearTimeout(handleClick._t);
    handleClick._t = setTimeout(()=> tooltip.style.display='none', 3200);
    selectObject(hit.object);
  }

  const btnOrbit=document.getElementById('btnOrbit'), btnPlan=document.getElementById('btnPlan'), btnSave=document.getElementById('btnSave');
  btnOrbit.addEventListener('click', ()=>{
    theta=Math.PI*0.28; phi=Math.PI*0.32; radius=22; target.set(0,1.2,DEPTH*0.42); updateCamera();
    btnOrbit.classList.add('active'); btnPlan.classList.remove('active');
  });
  btnPlan.addEventListener('click', ()=>{
    theta=0.0001; phi=0.02; radius=26; target.set(0,0,DEPTH*0.5); updateCamera();
    btnPlan.classList.add('active'); btnOrbit.classList.remove('active');
  });
  btnSave.addEventListener('click', ()=>{
    renderFrame();
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'cortex_madarts_3d.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });

  const btnWalk = document.getElementById('btnWalk');
  const btnVideo = document.getElementById('btnVideo');
  const btnCentral = document.getElementById('btnCentral');

  function beginWalkFlow(){
    if(walking) return;
    btnCentral.disabled = true;
    btnOrbit.classList.remove('active'); btnPlan.classList.remove('active');
    btnWalk.textContent = 'Stop walk';
    walkOnStopCallback = ()=>{
      btnWalk.textContent = 'Walk through (POV)';
      btnCentral.disabled = false;
      updateCamera(); btnOrbit.classList.add('active');
    };
    startWalk();
  }

  btnWalk.addEventListener('click', ()=>{
    if(walking){
      stopWalk(); // manual stop mid-walk
      return;
    }
    beginWalkFlow();
  });

  btnCentral.addEventListener('click', ()=>{
    if(walking){
      stopWalk();
      return;
    }
    btnWalk.disabled = true;
    btnOrbit.classList.remove('active'); btnPlan.classList.remove('active');
    btnCentral.textContent = 'Stop';
    walkOnStopCallback = ()=>{
      btnCentral.textContent = 'Central space';
      btnWalk.disabled = false;
      updateCamera(); btnOrbit.classList.add('active');
    };
    startCentralOrbit();
  });

  // Video recording via the browser-native MediaRecorder — no CDN, no worker, no encoding
  // wait. Recording is independent of walk/orbit mode: it grabs whatever the main render
  // loop draws each frame (manual orbit, walkthrough, central-space spin, or plan view).
  // Output is 1080p-class: 1080px tall, width following the viewport aspect ratio so
  // nothing is distorted, cropped, or letterboxed (exactly 1920×1080 at a 16:9 window).
  let videoRecording = false;
  let videoRecorder = null, videoCanvas = null, videoCtx = null;
  function captureVideoFrame(){
    if(!videoRecording) return;
    videoCtx.drawImage(renderer.domElement, 0, 0, videoCanvas.width, videoCanvas.height);
  }

  function pickVideoMime(){
    const candidates = [
      'video/mp4;codecs=avc1.42E01E', // Safari (and Chromium 126+) — plays everywhere
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    return candidates.find(c => MediaRecorder.isTypeSupported(c)) || '';
  }

  btnVideo.addEventListener('click', ()=>{
    if(videoRecording){
      videoRecording = false;
      btnVideo.textContent = 'Saving…'; btnVideo.disabled = true;
      videoRecorder.stop(); // onstop handler downloads the file and resets the button
      return;
    }
    if(typeof MediaRecorder === 'undefined'){
      alert('This browser does not support in-page video recording (MediaRecorder). Try "Save image" for a still frame, or screen-recording software instead.');
      return;
    }
    const vh = 1080;
    const vw = Math.round(vh * (W()/H()) / 2) * 2; // encoders want even dimensions
    videoCanvas = document.createElement('canvas');
    videoCanvas.width = vw; videoCanvas.height = vh;
    videoCtx = videoCanvas.getContext('2d');
    videoCtx.drawImage(renderer.domElement, 0, 0, vw, vh); // prime the first frame
    const stream = videoCanvas.captureStream(60);
    const mime = pickVideoMime();
    const chunks = [];
    videoRecorder = new MediaRecorder(stream, {
      ...(mime ? {mimeType: mime} : {}),
      videoBitsPerSecond: 16_000_000, // generous for 1080p60 — the beam/bloom gradients band badly at low bitrates
    });
    videoRecorder.ondataavailable = (e)=>{ if(e.data && e.data.size) chunks.push(e.data); };
    videoRecorder.onstop = ()=>{
      const type = videoRecorder.mimeType || mime || 'video/webm';
      const ext = type.includes('mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, {type});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `cortex_madarts_recording.${ext}`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 5000);
      stream.getTracks().forEach(t=>t.stop());
      videoRecorder = null; videoCanvas = null; videoCtx = null;
      btnVideo.textContent = 'Record video'; btnVideo.disabled = false;
    };
    videoRecorder.start(250); // flush chunks periodically so long recordings don't buffer in one blob
    videoRecording = true;
    btnVideo.textContent = 'Stop && save video';
  });

  // ---- Technical drawing side panel (press X) ----
  // A LIVE vector floorplan, generated entirely from the model state and drawn directly
  // in METRES (x from the room centerline, y = plan z from the near/booth wall). Every
  // distance/position edit re-renders it, so the 3D scene and this drawing can never
  // drift apart. The architect's original drawing (public/floorplan2.svg) can be shown
  // beneath it as a toggleable underlay, mapped into the same metre space through
  // FLOORPLAN_SVG.unitsPerMeter, for direct visual comparison — but that drawing is not
  // ours to publish, so it is git-ignored and absent from any deployed build; the panel
  // detects that and disables the toggle. Ring arcs are clickable — they open and flash
  // that ring's control row — and the whole drawing exports as SVG.
  const fpPanel = document.getElementById('floorplanPanel');
  const FP_NS = 'http://www.w3.org/2000/svg';
  const fpMk = (tag, attrs)=>{ const el = document.createElementNS(FP_NS, tag); for(const k in attrs) el.setAttribute(k, attrs[k]); return el; };
  // Polyline arc in metre space around (cx, cy) — polylines rather than SVG A commands so
  // the same tessellation logic serves any sweep length (incl. >180°) without edge cases.
  function fpArcPath(cx, cy, r, startDeg, lenDeg){
    const steps = Math.max(8, Math.round(Math.abs(lenDeg)/3));
    let d = '';
    for(let s=0;s<=steps;s++){
      const a = deg2rad(startDeg + lenDeg*(s/steps));
      d += (s===0?'M':'L') + (cx + r*Math.cos(a)).toFixed(3) + ' ' + (cy + r*Math.sin(a)).toFixed(3);
    }
    return d;
  }

  let fpSvgEl = null;
  (function initFloorplanPanel(){
    const RW = ROOM_M.width, RD = ROOM_M.depth;
    fpSvgEl = fpMk('svg', {viewBox:`${(-RW/2-1).toFixed(2)} -1 ${(RW+2).toFixed(2)} ${(RD+2.6).toFixed(2)}`, preserveAspectRatio:'xMidYMid meet'});

    // Underlay: the architect's drawing, mapped into metre space. Added empty and filled in
    // later (see the probe below) — it goes in first regardless so that, if the drawing does
    // turn up, it sits behind the shell and the live drawing rather than on top of them.
    const under = fpMk('g', {});
    fpSvgEl.appendChild(under);

    // Static shell: double-line walls, entrance opening in the far wall, service box on
    // the near wall, sprinklers along the right wall.
    const shell = fpMk('g', {});
    shell.appendChild(fpMk('rect', {x:(-RW/2-0.28).toFixed(2), y:-0.28, width:(RW+0.56).toFixed(2), height:(RD+0.56).toFixed(2), fill:'none', stroke:'#3b3f46', 'stroke-width':'0.05'}));
    shell.appendChild(fpMk('rect', {x:(-RW/2).toFixed(2), y:0, width:RW.toFixed(2), height:RD.toFixed(2), fill:'none', stroke:'#3b3f46', 'stroke-width':'0.08'}));
    // Entrance opening in the far wall (drawn as a wall break + threshold line)
    const halfEnt = (DOOR_M.width || 2.52) / 2;
    shell.appendChild(fpMk('line', {x1:(DOOR_M.x-halfEnt).toFixed(2), y1:RD, x2:(DOOR_M.x+halfEnt).toFixed(2), y2:RD, stroke:'#f4f2ec', 'stroke-width':'0.2'}));
    shell.appendChild(fpMk('line', {x1:(DOOR_M.x-halfEnt).toFixed(2), y1:RD, x2:(DOOR_M.x+halfEnt).toFixed(2), y2:RD, stroke:'#2563eb', 'stroke-width':'0.05', 'stroke-dasharray':'0.2 0.14'}));
    SPRINKLER_Z_M.forEach(z=>shell.appendChild(fpMk('circle', {cx:(RW/2-0.15).toFixed(2), cy:z, r:0.12, fill:'none', stroke:'#c05050', 'stroke-width':'0.05'})));
    fpSvgEl.appendChild(shell);

    fpOverlay = fpMk('g', {});
    fpSvgEl.appendChild(fpOverlay);
    document.getElementById('fpCanvas').appendChild(fpSvgEl);

    document.getElementById('fpUnderlayToggle').addEventListener('change', (e)=>{
      under.style.display = e.target.checked ? '' : 'none';
    });
    // The architect's drawing is not published (README), so the build tells us whether this
    // one has it (vite.config.js). Where it does, the underlay and its checkbox appear; where
    // it does not, the panel is just the live drawing — no control advertising a missing file,
    // no request for it, and so nothing in the console either.
    // typeof, because a dev server started before this constant existed would otherwise
    // throw a ReferenceError here and take the whole scene down over an optional underlay.
    if(typeof __HAS_FLOORPLAN_UNDERLAY__ !== 'undefined' && __HAS_FLOORPLAN_UNDERLAY__){
      // SVG transforms apply right-to-left: shift so the room's top-left inner corner hits
      // the origin, then scale drawing units → metres.
      const S = FLOORPLAN_SVG.unitsPerMeter;
      const img = fpMk('image', {x:0, y:0, width:595, height:842, opacity:'0.45',
        transform:`scale(${(1/S).toFixed(6)}) translate(${-FLOORPLAN_SVG.roomMidX} ${-FLOORPLAN_SVG.roomTopY})`});
      img.setAttribute('href', FLOORPLAN_SVG.url);
      under.appendChild(img);
      document.getElementById('fpUnderlayLabel').hidden = false;
    }
    document.getElementById('fpDownload').addEventListener('click', ()=>{
      const clone = fpSvgEl.cloneNode(true);
      clone.setAttribute('xmlns', FP_NS);
      const blob = new Blob([new XMLSerializer().serializeToString(clone)], {type:'image/svg+xml'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'cortex_floorplan_live.svg';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(()=>URL.revokeObjectURL(url), 5000);
    });
    updateFloorplanOverlay();
  })();

  function focusRingRow(i){
    const row = document.getElementById('ringrow-'+i);
    if(!row) return;
    const section = row.closest('details'); if(section) section.open = true;
    document.querySelectorAll('.ringrow.flash').forEach(el=>el.classList.remove('flash'));
    row.scrollIntoView({block:'nearest'});
    row.classList.add('flash');
    setTimeout(()=>row.classList.remove('flash'), 1600);
  }

  function selectScreenFromPlan(){
    const mesh = gScreen.children.find(c=>c.isMesh && c.userData?.kind==='screen');
    if(mesh) selectObject(mesh);
  }

  function updateFloorplanOverlay(){
    if(!fpOverlay) return;
    while(fpOverlay.firstChild) fpOverlay.removeChild(fpOverlay.firstChild);
    const cx = circleCenter.x, cy = circleCenter.z;
    let shown = 0;
    builtRingArcs.forEach((entry, i)=>{
      if(!entry || ringVisible[i] === false) return;
      shown++;
      const g = fpMk('g', {class:'fpRing'});
      entry.arcs.forEach(([sRad, lenRad])=>{
        g.appendChild(fpMk('path', {d: fpArcPath(cx, cy, entry.r, sRad*180/Math.PI, lenRad*180/Math.PI), fill:'none', stroke:'#c0392b', 'stroke-width':'0.07', 'stroke-linecap':'round'}));
      });
      entry.gaps.forEach(gp=>{
        g.appendChild(fpMk('path', {d: fpArcPath(cx, cy, entry.r, gp.start, gp.end - gp.start), fill:'none', stroke:'#1f9d55', 'stroke-width':'0.06', 'stroke-dasharray':'0.16 0.14'}));
      });
      const tip = fpMk('title', {});
      tip.textContent = `Ring ${i+1} — Ø${(entry.r*2).toFixed(2)} m · ${entry.gaps.length} entrance(s) — click to edit`;
      g.appendChild(tip);
      g.addEventListener('click', ()=>focusRingRow(i));
      fpOverlay.appendChild(g);
    });

    // Screen: distinct gold arcs at SCREEN.center (not curtain ring center)
    if(gScreen.visible){
      const sg = fpMk('g', {class:'fpScreen'});
      const sx = SCREEN.center.x, sy = SCREEN.center.z;
      const rSvg = SCREEN.faceDiameter / 2;
      // Gold = projection surface. The curtain arc closing the circle is drawn white and
      // dashed, matching how it reads in 3D: fabric, not screen.
      SCREEN.arcs.forEach(arc=>{
        const isCurtain = arc.role === 'curtain';
        sg.appendChild(fpMk('path', {
          d: fpArcPath(sx, sy, rSvg, arc.startDeg, Math.abs(arc.sweepDeg)),
          fill:'none',
          stroke: isCurtain ? '#e7e9ec' : '#b8860b',
          'stroke-width':'0.09',
          'stroke-linecap':'round',
          ...(isCurtain ? {'stroke-dasharray':'0.18 0.14'} : {}),
        }));
      });
      const study = computeProjectionStudy(SCREEN);
      const tip = fpMk('title', {});
      tip.textContent = `Projection screen Ø${SCREEN.outerDiameter.toFixed(2)} m (face ${SCREEN.faceDiameter}) — ${study.mainSweepDeg.toFixed(0)}° screen + ${study.curtainSweepDeg.toFixed(0)}° curtain — click for study`;
      sg.appendChild(tip);
      sg.addEventListener('click', ()=>selectScreenFromPlan());
      fpOverlay.appendChild(sg);
    }

    if(gTechnical.visible){
      const tg = fpMk('g', {class:'fpTechnical'});
      const halfW = ROOM_M.width/2;
      TECHNICAL.niches.forEach(n=>{
        tg.appendChild(fpMk('rect', {
          x:(-halfW).toFixed(2), y:(n.z - n.width/2).toFixed(2),
          width:n.depth.toFixed(2), height:n.width.toFixed(2),
          fill:'none', stroke:'#6a7380', 'stroke-width':'0.05',
        }));
      });
      TECHNICAL.ducts.forEach(d=>{
        tg.appendChild(fpMk('circle', {
          cx:(halfW - 0.12).toFixed(2), cy:d.z, r:(d.diameter/2).toFixed(2),
          fill:'none', stroke:'#8a929c', 'stroke-width':'0.05',
        }));
      });
      const b = TECHNICAL.booth;
      tg.appendChild(fpMk('rect', {
        x:(b.x - b.width/2).toFixed(2), y:(b.z - b.depth/2).toFixed(2),
        width:b.width.toFixed(2), height:b.depth.toFixed(2),
        fill:'none', stroke:'#4a5560', 'stroke-width':'0.06',
      }));
      fpOverlay.appendChild(tg);
    }

    // Central beam. Drawn before the centre markers so the crosshair stays legible on top
    // of the fill. The beam pulses with occupancy, so a technical drawing cannot honestly
    // show one radius: the solid disc is the mean at the current occupancy and the dashed
    // ring is the widest the beam gets. Both come from centralLight.js, which owns the
    // pulse — the drawing therefore cannot disagree with the 3D scene.
    let beamFootprint = null;
    if(gRig.visible){
      const occupancyFactor = Math.min(1, peopleManager.getPeopleCount() / MAX_PEOPLE_FOR_FULL_LIGHT);
      beamFootprint = centralBeamPlanFootprint({
        occupancyFactor,
        beamScale: getVisualSettings().centralLight.beam,
        wallHeight: WALL_H,
      });
      const bg = fpMk('g', {class:'fpBeam'});
      bg.appendChild(fpMk('circle', {cx, cy, r:beamFootprint.maxRadius.toFixed(3), fill:'none',
        stroke:BEAM_COLOR_HEX, 'stroke-width':'0.03', 'stroke-dasharray':'0.07 0.09', opacity:'0.8'}));
      bg.appendChild(fpMk('circle', {cx, cy, r:beamFootprint.nominalRadius.toFixed(3),
        fill:BEAM_COLOR_HEX, 'fill-opacity':'0.32', stroke:BEAM_COLOR_HEX, 'stroke-width':'0.035'}));
      const beamTip = fpMk('title', {});
      beamTip.textContent =
        `Central beam — Ø${(beamFootprint.nominalRadius*2).toFixed(2)} m at ${Math.round(occupancyFactor*100)}% occupancy ` +
        `(pulses Ø${(beamFootprint.minRadius*2).toFixed(2)}–${(beamFootprint.maxRadius*2).toFixed(2)} m) · ${beamFootprint.height.toFixed(2)} m tall`;
      bg.appendChild(beamTip);
      fpOverlay.appendChild(bg);
    }

    fpOverlay.appendChild(fpMk('circle', {cx, cy, r:CIRC_D/2, fill:'none', stroke:'#c0392b', 'stroke-width':'0.045', 'stroke-dasharray':'0.1 0.12'}));
    fpOverlay.appendChild(fpMk('circle', {cx, cy, r:CENTER_MARKER_D/2, fill:'none', stroke:'#d9a441', 'stroke-width':'0.04', 'stroke-dasharray':'0.08 0.08'}));
    fpOverlay.appendChild(fpMk('path', {d:`M${(cx-0.35).toFixed(2)} ${cy.toFixed(2)}L${(cx+0.35).toFixed(2)} ${cy.toFixed(2)}M${cx.toFixed(2)} ${(cy-0.35).toFixed(2)}L${cx.toFixed(2)} ${(cy+0.35).toFixed(2)}`, stroke:'#c0392b', 'stroke-width':'0.04', fill:'none'}));
    fpOverlay.appendChild(fpMk('circle', {cx:doorPos.x, cy:doorPos.z, r:0.35, fill:'none', stroke:'#2563eb', 'stroke-width':'0.07'}));
    // Box housing, rotated about its own centre. SVG y grows downward where plan z does,
    // so a positive yaw reads as a negative SVG rotation.
    fpOverlay.appendChild(fpMk('rect', {
      x:(box.x - box.width/2).toFixed(2), y:(box.z - box.depth/2).toFixed(2),
      width:box.width.toFixed(2), height:box.depth.toFixed(2),
      fill:'none', stroke:'#9b59b6', 'stroke-width':'0.06',
      transform:`rotate(${(-box.yaw).toFixed(1)} ${box.x.toFixed(2)} ${box.z.toFixed(2)})`,
    }));
    // The lit face, in red, so the drawing says which way the box is pointing.
    const bf = boxFacing();
    const bfc = { x: box.x + bf.x*box.depth/2, z: box.z + bf.z*box.depth/2 };
    const bfr = { x: bf.z, z: -bf.x };   // along the face, perpendicular to the facing
    fpOverlay.appendChild(fpMk('line', {
      x1:(bfc.x - bfr.x*box.width/2).toFixed(2), y1:(bfc.z - bfr.z*box.width/2).toFixed(2),
      x2:(bfc.x + bfr.x*box.width/2).toFixed(2), y2:(bfc.z + bfr.z*box.width/2).toFixed(2),
      stroke:BOX_FACE_COLOR_HEX, 'stroke-width':'0.1',
    }));
    const dims = document.getElementById('fpDims');
    if(dims){
      dims.textContent =
        `room ${ROOM_M.width.toFixed(2)} × ${ROOM_M.depth.toFixed(2)} m · screen Ø${SCREEN.outerDiameter.toFixed(2)} · center (${circleCenter.x.toFixed(2)}, ${circleCenter.z.toFixed(2)}) m · ${shown} rings` +
        (beamFootprint ? ` · beam Ø${(beamFootprint.nominalRadius*2).toFixed(2)} m × ${beamFootprint.height.toFixed(2)} m tall` : '') +
        ` · technical layer is vector-only (raster MEP underlay not bundled)`;
    }
  }

  window.addEventListener('keydown', (e)=>{
    if(e.key !== 'x' && e.key !== 'X') return;
    const t = e.target;
    if(t && (t.tagName==='INPUT' || t.tagName==='TEXTAREA' || t.tagName==='SELECT' || t.isContentEditable)) return;
    const show = !fpPanel.classList.contains('open');
    fpPanel.classList.toggle('open', show);
    if(show) updateFloorplanOverlay();
  });

  window.addEventListener('resize', ()=>{
    camera.aspect=W()/H(); camera.updateProjectionMatrix(); renderer.setSize(W(),H());
    composer.setSize(W(), H());
    labelRenderer.setSize(W(), H());
  });

  let lastAnimTime = performance.now();
  (function animate(now){
    requestAnimationFrame(animate);
    const delta = Math.min(0.05, (now - lastAnimTime) / 1000);
    lastAnimTime = now;
    peopleManager.updateAnimations(delta);

    const t = Date.now()*0.001;
    const occupancyFactor = Math.min(1, peopleManager.getPeopleCount() / MAX_PEOPLE_FOR_FULL_LIGHT);
    lighting.tick(t, occupancyFactor);
    const bloomMul = getVisualSettings().centralLight.bloom;
    bloomPass.strength = lineView.bloomStrengthFor((0.45 + occupancyFactor * 0.55) * bloomMul);

    renderFrame();
    // recording is hooked in here deliberately — this loop runs every frame regardless of
    // orbit/walk/central-space/plan-view mode, so this is genuinely "whatever's on screen"
    captureVideoFrame();
  })();
