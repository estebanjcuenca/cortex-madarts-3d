<!--
Sync Impact Report
- Version change: 1.0.0 → 1.1.0
- Modified principles: None
- Added sections: Future Direction (WebGPU, materials, lighting roadmap)
- Removed sections: None
- Follow-up TODOs: None — future work requires dedicated /speckit-specify when ready
-->

# CORTEX — MadArts 3D Visualization Constitution

## Core Principles

### I. No Build Step by Default

The project MUST remain runnable as a static demo: open `index.html` in a browser
or serve the repo root with a simple HTTP server. No bundler, npm install, or compile
step is required for the shareable GitHub Pages deployment on `main`.

Introducing a build toolchain (e.g., Vite, webpack) is a **major architectural
decision**. It MUST be documented in the feature spec and plan, justified against
this principle in the Constitution Check, and approved before implementation. The
handoff notes in `index.html` explicitly flag this as a suggested future step — not
an assumed default.

### II. Render Loop Integrity

The main animation/render loop is shared infrastructure for orbit controls, all
camera modes, and GIF capture (`captureGifFrame()`). Any change to the render loop
MUST preserve the GIF recording hook so recording works in orbit, walk, central-orbit,
and plan views equally.

GIF recording depends on gif.js (CDN) and a cross-origin Worker loaded via a
fetch+Blob workaround (`getGifWorkerUrl()`). This path is fragile (network + CORS).
Changes MUST NOT break it; offline fallback beyond existing user-facing errors is out
of scope unless explicitly specced.

### III. Camera Mode Safety (NON-NEGOTIABLE)

Any new scripted camera animation loop (e.g., `startWalk`, `startCentralOrbit`, or
future modes) MUST wrap its per-frame step function in `try/catch` and ALWAYS call
the corresponding stop/reset function (e.g., `stopWalk()`) on failure.

**Rationale:** A real bug occurred when an error mid-loop left the `walking` flag
stuck `true`, permanently blocking orbit controls. This pattern is mandatory for all
new scripted camera modes — no exceptions.

### IV. Raycasting Correctness

Any new horizontal or click-interaction plane (floor pickers, ceiling placement,
etc.) MUST use `side: THREE.DoubleSide` on its material unless there is a documented,
tested reason not to.

**Rationale:** After `rotateX()`, a single-sided plane's front-face normal can point
away from the normal viewing camera angle. Raycasting silently drops back-face hits
on single-sided materials — this caused a real bug on the ceiling-light plane.

### V. Scene Object & Transparency Budget

The scene object count MUST be monitored when adding visual layers. Each ring already
spawns multiple meshes (fabric arcs, edge lines, dashed aperture markers, gate posts).
Transparent and additive materials are depth-sorted every frame.

**Rationale:** High object counts with transparency/additive blending caused a real
"stuck-feeling" orbit control complaint. New features MUST estimate added mesh count
and prefer instancing, merged geometry, or reduced segment counts before shipping.
Already-trimmed geometry (e.g., `CylinderGeometry` segment counts) MUST NOT be
regressed without performance justification.

### VI. Shareable Demo Stability

The public URL (`main` branch → GitHub Pages) is the stable, shareable reference.
Work-in-progress MUST land on feature branches (e.g., `dev`) and only merge to `main`
when ready to update the live demo. Breaking the shareable link for a demo audience
is unacceptable without explicit approval.

### VII. Geometry Fidelity Transparency

Room layout, ring geometry, walkthrough route, and maze generator are fit/approximated
from a cropped floor-plan image — not exact CAD. Confirmed dimensions (e.g., Ø6.533 m
outer ring, Ø1.541 m center marker) MUST be preserved; estimated values (room taper,
door position, ceiling height) MUST NOT be silently "corrected" without source data.
New geometry work MUST document what is confirmed vs. estimated.

## Technical Constraints

- **Runtime:** Modern browsers with WebGL; Three.js loaded via CDN script tags today.
- **Deployment:** Static files only on GitHub Pages — no server-side logic.
- **Assets:** External models/textures MUST use paths compatible with static hosting
  (relative URLs or CDN). Large assets MUST be justified for Page load time.
