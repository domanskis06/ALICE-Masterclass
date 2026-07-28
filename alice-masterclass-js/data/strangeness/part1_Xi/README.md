# Xi / anti-Xi cascades for Visual Analysis

How the 32 Ξ / Ξ̅ cascade events in Strangeness Visual Analysis were produced, how they are wired into datasets, and how to regenerate them.

| | |
| --- | --- |
| **Exercise** | Strangeness Visual Analysis (`strangeness-visual-analysis`) |
| **Source dump** | [`Xi_params.txt`](Xi_params.txt) (FemtoUniverse candidate log) |
| **Converter** | [`convert_xi_params.py`](convert_xi_params.py) (Python 3, stdlib only) |
| **Legacy ROOT path** | [`../part1/convert_events.C`](../part1/convert_events.C) — *not* used for these Xi |
| **Production JSON** | `src/assets/exercises/strangeness/part1/event_{1–20}_15.json` (+ `_16` for datasets 1–12) |
| **Loader** | `StrangenessDataService` (`getEventsInDataset`, `FULL_EVENT_FILE_IDS`) |

Related: EventDisplay cascade picking — [`ci/docs/event-display.md`](../../../../ci/docs/event-display.md). Multi-cascade histogram behaviour — [`ci/docs/changelog-visual-analysis-histograms.md`](../../../../ci/docs/changelog-visual-analysis-histograms.md).

---

## Why a separate pipeline?

The original VA events under `data/strangeness/part1/events/` were converted from AliVSD ROOT with `convert_events.C`, which uses **TEveTrackPropagator** to bake `trajectory` polylines into JSON.

The 32 new Ξ candidates arrived only as a text dump (`Xi_params.txt`: momentum + position + sign per daughter / bachelor). O2 / open-data do **not** ship trajectory points for these candidates, and we do not have ROOT files for them. Re-running the ROOT macro was therefore impossible.

Solution: a Python converter that mirrors the *idea* of `convert_events.C` (uniform \(B_z\), helix steps, same VA JSON schema) without ROOT/TEve.

> Demo dataset `0` already contains one historical cascade (`event_0_3.json` from the ROOT pipeline). It was left untouched. The 32 new events are appended to workshop datasets **1–20** only.

---

## Layout

```
data/strangeness/
  part1/                    ← legacy ROOT → JSON (V0s + one historical Xi)
    convert_events.C
    events/                 ← AliVSD ROOT sources
  part1_Xi/                 ← THIS folder: FemtoUniverse → JSON for new Xi
    Xi_params.txt
    convert_xi_params.py
    README.md               ← this file
    _out/                   ← optional regenerable artefacts (gitignored locally if created)

src/assets/exercises/strangeness/part1/
  event_0_*.json            ← demo (unchanged; includes event_0_3 cascade)
  event_{1-20}_0…14.json    ← original workshop / full events
  event_{1-20}_15.json      ← 20 new Xi events (one per dataset 1–20)
  event_{1-12}_16.json      ← 12 extra Xi events (second cascade in datasets 1–12)
```

Do **not** commit regenerable `_out/` dumps unless you have a reason; production truth is the files under `src/assets/.../part1/`.

---

## Physics / format decisions (locked)

### Species from bachelor sign

| Parent | Bachelor | Pos daughter | Neg daughter |
| --- | --- | --- | --- |
| Ξ⁻ (`pdg_parent` −3312) | π⁻ (`sign` −1, PDG −211) | p (2212) | π⁻ (−211) |
| Ξ̅⁺ (`pdg_parent` +3312) | π⁺ (`sign` +1, PDG +211) | π⁺ (211) | p̅ (−2212) |

Masses used in the converter (GeV/\(c^2\)):

| Species | Mass |
| --- | --- |
| π± | 0.1395704 |
| p / p̅ | 0.9382721 |

(Reference table also used in teaching materials: e± 0.0005, K⁰ 0.4976, Λ 1.1157, Ξ 1.3217.)

### Vertices

`Xi_params.txt` gives a separate `(x,y,z)` per leg. For VA:

- **V0 (Λ) vertex** = midpoint of pos and neg daughter positions.
- **Cascade (Ξ) vertex / bachelor start** = bachelor’s own `(x,y,z)`.
- Cascade daughters (`type` CASCADE) start at the V0 midpoint; bachelor (`type` CASCADE_BACHELOR) starts at the cascade vertex.

### Track types and decay order

Matches existing cascade JSON (e.g. `event_0_3.json`):

| Role | `type` | Value |
| --- | --- | --- |
| V0 daughters | `CASCADE` | 2 |
| Bachelor | `CASCADE_BACHELOR` | 3 |

Decay array order: **`[neg, pos, bachelor]`**, all with the same `decayId` (0 for these single-cascade events).

Each production file is a minimal event:

```json
{ "tracks": [], "decays": [ [ neg, pos, bachelor ] ], "clusters": [] }
```

Background tracks were intentionally omitted — each appended slot is a dedicated Ξ teaching event.

