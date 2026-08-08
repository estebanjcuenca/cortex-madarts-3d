# Research: 3D Humanoid People

**Feature**: 001-3d-humanoid-people | **Date**: 2026-08-08

## R1: Build Tooling for GLTFLoader

**Decision**: Introduce Vite 6 with `three` npm package; entry `index.html` → `src/main.js`.

**Rationale**:
- `index.html` handoff notes recommend Vite + three.js npm as the path to GLTFLoader.
- `GLTFLoader` imports as ES module from `three/addons/loaders/GLTFLoader.js` (r160+).
- Vite outputs static `dist/` compatible with GitHub Pages (`base: './'` in config).
- Hot reload improves iteration on a file that is already 1,300+ lines.

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|------------------|
| CDN GLTFLoader standalone script | Version skew with Three.js core; no tree-shaking; fragile global namespace |
| Import maps only (no bundler) | Still need dev server for modules; no asset pipeline; harder Pages deploy |
| Keep sprites, fake 3D with billboards | Fails spec requirement for volumetric figures |

## R2: Humanoid Asset Selection

**Decision**: Use **Quaternius "Universal Base Characters"** or **KayKit Character Pack**
(CC0, low-poly, ~1–2k tris), single standing idle pose GLB exported without animation
requirement for v1.

**Rationale**:
- Free commercial use (CC0) safe for public GitHub demo.
- Low poly count supports 60 instances budget (Constitution V).
- Human proportions suitable for scale-based age bands (child 0.55–0.75×, teen 0.85–0.95×,
  adult 1.0× of base 1.7 m model).

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|------------------|
| Mixamo rigged characters | FBX pipeline heavier; animation unused in v1 |
| Procedural capsule humanoids | Fails "accurate proportions" / recognizable humanoid goal |
| Multiple full GLBs per build variant | Multiplies download size; scale + slight width scale suffices |

## R3: Age / Build Randomization Strategy

**Decision**: Port existing probability logic from `createPersonSprite()`:
- Age roll: 15% child, 10% teen, 75% adult → height scale ranges above.
- Build roll: 50% broader (scale X/Z × 1.08), 50% narrower (scale X/Z × 0.92).
- Optional: random HSL tint on mesh material (±10° hue) for visual diversity without
  extra geometry.

**Rationale**: Matches current behavior users expect; deterministic test via seeded
random optional later.

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|------------------|
| Separate GLB per age band | 3× asset load; scale achieves same effect |
| Skeleton bone scaling | Requires rigged model + skinning complexity for v1 |

## R4: Raycasting & Interaction Parity

**Decision**: Each person is a `THREE.Group` root with `userData.kind = 'person'`;
children meshes inherit raycast via group intersection. Replace `THREE.Sprite` entries
in `raycastTargets` with group roots. Keep `handleClick` logic: `kind==='person'` →
`removeDot`, `kind==='floor'` → `addDotAtPoint`.

**Rationale**: Minimal change to proven click routing (lines ~1162–1168 in current
`index.html`). Group root matches sprite's single raycast target pattern.

## R5: GitHub Pages Deployment with Vite

**Decision**: Add `npm run build`; deploy `dist/` to `main` via GitHub Actions workflow
(or manual build + push to `gh-pages` branch). Update README with build instructions.
Keep `dev` branch for source; merge triggers build.

**Rationale**: Constitution VI — `main` remains shareable URL but serves built static
assets. Source on `dev` uses Vite dev server locally.

**Alternatives considered**:
| Alternative | Rejected because |
|-------------|------------------|
| Commit `dist/` directly | Noisy diffs; Actions build is cleaner |
| Stay single-file, base64 embed GLB | Inflates HTML; poor caching |

## R6: Performance Mitigation

**Decision**:
- Load GLB once; `clone()` scene graph per person (Three.js `SkeletonUtils.clone` if
  skinned, else `scene.clone()`).
- Share one `MeshStandardMaterial` instance where possible.
- Benchmark at 20 people with rings + heatmap before merge to `main`.

**Rationale**: Constitution V — transparent/additive ring meshes already stress sort;
people must use opaque materials with `depthWrite: true` default.

## Context7 / Three.js References (for implementation phase)

Before coding, query Context7 for:
- `GLTFLoader` load + clone pattern (current Three.js r16x)
- `SkeletonUtils.clone` vs `Object3D.clone` for skinned meshes
- Proper ground alignment: `Box3.setFromObject` → offset Y by `-min.y`
