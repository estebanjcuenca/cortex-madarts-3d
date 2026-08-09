# Feature 004: Visual Controls & UI Components

**Status**: **Shipped, then superseded by [005 — Stage Visualizer & Designer Components](../005-stage-visualizer-components/spec.md)** (2026-08-09)

> **Why this file has no tasks.** 004 was written *after* the code shipped, as a record of work done
> directly in conversation. It never went through `/speckit-plan` or `/speckit-tasks`, so it has no
> user stories and no task list — it is a changelog, not a roadmap entry. Do not add tasks here.
>
> **The code below is live and in use.** Nothing described here has been removed. Feature 005
> absorbs it: `visualSettings.js` folds into `core/stageModel.js` (005 T075) and the three UI panels
> are extended rather than replaced (005 T024, T033, T061).

## Goal

Extract lighting and circulation tuning into reusable UI components with shared settings state. Organize layer toggles by scene domain.

## Components

| Module | Role |
|--------|------|
| `src/settings/visualSettings.js` | Single source of truth + change listeners |
| `src/ui/layersPanel.js` | Layer visibility grouped: Architecture / Circulation / Lighting & rig |
| `src/ui/heatmapControls.js` | Heatmap overall brightness + center/outside bias |
| `src/ui/lightingControls.js` | Central light, fabric wash, room fill |
| `src/lighting/centralLight.js` | Rig accepts intensity/beam/glow multipliers |

## Controls

### Heatmap
- **Overall brightness** — base opacity per passage blob (additive overlap unchanged)
- **Center bias** −1…+1 — brighter toward outer rings vs toward center

### Central light
- Intensity, beam width, base glow, bloom (post-process)

### Fabric
- Brightness (albedo), light wash (emissive fill on curtain meshes tagged `userData.fabric`)

### Room fill
- Ambient + key/rim directional scales

## Next steps — resolved

All three were carried forward. Recorded here so nothing was silently dropped.

| Original next step | Outcome |
|---|---|
| Move circulation mode + flow slider into `src/ui/circulationControls.js` | **Scheduled** — 005 task T061 |
| Persist settings to `localStorage` | **Scheduled, broadened** — 005 task T065 persists the whole design, not just the sliders |
| Bind walkthrough to selected flow route index | **Not scheduled** — parked as [BACKLOG B4](../BACKLOG.md#b4--bind-the-walkthrough-to-the-selected-flow-route); becomes nearly free once 005 T052 gives `walkMode(route)` a route argument |

## Where these components go next

| Module | Fate under 005 |
|---|---|
| `src/settings/visualSettings.js` | Folded into `src/core/stageModel.js`; kept as a compatibility shim through Phase 3, removed at T075 |
| `src/ui/layersPanel.js` | Kept, rewired to `layerRegistry` (T024), gains discipline presets (T059) |
| `src/ui/heatmapControls.js` | Kept as-is |
| `src/ui/lightingControls.js` | Kept, extended to a fixture list and saved looks (T033, T036) |
| `src/lighting/centralLight.js` | Kept; `setMultipliers` becomes `update(fixture)` under the `centralBeam` fixture type (T030) |