### Helix propagation (TEve-like)

Constants in `convert_xi_params.py`:

| Constant | Value | Role |
| --- | --- | --- |
| `B_FIELD_T` | 0.5 T | Uniform \(B_z\) (same order as `convert_events.C`) |
| `B2C` | \(0.299792458 \times 10^{-2}\) | GeV / (c·T·cm) |
| `STEP_CM` | 1.5 cm | Euler step along the path |
| `MAX_R_CM` / `MAX_Z_CM` | 600 cm | Detector box stop |
| `MAX_PATH_CM` | 500 cm | Cap spirals of low-\(p_T\) tracks (avoids 2000-point helices) |
| `MAX_POINTS` | 2000 | Hard point limit |

Energy: \(E = \sqrt{p^2 + m^2}\). Invariant mass of the three legs should sit near the Ξ mass (~1.32 GeV); the converter’s `validate_cascades()` sanity-checks this.

---

## How the 32 events map onto datasets

Goal: **every** workshop / full dataset a student can pick contains at least one Ξ.

| Source index in `Xi_params.txt` | Production file | Datasets |
| --- | --- | --- |
| 0 … 19 | `event_{1…20}_15.json` | one Ξ in each of datasets 1–20 |
| 20 … 31 | `event_{1…12}_16.json` | second Ξ in datasets 1–12 |

Navigable lengths (`StrangenessDataService`):

| Dataset | Event count | Notes |
| --- | --- | --- |
| 0 (demo) | 4 | Original demo only; historical Xi at index 3 |
| 1–12 | 17 | indices 0–14 original + 15 + 16 Xi |
| 13–19 | 16 | indices 0–14 original + 15 Xi |
| 20 (full) | 5 | UI indices 0–4 map to files `[0, 1, 2, 3, 15]` via `FULL_EVENT_FILE_IDS` |

If you add or remove Xi files, update `getEventsInDataset()` / `FULL_EVENT_FILE_IDS` and the VA component’s `maxEvents` wiring in the same change.

---

## Regenerate

From `alice-masterclass-js/`:

```bash
# Smoke / rebuild regenerable dumps under part1_Xi/_out/
python3 data/strangeness/part1_Xi/convert_xi_params.py
```

That writes:

- `_out/xi_cascades.json` — full cascade records + metadata
- `_out/xi_events/event_21_*.json` — 32 events with temporary dataset id `21`

### Promote into production asset names

After a regenerate, **rename and copy** into assets (do not leave `event_21_*` in production):

```bash
python3 << 'PY'
from pathlib import Path
import shutil

src = Path('data/strangeness/part1_Xi/_out/xi_events')
dst = Path('src/assets/exercises/strangeness/part1')

mapping = []
for ds in range(1, 21):
    mapping.append((ds - 1, ds, 15))          # indices 0..19 → *_15
for ds in range(1, 13):
    mapping.append((19 + ds, ds, 16))         # indices 20..31 → *_16

for xi_i, ds, ev in mapping:
    s = src / f'event_21_{xi_i}.json'
    t = dst / f'event_{ds}_{ev}.json'
    shutil.copy2(s, t)
    print(f'{s.name} → {t.name}')
print(f'copied {len(mapping)} files')
PY
```

Then spot-check in the app: pick datasets 1, 12, 13, 20; open the last event(s); confirm cascade click → calculator → Ξ histogram.

### Optional flags

```bash
python3 data/strangeness/part1_Xi/convert_xi_params.py \
  --input data/strangeness/part1_Xi/Xi_params.txt \
  --cascades-out data/strangeness/part1_Xi/_out/xi_cascades.json \
  --events-out data/strangeness/part1_Xi/_out/xi_events \
  --normalized-out data/strangeness/part1_Xi/_out/xi_params_normalized.json \
  --dataset 21
```

`--input` may also be a previously written normalized JSON (pre-propagation).

---

## What future developers should / should not do

**Do**

- Treat `Xi_params.txt` + `convert_xi_params.py` as the source of truth for these 32 events.
- Keep propagation constants aligned with `convert_events.C` unless you intentionally change the visual language of *all* VA helices.
- Keep cascade `type` / decay order compatible with EventDisplay + calculator (see `TrackType` in the student app models).
- When changing counts or mapping, update `StrangenessDataService` and its unit tests together.

**Do not**

- Put new heavy physics into `EventDisplayComponent` — regenerate trajectories here or in a dedicated Angular Service (see architecture rules).
- Expect O2 to give trajectory points for free; if you get better source data (ROOT/VSD), prefer extending / reusing `convert_events.C` instead of this text path.
- Confuse this folder with Particle Propagation events (`ci/docs/particle-propagation.md`) — those use a different JSON schema and a real 3D field map.

---

## Historical note

Earlier attempts left intermediate artefacts under `scripts/` (`xi_cascades.json`, `xi_events/`, assignment maps). Those were superseded by this folder and by the production files in `assets/.../part1`. Anything regenerable belongs under `part1_Xi/_out/` (local) or should be deleted after promoting to assets.
