# Research: Central Light Realism & Maze Path Reliability

**Date**: 2026-08-08 | **Plan**: [plan.md](./plan.md)

## R1 — Renderer platform: WebGPU now or defer?

**Decision**: **Stay on WebGL (`WebGLRenderer`) for this feature. Defer WebGPU** to a dedicated future feature, per the constitution's Stage 1 → Stage 2 staging.

**Rationale**:

1. **Safari is currently broken under WebGPU.** Safari 26+ ships WebGPU, but Safari 26.4 (released 2026-03-23) regressed 3D rendering — WebGPU canvases render black on macOS 26.4 and iPadOS 26.4. Production projects (e.g., Rerun) have reverted Safari to WebGL by default until WebKit ships a fix. The shareable GitHub Pages demo (Constitution VI) cannot absorb a "black screen on Mac" risk.
2. **Three.js's own guidance** (r172 manual): `WebGPURenderer` is "still in an experimental state", and `WebGLRenderer` remains "the recommended choice for pure WebGL 2 applications". The automatic WebGL2 fallback only triggers when WebGPU is *unavailable* — it would NOT protect Safari 26.4 users, whose browsers report WebGPU support and then render black.
3. **Everything this feature needs is proven on WebGL**: `UnrealBloomPass` bloom, PCF soft shadow maps, physical light decay. The constitution's Stage 1 explicitly lists "EffectComposer bloom on the pulsing central light" as WebGL-stage work.
4. **Curtain textures are NOT blocked by WebGL.** PBR texture maps (color/normal/roughness) on `MeshStandardMaterial`/`MeshPhysicalMaterial` are fully supported. WebGPU only becomes necessary for TSL node materials, compute-driven effects (e.g., GPU cloth), or scene complexity WebGL cannot sustain.
5. **GIF capture risk**: the recorder does `drawImage(renderer.domElement)` and relies on `preserveDrawingBuffer`. Under `WebGPURenderer` the swap-chain semantics differ and this path is unvalidated. Migrating would require re-validating the most fragile subsystem (Constitution II) for zero visual payoff this feature.

**Re-evaluation criteria** (any of these triggers a dedicated WebGPU spec):

- Safari ships a fix for the 26.4 WebGPU regression and it reaches the demo audience's Safari versions.
- A concrete feature requires TSL node materials or compute shaders (e.g., cloth simulation on curtains, GPU particles).
- Frame budget is exhausted on WebGL at required visual quality.
- Three.js manual drops the "experimental" label / recommends `WebGPURenderer` for production 2D-canvas-capture workloads, and a prototype validates GIF capture + all four camera modes.

**Alternatives considered**:

- **Switch to `WebGPURenderer` now with `forceWebGL` on Safari** (the Rerun mitigation): workable, but adds a browser-sniffing code path, re-opens GIF-capture validation, and rewrites bloom to the node-based PostProcessing API — all cost, no visual gain over Stage 1 WebGL for this feature's goals.
- **Dual renderer builds**: rejected as over-engineering for a demo site.

## R2 — Central light glow (bloom)

**Decision**: `EffectComposer` + `RenderPass` + `UnrealBloomPass` + `OutputPass`, threshold-tuned so only bright emissive surfaces bloom (the scene is dark; the beam, base glow, and ceiling-fixture emissives are the only high-luminance sources). Bloom strength modulated by the existing occupancy pulse factor.

**Rationale**: Well-proven WebGL path; fixed full-screen cost regardless of scene object count (Constitution V); no per-object material changes needed. Threshold-based bloom avoids the complexity of layer-based selective bloom — acceptable because the dark scene gives natural separation.

**Alternatives considered**: layer-based selective bloom (two-pass render — only if threshold bleeds onto bright UI-adjacent surfaces); sprite-only fake glow (no true halo over geometry edges — rejected as primary, kept as cheap *addition* for the base glow).

**Render-loop integration (Constitution II)**: introduce one `renderFrame()` used by the main loop, `startWalk`, `startCentralOrbit`, and the save-image button. It calls `composer.render()` then `labelRenderer.render()`, and the GIF `captureGifFrame()` hook stays in the main loop reading the same visible canvas. `composer.setSize` joins the existing resize handler.

