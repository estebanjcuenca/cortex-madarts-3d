# Quickstart & Validation: Central Light Realism & Maze Path Reliability

**Date**: 2026-08-08 | **Plan**: [plan.md](./plan.md)

## Prerequisites

```bash
cd /Users/esteban/Documents/CORTEX-MA
npm install          # three ^0.172, vite 6 (already in package.json)
npm run dev          # → http://localhost:5173/ (or next free port)
```

Assets (people GLBs) are already imported; no re-import needed for this feature.

## Validation scenarios

### V1 — Maze reliability, 10-run loop (SC-001, SC-002 · US1)

1. Open the demo, enable the **Layers → Circulation → Path** layer.
2. Click **Generate new maze & walk it** — watch the full walkthrough.
3. Repeat for a total of **10 runs**.

**Expected**: every run — camera threads each ring's opening outermost→center, never passes through fabric, never exits the room, ends at the center with orbit controls restored. The drawn green path matches the walked route.

Automated equivalent: headless script (see research.md R5) asserts `validateRoute` passes 10/10 and no NaN samples.

### V2 — Central light realism (SC-003 · US2)

1. Reload; from the default start view click **Set occupancy** (6 people).
2. Observe the central light.

**Expected**: soft glow/halo around beam and base (no hard cylinder edge); people near the light are visibly lit with physical falloff; each person casts a soft shadow away from the light; pulse continues, scaling with occupancy (compare occupancy 0 vs 20).

### V3 — Performance budget (SC-004 · FR-014)

1. Set occupancy to **60**. Orbit and zoom for ~20 s.
2. Check fps (browser dev-tools performance overlay or the headless probe).

**Expected**: ≥30 fps sustained at 60 occupants; ≥50 fps at occupancy 6. If below: reduce shadow map to 512 and re-test before any other change.

### V4 — GIF capture in all modes (SC-006 · Constitution II)

For each of **Orbit, Plan view, Walk through, Central space**: click **Record GIF**, record ~3 s, stop.

**Expected**: a valid animated GIF downloads in each mode showing the bloomed lighting (no black/blank frames). Also verify **Save image** captures the post-processed frame.

### V5 — Cross-browser (SC-005 · US3)

Open the built site (`npm run build && npm run preview`) in current **Chrome**, **Firefox**, and **Safari**.

**Expected**: identical scene, no black screen, bloom and shadows visible in all three (feature is WebGL — no WebGPU dependency by design, see research.md R1).

### V6 — Renderer decision documented (SC-007 · FR-013)

**Expected**: [research.md R1](./research.md) states the decision (stay WebGL / defer WebGPU), rationale (incl. Safari 26.4 WebGPU regression), and four re-evaluation triggers.

## Regression guards

- `npm run build` exits 0.
- Click-to-add / click-to-remove people still works (raycast targets unchanged).
- Name labels still render (CSS2D pass runs after composer in `renderFrame()`).
- Ring sliders, auto-orient, ring add/remove all still rebuild correctly.

## Validation results — 2026-08-08 (implementation run)

| Scenario | Result | Evidence |
|----------|--------|----------|
| V1 maze reliability | ✅ PASS | `node scripts/verify-maze.mjs` — 10/10 routes valid, walk starts and stops cleanly, on both dev server and built site (headless Chromium) |
| V2 light realism | ✅ PASS | Screenshots at occupancy 6 and 60: soft-edge beam, bloom halo, red light spill on people/floor, intensity scales with occupancy |
| V3 performance | ✅ PASS | 60.3 fps at occupancy 6 AND at occupancy 60 (headless Chromium, 1280×800, shadows + bloom on) |
| V4 GIF capture | ✅ PASS | 697 KB animated GIF downloaded from central-space mode through the composer pipeline; all 4 camera modes render non-black through `renderFrame()` |
| V5 cross-browser | ✅ PASS | Built site in Playwright Chromium, Firefox, and WebKit (Safari engine): scene renders (equal canvas brightness ±1%), maze validates, walk starts, zero page errors in all three. Native-browser spot check still recommended before publishing. |
| V6 renderer decision | ✅ PASS | research.md R1: decision + 5-point rationale + 4 re-evaluation triggers; renderer note added to `index.html` handoff block |

**Bug found & fixed during validation**: rAF timestamps can precede a `performance.now()` taken just before the loop starts, producing a negative `dt` → negative `walkT` → `getPointAt()` crash on the walk's first frame (the long-standing intermittent "walk never starts" defect). Fixed by clamping `dt ≥ 0` in `startWalk` and `startCentralOrbit`.
