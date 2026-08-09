<!--
Sync Impact Report
- Version change: 1.1.0 → 1.2.0
- Modified principles:
  - I. "No Build Step by Default" → "Static Deployment, Bundled Build" — records that Vite was
    adopted in feature 002 and is now the assumed toolchain. The protected outcome (a static,
    server-free GitHub Pages deployment) is unchanged; only the means changed.
  - II. "Render Loop Integrity" — the protected capture mechanism is now MediaRecorder via
    captureVideoFrame(); gif.js and captureGifFrame() no longer exist. The intent (capture must
    work in every camera mode) is unchanged and now enforced by the single renderFrame() entry
    point.
- Modified sections: Technical Constraints — runtime is bundled ES modules, not CDN script tags;
  the module-split constraint now points at feature 005 rather than treating a build step as
  hypothetical.
- Added sections: None
- Removed sections: None
- Rationale: Principles I and II described a codebase that no longer existed, so every
  Constitution Check since feature 002 has been evaluated against stale text. This amendment is
  documentation debt repayment, not a change of intent. Ratified as MINOR because it materially
  expands two principles without removing or redefining any.
- Follow-up TODOs:
  - specs/002-light-realism-maze-fix/research.md R1 gates WebGPU re-evaluation on GIF capture
    working; substitute the video capture path when that spec is written (see specs/BACKLOG.md B1).
-->

# CORTEX — MadArts 3D Visualization Constitution

## Core Principles

### I. Static Deployment, Bundled Build

The project MUST deploy as **static files only** — no server-side logic, no runtime
backend. That is the outcome this principle protects, and it is non-negotiable.

**Vite is the adopted toolchain** (introduced in feature 002). `npm install` and
`npm run build` are assumed; the build output is what ships to GitHub Pages on `main`.
The earlier "no bundler" requirement is superseded — it described the pre-002
single-file prototype.

Replacing or removing the build toolchain remains a **major architectural decision**:
it MUST be documented in the feature spec and plan, justified in the Constitution
Check, and approved before implementation. Adding a *runtime* dependency on a server,
database, or authenticated API is a violation of this principle, not merely a decision
to justify.

### II. Render Loop Integrity

The main animation/render loop is shared infrastructure for orbit controls, all camera
modes, still capture, and video recording (`captureVideoFrame()`). Any change to the
render loop MUST preserve the capture hook so recording works in orbit, walk,
central-orbit, and plan views equally.

**All frames MUST route through the single render entry point** (`renderFrame()`, and
its successor `stageContext.render()`), which draws through the `EffectComposer` and
the CSS2D label renderer. Calling `composer.render()` or `renderer.render()` directly
bypasses post-processing and labels, and silently breaks saved images and recordings.

Video recording uses `MediaRecorder` over an offscreen canvas fed by
`captureVideoFrame()`, which reads `renderer.domElement` each main-loop frame and
therefore depends on `preserveDrawingBuffer`. The earlier gif.js path
(`captureGifFrame()`, `getGifWorkerUrl()`, cross-origin Worker via fetch+Blob) has been
removed; references to it in feature 002's task list and research are historical.

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

- **Runtime:** Modern browsers with WebGL2. Three.js is an npm dependency bundled by
  Vite as ES modules — not CDN script tags.
- **Deployment:** Static build output on GitHub Pages — no server-side logic.
- **Assets:** External models/textures MUST use paths compatible with static hosting
  (relative URLs or CDN). Large assets MUST be justified for Page load time.
- **Module split:** `src/main.js` is the orchestrator and has grown past 1,800 lines.
  Feature 005 restructures it into documented domain components; until that lands, new
  domain logic SHOULD go into a module under `src/` rather than into `main.js`, and any
  change to `main.js` MUST stay localized and well-commented.
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
4. Video recording (`captureVideoFrame()` / `MediaRecorder`), still capture, and all
   camera modes are re-validated under the new renderer — WebGPU swap-chain semantics
   differ from `preserveDrawingBuffer`, so this path is the highest migration risk.

Likely path: Three.js WebGPU renderer (`WebGPURenderer`) or TSL node materials,
not a greenfield engine rewrite — unless cloth simulation or similar forces Unreal/Unity.

### Stage 3 — Push material & lighting limits (WebGPU-enabled)

Once Stage 2 gates pass, target advanced techniques as specced per feature:

- Node-based / procedural materials (fabric sheen, light falloff, emissive pulse)
- Higher-fidelity shadows and reflections
- Post-processing beyond basic bloom (careful with perf + video capture compatibility)

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

Runtime handoff notes in the `Index.html` comment block remain authoritative context
for known limitations and bug history; the constitution codifies the non-negotiable
rules derived from them.

**Version**: 1.2.0 | **Ratified**: 2026-08-08 | **Last Amended**: 2026-08-09
