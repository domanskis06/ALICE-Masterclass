# Changelog detail — Visual Analysis: Model

[← Back to CHANGELOG](../../CHANGELOG.md)

Regenerated the ALICE detector geometry used by the Event Display from the actual **ALICE Run 3 (O2)**
simulation geometry, instead of hand-modelled or legacy assets, then converted and optimised it for
real-time rendering in the browser.

| | |
| --- | --- |
| **Module** | `alice-masterclass-js/src/app/shared/components/event-display/` |
| **Assets** | `alice-masterclass-js/src/assets/models/alice components/*.glb` |
| **Source geometry** | O2 simulation (`o2-sim`), ALICE2 detector version |
| **Conversion tool** | [`eic/root2cad`](https://github.com/eic/root2cad) |
| **Optimisation tool** | [`gltfpack`](https://github.com/zeux/meshoptimizer/tree/master/gltf) (meshoptimizer) |
| **Baseline** | [`gitlab.cern.ch/alice-masterclass/alice-masterclass-js`](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js) `master` (tag `0.0.6`) |

---

## Why

The GLB models previously used for the detector layers did not reflect the real Run 3 ALICE geometry.
To keep the construction-mode palette and the Event Display scene faithful to the actual experiment,
the models were re-extracted directly from O2's own detector simulation rather than approximated by hand.

## Pipeline

### 1. Export the geometry from O2 (`o2-sim`)

Run on a machine with a booted O2 (`O2Physics`) environment:

```bash
o2-sim -m FDD FT0 FV0 -n 1
```

`-m` selects which detector modules to include in the simulation/geometry (`-n 1` just runs a single
event, since only the resulting geometry is needed, not physics output). Module selection is fully
customisable — passing a different `-m` list pulls a different subset of the detector into the exported
geometry. Running `o2-sim` with an invalid module name prints the full list of modules available for the
current detector version (`ALICE2`):

| # | Module | # | Module | # | Module |
| --- | --- | --- | --- | --- | --- |
| 0 | ITS | 8 | MFT | 16 | HALL |
| 1 | TPC | 9 | MCH | 17 | MAG |
| 2 | TRD | 10 | MID | 18 | DIPO |
| 3 | TOF | 11 | ZDC | 19 | COMP |
| 4 | PHS | 12 | FT0 | 20 | PIPE |
| 5 | CPV | 13 | FV0 | 21 | ABSO |
| 6 | EMC | 14 | FDD | 22 | SHIL |
| 7 | HMP | 15 | CTP | | |

### 2. Convert to GLB (`root2cad`)

The raw O2/ROOT geometry is converted to `.glb` using the [`root2cad`](https://github.com/eic/root2cad)
macro — the same conversion path used by the EIC software stack to turn ROOT detector geometries into
CAD/web-friendly formats.

### 3. Simplify for the browser (`gltfpack`)

The converted GLBs are large enough that shipping them raw would blow up load times and tank frame rate,
so each one is passed through `gltfpack`:

```bash
npx -y gltfpack -i alice_raw.glb -o alice_slim.glb -si 0.5
```

`-si 0.5` sets the **simplification ratio**: `gltfpack` runs meshoptimizer's mesh simplifier and targets
roughly **50% of the original triangle count** per mesh, collapsing near-coplanar and low-visual-impact
geometry while preserving the overall silhouette. A ratio of `1.0` would leave meshes untouched; lower
values simplify more aggressively at the cost of surface detail. `0.5` was chosen as a middle ground —
detector layers stay recognisable at the distances/zoom levels used in the app, while file size and
GPU vertex load drop substantially.

### 4. Manual pruning

After simplification, parts that are never visible to the student (or that add negligible visual value
relative to their rendering cost) were removed by hand from each GLB — e.g. internal support structure,
occluded sub-components — to further cut draw calls and triangle count in the live scene.

## Not present upstream

The upstream repository ships static, hand-curated GLB assets with no documented sourcing pipeline. This
O2-sim → `root2cad` → `gltfpack` → manual-prune pipeline (and the resulting Run 3–accurate geometry) is
new to this fork.
