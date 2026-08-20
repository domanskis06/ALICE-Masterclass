# Spectrum Analysis (exercise 2) — data provenance

The web assets for `nuclear-modification-spectrum-analysis` are generated from the
same Pb–Pb sample the ALICE masterclass has always used, LHC10h run 139036
(`MasterClassesTree_LHC10h_Run139036.root`). The Münster group published a
flattened export of that tree for their Jupyter version of the exercise
([NTW-Muenster/alice-mc-raa](https://github.com/NTW-Muenster/alice-mc-raa)), and
that export is what `build_assets.py` reads.

## Raw inputs

Download into `raw/` (git-ignored, ~145 MB):

| file | rows | content |
| --- | --- | --- |
| `track_info.pkl` | 38 042 122 | one row per track: `trackPt` [GeV/c], `trackCent` [%] |
| `event_information.csv` | 118 909 | one row per event: multiplicity, centrality [%] |
| `pp_reference.dat` | 51 | pp reference spectrum, fewer digits than the shipped JSON |

The links live in the Münster repository's notebooks (sciebo share). Everything in
`raw/` stays out of git; only the generated assets are committed.

`build_assets.py` caches the unpickled track arrays as `raw/_pt.npy` and
`raw/_cent.npy` (152 MB each) because unpickling takes far longer than reading
them back. Delete the caches to force a re-read.

## Generated assets

Written to `src/assets/exercises/raa/part2/`:

- **`tracks_fine.json`** (41 KB) — track counts per centrality class on a
  0.01 GeV/c grid from 0.15 to 15 GeV/c (1485 bins), plus `nEvents`, `nColl` and
  the `overflow` above 15 GeV/c. A track only carries `(pt, centrality)`, so this
  tally holds the same information as the 38 M row track list while being ~2000×
  smaller — the student can still choose any binning and nothing is thrown away.
- **`events.json`** (1.3 MB) — `mult` and `cent` per event. Kept per event because
  the event part of the exercise needs the multiplicity distribution and the
  multiplicity-versus-centrality map, and because the student should derive
  `N_evt` from their own centrality choice rather than be handed it.
- **`pp_reference.json`** (1 KB) — pp `dN/dp_T` per event on the 51-bin ALICE grid.
  Values come from the already shipped `../pp_reference.json` (extracted from
  `PP_2760GeV_BaseLine.root`, six significant digits) rather than from
  `raw/pp_reference.dat`, which is rounded further. It is already normalised per
  event and per GeV/c, so the analysis must not divide it again.
- **`tracks_demo.json`** (35 KB) — 2000 real tracks for each of three classes,
  used only by the tutorial to fill a histogram track by track.

`metadata.json` in the parent directory is kept in step: `centralityBins` and
`nColl` are rewritten to the ten classes covered here. `⟨N_coll⟩` for `80-90` is
6.32, taken from the Münster notebook's `dictNColl`; the other nine keep the
values the repository already shipped.

## Centrality rounding

Centrality is rounded to four decimals for both events and tracks, once, before
anything is classified. This matters: at two decimals about 90 events shift
across a class edge, and the event count the app derives from `events.json` would
no longer match the `nEvents` stored in `tracks_fine.json`.

## Regenerating

```bash
cd alice-masterclass-js/data/raa/part2
python3 -m venv .venv && .venv/bin/pip install numpy pandas   # first time only
.venv/bin/python build_assets.py
```

The script verifies itself before exiting and returns a non-zero status on any
mismatch:

- rebinning the fine grid onto the ALICE grid must reproduce the totals in
  `../../../src/assets/exercises/raa/pt_spectra.json` exactly (6 272 646 tracks
  for 0–5%), and no individual bin may differ by more than 0.5 σ of its own
  `sqrt(N)` — the residual few-track differences are tracks sitting on a bin edge,
  because ROOT filled the reference from `float32` momenta;
- the event counts derived from `events.json` must reproduce `nEvents` for every
  class (5984, 6107, 12040, 12202, 12116, 12073, 12144, 12102, 12247, 11795).
