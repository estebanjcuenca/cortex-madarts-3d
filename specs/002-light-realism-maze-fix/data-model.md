# Data Model: Central Light Realism & Maze Path Reliability

**Date**: 2026-08-08 | **Plan**: [plan.md](./plan.md)

All entities are in-memory runtime structures (static site, no persistence).

## MazeRoute

The single source of truth for both the walkthrough camera and the circulation path drawing.

| Field | Type | Description |
|-------|------|-------------|
| `polarPoints` | `{r: number, a: number}[]` | Ordered waypoints in polar coordinates around `circleCenter`, outermost opening → center. Deduplicated (no consecutive points within ε = 1 cm). |
| `worldPoints` | `Vector3[]` | `polarPoints` mapped to world space at a given height (0.06 m for path drawing, 1.65 m for camera), each guaranteed inside the room boundary. |
| `curve` | `CatmullRomCurve3` | Smoothed camera curve built from `worldPoints`. |

**Validation rules**:
- Every sampled curve point (N ≥ 200 samples) lies inside the room polygon (margin ≥ 0.05 m).
- At each ring radius crossing, the sample's angle is within that ring's opening span (opening angle ± gap/2, minus fabric tolerance 2°).
- Route visits rings strictly in order: ring n−1, n−2, …, 0, center.
- No NaN in any curve sample (guards defect #3).

**State transitions**: Recomputed whenever `RING_RADII`, `OPENINGS`, `gapWidthM`, or `circleCenter` change; never mutated in place during an active walkthrough (walk holds its own reference until `stopWalk`).

## RingOpening

| Field | Type | Description |
|-------|------|-------------|
| `ringIndex` | `int` | 0 = innermost. |
| `angleDeg` | `number` | 0–360, authored by sliders / genMaze / autoOrient. |
| `widthM` | `number` | Shared `gapWidthM`. |
| `insideRoom` | `boolean` | Derived: world position of `(radius, angle)` lies inside the room polygon. |

**Validation rules**: Route computation only targets openings with `insideRoom === true`; when a ring's first opening fails, the route falls back to the nearest valid opening angle for that ring (authored slider values remain untouched).

## CentralLightRig

Owned by `src/lighting/centralLight.js`; consumed by the render loop.

| Field | Type | Description |
|-------|------|-------------|
| `light` | `PointLight` | decay 2, castShadow true, 1024 shadow map, positioned mid-beam (~1.6 m). |
| `beamMesh` | `Mesh` | Soft-edge radial-gradient additive cylinder (replaces flat-opacity beam). |
| `baseGlow` | `Sprite/Mesh` | Additive glow at floor contact. |
| `pulse` | `{baseRadius, speed, amount}` | Derived from `occupancyFactor` — formulas preserved verbatim from current implementation. |

**API contract** (unchanged from today's behavior): `update(t, occupancyFactor)` sets beam scale, glow scale, light intensity, and bloom strength modulation each frame.

## RenderPipeline

| Field | Type | Description |
|-------|------|-------------|
| `composer` | `EffectComposer` | RenderPass → UnrealBloomPass → OutputPass. |
| `renderFrame()` | `function` | The ONLY render entry point for all camera modes; keeps `captureGifFrame()` reading the visible canvas (Constitution II). |

## RendererDecision (documentation artifact, not runtime)

Captured in [research.md R1](./research.md): decision = stay WebGL / defer WebGPU; rationale; four explicit re-evaluation triggers. Satisfies FR-013 / SC-007.