- **Module split:** `index.html` is a single ~1,300-line file. New features SHOULD
  move toward modular files when a build step is approved; until then, changes MUST
  stay localized and well-commented to avoid unmaintainable growth.
- **Input validation:** DOM-driven numeric inputs (ring count, spacing, occupancy)
  currently trust sane values — new or touched inputs SHOULD add guards when modified.

## Future Direction

**Stated project goal (owner intent):** Push visual fidelity toward advanced
materials, lighting, and eventually WebGPU — exploring the limits of what this
space can look like in the browser.

This is **not in scope** for current features (including 001-3d-humanoid-people).
It MUST be introduced via its own spec/plan when the time comes. Until then, treat
the following as the agreed staging order:

### Stage 1 — WebGL realism (near-term, before WebGPU)

Maximize quality within Three.js + WebGL on the shareable demo:

- **Materials:** PBR textures from reference photos (curtain fabric, floor, red
  light in situ) — handoff notes rate this highest impact per effort.
- **Lighting:** Real shadow maps, HDRI environment, `EffectComposer` bloom on the
  pulsing central light.
- **Geometry:** 3D assets (people, props) via GLTF; improved mesh fidelity where
  WebGL suffices.

Each upgrade MUST still pass Constitution Checks (render loop, perf budget, demo
stability). These are low-risk, well-supported Three.js paths.

### Stage 2 — WebGPU exploration (future, gated)

WebGPU is a **major platform bet**, not a drop-in realism toggle. Adopt only when:

1. A dedicated feature spec justifies the migration (e.g., advanced material nodes,
   compute-driven effects, or scene complexity WebGL cannot sustain at target fps).
2. **Browser support** is acceptable for the demo audience — especially Safari —
   which handoff notes flag as still inconsistent for shareable links.
3. A **fallback or parallel build** exists so `main` GitHub Pages demo does not
   break for WebGL-only users, OR the audience explicitly accepts a WebGPU-only demo.
4. GIF recording and orbit/walk camera modes are re-validated under the new renderer.

Likely path: Three.js WebGPU renderer (`WebGPURenderer`) or TSL node materials,
not a greenfield engine rewrite — unless cloth simulation or similar forces Unreal/Unity.

### Stage 3 — Push material & lighting limits (WebGPU-enabled)

Once Stage 2 gates pass, target advanced techniques as specced per feature:

- Node-based / procedural materials (fabric sheen, light falloff, emissive pulse)
- Higher-fidelity shadows and reflections
- Post-processing beyond basic bloom (careful with perf + GIF capture compatibility)

**Cloth simulation** on ring curtains remains a separate decision — handoff notes
point to Unreal/Unity only if that becomes a hard requirement, not WebGPU alone.

## Development Workflow

1. **Spec-driven:** Features start with `/speckit-specify` → `/speckit-plan` →
   `/speckit-tasks` → review → `/speckit-implement`. Constitution Check in each plan
   MUST pass or document justified violations.
2. **Branching:** `main` = public demo; `dev` (or feature branches) = active work.
3. **Documentation lookup:** Use Context7 MCP for version-specific library docs
   (Three.js, GLTFLoader, etc.) before implementing against external APIs.
4. **Review gate:** User approval required after tasks are generated and before
   `/speckit-implement` runs.

## Governance

This constitution supersedes ad-hoc implementation choices. Amendments require:

1. Update to `.specify/memory/constitution.md` with Sync Impact Report comment.
2. Semantic version bump: MAJOR for principle removal/redefinition; MINOR for new
   principles or material expansions; PATCH for clarifications only.
3. Constitution Check re-run on any in-flight feature plans affected by the change.

All feature plans MUST include a Constitution Check section. Violations MUST be
listed in Complexity Tracking with rationale — silent violations are not permitted.

Runtime handoff notes in the `index.html` comment block remain authoritative context
for known limitations and bug history; the constitution codifies the non-negotiable
rules derived from them.

**Version**: 1.1.0 | **Ratified**: 2026-08-08 | **Last Amended**: 2026-08-08
