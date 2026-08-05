# EventDisplay (student app)

Guide for [`EventDisplayComponent`](../alice-masterclass-js/src/app/shared/components/event-display/event-display.component.ts) (~4000 lines, graph god node). Read this before editing the component. Do **not** load the full source into an AI chat unless you already know the exact methods to change.

## Role

Three.js canvas that visualizes ALICE MasterClass events: detector GLB assembly, tracks, clusters, cascade/V0 markers, and a short proton-collision intro. Primary consumer: **Strangeness Visual Analysis** (also exposed via `SharedModule`).

This is **custom Three.js** — not JSROOT / Phoenix.

Detector L3: Visual Analysis and Particle Propagation both load the octagon magnet stand-in `assets/models/alice components/L3.glb`. The archived CAD source is `L3_original.glb` — see [`particle-propagation.md`](particle-propagation.md) § “L3 magnet”.

## Stack

- `three` + `OrbitControls`, `Line2` / `LineGeometry` / `LineMaterial`
- `GLTFLoader` for detector and proton models under `assets/models/`
- `EffectComposer` + `UnrealBloomPass` for post-processing
- Detector load helpers under [`shared/three/`](../alice-masterclass-js/src/app/shared/three/) (`optimize-detector-part.ts`, `merge-static-meshes.ts`)

## Data model

From [`event.ts`](../alice-masterclass-js/src/app/shared/models/event/event.ts):

| Type | Purpose |
| --- | --- |
| `Track` | Momentum, mass, charge sign, `TrackType`, `trajectory` polyline |
| `TrackType` | `STANDARD`, `V0`, `CASCADE`, `CASCADE_BACHELOR` |
| `Event` | `tracks`, `clusters`, `decays` |

Parents pass an `@Input() event` (and related UI inputs). Prefer changing parents/services over stuffing logic into the display.

## Responsibility map (methods)

| Zone | Key symbols | Notes |
| --- | --- | --- |
| Scene / camera / render | `createScene`, `render`, `resize`, `updateCameraMode`; side views via RT cache + blit (`SIDE_VIEW_*`, `sideViewAllowsPart`, `applySideViewDetectorMask`) | Core WebGL loop. View1 ρz (side): ITS+TRD @ 0.5; View2 Rφ (front): ITS+TPC+TRD+TOF @ 0.5; zoom follows main orbit distance with throttle |
| Detector | `detectorModel`, multipart assembly, `setDetectorPartVisibility`, `setDetectorPartOpacity`, palette drag-drop; load calls `optimizeStaticDetectorPart` | GLB layers (ITS, TPC, `L3.glb`, …) — see § Detector load optimisation |
| Physics visibility / intro | `applyDesiredPhysicsVisibility`, proton collision intro helpers | Show/hide tracks around intro |
| Interaction | `onPointer*`, vertex panel, cascade hover / proximity helpers | Picking UI |
| Legacy math in component | `invariantMass` | **Do not grow** — new math → Service |

## Side views (Rφ / ρz)

Optional right-hand panes (toggle in the EventDisplay sidebar; only after multipart assembly completes —
`effectiveSideViewsShown`). One WebGL canvas, three cameras (`camera3D`, `cameraRphi`, `cameraRhoz`),
dirty full-res `WebGLRenderTarget` caches, blit after the main pass. Picking stays on the main 3D viewport.

| Pane | Camera | Detector shells (forced visible) | Opacity |
| --- | --- | --- | --- |
| **View 1** (top in landscape — side / ρz) | `cameraRhoz` at (−10, 0, 0) | ITS + TRD | `SIDE_VIEW_DETECTOR_OPACITY` = 0.5 |
| **View 2** (bottom in landscape — front / Rφ) | `cameraRphi` at (0, 0, 10) | ITS + TPC + TRD + TOF | same 0.5 |

Masking is temporary per RT pass (`applySideViewDetectorMask` → render → `restoreDetectorPartRenderState`
in `try/finally`) so the main 3D view keeps the student’s slider visibility/opacity. Tracks, decays,
clusters, and markers stay shared (`LAYER_SHARED`); helper grids stay `LAYER_MAIN_ONLY`; calorimeter
readouts are hidden during side passes.

**Zoom sync:** side `PerspectiveCamera.zoom` = `computeSideViewZoomFromDistance(controls.getDistance())`
(`SIDE_CAMERA_DISTANCE / distance`, fallback `SIDE_VIEW_FIXED_ZOOM` at overview). Shared by both
panes (original framing). While the student orbits/zooms, side RT refreshes are throttled
(`SIDE_VIEW_ZOOM_THROTTLE_MS`, `SIDE_VIEW_ZOOM_EPS`); `controls.end` always does a full refresh.
Rotation without a distance change does **not** invalidate the caches.

**Scale HUD (m):** SVG overlays on `#scales1` / `#scales2`. Metres use a **per-pane
scale plane**:

