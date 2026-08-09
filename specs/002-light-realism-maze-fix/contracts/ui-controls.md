# UI Contracts: Central Light Realism & Maze Path Reliability

**Date**: 2026-08-08 | **Plan**: [../plan.md](../plan.md)

No new UI controls are added by this feature. Existing controls gain stronger guarantees.

## `Generate new maze & walk it` (button `#genMaze`)

| Aspect | Contract |
|--------|----------|
| Input | Current ring radii, room boundary, gap width. |
| Behavior | Reshuffles inner-ring openings (outermost untouched), **validates the resulting route** (inside room, threads openings, no fabric intersection), retries bounded times on validation failure, then starts the walkthrough. |
| Guarantee | Every click yields a walkable, non-clipping route ending at the center (SC-001). Clicking during an active walkthrough stops it cleanly first — never corrupts route state. |

## `Walk through (POV)` (button `#btnWalk`)

| Aspect | Contract |
|--------|----------|
| Behavior | Walks the same validated route drawn by the circulation "Path" layer (FR-006). Camera at 1.65 m, continuous motion, ends at center, controls restored via existing `stopWalk()` pattern. |

## Ring opening sliders (`#ringControls`)

| Aspect | Contract |
|--------|----------|
| Behavior | Unchanged authoring. If a slider places an opening outside the room, the drawn/walked route falls back to the nearest inside-the-room angle for that ring; the slider value itself is never rewritten. |

## Occupancy controls (`#setOccupancy`, `#clearPeople`, floor click)

| Aspect | Contract |
|--------|----------|
| Behavior | Unchanged. Occupancy continues to drive pulse intensity/speed and now also modulates bloom strength through the same `occupancyFactor` (FR-010). |

## View buttons (`#btnOrbit`, `#btnPlan`, `#btnWalk`, `#btnCentral`, `#btnSave`, `#btnGif`)

| Aspect | Contract |
|--------|----------|
| Behavior | All modes render through the shared `renderFrame()` (bloom + labels applied identically). `Save image` captures the post-processed frame. `Record GIF` works in all four camera modes (FR-011 / SC-006). |
