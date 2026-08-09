# Research: Screen Regrouping, Real Dimensions & Projection Study

**Feature**: 003-screen-real-dimensions  
**Date**: 2026-08-09  
**Source drawing**: `public/floorplan2.svg` (matches the SVG the user pasted; includes st8 screen arcs, st9 dashed rings, st6 technical)

Analysis script: `.tmp/fit-floorplan2.mjs` (class-aware fit of screen, fabric, dashed rings, walls, niches, ducts).

---

## R1 — Scale anchor

**Decision**: Use the mean of the two dimension-line scales from labels **"Ø4.800"** and **"4.695"**: **29.928 svg units / metre**.

**Rationale**: The two independent straight dimension lines agree within 0.1% (29.915 vs 29.941). That is stronger evidence than circle-fitting a hand-drawn arc and assigning a label to it.

**Alternatives considered**:

| Hypothesis | Result | Rejected because |
|------------|--------|------------------|
| Innermost circle = Ø6.533 (current model) | Scale ≈22.3 u/m → room ≈13.6×30.0 m; dim lines read as ~6.4 m | Contradicts both printed labels on those lines |
| Screen fit diameter alone = Ø4.800 | Scale ≈30.38 u/m | Ignores the 4.695 face label and the tip-to-tip dim lines |

**Derived room (inner faces)**: 10.12 × 22.34 m ≈ **226 m²** (current model ≈418 m² — ~36% linear oversize).

---

## R2 — Innermost circle is the screen

**Decision**: Model the two `st8` arcs as the **projection screen** (outer Ø4.800 m, projection face Ø4.695 m). Do **not** put this circle in `PLAN_RINGS` / curtain fabric.

**Evidence**:

- Two arcs, same center ≈(262.21, 308.18) svg, r≈72.88 u.
- Angular coverage ≈ **227°** (main) + **73°** (rear), with two entry gaps.
- Dimension line A spans the Ø4.800 label across this circle; line B spans 4.695 (projection face / inner edge of the screen construction).
- First curtain cluster sits at **r = 3.267 m (Ø6.533)** — matches the Ø6.533 leader, not the innermost circle.

**Note**: At the dim-line mean scale, a pure geometric fit of the st8 path yields Ø≈4.87 m (~1.5% over label). Prefer **labeled** Ø4.800 / 4.695 for reported "real dimensions"; use fitted center for placement. Document the 1.5% drawing wobble (Constitution VII).

**Current bug**: `buildScreen()` hangs a single ~81° arc on the Ø6.533 curtain ring and treats Ø4.8 as the central floor only. Grouping is wrong.

---

## R3 — Curtain rings at corrected scale

**Decision**: Re-derive `PLAN_RINGS` from floorplan2 clusters at 29.928 u/m; merge wobble pairs (solid+dashed of the same ring); keep full-room coverage default for outer dashed radii (same product rule as today).

**Confirmed**: Ring 1 = **Ø6.533 m (r=3.267)**.

**Door angles**: Recompute from solid-arc gaps per merged cluster (same approach as `fit-floorplan.mjs` / current `PLAN_RINGS`), not copy of old oversized angles without re-fit.

**Ring-field center**: ≈6.69 m from booth (near) wall, ≈0.08 m off room centerline → world ≈ `{ x: 0.08, z: 6.69 }` after svg→world mapping.

**Screen center**: Slightly offset from ring center (~0.07 m x, ~−0.19 m z in metres). **Decision**: Place screen at its own fitted center; curtains stay on ring-field center (matches drawing).

---

## R4 — Projection surface & projector count

**Decision**: Recommend **two edge-blended projectors** for one continuous image on the **227° main arc**. Optionally note a third only if the rear 73° arc must also carry content (out of default scope — default study targets the main arc as "the screen").

**Formulas** (projection face R = 4.695/2 = 2.3475 m; editable height H, default 2.4 m):

| Metric | Formula | Value (H=2.4 m) |
|--------|---------|-----------------|
| Main arc length | R · θ | 2.3475 · 227π/180 ≈ **9.30 m** |
| Rear arc length | R · 73π/180 | ≈ **2.99 m** |
| Main surface area | arcLen · H | ≈ **22.3 m²** |
| Chord (main) | 2 R sin(θ/2) | ≈ **4.32 m** |
| Sagitta (main) | R (1 − cos(θ/2)) | ≈ **1.65 m** |
| Curvature | 1/R | ≈ **0.426 m⁻¹** |

**Optics assumption** (commodity ultra-short-throw): throw ratio ≈0.25:1 → horizontal FOV ≈ **127°**. With ~10% blend reserve, one projector covers ≤ ~115° of screen angle — **insufficient for 227°**. Two projectors with ~8–10° overlap cover ≈ 2×115° − 9° ≈ 221° ≈ main arc.

**Alternatives considered**:

- One projector + fish-eye / mirror: possible in specialty installs but not "one commodity projector on a single screen" — reject for the default recommendation.
- Three projectors (main+rear): only if rear arc is content-bearing; default = two on main arc.

**3D viz**: Two projector models aimed at main-arc left/right thirds; faint blend band on the screen mesh or as a translucent plane marker.

---

## R5 — Technical / ventilation layer

**Decision**: Build from **vector** `st6` (and related) elements only:

| Element | Count / size (metres) |
|---------|------------------------|
| Wall thickness | 0.20 m |
| Entrance opening | 2.52 m (far wall, right) |
| Booth (near-right) | 1.17 × 1.64 m |
| Left-wall niches | 4 × (0.35 m tall × 0.08 m deep) |
| Right-wall ducts/sprinklers | 4 × Ø0.31 m |

**Rationale**: SVG references `content-1.png` / `content-2.png` (raster MEP underlays) but those files are **not in the repo**. Shipping without them; panel notes "vector technical layer — raster MEP underlay not bundled".

**Dashed st9 concentric marks** are curtain/open-space rings (already in ring model), **not** a separate HVAC layer — do not double-draw them as "ventilation".

---

## R6 — Live floorplan underlay

**Decision**: Point `FLOORPLAN_SVG.url` at `/floorplan2.svg` with recalibrated `unitsPerMeter`, `center`, `roomMidX`, `roomTopY`, `panelViewBox`. Keep `floorplan.svg` in `public/` for archive.

**Mapping**: unchanged convention (svg y down → world +z from near wall; x from room mid).

---

## R7 — What must not break

**Decision**: Treat as hard regression gates (see quickstart):

1. Maze `validateRoute` 10/10 + clean walk stop  
2. Cylinder angle conversion for fabric **and** screen  
3. `renderFrame` + video capture  
4. Per-ring door/trim UI (ring indices = curtains only)  
5. People placement on central floor  
6. X-panel download SVG still works  

No maze algorithm rewrite in this feature unless validation fails after scale change — then minimal trim/clearance tweak only.
