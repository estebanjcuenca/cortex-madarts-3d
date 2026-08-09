import * as THREE from 'three';

// Radial clearance either side of a ring when passing through its opening (estimate, not CAD).
const OPENING_MARGIN = 0.15;
// Extra radial guard distance so the spline's tangent through each gap stays radial.
const GUARD_OFFSET = 0.55;
// Consecutive world points closer than this are dropped — identical control points break
// centripetal Catmull-Rom parameterization (NaN tangents, jerks at the end of the walk).
const EPS_DEDUPE = 0.01;
// A curve sample this close to a ring radius counts as "crossing" that ring.
const RING_CROSS_TOL = 0.08;
// Angular safety inside the opening span when validating crossings.
const FABRIC_TOL_DEG = 2;

/** Angular span (degrees) covered by a fabric trim window {start, end} (CCW, may wrap). */
function windowSpan(win) {
  let span = ((win.end - win.start) % 360 + 360) % 360;
  if (span === 0) span = (win.end !== win.start || win.end >= 360) ? 360 : 0;
  return span;
}

/** Is fabric present at this angle (degrees)? expandDeg widens the window for safety. */
function fabricAtAngle(deg, win, expandDeg = 0) {
  if (!win) return true;
  const span = windowSpan(win);
  if (span >= 360) return true;
  if (span <= 0) return false;
  const rel = ((deg - (win.start - expandDeg)) % 360 + 360) % 360;
  return rel <= span + 2 * expandDeg;
}

/**
 * Panel-aware fabric test: rings loaded from the architect's floorplan carry an explicit
 * panel list [{s, e}] (degrees, e may exceed 360). Fabric exists only INSIDE a panel;
 * shrinkDeg narrows each panel so grazing a panel edge inside a wide drawn gap doesn't
 * count as contact.
 */
function fabricInPanels(deg, panels, shrinkDeg = 0) {
  return panels.some((p) => {
    const len = p.e - p.s - 2 * shrinkDeg;
    if (len <= 0) return false;
    const rel = ((deg - (p.s + shrinkDeg)) % 360 + 360) % 360;
    return rel <= len;
  });
}

/**
 * Compute the walkable maze route: through each ring's opening (radial pass), then along
 * the corridor between rings (angular arc) to line up with the next opening, repeating
 * inward to the center. Pure function — same output feeds both the circulation path
 * drawing and the walkthrough camera.
 *
 * @param {{
 *   ringRadii: number[],                       // index 0 = innermost
 *   openings: number[][],                      // per-ring opening angles (degrees)
 *   gapDeg: (r: number) => number,             // opening angular width at radius r
 *   center: {x: number, z: number},
 *   isInsideRoomXZ: (x: number, z: number, marginM?: number) => boolean,
 *   trims?: {start: number, end: number}[],    // per-ring fabric windows (degrees, CCW)
 *   panels?: ({s: number, e: number}[]|null)[],// per-ring explicit fabric panels (degrees)
 * }} cfg
 * @param {{ doorsDeg?: number[], turnShort?: boolean[] }|null} [flowChoices]
 *   doorsDeg[i] = chosen door on ring i (degrees). turnShort[j] = use shorter corridor
 *   from ring j+1 → j when walking inward (j = 0..n-2); false = long way around.
 */
