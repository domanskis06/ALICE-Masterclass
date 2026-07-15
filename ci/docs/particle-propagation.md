# Particle Propagation

Real-time visualization of two protons colliding at the centre of ALICE and the produced particles racing outward, bent by the **exact 3D magnetic field** of the detector.

| | |
| --- | --- |
| **Module** | `alice-masterclass-js/src/app/particle-propagation/` |
| **Route** | `/particle-propagation` |
| **Scene** | Own Three.js scene (`propagation-scene.ts`) — **not** a mode of `EventDisplayComponent` |
| **Events** | `assets/exercises/particle-propagation/event_0…9.json` |
| **Field map** | `assets/field/{sol,dip}_{params,segments}.bin` |

Architecture reminder (`.cursor/rules/architecture.mdc`): no new physics/math in the EventDisplay god node — see also [`event-display.md`](event-display.md).

---

## Why a separate module?

`EventDisplayComponent` already visualises reconstructed tracks for Strangeness Visual Analysis. Particle Propagation needs something different:

1. **Live RK4** through a spatially varying Chebyshev field (not pre-baked VA helices).
2. An interactive **B-field overlay** (streamlines + strength slider).
3. A **time scrubber** over a three-phase timeline (protons → flash → propagation).

That would have bloated the god node with Lorentz force, Clenshaw evaluation, and Web Workers. Instead the feature lives as its own Angular module: all math under `physics/`, all rendering under `scene/`, a thin component shell on top.

Trajectories are **pre-computed once** before the animation starts. The render loop and scrubber only ever read those buffers via `setDrawRange` / `instanceCount` — **zero physics while scrubbing**.

---

## How the component was built

The student-facing module is a **TypeScript/Angular port and re-staging** of two research codebases by Piotr Nowakowski (and co-authors), both **GPL-3.0**:

