import * as THREE from 'three';
import { computeMazeRoute, validateRoute } from './route.js';

/** Distinct hues for flow strands (golden-angle spacing) — bright for floor-plan readability. */
export function flowRouteColor(index) {
  const h = ((index * 137.508) % 360) / 360;
  return new THREE.Color().setHSL(h, 0.92, 0.58);
}

function norm360(d) {
  return ((d % 360) + 360) % 360;
}

function angularDist(aDeg, bDeg) {
  let d = Math.abs(norm360(aDeg) - norm360(bDeg));
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Door angles (degrees) on ring i that lie inside the room.
 * @param {object} cfg — same shape as computeMazeRoute
 * @param {number} ringIndex
 */
export function listUsableDoorsDeg(cfg, ringIndex) {
  const { ringRadii, openings, center, isInsideRoomXZ, trims } = cfg;
  const r = ringRadii[ringIndex];
  const authored = openings[ringIndex]?.length ? openings[ringIndex] : [0];
  const usable = [];
  const seen = new Set();
  for (const deg of authored) {
    const a = deg * Math.PI / 180;
    const wx = center.x + r * Math.cos(a);
    const wz = center.z + r * Math.sin(a);
    if (isInsideRoomXZ(wx, wz)) {
      const k = Math.round(norm360(deg));
      if (!seen.has(k)) { seen.add(k); usable.push(k); }
    }
  }
  if (!usable.length) {
    // trimmed free arc — sample mids like route.js
    const win = trims?.[ringIndex];
    if (win) {
      let span = ((win.end - win.start) % 360 + 360) % 360;
      if (span > 0 && span < 360) {
        const mid = norm360(win.end + (360 - span) / 2);
        usable.push(Math.round(mid));
      }
    }
    if (!usable.length) usable.push(Math.round(norm360(authored[0])));
  }
  usable.sort((a, b) => a - b);
  return usable;
}

/**
 * @typedef {{ doorsDeg: number[], turnShort: boolean[] }} FlowChoices
 * turnShort[j]: corridor from ring (j+1) → ring j when walking inward (j = 0..n-2)
 */

export function defaultFlowChoices(cfg, fromAngleDeg = 90) {
  const n = cfg.ringRadii.length;
  const doorsDeg = [];
  let prev = fromAngleDeg;
  for (let i = n - 1; i >= 0; i--) {
    const options = listUsableDoorsDeg(cfg, i);
    let best = options[0];
    let bestD = Infinity;
    for (const d of options) {
      const dist = angularDist(d, prev);
      if (dist < bestD) { bestD = dist; best = d; }
    }
    doorsDeg[i] = best;
    prev = best;
  }
  const turnShort = Array(Math.max(0, n - 1)).fill(true);
  return { doorsDeg, turnShort };
}

/**
 * Enumerate valid routes (door × left/right choices), capped.
 * @returns {{ id: number, choices: FlowChoices, route: object, color: THREE.Color }[]}
 */
export function enumerateFlowRoutes(cfg, { maxRoutes = 48, fromAngleDeg = 90 } = {}) {
  const n = cfg.ringRadii.length;
  if (n === 0) return [];

  const doorsPerRing = [];
  for (let i = 0; i < n; i++) doorsPerRing.push(listUsableDoorsDeg(cfg, i));

  const results = [];
  const doorsDeg = Array(n).fill(0);
  const turnShort = Array(Math.max(0, n - 1)).fill(true);
  const seenSigs = new Set();

  function tryPush() {
    if (results.length >= maxRoutes) return;
    const choices = { doorsDeg: [...doorsDeg], turnShort: [...turnShort] };
    const sig = choices.doorsDeg.join(',') + '|' + choices.turnShort.map(t => t ? 'S' : 'L').join('');
    if (seenSigs.has(sig)) return;
    seenSigs.add(sig);
    const route = computeMazeRoute(cfg, choices);
    const curve = new THREE.CatmullRomCurve3(route.toWorldPoints(1.65));
    const check = validateRoute(curve, route);
    if (!check.valid) return;
    results.push({
      id: results.length,
      choices,
      route,
      color: flowRouteColor(results.length),
      signature: choices.doorsDeg.join(',') + '|' + choices.turnShort.map(t => t ? 'S' : 'L').join(''),
    });
  }

  function assignTurns(ti) {
    if (ti >= n - 1) {
      tryPush();
      return;
    }
    if (results.length >= maxRoutes) return;
    for (const short of [true, false]) {
      turnShort[ti] = short;
      assignTurns(ti + 1);
      if (results.length >= maxRoutes) return;
    }
  }

  function assignDoors(ri) {
    if (results.length >= maxRoutes) return;
    if (ri < 0) {
      assignTurns(0);
      return;
    }
    for (const d of doorsPerRing[ri]) {
      doorsDeg[ri] = d;
      assignDoors(ri - 1);
      if (results.length >= maxRoutes) return;
    }
  }

  if (doorsPerRing.every(d => d.length <= 1)) {
    for (let i = 0; i < n; i++) doorsDeg[i] = doorsPerRing[i][0] ?? 0;
    assignTurns(0);
  } else {
    assignDoors(n - 1);
  }

  // Ensure at least the "closest door" default path is present
  if (!results.length) {
    const fallback = defaultFlowChoices(cfg, fromAngleDeg);
    const route = computeMazeRoute(cfg, fallback);
    results.push({
      id: 0,
      choices: fallback,
      route,
      color: flowRouteColor(0),
      signature: 'default',
    });
  }

  return results;
}

/** Waypoints at each ring crossing for junction markers (outer → inner). */
export function flowJunctions(cfg, choices) {
  const n = cfg.ringRadii.length;
  const { center, ringRadii } = cfg;
  const pts = [];
  for (let i = n - 1; i >= 0; i--) {
    const deg = choices.doorsDeg[i];
    const a = deg * Math.PI / 180;
    pts.push({
      ringIndex: i,
      ringNum: i + 1,
      angleDeg: deg,
      r: ringRadii[i],
      x: center.x + ringRadii[i] * Math.cos(a),
      z: center.z + ringRadii[i] * Math.sin(a),
      isDiversion: listUsableDoorsDeg(cfg, i).length > 1 || (i > 0 && corridorTurnLabel(cfg, choices, i) !== null),
    });
  }
  pts.push({ ringIndex: -1, ringNum: 0, r: 0, x: center.x, z: center.z, angleDeg: choices.doorsDeg[0], isDiversion: false, isCenter: true });
  return pts;
}

function corridorBlocked(cfg, ringIndex, aFrom, delta) {
  const { ringRadii, center, isInsideRoomXZ } = cfg;
  const rMinIn = ringIndex > 0 ? ringRadii[ringIndex - 1] + 0.15 : 0.2;
  const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 30)));
  let blocked = 0;
  for (let s = 1; s < steps; s++) {
    const a = aFrom + delta * (s / steps);
    const wx = center.x + rMinIn * Math.cos(a);
    const wz = center.z + rMinIn * Math.sin(a);
    if (!isInsideRoomXZ(wx, wz)) blocked++;
  }
  return steps > 1 ? blocked / (steps - 1) : 0;
}