export function computeMazeRoute(cfg, flowChoices = null) {
  const { ringRadii, openings, center, isInsideRoomXZ, trims } = cfg;
  const n = ringRadii.length;

  const worldAt = (r, a) => ({ x: center.x + r * Math.cos(a), z: center.z + r * Math.sin(a) });

  // Defect 4 fix + trim awareness: target the first authored door inside the room; if no
  // door is usable, pass through the trimmed-away (fabric-free) arc; else the nearest
  // inside-the-room angle. Authored slider values are never rewritten.
  function pickOpeningAngleRad(i) {
    const authored = openings[i]?.length ? openings[i] : [0];
    for (const deg of authored) {
      const a = deg * Math.PI / 180;
      const w = worldAt(ringRadii[i], a);
      if (isInsideRoomXZ(w.x, w.z)) return a;
    }
    // No usable door — if the curtain is trimmed, the fabric-free arc is open passage.
    const win = trims?.[i];
    if (win && windowSpan(win) < 360 && windowSpan(win) > 0) {
      const freeSpan = 360 - windowSpan(win);
      const mid = win.end + freeSpan / 2; // middle of the fabric-free arc
      for (let d = 0; d <= freeSpan / 2 - 2; d += 3) {
        for (const sign of [1, -1]) {
          const a = (mid + sign * d) * Math.PI / 180;
          const w = worldAt(ringRadii[i], a);
          if (isInsideRoomXZ(w.x, w.z)) return a;
        }
      }
    }
    const base = authored[0] * Math.PI / 180;
    for (let d = 2; d <= 180; d += 2) {
      for (const sign of [1, -1]) {
        const a = base + sign * d * Math.PI / 180;
        const w = worldAt(ringRadii[i], a);
        if (isInsideRoomXZ(w.x, w.z)) return a;
      }
    }
    return base; // ring lies entirely outside the room — keep the authored angle
  }

  // Defect 2 fix: clamp corridor samples radially (toward rMin) until inside the room —
  // never let a wall-clamped shortcut cut through the outer ring's fabric.
  function clampCorridorRadius(r, a, rMin) {
    let w = worldAt(r, a);
    if (isInsideRoomXZ(w.x, w.z)) return r;
    const steps = 24;
    for (let s = 1; s <= steps; s++) {
      const rr = r + (rMin - r) * (s / steps);
      w = worldAt(rr, a);
      if (isInsideRoomXZ(w.x, w.z)) return rr;
    }
    // Even rMin is outside — the ring field is pressed against a wall at this angle. The
    // fabric there is trimmed away (it can't exist outside the room), so the corridor may
    // legally cut further inward; validation is trim-aware and accepts the crossing.
    for (let s = 1; s <= 12; s++) {
      const rr = rMin * (1 - s / 12);
      w = worldAt(rr, a);
      if (isInsideRoomXZ(w.x, w.z)) return rr;
    }
    return rMin;
  }

  const chosenOpenings = [];
  if (flowChoices?.doorsDeg?.length === n) {
    for (let i = 0; i < n; i++) chosenOpenings[i] = flowChoices.doorsDeg[i] * Math.PI / 180;
  } else {
    for (let i = 0; i < n; i++) chosenOpenings[i] = pickOpeningAngleRad(i);
  }

  const pts = [];
  for (let i = n - 1; i >= 0; i--) {
    const a = chosenOpenings[i];
    const rI = ringRadii[i];
    const corrOut = i < n - 1 ? (ringRadii[i + 1] + rI) / 2 : rI + GUARD_OFFSET;
    const corrIn = i > 0 ? (rI + ringRadii[i - 1]) / 2 : rI * 0.4;
    const rMinIn = i > 0 ? ringRadii[i - 1] + OPENING_MARGIN : 0.2;

    // Defect 1 fix: radial guard points before and after the gap keep the spline's
    // tangent radial through the opening so smoothing cannot bulge into adjacent fabric.
    pts.push({ r: clampCorridorRadius(Math.min(corrOut, rI + GUARD_OFFSET), a, rI + OPENING_MARGIN), a });
    pts.push({ r: rI + OPENING_MARGIN, a });
    pts.push({ r: rI - OPENING_MARGIN, a });
    pts.push({ r: clampCorridorRadius(corrIn, a, rMinIn), a });

    if (i > 0) {
      const aNext = chosenOpenings[i - 1];
      let da = aNext - a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const blockedFrac = (delta) => {
        const steps = Math.max(8, Math.ceil(Math.abs(delta) / (Math.PI / 30)));
        let blocked = 0;
        for (let s = 1; s < steps; s++) {
          const w = worldAt(rMinIn, a + delta * (s / steps));
          if (!isInsideRoomXZ(w.x, w.z)) blocked++;
        }
        return steps > 1 ? blocked / (steps - 1) : 0;
      };
      const ti = i - 1; // corridor index: ring i → i-1
      const hasTurnPref = flowChoices?.turnShort && flowChoices.turnShort.length > ti;
      if (hasTurnPref && flowChoices.turnShort[ti] === false) {
        const alt = da - Math.sign(da || 1) * Math.PI * 2;
        if (blockedFrac(alt) <= 0.02) da = alt;
      } else if (blockedFrac(da) > 0.02) {
        const alt = da - Math.sign(da || 1) * Math.PI * 2;
        if (blockedFrac(alt) < blockedFrac(da)) da = alt;
      }
      const steps = Math.max(8, Math.ceil(Math.abs(da) / (Math.PI / 30))); // sample ≥ every 6° (limits spline bow past clamped samples)
      for (let s = 1; s < steps; s++) {
        const aa = a + da * (s / steps);
        pts.push({ r: clampCorridorRadius(corrIn, aa, rMinIn), a: aa });
      }
    }
  }
  // Defect 3 fix (part 1): the inner segment is two distinct points (corridor guard →
  // center), approached radially from ring 0's gap — no duplicated control points.
  pts.push({ r: 0, a: chosenOpenings[0] });

  return {
    cfg,
    flowChoices: flowChoices || null,
    chosenOpenings,
    polarPoints: pts,
    /** Map to world at height y. Defect 3 fix (part 2): dedupe consecutive points. */
    toWorldPoints(y) {
      const out = [];
      for (const p of pts) {
        const w = worldAt(p.r, p.a);
        const v = new THREE.Vector3(w.x, y, w.z);
        if (!out.length || out[out.length - 1].distanceToSquared(v) > EPS_DEDUPE * EPS_DEDUPE) {
          out.push(v);
        }
      }
      return out;
    },
  };
}

