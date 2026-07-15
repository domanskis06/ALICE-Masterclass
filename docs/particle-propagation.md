# Particle Propagation (student app)

Guide for the `particle-propagation` feature module — real-time visualization of two protons colliding at the centre of ALICE and the produced particles propagating outward, bent by the real 3D magnetic field. Full implementation checklist/history: [`docs/plans/particle-propagation.md`](plans/particle-propagation.md).

## Role

Own Angular feature module (`app/particle-propagation/`), own Three.js scene (`propagation-scene.ts`) — **not** a mode of `EventDisplayComponent` (see [`event-display.md`](event-display.md) and `.cursor/rules/architecture.mdc`: no new physics/math in that god node). Route: `/particle-propagation`, nav entry next to Strangeness Visual/Large-Scale Analysis.

Trajectories are **pre-computed once** (4th-order Runge-Kutta through the exact ALICE Chebyshev field map) before the animation starts; the render loop and the time scrubber only ever read from those pre-computed buffers via `THREE.BufferGeometry.setDrawRange()` — zero physics in the render loop or while scrubbing.

## Stack

- Angular Material right sidebar for Event / Playback / Time / Magnetic-field controls
- `three` + `OrbitControls`, `GLTFLoader` (detector parts + `proton.glb`)
- A Web Worker (`propagation-physics.worker.ts`) for the RK4 pre-computation, with a chunked main-thread fallback when `Worker` is unavailable

## Data model

| Type (`physics/propagation-types.ts`) | Purpose |
| --- | --- |
| `Vec3` | `{x,y,z}`, used for position/momentum/field, cm / GeV·c⁻¹ / T |
| `PropagationParticle` | Input to RK4: `origin` (`primary`/`v0`), `vertex`, `momentum`, `charge`, `mass`, `energy` |
| `BufferedTrack` | RK4 output: fixed-capacity `Float32Array` `positions`/`times` + `pointCount` + `origin`/`charge`, ready for `setDrawRange` |
| `PropagationResult` | `{ tracks, maxTimeNs }` — a full worker/fallback precompute result |

Units convention (`physics/constants.ts`): **cm** (position), **GeV/c** (momentum), **Tesla** (field), **ns** (time). Converted to Three.js world units (`PropagationScene.objectScale = 1e-2`) and UI milliseconds only in the `scene/` layer / component template — never inside `physics/`.

Event input: `data/particle-data.service.ts` loads `assets/exercises/particle-propagation/event_<n>.json` (`n = 0..9`, `PARTICLE_EVENT_COUNT`). These are **converted** from Strangeness Visual Analysis `part1` by [`scripts/curate-propagation-events.mjs`](../alice-masterclass-js/scripts/curate-propagation-events.mjs): primary (collision) tracks plus one V0 daughter pair. Primary tracks start at the IP (`vertex = 0`) and are drawn **blue** (`trackColor`); their `charge` (±1) is inferred from the stored helix `trajectory` because part1 exports background `sign = 0`. V0 daughters keep VA `sign` as `charge`, start at the **secondary vertex**, and are drawn **red (+) / green (−)**. Cascades are omitted. The service always keeps V0 tracks when truncating to `MAX_TRACKED_PARTICLES` (40). Regenerate with `node scripts/curate-propagation-events.mjs` from `alice-masterclass-js` (requires local `src/assets/exercises/strangeness/part1`).

Magnetic-field visualization: field **lines** (streamlines), in the style of Fig. 19 of Nowakowski/Rokita/Graczykowski's *"Distributed simulation and visualization of the ALICE detector magnetic field"* (2022) — but controllable in density, and lines only (no colour-mapped slice plane; that paper's GPU repo mainly colours 2D slices via `B→RGB`, while streamlines carry positions). `physics/field-line-tracer.ts::traceFieldLines()` seeds a disc grid in the transverse (xy) plane at `z = 0` (presets `sparse` / `medium` / `dense`) and, for each seed, walks both directions along `dr/ds = ±B(r)/|B(r)|` via its own small RK4 until `|B|` drops below threshold or the line leaves the sampled volume. Polyline order is −B̂ → +B̂; each vertex also stores `|B|` (Tesla). `scene/field-line-visualizer.ts::buildFieldLines()` packs every traced polyline into a single native `THREE.LineSegments` (`LineBasicMaterial` with **vertex colours** from `physics/field-colormap.ts`, Jet-style blue→cyan→green→yellow→orange→red over a narrow window centred on the selected strength — base offsets `[B−0.03 T, B+0.01 T]` at 0.5 T (`0.47…0.51 T`), scaled by `B / NOMINAL_SOLENOID_B_T` so axial fall-off keeps the same relative palette at every slider setting, e.g. `1.88…2.04 T` at 2 T; weak = deep blue → strong = bright red), `depthTest`/`depthWrite` like particle tracks) plus an `InstancedMesh` of cone arrowheads coloured by local `|B|`. Native 1 px lines replace the previous fat `LineSegments2` quads so orbiting stays smooth with the overlay on. A CSS colorbar in the Magnetic field panel mirrors the same scale. The sidebar **Field strength** slider (`0.5…2 T`, default `0.5 T`) multiplies the Chebyshev map by `B_ui / NOMINAL_SOLENOID_B_T` via `MagneticFieldService` (spatial fall-off at the detector ends is preserved) and rebuilds coloured field lines immediately; tracks keep the previous curvature until the student hits **Replay**, which re-runs the RK4 precompute at the new strength. Field lines are also rebuilt when density changes (never per frame). It makes the core lesson visible: B is strong and near-uniform along z inside the solenoid, so tracks curve in the transverse plane — colour shifts appear mainly toward the axial fall-off.