## R3 — Central light illumination & shadows

**Decision**:

- Keep the existing `PointLight` as the physical illuminant; set `decay = 2` (physical falloff), raise it to ~1.6 m (mid-beam), increase range to cover the central floor and first rings.
- `renderer.shadowMap.enabled = true`, `PCFSoftShadowMap`. **Only the central PointLight casts shadows** (1024px cube map, `shadow.camera.far ≈ 10 m`). Key/rim directional lights remain shadowless.
- People meshes: `castShadow = true`, `receiveShadow = true` (one traverse in `modelLoader.js` at load). Floor and ring fabric: `receiveShadow = true`.
- Beam visual: replace flat-opacity cylinder material with a radial-gradient (soft-edge) additive material so the beam reads volumetric; add a small additive glow sprite at the base (existing base glow mesh upgraded).

**Rationale**: One shadow-casting point light is the entire shadow budget — with 60 skinned people this is the difference between 30+ fps and single digits. Physical decay makes nearby people visibly brighter than far ones, which is most of perceived "realism" here.

**Alternatives considered**: `RectAreaLight` (no shadows, wrong shape for a beam); multiple shadow lights (blows the budget); baked AO only (static, ignores the pulse).

## R4 — Maze route defects & fixes

Observed root causes in `computeMazeRoutePolar()` / `startWalk` (current `main.js`):

| # | Defect | Fix |
|---|--------|-----|
| 1 | **Spline overshoot through fabric**: Catmull-Rom smoothing bulges outward/inward at the sharp radial-pass-then-arc corners near each opening, cutting through curtain fabric adjacent to the gap. | Add radial **guard points** just before/after each opening pass (aligned at the opening angle, at corridor radii), so the spline's tangent is radial through the gap. Round corridor corners with more intermediate arc samples. |
| 2 | **Corridor arcs clamped through fabric**: for rings larger than the room, corridor midpoints fall outside; `clampPointToRoom` snaps them to the wall, and the straightened segment can cross the fabric of the outer ring. | Clamp **in polar space per angle sample**: if a corridor sample at radius `r_mid` is outside the room, reduce its radius (toward the inner ring + margin) until inside. The corridor between rings gives room to shrink; never hand a wall-clamped shortcut to the spline. |
| 3 | **Degenerate final segment**: when `i === 0`, six identical points are pushed (`da = 0`), then the center — duplicate control points break centripetal Catmull-Rom parameterization (NaN/jerk risk at the end of the walk). | Deduplicate consecutive points (epsilon) before building the curve; replace the inner spiral-in with 2–3 distinct points from ring-0 opening to center. |
| 4 | **Opening angles resolving outside the room**: `genMaze`/`autoOrient` check this, but manual per-ring sliders do not; the route then targets an unreachable opening. | Route computation picks, per ring, the **first opening whose world position is inside the room** (falling back to the nearest valid angle); slider UI unchanged (scope discipline) but route is always valid. |
| 5 | **No validation**: nothing verifies the generated route. | Add `validateRoute(curve)`: sample N points; assert inside-room and angular clearance from fabric arcs at each ring radius (± fabric tolerance). `genMaze` retries (bounded) on validation failure. Exposed for the headless test script. |

**Decision**: Extract route logic to `src/maze/route.js` as pure functions of `(RING_RADII, OPENINGS, gapDeg, circleCenter, roomBoundary)` and implement fixes 1–5 there. The circulation path drawing and the walkthrough consume the same computed route (FR-006 by construction).

**Alternatives considered**: replacing Catmull-Rom with per-corner Bézier fillets (cleaner math, bigger rewrite — revisit only if guard points prove insufficient); navmesh/pathfinding (massive overkill for concentric rings).

## R5 — Validation tooling

**Decision**: Headless Playwright script (dev-time, `.tmp/` or `scripts/`, not shipped): loads the page, clicks "Generate new maze" 10×, calls the exposed `validateRoute` result per run, asserts 10/10 valid (SC-001); reads `performance.now()`-based fps probe at occupancy 6 and 60 (SC-004); triggers a short GIF recording per camera mode and asserts a non-empty blob (SC-006). Manual cross-browser pass for SC-005.