function worldAt(cfg, r, aDeg) {
  const a = aDeg * Math.PI / 180;
  return {
    x: cfg.center.x + r * Math.cos(a),
    z: cfg.center.z + r * Math.sin(a),
  };
}

function pathInsideRoom(cfg, x1, z1, x2, z2, steps = 16) {
  // Endpoints may sit on the wall (entrance/exit); sample the interior span only.
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (!cfg.isInsideRoomXZ(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0.02)) return false;
  }
  return true;
}

/** Sample floor points for outer ring door → inner ring door (both turn directions when valid). */
function sampleCorridorEdge(cfg, ringIndex, fromDeg, toDeg, turnShort, floorY = 0.08) {
  const { ringRadii, center } = cfg;
  const rOut = ringRadii[ringIndex];
  const rIn = ringRadii[ringIndex - 1];
  const rMinIn = rIn + 0.15;
  const aFrom = fromDeg * Math.PI / 180;
  const aTo = toDeg * Math.PI / 180;
  let da = aTo - aFrom;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const alt = da - Math.sign(da || 1) * Math.PI * 2;
  const useDa = turnShort ? da : alt;
  if (Math.abs(useDa) < 0.02 && !turnShort) return null;
  if (corridorBlocked(cfg, ringIndex, aFrom, useDa) > 0.02) return null;

  const pts = [];
  const push = (r, aRad) => {
    pts.push(new THREE.Vector3(
      center.x + r * Math.cos(aRad),
      floorY,
      center.z + r * Math.sin(aRad),
    ));
  };
  push(rOut + 0.12, aFrom);
  push(rOut - 0.12, aFrom);
  const steps = Math.max(6, Math.ceil(Math.abs(useDa) / (Math.PI / 24)));
  for (let s = 1; s < steps; s++) push(rMinIn, aFrom + useDa * (s / steps));
  push(rIn + 0.12, aTo);
  return pts;
}

/**
 * Passage graph: one dot per usable opening, edges to every valid next-inner passage + center + exit.
 * @returns {{ nodes: object[], edges: object[], routes: object[] }}
 */
