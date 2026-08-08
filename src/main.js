import * as THREE from 'three';
import './style.css';
import { loadHumanoidTemplate } from './people/modelLoader.js';
import { createPeopleManager } from './people/peopleManager.js';

  const wrap = document.getElementById('canvas-wrap');
  const W = () => window.innerWidth, H = () => window.innerHeight;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d10);
  scene.fog = new THREE.Fog(0x0b0d10, 25, 70);
  const camera = new THREE.PerspectiveCamera(45, W()/H(), 0.1, 200);
  const renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(W(), H());
  renderer.localClippingEnabled = true;
  wrap.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0x8899aa, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 0.5); key.position.set(10,18,8); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4fb3ff, 0.25); rim.position.set(-10,6,-10); scene.add(rim);

  const DEPTH = 21.9, W_NEAR = 8.5, W_FAR = 13.4, WALL_H = 3.2, CIRC_D = 4.8, CURTAIN_H = 3.0;
  // Ø1.541m is NOT a curtain ring — it sits inside the central floor (radius 2.4m) and is
  // rendered separately below as an unidentified flat marker. The curtain series starts at
  // Ø6.533m (the only confirmed curtain-ring measurement) since that's the first ring that
  // actually clears the central floor.
  const CURTAIN_R0 = 3.267;               // ring 1 radius, Ø6.533m — confirmed
  const CONFIRMED_RADII = [3.267];
  const DEFAULT_GROWTH = 1.229;           // preserved from the original two-point fit; now a
                                           // judgment call rather than a fit, since we only have
                                           // one confirmed curtain-ring measurement to anchor on
  const CENTER_MARKER_D = 1.541;          // unidentified ring inside the floor — decorative only
  const MAX_PEOPLE_FOR_FULL_LIGHT = 20;

  let growthFactor = DEFAULT_GROWTH;
  let gapWidthM = 1.2;
  let openingsPerRing = 1;
  let openingSpacingDeg = 40;
  let clipToRoom = false;
  let circulationMode = 'path';

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

  let RING_RADII = genRadii(9, DEFAULT_GROWTH); // reaches the far wall from z=5.0m by default
  let baseAngles = [270, 90, 260, 100, 250, 110, 240, 120, 230];
  let ringVisible = baseAngles.map(()=>true);
  let OPENINGS = baseAngles.map(a=>[a]);

  function regenerateAllOpenings(){
    OPENINGS = baseAngles.map(a=>{
      const arr = [];
      for(let k=0;k<openingsPerRing;k++) arr.push(((a + k*openingSpacingDeg) % 360 + 360) % 360);
      return arr;
    });
  }
  regenerateAllOpenings();

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

  let circleCenter = new THREE.Vector3(-0.9, 0, 5.0);
  let boxPos = {x:2.34, y:1.2};
  // Door position: best reading of the plan is a directional arrow near the far (wide) end of the
  // room, offset toward the right wall — separate from the fire-exit stair marked at the near end,
  // which is emergency-only. Genuinely approximate; adjust freely.
  let doorPos = {x:3.5, z:20.4};

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
        gBox=new THREE.Group(), gFixtures=new THREE.Group(), gGrid=new THREE.Group(), gPeople=new THREE.Group(),
        gCeilingLights=new THREE.Group();
  scene.add(gRoom,gFloorCentral,gCurtain,gCirculation,gScreen,gRig,gBox,gFixtures,gGrid,gPeople,gCeilingLights);

  const floorShape = new THREE.Shape(corners);
  const floorGeo = new THREE.ShapeGeometry(floorShape); floorGeo.rotateX(-Math.PI/2);
  gRoom.add(new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({color:0x1a1e24, roughness:0.9, metalness:0.05})));
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

  let raycastTargets = [];

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
  // kept OUT of the main raycastTargets deliberately: the camera usually sits above WALL_H,
  // so a full-room ceiling plane would intercept nearly every click before it ever reaches
  // the floor, rings, or people below. It's only tested as a fallback when nothing else is hit.
  let ceilingRaycastTargets = [ceilingMesh];

  let ceilingLights = [];
  function addCeilingLight(worldPoint){
    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.45,0.12,0.45), new THREE.MeshStandardMaterial({color:0xffd23f, emissive:0xffb800, emissiveIntensity:1.2, roughness:0.4}));
    fixture.position.set(worldPoint.x, WALL_H-0.1, worldPoint.z);
    fixture.userData = {kind:'ceilingLight', info:'Ceiling light — click to remove'};
    // a visible downward glow cone, not just an invisible PointLight, so placing one is obvious
    const coneGeo = new THREE.ConeGeometry(0.7, WALL_H-0.6, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({color:0xffe9a8, transparent:true, opacity:0.16, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false});
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(worldPoint.x, WALL_H-0.1-(WALL_H-0.6)/2, worldPoint.z);
    const spot = new THREE.PointLight(0xffe9a8, 1.4, 8, 2);
    spot.position.set(worldPoint.x, WALL_H-0.2, worldPoint.z);
    gCeilingLights.add(fixture); gCeilingLights.add(cone); gCeilingLights.add(spot);
    ceilingLights.push({fixture, cone, spot});
    ceilingRaycastTargets.push(fixture);
  }
  function removeCeilingLight(fixtureMesh){
    const entry = ceilingLights.find(c=>c.fixture===fixtureMesh);
    if(!entry) return;
    gCeilingLights.remove(entry.fixture); gCeilingLights.remove(entry.cone); gCeilingLights.remove(entry.spot);
    ceilingLights = ceilingLights.filter(c=>c!==entry);
    ceilingRaycastTargets = ceilingRaycastTargets.filter(m=>m!==fixtureMesh);
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
  }
  function selectObject(hitMesh){
    clearSelection();
    const ud = hitMesh.userData;
    selected = {mesh:hitMesh, kind:ud.kind, index:ud.index};
    if(hitMesh.material){
      selected.origColor = hitMesh.material.color.getHex();
      hitMesh.material.color.setHex(0xffd23f);
      if(hitMesh.material.emissive){ selected.origEmissive = hitMesh.material.emissive.getHex(); hitMesh.material.emissive.setHex(0x4a3a00); }
    }
    if(ud.kind==='ring'){
      selTitle.textContent = `Selected: Ring ${ud.index+1}`;
      const row = document.getElementById('ringrow-'+ud.index);
      if(row){ row.scrollIntoView({block:'nearest'}); row.classList.add('flash'); }
      selPanel.innerHTML = `<div class="numrow"><span>Ø${(RING_RADII[ud.index]*2).toFixed(3)}m</span><span>${CONFIRMED_RADII.some(r=>Math.abs(r-RING_RADII[ud.index])<0.01)?'confirmed':'interpolated'}</span></div>`;
    } else if(ud.kind==='rig'){
      selTitle.textContent = 'Selected: Sensor / central light';
      selPanel.innerHTML = '<div class="numrow"><span>Use Central space position sliders below</span></div>';
    } else if(ud.kind==='box'){
      selTitle.textContent = 'Selected: Background light box';
      selPanel.innerHTML = '<div class="numrow"><span>Use Background light box fields below</span></div>';
    } else if(ud.kind==='screen'){
      selTitle.textContent = 'Selected: Projection screen';
      selPanel.innerHTML = '<div class="numrow"><span>Position follows the Ø6.533m ring</span></div>';
    }
  }

  function buildFloorCentral(){
    gFloorCentral.clear();
    raycastTargets = raycastTargets.filter(m=>m.userData.kind!=='floor');
    const circGeo = new THREE.CircleGeometry(CIRC_D/2, 64); circGeo.rotateX(-Math.PI/2);
    const circMat = new THREE.MeshStandardMaterial({color:0xc0392b, roughness:0.6, metalness:0.1, transparent:true, opacity:0.5});
    const circMesh = new THREE.Mesh(circGeo, circMat);
    circMesh.userData = {kind:'floor', index:0, info:'Central floor (Ø4.8m) — click to add a person'};
    gFloorCentral.add(circMesh);
    raycastTargets.push(circMesh);
    const circOutline = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(CIRC_D/2,64)), new THREE.LineBasicMaterial({color:0xff6b5b}));
    circOutline.rotation.x = -Math.PI/2; circOutline.position.y = 0.03;
    gFloorCentral.add(circOutline);

    // Ø1.541m unidentified marker — flat outline only (not a wall), so it never blocks clicks
    const markerOutline = new THREE.LineLoop(new THREE.EdgesGeometry(new THREE.CircleGeometry(CENTER_MARKER_D/2,48)), new THREE.LineDashedMaterial({color:0xd9a441, dashSize:0.06, gapSize:0.05}));
    markerOutline.computeLineDistances();
    markerOutline.rotation.x = -Math.PI/2; markerOutline.position.y = 0.035;
    gFloorCentral.add(markerOutline);

    gFloorCentral.position.set(circleCenter.x, 0, circleCenter.z);
  }

  function buildRings(){
    gCurtain.clear();
    raycastTargets = raycastTargets.filter(m=>m.userData.kind!=='ring');

    RING_RADII.forEach((r, i)=>{
      const isConfirmed = CONFIRMED_RADII.some(cr=>Math.abs(cr-r)<0.01);
      const clearance = Math.min(circleCenter.x + halfWidthAtZ(circleCenter.z), halfWidthAtZ(circleCenter.z) - circleCenter.x);
      const exceeds = r > clearance;
      const h = Math.max(1.0, CURTAIN_H - Math.min(i,10)*0.06);
      const col = exceeds ? 0xe0743c : 0xffffff;
      const op = exceeds ? 0.22 : (isConfirmed ? 0.22 : 0.16); // restored to actually-visible — the light stays visible through it via render order, not by making fabric nearly invisible
      const gapDeg = gapAngleDeg(r);
      const openingsDeg = OPENINGS[i] || [0];
      const ringGroup = new THREE.Group();
      ringGroup.visible = ringVisible[i] !== false;

      const arcs = computeFabricArcs(openingsDeg, gapDeg);
      arcs.forEach(([thetaStart, thetaLength])=>{
        const geo = new THREE.CylinderGeometry(r, r, h, 32, 1, true, thetaStart, thetaLength);
        const mat = new THREE.MeshStandardMaterial({color:col, roughness:0.7, transparent:true, opacity:op, side:THREE.DoubleSide});
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, h/2, 0);
        mesh.userData = {kind:'ring', index:i, info:`Ring ${i+1}: Ø${(r*2).toFixed(3)}m`+(isConfirmed?'  [confirmed]':'  [interpolated]')+(exceeds?'  [exceeds room width here]':'')+`  — ${openingsDeg.length} opening(s)`};
        ringGroup.add(mesh);
        if(ringGroup.visible) raycastTargets.push(mesh);

        [0.02, h].forEach(y=>{
          const pts=[]; const steps=32;
          for(let s=0;s<=steps;s++){ const a=thetaStart+thetaLength*(s/steps); pts.push(new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a))); }
          ringGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({color:col, transparent:true, opacity:isConfirmed?0.9:0.5})));
        });
      });

      openingsDeg.forEach(openCenter=>{
        const gapStart = deg2rad(openCenter - gapDeg/2), gapEnd = deg2rad(openCenter + gapDeg/2);
        [0.02, h].forEach(y=>{
          const pts=[]; const steps=10;
          for(let s=0;s<=steps;s++){ const a=gapStart+(gapEnd-gapStart)*(s/steps); pts.push(new THREE.Vector3(r*Math.cos(a),y,r*Math.sin(a))); }
          const dotGeo = new THREE.BufferGeometry().setFromPoints(pts);
          const dotLine = new THREE.Line(dotGeo, new THREE.LineDashedMaterial({color:0xe7e9ec, dashSize:0.08, gapSize:0.06}));
          dotLine.computeLineDistances();
          ringGroup.add(dotLine);
        });
        [gapStart, gapEnd].forEach(a=>{
          const postMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.025,0.025,h,8), new THREE.MeshStandardMaterial({color:0x9aa4b0, emissive:0x22262c}));
          postMesh.position.set(r*Math.cos(a), h/2, r*Math.sin(a));
          ringGroup.add(postMesh);
        });
      });
      gCurtain.add(ringGroup);
    });

    gCurtain.position.set(circleCenter.x, 0, circleCenter.z);
    document.getElementById('ringCount').textContent = RING_RADII.length;
    buildScreen();
    buildCirculation();
  }

  function buildScreen(){
    gScreen.clear();
    raycastTargets = raycastTargets.filter(m=>m.userData.kind!=='screen');
    let idx = RING_RADII.findIndex(r=>Math.abs(r-3.267)<0.05);
    if(idx<0) idx = Math.min(7,RING_RADII.length-1);
    const r = RING_RADII[idx] + 0.04;
    const geo = new THREE.CylinderGeometry(r, r, 2.0, 24, 1, true, 0, Math.PI*0.45);
    const mat = new THREE.MeshStandardMaterial({color:0xe0c341, roughness:0.6, transparent:true, opacity:0.55, side:THREE.DoubleSide});
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(circleCenter.x, 1.0, circleCenter.z);
    mesh.rotation.y = Math.PI*0.15;
    mesh.userData = {kind:'screen', index:0, info:'Projection screen (on Ø6.533m ring)'};
    gScreen.add(mesh);
    raycastTargets.push(mesh);
  }

  let beamMesh, glowLight, baseGlowMesh;
  function buildRig(){
    gRig.clear();
    const sensorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.28,0.14,0.28), new THREE.MeshStandardMaterial({color:0xe7e9ec, roughness:0.4, metalness:0.4}));
    sensorMesh.position.set(0, WALL_H-0.15, 0);
    sensorMesh.userData = {kind:'rig', index:0, info:'Overhead mmWave sensor'};
    gRig.add(sensorMesh);
    raycastTargets = raycastTargets.filter(m=>m.userData.kind!=='rig');
    raycastTargets.push(sensorMesh);

    const dashPts=[]; for(let t=0;t<=1;t+=0.06) dashPts.push(new THREE.Vector3(0, THREE.MathUtils.lerp(WALL_H-0.15,0.1,t), 0));
    gRig.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(dashPts), new THREE.PointsMaterial({color:0xe7e9ec, size:0.035})));

    const beamGeo = new THREE.CylinderGeometry(0.05, 0.05, WALL_H-0.2, 20, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({color:0xff3b30, transparent:true, opacity:0.85, blending:THREE.AdditiveBlending, side:THREE.DoubleSide, depthWrite:false, depthTest:false});
    beamMesh = new THREE.Mesh(beamGeo, beamMat);
    beamMesh.position.set(0, (WALL_H-0.2)/2 + 0.06, 0);
    beamMesh.renderOrder = 999; // draw after everything else so it reads through translucent curtains
    gRig.add(beamMesh);

    baseGlowMesh = new THREE.Mesh(new THREE.SphereGeometry(0.13,16,16), new THREE.MeshBasicMaterial({color:0xff3b30, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending, depthWrite:false, depthTest:false}));
    baseGlowMesh.position.set(0,0.06,0);
    baseGlowMesh.renderOrder = 999;
    gRig.add(baseGlowMesh);

    glowLight = new THREE.PointLight(0xff3b30, 1.6, 8, 2);
    glowLight.position.set(0,0.3,0);
    gRig.add(glowLight);

    gRig.position.set(circleCenter.x, 0, circleCenter.z);
  }

  const occReadout = document.getElementById('occReadout');
  function updateOccupancyUI(count) {
    occReadout.textContent = count;
  }

  const peopleManager = createPeopleManager({
    gPeople,
    getCircleCenter: () => circleCenter,
    circD: CIRC_D,
    getRaycastTargets: () => raycastTargets,
    setRaycastTargets: (next) => { raycastTargets = next; },
    updateOccupancyUI,
  });

  document.getElementById('clearPeople').addEventListener('click', () => {
    peopleManager.clearAllPeople();
  });
  document.getElementById('setOccupancy').addEventListener('click', () => {
    const targetN = parseInt(document.getElementById('occTarget').value, 10) || 0;
    peopleManager.setOccupancy(targetN);
  });

  loadHumanoidTemplate()
    .then((template) => { peopleManager.setTemplate(template); })
    .catch((err) => {
      console.error('Humanoid model load failed:', err);
      const subtitle = document.querySelector('#title p');
      if (subtitle) subtitle.textContent += ' · 3D people unavailable (model load failed)';
    });

  function buildBox(){
    gBox.clear();
    raycastTargets = raycastTargets.filter(m=>m.userData.kind!=='box');
    const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6,2.4,0.35), new THREE.MeshStandardMaterial({color:0x9b59b6, emissive:0x3a1f45, roughness:0.5}));
    boxMesh.position.set(boxPos.x, boxPos.y, 1.4);
    boxMesh.userData = {kind:'box', index:0, info:'Background lighting box'};
    gBox.add(boxMesh);
    raycastTargets.push(boxMesh);
  }

  const sprinklerMat = new THREE.MeshStandardMaterial({color:0xff4d4d, emissive:0x660000});
  [3.2,8.4,13.6,18.8].forEach(z=>{
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.06,12,12), sprinklerMat);
    s.position.set(farHalf-0.15, WALL_H-0.1, z);
    gFixtures.add(s);
  });
  const exitMesh = new THREE.Mesh(new THREE.BoxGeometry(1.1,2.1,0.08), new THREE.MeshStandardMaterial({color:0xff4d4d, transparent:true, opacity:0.5}));
  exitMesh.position.set(farHalf*0.6, 1.05, 0.02);
  gFixtures.add(exitMesh);

  const grid = new THREE.GridHelper(60,60,0x333944,0x21262c); grid.position.y=0.005; gGrid.add(grid); gGrid.visible=false;

  function computeMazeRoutePolar(){
    // Traces the actual walkable route: through each ring's opening (radial step),
    // then along the corridor between that ring and the next one inward (angular arc)
    // to line up with the next ring's opening, repeating in to the center. This is what
    // gives the walkthrough real turns instead of cutting straight through the fabric.
    // Starts AT the outermost ring's opening (not beyond it) so the route never begins
    // outside the room — every point gets clamped to the room boundary in polarToWorld too.
    const n = RING_RADII.length;
    const pts = [];
    for(let i=n-1;i>=0;i--){
      const aHere = deg2rad((OPENINGS[i]||[0])[0]);
      pts.push({r:RING_RADII[i]+0.15, a:aHere});
      pts.push({r:RING_RADII[i]-0.15, a:aHere});
      const hasInner = i>0;
      const nextA = hasInner ? deg2rad((OPENINGS[i-1]||[0])[0]) : aHere;
      const corridorR = hasInner ? (RING_RADII[i]+RING_RADII[i-1])/2 : RING_RADII[i]*0.4;
      let da = nextA - aHere;
      while(da > Math.PI) da -= Math.PI*2;
      while(da < -Math.PI) da += Math.PI*2;
      const steps = 6;
      for(let s=1;s<=steps;s++) pts.push({r:corridorR, a:aHere + da*(s/steps)});
    }
    pts.push({r:0, a:0});
    return pts;
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
    return polarToWorld(computeMazeRoutePolar(), 0.06);
  }
  function buildCirculation(){
    gCirculation.clear();
    if(circulationMode==='path'){
      const pts = computeCirculationPoints();
      const curve = new THREE.CatmullRomCurve3(pts);
      const tubeGeo = new THREE.TubeGeometry(curve, 160, 0.035, 6, false);
      gCirculation.add(new THREE.Mesh(tubeGeo, new THREE.MeshStandardMaterial({color:0x5be089, emissive:0x1a4d2e, emissiveIntensity:0.6})));
      for(let i=2;i<pts.length;i+=4){
        const dir = new THREE.Vector3().subVectors(pts[i], pts[i-1]).normalize();
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.09,0.22,10), new THREE.MeshStandardMaterial({color:0x5be089, emissive:0x1a4d2e}));
        arrow.position.copy(pts[i]).setY(0.1);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir);
        gCirculation.add(arrow);
      }
    } else {
      // Heatmap now marks each ring's opening specifically (not a dense continuous trail —
      // that was both visually noisy and a real performance cost, since ~140 separate
      // transparent additive-blended objects have to be depth-sorted every single frame).
      const n = RING_RADII.length;
      const openingPolar = [];
      for(let i=n-1;i>=0;i--){
        openingPolar.push({r:RING_RADII[i], a:deg2rad((OPENINGS[i]||[0])[0])});
      }
      openingPolar.push({r:0, a:0}); // center
      const pts = polarToWorld(openingPolar, 0.05);
      pts.forEach((p, idx)=>{
        const t = idx/(pts.length-1); // progress: 0 = outermost opening, 1 = center
        const color = new THREE.Color().setHSL(THREE.MathUtils.lerp(0.6,0.0,t), 0.9, 0.5);
        const blobGeo = new THREE.CircleGeometry(1.0, 20);
        blobGeo.rotateX(-Math.PI/2);
        const blobMat = new THREE.MeshBasicMaterial({color, transparent:true, opacity:0.35, blending:THREE.AdditiveBlending, depthWrite:false});
        const blob = new THREE.Mesh(blobGeo, blobMat);
        blob.position.set(p.x, 0.05, p.z);
        gCirculation.add(blob);
      });
    }
  }

  buildFloorCentral();
  buildRings();
  buildRig();
  buildBox();

  const layers = {room:gRoom, floor:gFloorCentral, curtain:gCurtain, circulation:gCirculation, screen:gScreen, rig:gRig, box:gBox, fixtures:gFixtures, grid:gGrid, ceilingLights:gCeilingLights};
  gCirculation.visible = false;
  document.querySelectorAll('[data-layer]').forEach(inp=>{
    inp.addEventListener('change', ()=>{ layers[inp.dataset.layer].visible = inp.checked; });
  });

  document.getElementById('clipToggle').addEventListener('change', e=>{
    clipToRoom = e.target.checked;
    applyClipping();
  });

  const ceilingModeBtn = document.getElementById('ceilingModeBtn');
  ceilingModeBtn.addEventListener('click', ()=>{
    ceilingPlacementMode = !ceilingPlacementMode;
    ceilingModeBtn.classList.toggle('active', ceilingPlacementMode);
    ceilingModeBtn.textContent = ceilingPlacementMode ? 'Click room to place (click here to stop)' : 'Add ceiling light';
  });

  const circPathBtn = document.getElementById('circPath'), circHeatBtn = document.getElementById('circHeat');
  circPathBtn.addEventListener('click', ()=>{ circulationMode='path'; circPathBtn.classList.add('active'); circHeatBtn.classList.remove('active'); buildCirculation(); });
  circHeatBtn.addEventListener('click', ()=>{ circulationMode='heat'; circHeatBtn.classList.add('active'); circPathBtn.classList.remove('active'); buildCirculation(); });

  const offX = document.getElementById('offX'), offZ = document.getElementById('offZ');
  function applyOffset(){
    circleCenter = new THREE.Vector3(parseFloat(offX.value)||0, 0, parseFloat(offZ.value)||0);
    buildFloorCentral();
    buildRings();
    buildRig();
    rebuildRingSliders();
  }
  offX.addEventListener('input', applyOffset);
  offZ.addEventListener('input', applyOffset);

  const boxXInp = document.getElementById('boxX'), boxYInp = document.getElementById('boxY');
  function applyBoxPos(){
    boxPos = {x:parseFloat(boxXInp.value)||0, y:parseFloat(boxYInp.value)||0};
    buildBox();
  }
  boxXInp.addEventListener('input', applyBoxPos);
  boxYInp.addEventListener('input', applyBoxPos);

  const doorXInp = document.getElementById('doorX'), doorZInp = document.getElementById('doorZ');
  doorXInp.addEventListener('input', ()=>{ doorPos.x = parseFloat(doorXInp.value)||0; });
  doorZInp.addEventListener('input', ()=>{ doorPos.z = parseFloat(doorZInp.value)||0; });

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
    baseAngles[n-1] = Math.round(bestAngle);
    for(let i=n-2;i>=0;i--){
      const next = baseAngles[i+1];
      baseAngles[i] = Math.round(nextWindingAngle(next));
    }
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
    if(!found){
      alert('No angle for the outermost ring\'s opening lands inside the room at its current radius — it may be too large for this room. Try a smaller "Growth /ring" value or move the central space closer to the door.');
    }
  });

  document.getElementById('genMaze').addEventListener('click', ()=>{
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
      baseAngles[i] = candidate !== null ? candidate : Math.round(nextWindingAngle(outerAngle));
    }
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
    if(!walking) beginWalkFlow();
  });

  const openPerRingInp = document.getElementById('openPerRing');
  const openSpacingInp = document.getElementById('openSpacing');
  function applyOpeningsConfig(){
    openingsPerRing = Math.max(1, parseInt(openPerRingInp.value,10)||1);
    openingSpacingDeg = Math.max(1, parseFloat(openSpacingInp.value)||40);
    regenerateAllOpenings();
    buildRings();
  }
  openPerRingInp.addEventListener('input', applyOpeningsConfig);
  openSpacingInp.addEventListener('input', applyOpeningsConfig);

  const ringControls = document.getElementById('ringControls');
  function rebuildRingSliders(){
    ringControls.innerHTML = '';
    const clearance = Math.min(circleCenter.x + halfWidthAtZ(circleCenter.z), halfWidthAtZ(circleCenter.z) - circleCenter.x);
    baseAngles.forEach((deg, i)=>{
      if(ringVisible[i] === undefined) ringVisible[i] = true;
      const row = document.createElement('div');
      row.className = 'ringrow' + (RING_RADII[i] > clearance ? ' warn' : '');
      row.id = 'ringrow-'+i;
      const isConfirmed = CONFIRMED_RADII.some(cr=>Math.abs(cr-RING_RADII[i])<0.01);
      row.innerHTML = `<button class="eyeBtn" title="Show/hide this ring">${ringVisible[i] ? '\u{1F441}' : '\u{1F576}'}</button>
        <span class="lab">Ring ${i+1}${isConfirmed?' *':''}</span>
        <input type="range" min="0" max="359" value="${deg}">
        <span class="deg">${deg}°</span>`;
      const eyeBtn = row.querySelector('.eyeBtn');
      const slider = row.querySelector('input'), label = row.querySelector('.deg');
      eyeBtn.addEventListener('click', ()=>{
        ringVisible[i] = !ringVisible[i];
        eyeBtn.textContent = ringVisible[i] ? '\u{1F441}' : '\u{1F576}';
        row.classList.toggle('hiddenRing', !ringVisible[i]);
        buildRings();
      });
      if(!ringVisible[i]) row.classList.add('hiddenRing');
      slider.addEventListener('input', ()=>{
        baseAngles[i] = parseInt(slider.value,10);
        label.textContent = baseAngles[i]+'°';
        regenerateAllOpenings();
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
    baseAngles.push(nextWindingAngle(lastAngle));
    ringVisible.push(true);
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
  });
  document.getElementById('removeRing').addEventListener('click', ()=>{
    if(RING_RADII.length<=1) return;
    RING_RADII.pop(); baseAngles.pop(); ringVisible.pop();
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
      baseAngles.push(nextWindingAngle(lastAngle));
      ringVisible.push(true);
    }
    regenerateAllOpenings();
    rebuildRingSliders();
    buildRings();
  });
  updateGapPreview();
  applyClipping();

  const target = new THREE.Vector3(0, 1.2, DEPTH*0.45);
  let radius=24, theta=Math.PI*0.28, phi=Math.PI*0.32;
  let dragging=false, panMode=false, lastX=0, lastY=0, downX=0, downY=0, moved=false;
  let walking = false;

  function computeWalkCurve(){
    const pts = polarToWorld(computeMazeRoutePolar(), 1.65);
    return new THREE.CatmullRomCurve3(pts);
  }
  let walkT = 0, walkCurve = null, walkRAF = null, walkOnStopCallback = null, walkCaptureCallback = null;
  let walkSpeedFrac = 1/28; // fraction of the route per second — recomputed per-walk from real route length

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
        const dt = (now-last)/1000; last = now;
        walkT = Math.min(1, walkT + dt*walkSpeedFrac);
        const pos = walkCurve.getPointAt(walkT);
        // look further ahead than the step size so turns are smooth rather than jittery,
        // and so the camera visibly rotates through each corridor turn like a person would
        const lookPos = walkCurve.getPointAt(Math.min(1, walkT + 0.012));
        camera.position.copy(pos);
        camera.lookAt(lookPos.x, pos.y, lookPos.z);
        renderer.render(scene, camera);
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
        const dt = (now-last)/1000; last = now;
        angle += dt * (Math.PI*2/ORBIT_PERIOD_SEC);
        camera.position.set(circleCenter.x + ORBIT_RADIUS*Math.cos(angle), ORBIT_HEIGHT, circleCenter.z + ORBIT_RADIUS*Math.sin(angle));
        camera.lookAt(circleCenter.x, 0.6, circleCenter.z);
        renderer.render(scene, camera);
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

  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2();
  let ceilingPlacementMode = false;
  function handleClick(e){
    mouseNDC.x = (e.clientX/W())*2-1;
    mouseNDC.y = -(e.clientY/H())*2+1;
    raycaster.setFromCamera(mouseNDC, camera);

    if(ceilingPlacementMode){
      // dedicated mode, checked FIRST and exclusively — with up to a dozen large ring
      // cylinders often filling the frame, a "only check ceiling if nothing else was hit"
      // fallback almost never actually triggers, since some ring is nearly always hit first
      const chits = raycaster.intersectObjects(ceilingRaycastTargets, false);
      if(chits.length){
        const k = chits[0].object.userData.kind;
        if(k==='ceilingLight') removeCeilingLight(chits[0].object);
        else addCeilingLight(chits[0].point);
      }
      return;
    }

    const hits = raycaster.intersectObjects(raycastTargets, false);
    if(!hits.length){ tooltip.style.display='none'; clearSelection(); return; }
    const hit = hits[0];
    let hitRoot = hit.object;
    while (hitRoot.parent && !hitRoot.userData.kind) hitRoot = hitRoot.parent;
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
    theta=Math.PI*0.28; phi=Math.PI*0.32; radius=24; target.set(0,1.2,DEPTH*0.45); updateCamera();
    btnOrbit.classList.add('active'); btnPlan.classList.remove('active');
  });
  btnPlan.addEventListener('click', ()=>{
    theta=0.0001; phi=0.02; radius=26; target.set(0,0,DEPTH*0.5); updateCamera();
    btnPlan.classList.add('active'); btnOrbit.classList.remove('active');
  });
  btnSave.addEventListener('click', ()=>{
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url; a.download = 'cortex_madarts_3d.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  });

  const btnWalk = document.getElementById('btnWalk');
  const btnGif = document.getElementById('btnGif');
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

  let gifWorkerBlobUrl = null;
  async function getGifWorkerUrl(){
    if(gifWorkerBlobUrl) return gifWorkerBlobUrl;
    const resp = await fetch('https://cdnjs.cloudflare.com/ajax/libs/gif.js/0.2.0/gif.worker.js');
    if(!resp.ok) throw new Error('worker fetch failed');
    const text = await resp.text();
    const blob = new Blob([text], {type:'application/javascript'});
    gifWorkerBlobUrl = URL.createObjectURL(blob);
    return gifWorkerBlobUrl;
  }

  // Recording is now completely independent of walk/orbit mode — it just grabs whatever the
  // main render loop draws each frame, whether that's manual mouse-orbit, the walkthrough,
  // the central-space spin, or plan view. No mode is started or stopped by this button.
  let gifRecording = false;
  let gifInstance = null, gifCaptureCanvas = null, gifCaptureCtx = null, gifLastCapture = -Infinity;
  function captureGifFrame(now){
    if(!gifRecording) return;
    if(now - gifLastCapture < 100) return; // ~10fps
    gifLastCapture = now;
    gifCaptureCtx.drawImage(renderer.domElement, 0, 0, gifCaptureCanvas.width, gifCaptureCanvas.height);
    gifInstance.addFrame(gifCaptureCtx, {copy:true, delay:100});
  }

  btnGif.addEventListener('click', async ()=>{
    if(gifRecording){
      gifRecording = false;
      btnGif.textContent = 'Encoding…'; btnGif.disabled = true;
      gifInstance.on('finished', (blob)=>{
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'cortex_madarts_recording.gif';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        btnGif.textContent = 'Record GIF'; btnGif.disabled = false;
      });
      gifInstance.render();
      return;
    }
    if(typeof GIF === 'undefined'){
      alert('The GIF encoder failed to load (network/CORS issue in this environment). Try "Save image" for a still frame, or screen-recording software instead.');
      return;
    }
    btnGif.textContent = 'Loading…'; btnGif.disabled = true;
    let workerUrl;
    try { workerUrl = await getGifWorkerUrl(); }
    catch(err){
      alert('Could not load the GIF encoder worker (network/CORS issue). Try "Save image" or screen-recording software instead.');
      btnGif.textContent = 'Record GIF'; btnGif.disabled = false;
      return;
    }
    const gw = Math.round(W()*0.45), gh = Math.round(H()*0.45);
    gifInstance = new GIF({workers:2, quality:12, workerScript:workerUrl, width:gw, height:gh});
    gifCaptureCanvas = document.createElement('canvas');
    gifCaptureCanvas.width = gw; gifCaptureCanvas.height = gh;
    gifCaptureCtx = gifCaptureCanvas.getContext('2d');
    gifLastCapture = -Infinity;
    gifRecording = true;
    btnGif.disabled = false;
    btnGif.textContent = 'Stop && save GIF';
  });

  window.addEventListener('resize', ()=>{
    camera.aspect=W()/H(); camera.updateProjectionMatrix(); renderer.setSize(W(),H());
  });

  (function animate(now){
    requestAnimationFrame(animate);
    const t = Date.now()*0.001;
    const occupancyFactor = Math.min(1, peopleManager.getPeopleCount() / MAX_PEOPLE_FOR_FULL_LIGHT);
    const minR = 0.045, maxR = 0.42;
    const baseRadius = THREE.MathUtils.lerp(minR, maxR, occupancyFactor);
    const pulseSpeed = 0.6 + occupancyFactor*1.4;
    const pulseAmount = 0.25 + occupancyFactor*0.15;
    const pulse = baseRadius * (1 + Math.sin(t*pulseSpeed)*pulseAmount);

    if(beamMesh) beamMesh.scale.set(pulse/0.05, 1, pulse/0.05);
    if(baseGlowMesh) baseGlowMesh.scale.setScalar(0.7 + occupancyFactor*1.1);
    if(glowLight) glowLight.intensity = (1.0 + occupancyFactor*1.6) + Math.sin(t*pulseSpeed)*0.35;

    renderer.render(scene, camera);
    // recording is hooked in here deliberately — this loop runs every frame regardless of
    // orbit/walk/central-space/plan-view mode, so this is genuinely "whatever's on screen"
    captureGifFrame(now || performance.now());
  })();