Detector rendering perf / interactivity: `scene/detector-loader.ts` returns a `DetectorModel` (`{ group, parts }`) — a recentered group plus a per-part list so each layer (ITS/TPC/…/L3) gets its own **Visible** + **Opacity** GUI control (`scene/detector-appearance.ts`, patterns adapted from `EventDisplayComponent` without importing it). Recentering uses the **ITS** (then TPC) bounding-box centre as the beam-pipe axis — not the whole-assembly AABB, which sits at the origin because L3 is huge and calorimeters are one-sided, while the authored ITS/TPC tube is systematically offset (~+30 cm in Y). That shift is what puts the collision vertex in the middle of the pipe. Each GLB part is run through `shared/three/merge-static-meshes.ts` (`mergeStaticMeshesByMaterial`), collapsing thousands of repeated-node meshes down to ~1 draw call per unique material, then given EventDisplay-style materials: **`depthWrite = true`** + per-mesh `polygonOffset`/`renderOrder` (inner shells translucent but still depth-writing). The **L3 magnet defaults to fully opaque** (`opacity = 1`, `transparent = false`) so the down-the-barrel view looks through the magnet *opening*, not through a translucent yoke that filled the framebuffer and caused orbit lag; transforms are frozen (`matrixAutoUpdate = false`) after load. Field lines use native `THREE.LineSegments` with `|B|` vertex colours (not fat `LineSegments2` screen-space quads). Combined with a capped `renderer.setPixelRatio(min(dpr, 1.5))` that drops to `1` while OrbitControls is dragging, and `controls.minDistance`/`maxDistance`, orbit stays smooth when zoomed in — matching Visual Analysis. `OrbitControls` keeps `enablePan = false`. The camera opens in a fixed 3/4 "down the barrel" pose (`INITIAL_CAMERA_POSITION`). Dark mode (default) / light mode toggles the scene background and boosts detector saturation/emissive (`PropagationScene.setDarkMode` + `applyDetectorDarkMode`).

## Responsibility map (folders)

| Folder | Owns | Notes |
| --- | --- | --- |
| `physics/` | Field map parsing (`cheb-field-data.ts`, little-endian `DataView`), field evaluation (`cheb-field-eval.ts`), RK4 (`rk4-integrator.ts`), field-line tracing (`field-line-tracer.ts`), `|B|` Jet map (`field-colormap.ts`), Worker (`propagation-physics.worker.ts`) + its Angular facade (`rk4-propagator.service.ts`), constants/types | **All math lives here.** Pure TS (no Angular/DOM) except the two `*.service.ts` facades, so the exact same code runs inside the Worker. |
| `data/` | `particle-data.service.ts`, `propagation-event.ts` (on-disk schema) | Loads/maps curated event JSON, no physics |
| `scene/` | `propagation-scene.ts` (Three.js core + dark mode + camera pose), `detector-loader.ts`/`.service.ts` (GLB loading → `DetectorModel`), `detector-appearance.ts` (per-part materials/opacity/visibility/dark mode), `field-line-visualizer.ts` (B streamlines), `collision-intro.ts` (proton intro), `track-renderer.ts` (fat `Line2` + `instanceCount` reveal + primary blue / V0 R/G colours), `propagation-timeline.ts` (3-phase time model), `timeline-constants.ts` | Zero physics computation — only reads pre-computed buffers / samples the field for display |
| `instructions/`, `welcome-dialog/` | "?"-toolbar instructions, first-open welcome modal | i18n via `en.json` (`STRANGENESS.INSTRUCTIONS_PARTICLE_PROPAGATION`, `PARTICLE_PROPAGATION.*`) |
| `particle-propagation.component.ts` | UI shell + native Material right sidebar (Event / Playback / Time / Field), left Detector-parts panel, orchestrates the phases below | Thin: constructs scene, wires DI services, runs the `requestAnimationFrame` loop calling `timeline.applyTime()` + `scene.render()` |

## Physics pipeline (per event)