| Pane | Largest shell | Scale plane |
| --- | --- | --- |
| View 1 ρz | TRD (~7.36 m tall; length reads ~12 m with perspective) | Origin / IP (`cameraDistance`) — height limb at x≈0 |
| View 2 Rφ | TOF (~7.5 m long, ~8 m tall) | `SIDE_VIEW_RPHI_SCALE_DEPTH_M` = 3.75 m (TOF face toward camera) |

Projection math:
[`side-view-scale.service.ts`](../alice-masterclass-js/src/app/shared/services/side-view-scale.service.ts)
(`tan(fov/2) * scalePlaneDistance / zoom` → m; `objectScale = 1e-2` ⇒ 1 wu = 1 m).
Axis labels: Rφ → `x`/`y`, ρz → `z`/`y`. Pane mapping matches the WebGL blit
(landscape: top ρz / bottom Rφ; portrait: left Rφ / right ρz).

Helpers/tests: `sideViewAllowsPart`, `computeSideViewZoomFromDistance` in
`event-display.component.spec.ts`; scale math in `side-view-scale.service.spec.ts`. Changelog detail:
[`changelog-visual-analysis-visualisation.md`](changelog-visual-analysis-visualisation.md) § “Linked side views”.

## Detector load optimisation (Visual Analysis)

After each multipart GLB loads, EventDisplay runs
[`optimizeStaticDetectorPart`](../alice-masterclass-js/src/app/shared/three/optimize-detector-part.ts)
(before materials / polygonOffset). Goal: fewer draw calls without softening ITS/TPC close-ups.
Particle Propagation does **not** use this helper — it has its own full merge + `InstancedMesh` / Melax path
([`particle-propagation.md`](particle-propagation.md)).

### Asset vs runtime

| Layer | On disk (GLB) | At EventDisplay load |
| --- | --- | --- |
| **ITS / TPC** | Full triangle detail (no extra VA decimate) | Batched merge by material only |
| **FIT** | Extra `gltfpack -si 0.5` pass on the shared file | Prune tiny CAD fragments, then batched merge |
| **TRD / TOF / PHOS / L3 / …** | Original slim pipeline (no second VA decimate) | Prune tiny fragments, then batched merge |
| **EMCal / DCal** | Unchanged | **No** merge / prune — keep `SMOD_` / `DCSM_` nodes for energy bars |

Pipeline history for regenerating GLBs from O2: [`changelog-visual-analysis-model.md`](changelog-visual-analysis-model.md).

### Tunables (`optimize-detector-part.ts`)

| Constant | Role | Typical effect |
| --- | --- | --- |
| `VA_MERGE_MAX_GEOMETRIES_PER_BATCH` | Max source meshes collapsed into one draw call (per material) | **Lower** → more draw calls, finer z-order / closer to raw GLB; **higher** → fewer draws, more aggressive flatten |
| `TINY_DETECTOR_MESH_MAX_DIM_CM` | Prune threshold (authored cm): drop meshes whose AABB max dim is below this | **Lower** → keep more micro-detail; **higher** → strip more screws / microfacets. **Not applied to ITS/TPC** |

Batched merge implementation: `mergeStaticMeshesByMaterial(root, { maxGeometriesPerBatch })` in
[`merge-static-meshes.ts`](../alice-masterclass-js/src/app/shared/three/merge-static-meshes.ts).
Omitting the batch size (Particle Propagation) collapses to ~one mesh per material.

### Visual impact (what students see)

- Silhouette, colours, opacity sliders, and calorimeter bars: same as before optimisation.
- FIT: slightly softer surfaces at strong zoom (fewer triangles in the GLB).
- Non–ITS/TPC layers: sub-threshold CAD fragments may be missing after prune.
- ITS / TPC: full geometry; only draw-call batching changes.

## Hard rules

1. **No heavy physics/math** in `EventDisplayComponent` (Lorentz force, RK4, new invariant-mass pipelines, track fitting, etc.).
2. New math → dedicated Angular `*.service.ts`; EventDisplay gets at most inject + a thin call (prefer calling from the parent analysis component).
3. Prefer this responsibility map + targeted / ranged reads of the component. Do **not** dump the full ~4000-line file into an AI chat unless you already know the methods to change (or the user asks for a whole-file review).
4. Do **not** merge EMCal / DCal in EventDisplay — energy readout depends on named panel nodes.

## How to extend

1. Orient with this doc — identify the zone above; then open only the relevant methods / related services.
2. Add or extend a service under `alice-masterclass-js/src/app/` (shared or feature folder).
3. Wire from Visual Analysis (or other parent); touch EventDisplay only for rendering hooks if unavoidable.
4. Detector perf knobs → `optimize-detector-part.ts` (or shared `merge-static-meshes.ts`); do not re-implement merge inside the god component.
5. `npm run build` (or targeted test).

## Testing

UI changes affecting Visual Analysis / display:

```bash
cd alice-masterclass-js
npm run e2e:smoke
```

Unit coverage for the load path and side-view helpers:

```bash
cd alice-masterclass-js
npx ng test --include='**/optimize-detector-part.spec.ts' --include='**/merge-static-meshes.spec.ts' --include='**/event-display.component.spec.ts' --browsers=ChromeHeadlessCI --watch=false
```

See also [E2E.md](E2E.md).