export function buildPassageGraph(cfg, { entrance, exit, floorY = 0.08, maxRoutes = 256 } = {}) {
  const { ringRadii, center } = cfg;
  const n = ringRadii.length;
  const nodeMap = new Map();
  const edges = [];
  const edgeSeen = new Set();

  const addNode = (node) => {
    if (!nodeMap.has(node.id)) nodeMap.set(node.id, node);
    return node.id;
  };
  const addEdge = (edge) => {
    const sig = `${edge.from}|${edge.to}|${edge.kind}|${edge.turnShort ?? ''}`;
    if (edgeSeen.has(sig)) return;
    edgeSeen.add(sig);
    edges.push(edge);
  };

  for (let i = 0; i < n; i++) {
    for (const deg of listUsableDoorsDeg(cfg, i)) {
      const w = worldAt(cfg, ringRadii[i], deg);
      addNode({
        id: `p${i}_${Math.round(deg)}`,
        kind: 'passage',
        ringIndex: i,
        ringNum: i + 1,
        angleDeg: deg,
        r: ringRadii[i],
        x: w.x,
        z: w.z,
      });
    }
  }

  addNode({ id: 'center', kind: 'center', ringIndex: -1, ringNum: 0, angleDeg: 0, r: 0, x: center.x, z: center.z });
  if (entrance) addNode({ id: 'entrance', kind: 'entrance', ringIndex: n, ringNum: n + 1, angleDeg: 0, r: 0, x: entrance.x, z: entrance.z });
  if (exit) addNode({ id: 'exit', kind: 'exit', ringIndex: -2, ringNum: -1, angleDeg: 0, r: 0, x: exit.x, z: exit.z });

  const passages = [...nodeMap.values()].filter(nd => nd.kind === 'passage');

  for (let i = 1; i < n; i++) {
    const outer = passages.filter(nd => nd.ringIndex === i);
    const inner = passages.filter(nd => nd.ringIndex === i - 1);
    for (const from of outer) {
      for (const to of inner) {
        for (const turnShort of [true, false]) {
          const points = sampleCorridorEdge(cfg, i, from.angleDeg, to.angleDeg, turnShort, floorY);
          if (!points || points.length < 2) continue;
          addEdge({
            id: `${from.id}->${to.id}:${turnShort ? 'S' : 'L'}`,
            from: from.id,
            to: to.id,
            kind: 'corridor',
            turnShort,
            ringFrom: i,
            ringTo: i - 1,
            points,
            color: flowRouteColor(edges.length),
          });
        }
      }
    }
  }

  for (const node of passages.filter(nd => nd.ringIndex === 0)) {
    const points = [
      new THREE.Vector3(node.x, floorY, node.z),
      new THREE.Vector3(center.x, floorY, center.z),
    ];
    addEdge({
      id: `${node.id}->center`,
      from: node.id,
      to: 'center',
      kind: 'radial',
      ringFrom: 0,
      ringTo: -1,
      points,
      color: flowRouteColor(edges.length),
    });
  }

  if (entrance) {
    for (const node of passages.filter(nd => nd.ringIndex === n - 1)) {
      if (!cfg.isInsideRoomXZ(node.x, node.z, 0.05)) continue;
      addEdge({
        id: `entrance->${node.id}`,
        from: 'entrance',
        to: node.id,
        kind: 'approach',
        ringFrom: n,
        ringTo: n - 1,
        points: [
          new THREE.Vector3(entrance.x, floorY, entrance.z),
          new THREE.Vector3(node.x, floorY, node.z),
        ],
        color: flowRouteColor(edges.length),
      });
    }
  }

  if (exit) {
    if (pathInsideRoom(cfg, center.x, center.z, exit.x, exit.z)) {
      addEdge({
        id: 'center->exit',
        from: 'center',
        to: 'exit',
        kind: 'egress',
        ringFrom: -1,
        ringTo: -2,
        points: [
          new THREE.Vector3(center.x, floorY, center.z),
          new THREE.Vector3(exit.x, floorY, exit.z),
        ],
        color: new THREE.Color(0xe8a735),
      });
    }
  }

  const nodes = [...nodeMap.values()];
  const routes = enumerateGraphRoutes(nodes, edges, { maxRoutes });

  return { nodes, edges, routes };
}

