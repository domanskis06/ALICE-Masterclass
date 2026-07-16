# EventDisplay (student app)

Guide for [`EventDisplayComponent`](../alice-masterclass-js/src/app/shared/components/event-display/event-display.component.ts) (~2200 lines, graph god node). Read this before editing the component. Do **not** load the full source into an AI chat unless you already know the exact methods to change.

## Role

Three.js canvas that visualizes ALICE MasterClass events: detector GLB assembly, tracks, clusters, cascade/V0 markers, and a short proton-collision intro. Primary consumer: **Strangeness Visual Analysis** (also exposed via `SharedModule`).

This is **custom Three.js** — not JSROOT / Phoenix.

## Stack

- `three` + `OrbitControls`, `Line2` / `LineGeometry` / `LineMaterial`
- `GLTFLoader` for detector and proton models under `assets/models/`
- `EffectComposer` + `UnrealBloomPass` for post-processing

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
| Scene / camera / render | `createScene`, `render`, `resize`, `updateCameraMode` | Core WebGL loop |
| Detector | `detectorModel`, multipart assembly, `setDetectorPartVisibility`, `setDetectorPartOpacity`, palette drag-drop | GLB layers (ITS, TPC, …) |
| Physics visibility / intro | `applyDesiredPhysicsVisibility`, proton collision intro helpers | Show/hide tracks around intro |
| Interaction | `onPointer*`, vertex panel, cascade hover / proximity helpers | Picking UI |
| Legacy math in component | `invariantMass` | **Do not grow** — new math → Service |

## Hard rules

1. **No heavy physics/math** in `EventDisplayComponent` (Lorentz force, RK4, new invariant-mass pipelines, track fitting, etc.).
2. New math → dedicated Angular `*.service.ts`; EventDisplay gets at most inject + a thin call (prefer calling from the parent analysis component).
3. Prefer Graphify (`graphify query` / `path`) over grepping the whole file.
4. After new services and a successful build: from `alice-masterclass-js`, run `graphify update .`.

## How to extend

1. Orient with Graphify / this doc — identify the zone above.
2. Add or extend a service under `alice-masterclass-js/src/app/` (shared or feature folder).
3. Wire from Visual Analysis (or other parent); touch EventDisplay only for rendering hooks if unavoidable.
4. `npm run build` (or targeted test), then `graphify update .`.

## Testing

UI changes affecting Visual Analysis / display:

```bash
cd alice-masterclass-js
npm run e2e:smoke
```

See also [E2E.md](E2E.md).