/**
 * Defect 5 fix: validate a smoothed route curve against the room and the curtain fabric.
 * Samples the curve densely and checks: finite coordinates, inside the room, and — at
 * every ring-radius crossing — angular containment within that ring's chosen opening.
 *
 * @param {THREE.CatmullRomCurve3} curve
 * @param {ReturnType<typeof computeMazeRoute>} route
 * @returns {{valid: boolean, issues: string[]}}
 */
export function validateRoute(curve, route) {
  const { ringRadii, gapDeg, center, isInsideRoomXZ, trims, panels } = route.cfg;
  const issues = [];
  const N = 240;
  for (let s = 0; s <= N; s++) {
    const t = s / N;
    const p = curve.getPointAt(t);
    if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) {
      issues.push(`non-finite sample at t=${t.toFixed(3)}`);
      continue;
    }
    if (!isInsideRoomXZ(p.x, p.z, 0.05)) {
      issues.push(`outside room at t=${t.toFixed(3)}`);
    }
    const dx = p.x - center.x, dz = p.z - center.z;
    const r = Math.hypot(dx, dz);
    const aDeg = ((Math.atan2(dz, dx) * 180 / Math.PI) % 360 + 360) % 360;
    for (let j = 0; j < ringRadii.length; j++) {
      if (Math.abs(r - ringRadii[j]) < RING_CROSS_TOL) {
        // Panel rings: fabric exists only inside the drawn panels — anywhere else on the
        // circle is genuinely open (the plan's dotted lines are open space).
        if (panels?.[j]) {
          if (fabricInPanels(aDeg, panels[j], FABRIC_TOL_DEG)) {
            issues.push(`fabric contact ring ${j + 1} at t=${t.toFixed(3)} (panel)`);
          }
          continue;
        }
        // No fabric at this angle (trimmed away) means free passage — no contact possible.
        if (!fabricAtAngle(aDeg, trims?.[j], FABRIC_TOL_DEG)) continue;
        const openDeg = ((route.chosenOpenings[j] * 180 / Math.PI) % 360 + 360) % 360;
        let dAng = Math.abs(aDeg - openDeg);
        if (dAng > 180) dAng = 360 - dAng;
        const allow = Math.max(1, gapDeg(ringRadii[j]) / 2 - FABRIC_TOL_DEG);
        if (dAng > allow) {
          issues.push(`fabric contact ring ${j + 1} at t=${t.toFixed(3)} (Δ${dAng.toFixed(1)}°)`);
        }
      }
    }
  }
  return { valid: issues.length === 0, issues };
}