1. `MagneticFieldService.load()` — fetch + little-endian-parse the 4 `assets/field/*.bin` Chebyshev LUTs (solenoid + dipole), once, cached.
2. `ParticleDataService.loadEvent(n)` — curated event JSON → `PropagationParticle[]`, mapping `charge` (±1) and `origin`: primary vertices are pinned to the IP; V0 daughters keep their secondary vertex from the JSON.
3. `Rk4PropagatorService.precompute(particles)` — off-main-thread RK4 (arc-length parametrized, `du/ds = k·(u×B(r))`, `k = charge·B2C/|p|`), field sampled fresh at each of the 4 RK4 stages; emits `progress` events, then a `result` (`BufferedTrack[]` + `maxTimeNs`), all as `Transferable` `ArrayBuffer`s.
4. `track-renderer.ts::createTrackLines()` turns each `BufferedTrack` into a fat `Line2` (`LineMaterial.linewidth = DEFAULT_TRACK_LINEWIDTH`, default 2 px) with `instanceCount = 0` — primary tracks blue, V0 tracks red/green by charge.
5. `PropagationTimeline` owns the single `globalTimeMs` axis (`t < 0` intro/protons approaching → `t = 0` collision flash → `t > 0` propagation) and, on `applyTime()`, only toggles visibility / calls `track-renderer.ts::updateDrawRange()` (binary search over `times`) — **no re-computation, ever**.

## Hard rules

1. **No physics/math in `particle-propagation.component.ts` or anywhere under `scene/`.** New math (kinematics, invariant mass, alternate field models, …) → a new file/service under `physics/`.
2. RK4 pre-computation must stay off the main thread (Worker) or explicitly chunked with a yield (`setTimeout(…, 0)`) — never a tight synchronous loop over `MAX_TRACKED_PARTICLES × MAX_RK4_STEPS`.
3. Binary field parsing must go through `DataView.getFloat32/getInt32(offset, true)` (explicit little-endian) — never `new Float32Array(buffer)` directly on a fetched `ArrayBuffer`.
4. `FIELD_SCALE` (`physics/constants.ts`) is **not** a literal port of `gpu_propagator`'s GLSL `SCALE` — its sign was empirically corrected (see `rk4-trajectory-validation.spec.ts`) to match our RK4's standard Lorentz-force sign convention. Do not "fix" it back to match the GLSL source without re-running that validation spec.
5. After new services/physics changes and a successful build: from `alice-masterclass-js`, run `graphify update .`.

## How to extend

1. Orient with Graphify (`graphify query`/`path`) or the responsibility map above.
2. New physics → a file under `physics/` (plain TS if it must run inside the Worker too), plus a unit spec.
3. New visuals that read pre-computed data → `scene/`; wire from `particle-propagation.component.ts`.
4. `npm run build` (or targeted `ng test --include=...`), then `graphify update .`.

## Testing

```bash
cd alice-masterclass-js
npm run test:ci -- --include='src/app/particle-propagation/**/*.spec.ts'   # module only
npm run test:ci                                                             # full suite
npm run build:dev
```

Key specs:
- `physics/cheb-field-data.spec.ts`, `physics/magnetic-field.service.spec.ts` — real `.bin` LUTs, field magnitude/direction sanity.
- `physics/rk4-integrator.spec.ts` — radius-of-curvature vs. the theoretical `R = pt / (B2C·|B|·|q|)` in a uniform test field.
- `physics/rk4-trajectory-validation.spec.ts` — cross-checks RK4 (through the real field) against the real, independently-produced `trajectory` arrays in `event_0_0.json` (same detector radius reached, same bending direction over a matched arc length). This is what caught the `FIELD_SCALE` sign bug — re-run it after touching anything in `physics/`.
- `data/particle-data.service.spec.ts` — loads a real curated `event_0.json` fixture (primary at IP + V0 at secondary vertex, both charge signs) plus synthetic `HttpTestingController` cases for vertex mapping and `MAX_TRACKED_PARTICLES` truncation (V0 always kept).
- `scene/detector-appearance.spec.ts` — per-part labels, inner→outer opacity lerp (calorimeter floor), `depthWrite`-preserving opacity, dark-mode colour round-trip.
- `physics/field-line-tracer.spec.ts` — lines follow a uniform `Bz` field along z; sparse < medium < dense seed counts; a constant-magnitude radial field terminates lines via the transverse-radius cutoff; seed grid stays within the configured radius; each vertex stores `|B|` (`magnitudes.length === pointCount`).
- `physics/field-colormap.spec.ts` — Jet map clamps/normalises Tesla scale; range tracks selected strength (`B±offsets`); weak→deep blue, strong→bright red; CSS gradient export.
- `physics/magnetic-field.service.spec.ts` — selected strength scales the Chebyshev map uniformly while preserving spatial shape.
- `scene/field-line-visualizer.spec.ts` — single native `LineSegments` with `vertexColors`, direction arrowheads oriented along +B, never a plane/slice mesh, higher density yields more geometry, empty group for a negligible field, opacity/width setters, `depthTest`+`depthWrite` (same occlusion as tracks); weak vs strong `|B|` yield different vertex colours.
- `scene/detector-loader.spec.ts` — real GLBs → recentered group + per-part list, ≤ draw-call budget, XY beam-axis centre ≈ origin.
- `particle-propagation.component.spec.ts` — full UI-shell smoke test; detector GLB loading and `CollisionIntro.create()` are mocked (via `DetectorLoaderService`/`spyOn`) to avoid real network fetches / WebGL context churn across the suite.
