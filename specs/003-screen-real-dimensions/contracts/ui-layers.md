# UI Contract: Layers, Screen Study & Floorplan Panel

## Layers checklist (`#legend` → Layers)

| Control | Behavior |
|---------|----------|
| Curtain rings | Shows/hides curtain fabric only — **never** the Ø4.8 screen |
| Projection screen | Shows/hides two screen arcs, projector models, blend marker, screen spill light |
| Technical / ventilation (**new**) | Shows/hides niches, ducts, booth outline, entrance corridor helpers in 3D and in the X-panel |

Unchecked layers leave other layers unaffected.

## Dimensions HUD (`#dims`)

Must report recalibrated values on load:

- Room ≈ 226 m² (10.12 × 22.34 m)  
- Screen Ø 4.80 m (face 4.695 m may appear in selection, not required in compact HUD)  
- Rings = curtain count only  

## Selection panel (`kind === 'screen'`)

When a screen arc or projector is selected, show at least:

- Outer Ø / face Ø / height  
- Per-arc sweep and arc length  
- Main surface area  
- Chord + sagitta of main arc  
- Projector recommendation (explicit “one vs two” sentence)

## Projection study (same data as selection)

May live inside the selection panel or a small collapsible “Projection study” section. Numbers must update if screen height is edited.

## Floorplan panel (X key)

| Element | Contract |
|---------|----------|
| Underlay | `floorplan2.svg`, toggleable |
| Live curtains | Red arcs (existing) |
| Live screen | Distinct stroke (e.g. amber/gold), two arcs at screen center — not counted as a ring |
| Technical | Shown when technical layer is on |
| Click ring | Still focuses curtain ring controls |
| Click screen | Focuses/selection of screen (no ringrow flash for a non-existent screen ring) |
| Dims footer | Room + center + door + ring count + screen Ø |
| Note | If raster MEP missing: short note that technical layer is vector-only |

## Defaults (`Index.html` inputs)

All metre inputs MUST match `src/floorplan.js` after recalibration (door, offsets, box, gap width as needed). Stale oversized defaults are a contract violation.

## Non-goals (this feature)

- Editing niche/duct positions in the UI  
- Driving real projector hardware  
- Shipping `content-1.png` / `content-2.png`  
- Changing maze generation UX controls  
