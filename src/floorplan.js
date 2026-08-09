// Geometry from public/floorplan2.svg — architect export with labeled dimensions.
// Derivation: .tmp/fit-floorplan2.mjs + dim-line scale (research.md R1–R5).
// Scale = mean of tip-to-tip lines labeled "Ø4.800" and "4.695" → 29.928 svg units/m.
//
// Coordinate conventions:
//  - SVG y grows downward. Drawing TOP (booth) → world z = 0; BOTTOM (entrance) → +z.
//  - World x = (svgX - roomMidX) / scale; drawing-right = world +x.
//  - Plan angles carry 1:1 — 0° = +x, 90° = +z (toward entrance).

const S = 29.928;

export const FLOORPLAN_SVG = {
  url: '/floorplan2.svg',
  unitsPerMeter: S,
  // Ring-field center (fabric arcs). Screen has its own center — see SCREEN.
  center: { x: 260.09, y: 313.87 },
  roomMidX: (106.3 + 409.3) / 2, // 257.8
  roomTopY: 113.8,
  panelViewBox: '90 100 340 720',
};

export const ROOM_M = { width: 10.12, depth: 22.34 };

// Ring-field center: ≈0.08 m off centerline, 6.69 m from near (booth) wall.
export const CENTER_M = { x: 0.08, z: 6.69 };

// Projection screen — innermost drawn circle (st8). NOT a curtain ring.
// Labeled outer Ø4.800 / face Ø4.695; placement uses fitted center.
// Arcs normalized to positive CCW sweeps (path was drawn clockwise in the SVG).
export const SCREEN = {
  center: { x: 0.15, z: 6.49 },
  outerDiameter: 4.8,
  faceDiameter: 4.695,
  height: 2.4,
  // Only the large arc is projection surface. The small arc closing the circle is a
  // CURTAIN, not screen — it carries no image and is excluded from the projection study.
  arcs: [
    { startDeg: 157.6, sweepDeg: 227.0, role: 'screen' },
    { startDeg: 51.3, sweepDeg: 72.7, role: 'curtain' },
  ],
};

/** Arcs that are actual projection surface. */
export function screenArcs(screen = SCREEN) {
  return (screen.arcs || SCREEN.arcs).filter((a) => (a.role ?? 'screen') === 'screen');
}

/** Arcs on the screen circle that are fabric rather than projection surface. */
export function screenCurtainArcs(screen = SCREEN) {
  return (screen.arcs || SCREEN.arcs).filter((a) => a.role === 'curtain');
}

/** Pure projection study from SCREEN (or overrides). research.md R4 */
export function computeProjectionStudy(screen = SCREEN) {
  const R = (screen.faceDiameter ?? 4.695) / 2;
  const H = screen.height ?? 2.4;
  const projection = screenArcs(screen);
  const main = projection.reduce(
    (a, b) => (Math.abs(b.sweepDeg) > Math.abs(a.sweepDeg) ? b : a),
    projection[0],
  );
  const mainSweepDeg = Math.abs(main.sweepDeg);
  const mainSweepRad = (mainSweepDeg * Math.PI) / 180;
  const mainArcLength = R * mainSweepRad;
  const curtainSweepDeg = screenCurtainArcs(screen)
    .reduce((sum, a) => sum + Math.abs(a.sweepDeg), 0);
  const curtainArcLength = R * (curtainSweepDeg * Math.PI) / 180;
  const mainArea = mainArcLength * H;
  const chord = 2 * R * Math.sin(mainSweepRad / 2);
  const sagitta = R * (1 - Math.cos(mainSweepRad / 2));
  const maxSingleCoverageDeg = 127; // ~0.25:1 UST horizontal FOV
  const blendOverlapDeg = 9;
  const usablePerProjector = maxSingleCoverageDeg * 0.9; // reserve ~10% for blend
  const recommendedCount = Math.max(1, Math.ceil(mainSweepDeg / usablePerProjector));
  const verdict =
    recommendedCount <= 1
      ? 'One projector can cover the main arc with commodity ultra-short-throw optics.'
      : `One projector (~${maxSingleCoverageDeg}° FOV) cannot cover the ${mainSweepDeg.toFixed(0)}° main arc — use ${recommendedCount} edge-blended projectors for one continuous image` +
        (curtainSweepDeg > 0
          ? ` (the remaining ${curtainSweepDeg.toFixed(0)}° of the circle is curtain, not screen — no projector needed there).`
          : '.');
  return {
    faceRadius: R,
    height: H,
    mainSweepDeg,
    curtainSweepDeg,
    mainArcLength,
    curtainArcLength,
    mainArea,
    chord,
    sagitta,
    curvature: 1 / R,
    maxSingleCoverageDeg,
    blendOverlapDeg,
    recommendedCount,
    verdict,
  };
}

// Curtain rings only (screen excluded). Ring 1 confirmed Ø6.533. Wobble pairs merged.
// Outer dashed radii included so the default scene covers the full room (auto-trimmed).
export const PLAN_RINGS = [
  { r: 3.267, doors: [63, 126, 187, 246, 303, 2] },
  { r: 4.43, doors: [30, 90, 146, 210, 271] },
  { r: 5.175, doors: [69, 120, 182, 249, 337] },
  { r: 6.089, doors: [102, 187, 280] },
  { r: 7.34, doors: [90, 270] },
  { r: 8.189, doors: [94] },
  { r: 9.259, doors: [83] },
  { r: 10.577, doors: [90] },
  { r: 11.996, doors: [84] },
  { r: 14.025, doors: [95] },
];

// Entrance: far wall, right side, 2.52 m wide.
export const DOOR_M = { x: 3.8, z: 22.34, width: 2.52 };

// Background / booth massing along the near wall (right of center).
export const BOX_X_M = 4.48;

// Duct / sprinkler circles on the right wall (z from near wall).
export const SPRINKLER_Z_M = [7.2, 13.56, 16.65, 19.75];

// Vector technical / ventilation elements (raster content-*.png not bundled).
export const TECHNICAL = {
  wallThickness: 0.2,
  entrance: { x: 3.8, z: 22.34, width: 2.52 },
  booth: { x: 4.48, z: 0.82, width: 1.17, depth: 1.64 },
  niches: [
    { z: 4.63, width: 0.35, depth: 0.08 },
    { z: 9.33, width: 0.35, depth: 0.08 },
    { z: 13.96, width: 0.35, depth: 0.08 },
    { z: 18.68, width: 0.35, depth: 0.08 },
  ],
  ducts: [
    { z: 7.2, diameter: 0.31 },
    { z: 13.56, diameter: 0.31 },
    { z: 16.65, diameter: 0.31 },
    { z: 19.75, diameter: 0.31 },
  ],
};