| Source | Paper / role | What we took |
| --- | --- | --- |
| [`pnwkw/gpu_propagator`](https://github.com/pnwkw/gpu_propagator) | *GPU propagation and visualisation of particle collisions with accurate model of ALICE detector magnetic field* | Chebyshev field model (`mag_field::mag_cheb`), binary LUT layout, helix/curvature conventions (adapted), reference `data/*.bin` |
| [`pnwkw/distributed_field`](https://github.com/pnwkw/distributed_field) | *Distributed simulation and visualization of the ALICE detector magnetic field* (2022) | Same field LUTs + evaluation; streamline visualisation style (cf. Fig. 19 — field **lines**, not GPU-coloured 2D slices) |

### Port map (research C++/GLSL → MasterClass)

```
gpu_propagator / distributed_field          alice-masterclass-js
─────────────────────────────────────       ──────────────────────────────────────
data/sol_*.bin, data/dip_*.bin          →   src/assets/field/*.bin
mag_cheb.h / mag_cheb.cpp               →   physics/cheb-field-data.ts
                                            physics/cheb-field-eval.ts
                                            physics/constants.ts (LUT sizes)
GLSL SCALE + helix kernel               →   FIELD_SCALE + physics/rk4-integrator.ts
                                            (sign corrected for textbook Lorentz)
Fig. 19–style field lines               →   physics/field-line-tracer.ts
                                            scene/field-line-visualizer.ts
GPU / OpenGL demo shell                 →   Angular module + Material sidebar
                                            + Web Worker RK4 precompute
```

What is **new** for the MasterClass (not a straight port):

- Angular feature module, routing, i18n, welcome / instructions dialogs
- Web Worker + chunked main-thread fallback for RK4 (`Rk4PropagatorService`)
- Collision intro with GLB protons, detector layers with per-part opacity/visibility
- Curated teaching events from Strangeness `part1` (see below) instead of the mega `events.json` shipped with the research repos
- UI field-strength slider that scales the map while preserving spatial fall-off
- Validation specs that lock bending direction against real VA trajectories

Attribution also lives in [`alice-masterclass-js/README.md`](../alice-masterclass-js/README.md) (Third-party attribution) and in file headers of `cheb-field-*.ts` / `magnetic-field.service.ts`.

---

## Data: where it lives and how it was prepared

Source of truth for development:

```
alice-masterclass-js/src/assets/
├── field/                                    ← magnetic-field LUTs
│   ├── sol_params.bin
│   ├── sol_segments.bin
│   ├── dip_params.bin
│   └── dip_segments.bin
└── exercises/particle-propagation/           ← curated collision events
    ├── event_0.json
    ├── …
    └── event_9.json
```

After `npm run build` / `build:dev` / `build:prod`, Angular copies them to:

```
alice-masterclass-js/dist/assets/field/
alice-masterclass-js/dist/assets/exercises/particle-propagation/
```

Runtime always fetches from `assets/…` (relative to the app base href) — `dist/` is just the packaged copy.

### 1. Magnetic field LUTs (`assets/field/`)

Copied from the research `data/` trees (identical blobs in both repos):

- https://github.com/pnwkw/gpu_propagator/tree/master/data
- https://github.com/pnwkw/distributed_field/tree/main/data

| File | ≈ size | Role |
| --- | --- | --- |
| `sol_segments.bin` / `sol_params.bin` | 31 KB / 1.0 MB | Solenoid (barrel) Chebyshev segments + coefficients |
| `dip_segments.bin` / `dip_params.bin` | 113 KB / 1.4 MB | Dipole (muon arm) segments + coefficients |

They are little-endian dumps produced by C++ `ifstream::read` of the AliRoot / AliMagWrapCheb Chebyshev tables. Parsing **must** go through `DataView.getFloat32/getInt32(offset, true)` — never a naked typed-array view over the buffer (endianness trap). Dimensions in `physics/constants.ts` mirror `mag_cheb.h` exactly (`SOL_*`, `DIP_*`).

`MagneticFieldService.load()` fetches all four bins once, caches the parsed evaluator, and exposes `B(r)` in Tesla (raw evaluation × `FIELD_SCALE`, optionally × UI strength / `NOMINAL_SOLENOID_B_T`).

> The research `data/events.json` files are **not** used by the MasterClass. Collision inputs come from Strangeness Visual Analysis (below).

### 2. Propagation events (`assets/exercises/particle-propagation/`)

Ten compact teaching events distilled from Strangeness Visual Analysis **part1** by:

```bash
cd alice-masterclass-js
node scripts/curate-propagation-events.mjs
# requires local src/assets/exercises/strangeness/part1/event_*_*.json
```

**Pipeline**

```
strangeness/part1/event_N_M.json          curate-propagation-events.mjs
  tracks[]  (VA background, sign=0)   →   origin: "primary", vertex = IP (0,0,0)
                                           charge inferred from helix trajectory
  decays[]  (first V0 pair, type=1)   →   origin: "v0", vertex = secondary
                                           charge = VA sign (±1)
  cascades (type 2/3)                 →   omitted
                                          ↓
                          event_0.json … event_9.json
                          { tracks: [{ charge, origin, X,Y,Z, px,py,pz, E, mass }] }
```

Selection rules inside the script:

- Keep only events that contain a valid opposite-sign V0 pair with secondary vertex clearly off the IP (`r_xy > 0.3 cm`)
- At least 8 primary tracks with recoverable charge; cap primaries at 38 (room for 2 V0 daughters under `MAX_TRACKED_PARTICLES = 40`)
- Sort primaries by `|p|` and keep the hardest; always keep the V0 pair
- Emit exactly 10 files (`event_0` … `event_9`)

At runtime `ParticleDataService` loads one file, maps it to `PropagationParticle[]`, and — if ever over the cap — truncates primaries by `|p|` while **always keeping V0**.

Colours in the scene: primary → blue; V0 → red (+) / green (−).

---

## Stack

- Angular Material right sidebar — Event / Playback / Time / Magnetic-field controls
- Left Detector-parts panel — per-layer visibility + opacity
- `three` + `OrbitControls`, `GLTFLoader` (detector GLBs + `proton.glb`)
- Web Worker (`propagation-physics.worker.ts`) for RK4 precompute, with chunked main-thread fallback when `Worker` is unavailable

---

## Data model

| Type (`physics/propagation-types.ts`) | Purpose |
| --- | --- |
| `Vec3` | `{x,y,z}` — position / momentum / field (cm, GeV/c, T) |
| `PropagationParticle` | RK4 input: `origin`, `vertex`, `momentum`, `charge`, `mass`, `energy` |
| `BufferedTrack` | RK4 output: fixed-capacity `Float32Array` `positions`/`times` + `pointCount` |
| `PropagationResult` | `{ tracks, maxTimeNs }` — full worker/fallback result |

Units (`physics/constants.ts`): **cm**, **GeV/c**, **Tesla**, **ns**. Conversion to Three.js world units (`PropagationScene.objectScale = 1e-2`) and UI milliseconds happens only in `scene/` / the template — never inside `physics/`.

On-disk schema: `data/propagation-event.ts` (`PropagationRawTrack` / `PropagationEvent`).

---

## Responsibility map

| Folder | Owns | Notes |
| --- | --- | --- |
| `physics/` | Field parsing & eval, RK4, field-line tracing, Jet colormap, Worker + `Rk4PropagatorService`, constants/types | **All math lives here.** Pure TS (no Angular/DOM) except the two `*.service.ts` facades — same code runs in the Worker |
| `data/` | `particle-data.service.ts`, `propagation-event.ts` | Loads/maps curated JSON, no physics |
| `scene/` | `propagation-scene`, detector load/appearance, field-line visuals, collision intro, track renderer, timeline | Zero physics — only reads pre-computed buffers / samples B for display |
| `instructions/`, `welcome-dialog/` | Toolbar help, first-open modal | i18n: `STRANGENESS.INSTRUCTIONS_PARTICLE_PROPAGATION`, `PARTICLE_PROPAGATION.*` |
| `particle-propagation.component.ts` | UI shell + orchestration of load → precompute → RAF loop | Thin: wire services, call `timeline.applyTime()` + `scene.render()` |

### Magnetic-field visualisation (short)

Streamlines in the spirit of Fig. 19 of the 2022 distributed-field paper — density-controllable **lines** with `|B|` vertex colours (Jet), not a colour-mapped slice plane. Seeds on a disc at `z = 0`; bidirectional RK4 along `±B̂`; one native `THREE.LineSegments` + cone arrowheads. Field-strength slider (`0.5…2 T`) multiplies the Chebyshev map by `B_ui / NOMINAL_SOLENOID_B_T`; tracks keep the old curvature until **Replay** re-runs RK4.

### Detector rendering (short)

`detector-loader` → `DetectorModel` with ITS-centred recentering (~+30 cm Y offset fix). Meshes merged via `mergeStaticMeshesByMaterial`; L3 defaults opaque; `depthWrite` + `polygonOffset` like Visual Analysis; DPR capped while orbiting. Camera opens in a fixed 3/4 “down the barrel” pose.

---

## Physics pipeline (per event)

1. **`MagneticFieldService.load()`** — fetch + little-endian-parse the four `assets/field/*.bin` LUTs (once, cached).
2. **`ParticleDataService.loadEvent(n)`** — curated JSON → `PropagationParticle[]` (primary @ IP, V0 @ secondary vertex).
3. **`Rk4PropagatorService.precompute(particles)`** — off-main-thread RK4 (`du/ds = k·(u×B(r))`, `k = charge·B2C/|p|`); progress events, then `BufferedTrack[]` as Transferable buffers.
4. **`track-renderer.createTrackLines()`** — fat `Line2` per track, `instanceCount = 0` until reveal.
5. **`PropagationTimeline`** — single `globalTimeMs` axis (`t < 0` intro → `t = 0` flash → `t > 0` propagation); `applyTime()` only updates visibility / draw range — **no re-computation**.

---

## Hard rules

1. **No physics/math** in `particle-propagation.component.ts` or anywhere under `scene/`. New math → `physics/`.
2. RK4 must stay off the main thread (Worker) or explicitly chunked with a yield — never a tight sync loop over `MAX_TRACKED_PARTICLES × MAX_RK4_STEPS`.
3. Binary field parsing only via `DataView` + explicit little-endian.
4. `FIELD_SCALE` is **not** a blind copy of `gpu_propagator`'s GLSL `SCALE` — the sign was corrected against real VA trajectories (`rk4-trajectory-validation.spec.ts`). Do not “fix” it back to match GLSL without re-running that spec.
5. After new services/physics and a successful build: from `alice-masterclass-js`, run `graphify update .`.

---

## How to extend

1. Orient with Graphify (`graphify query` / `path`) or the responsibility map above.
2. New physics → file under `physics/` (plain TS if it must run in the Worker) + unit spec.
3. New visuals over pre-computed data → `scene/`; wire from the component.
4. `npm run build` (or targeted tests), then `graphify update .`.

---

## Testing

```bash
cd alice-masterclass-js
npm run test:ci -- --include='src/app/particle-propagation/**/*.spec.ts'   # module only
npm run test:ci                                                             # full suite
npm run build:dev
```

Key specs:

| Spec | Guards |
| --- | --- |
| `cheb-field-data.spec.ts`, `magnetic-field.service.spec.ts` | Real `.bin` LUTs, magnitude/direction, UI strength scaling |
| `rk4-integrator.spec.ts` | Radius of curvature vs `R = p_t / (B2C·\|B\|·\|q\|)` in a uniform field |
| `rk4-trajectory-validation.spec.ts` | RK4 vs real VA `trajectory` in `event_0_0.json` (bending direction / arc) — catches `FIELD_SCALE` sign bugs |
| `particle-data.service.spec.ts` | Curated `event_0.json` + truncation keeps V0 |
| `field-line-tracer.spec.ts`, `field-colormap.spec.ts`, `field-line-visualizer.spec.ts` | Streamlines, Jet map, native `LineSegments` |
| `detector-loader.spec.ts`, `detector-appearance.spec.ts` | GLB recenter, materials, dark mode |
| `particle-propagation.component.spec.ts` | UI-shell smoke (detector / intro mocked) |

---

## Regenerate / refresh assets checklist

```bash
# Field map — re-copy from either research data/ tree if upstream updates
#   sol_params.bin  sol_segments.bin  dip_params.bin  dip_segments.bin
# → alice-masterclass-js/src/assets/field/

# Events — rebuild from local Strangeness part1
cd alice-masterclass-js
node scripts/curate-propagation-events.mjs

# Sanity
npm run test:ci -- --include='src/app/particle-propagation/physics/cheb-field-data.spec.ts'
npm run test:ci -- --include='src/app/particle-propagation/physics/rk4-trajectory-validation.spec.ts'
npm run test:ci -- --include='src/app/particle-propagation/data/particle-data.service.spec.ts'
```