/** All complete paths entrance → center (exit is a single post-center guidance link). */
export function enumerateGraphRoutes(nodes, edges, { maxRoutes = 256 } = {}) {
  const adj = new Map();
  edges.forEach(e => {
    if (e.kind === 'egress') return; // guidance only — not part of inbound route enumeration
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e);
  });

  const routes = [];
  const seen = new Set();

  function dfs(nodeId, pathEdges, visited) {
    if (routes.length >= maxRoutes) return;
    if (nodeId === 'center') {
      const sig = pathEdges.map(e => e.id).join('>');
      if (seen.has(sig)) return;
      seen.add(sig);
      const points = [];
      pathEdges.forEach(e => {
        e.points.forEach((p, i) => {
          if (!points.length || points[points.length - 1].distanceToSquared(p) > 1e-4) points.push(p.clone());
          else if (i === e.points.length - 1) points[points.length - 1].copy(p);
        });
      });
      routes.push({
        id: routes.length,
        terminal: nodeId,
        edges: [...pathEdges],
        points,
        color: flowRouteColor(routes.length),
      });
      return;
    }
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    for (const e of adj.get(nodeId) || []) {
      pathEdges.push(e);
      dfs(e.to, pathEdges, visited);
      pathEdges.pop();
    }
    visited.delete(nodeId);
  }

  if (adj.has('entrance')) dfs('entrance', [], new Set());
  else {
    // No entrance node — start from every outermost passage
    const startIds = nodes.filter(n => n.kind === 'passage' && n.ringIndex === Math.max(...nodes.filter(x => x.kind === 'passage').map(x => x.ringIndex))).map(n => n.id);
    startIds.forEach(sid => dfs(sid, [], new Set()));
  }

  return routes;
}

/** Label for turn from ring i → i-1 (i >= 1). */
export function corridorTurnLabel(cfg, choices, ringIndex) {
  if (ringIndex <= 0) return null;
  const ti = ringIndex - 1;
  const aFrom = choices.doorsDeg[ringIndex] * Math.PI / 180;
  const aTo = choices.doorsDeg[ringIndex - 1] * Math.PI / 180;
  let da = aTo - aFrom;
  while (da > Math.PI) da -= Math.PI * 2;
  while (da < -Math.PI) da += Math.PI * 2;
  const short = choices.turnShort[ti];
  const blocked = corridorBlocked(cfg, ringIndex, aFrom, da);
  const altBlocked = corridorBlocked(cfg, ringIndex, aFrom, da - Math.sign(da || 1) * Math.PI * 2);
  if (Math.abs(da) < 0.05 && Math.abs(altBlocked - blocked) < 0.001) return null;
  return short ? 'short (left)' : 'long (right)';
}

/**
 * Split routes into colored segments by shared prefix (option → confluence).
 * @returns {{ routes: object[], segments: { routeIds: number[], points: THREE.Vector3[], color: THREE.Color }[] }}
 */
export function buildFlowSegments(routes, worldPointsAtY) {
  if (!routes.length) return { routes, segments: [] };

  // Prefix signature: decisions from outer ring inward
  function prefixSig(choices, depth) {
    const n = choices.doorsDeg.length;
    let s = '';
    for (let ri = n - 1; ri >= n - 1 - depth && ri >= 0; ri--) {
      s += `D${ri}:${choices.doorsDeg[ri]};`;
      if (ri > 0) s += `T${ri}:${choices.turnShort[ri - 1] ? 'S' : 'L'};`;
    }
    return s;
  }

  const segments = [];
  const n = routes[0].choices.doorsDeg.length;
  const maxDepth = n * 2;

  for (let depth = 0; depth <= maxDepth; depth++) {
    const groups = new Map();
    routes.forEach((fr) => {
      const sig = prefixSig(fr.choices, depth);
      if (!groups.has(sig)) groups.set(sig, []);
      groups.get(sig).push(fr.id);
    });
    groups.forEach((routeIds, sig) => {
      if (routeIds.length === 0) return;
      const fr = routes.find(r => r.id === routeIds[0]);
      const pts = worldPointsAtY(fr.route);
      if (pts.length < 2) return;
      // Approximate segment length by depth fraction
      const frac = Math.min(1, (depth + 1) / (n + 1));
      const endIdx = Math.max(2, Math.floor(pts.length * frac));
      segments.push({
        routeIds,
        depth,
        confluence: routeIds.length > 1,
        points: pts.slice(0, endIdx),
        color: fr.color.clone(),
        opacity: routeIds.length > 1 ? 0.35 : 0.85,
      });
    });
  }

  return { routes, segments };
}

export function routeToWavePoints(worldPts, { amp = 0.28, wavelength = 1.4, floorY = 0.06 } = {}) {
  if (worldPts.length < 2) return worldPts;
  const base = new THREE.CatmullRomCurve3(worldPts);
  const len = base.getLength();
  const N = Math.max(80, Math.round(len * 8));
  const out = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = base.getPointAt(u);
    const s = u * len;
    const taper = Math.min(1, Math.min(s, len - s) / 1.0);
    const lift = (Math.sin(s * Math.PI * 2 / wavelength) * 0.5 + 0.5) * amp * taper;
    out.push(new THREE.Vector3(p.x, floorY + lift, p.z));
  }
  return out;
}
