# J/psi PID data converter

Turns the ALICE MasterClass J/psi VSD files into the columnar JSON assets used by the
Angular `jpsi-analysis` module.

The generated assets live in `src/assets/exercises/jpsi/` and **are committed** to the
repository. They total about 6.7 MB, so there is no need to regenerate them for a normal
checkout. Rerun the converter only when the source data or the schema changes.

## Prerequisites

ROOT with Eve/VSD support, so that `TEveVSD` is available. Verify with:

```bash
root -l -b -q -e 'TEveVSD v; printf("ok\n");'
```

`convert.sh` fails with a clear message when ROOT is missing or when the inputs are not
present, and leaves the macro and this document in place.

## Getting the input files

The VSD files are not committed; they are about 33 MB and are ignored via the root
`.gitignore`. Fetch them from the classic desktop MasterClass repository:

```bash
cd alice-masterclass-js/data/jpsi
mkdir -p vsd
BASE=https://gitlab.cern.ch/pinowako/masterclass-continued/-/raw/master/vsdData/Jpsi
curl -fL -o vsd/events_0.root "$BASE/events_0.root"
curl -fL -o vsd/events_1.root "$BASE/events_1.root"
```

## Which file is which collision system

`events_0.root` is **pp** and `events_1.root` is **p-Pb**. This is not written anywhere in
the source data, so it is established by track multiplicity: a p-Pb collision produces
many more particles than a pp collision.

| File | Events | Tracks | Tracks per event |
| --- | --- | --- | --- |
| `events_0.root` | 3865 | 85 658 | 22.2 |
| `events_1.root` | 2366 | 114 477 | 48.4 |

Reproduce this with the diagnostic macro:

```bash
root -l -b -q 'inspect_vsd.C("vsd/events_0.root")'
root -l -b -q 'inspect_vsd.C("vsd/events_1.root")'
```

`convert_events.C` repeats the check after conversion and refuses to write the manifest if
p-Pb does not come out with the higher multiplicity, so swapped inputs cannot silently
invert every physics conclusion in the exercise.

## Converting

```bash
cd alice-masterclass-js/data/jpsi
./convert.sh
```

or directly:

```bash
root -l -b -q convert_events.C
root -l -b -q 'convert_events.C("vsd", "../../src/assets/exercises/jpsi")'
```

Events are trimmed to a full hundred so the Quick Analysis presets (100, 200, 500, 1000,
All) always divide evenly: pp keeps 3800 of 3865 events, p-Pb keeps 2300 of 2366. Trimming
takes the first N events in file order.

## Output schema

One file per 100 events, stored column by column. Columns are parallel arrays over all
tracks in the batch; `trackOffsets` carries the event boundaries.

```json
{
  "datasetId": "pp",
  "firstEventIndex": 0,
  "eventCount": 100,
  "trackOffsets": [0, 14, 39, "…", 2213],
  "px": [-1.6558, "…"],
  "py": [0.3041, "…"],
  "pz": [0.512, "…"],
  "p": [2.3329, "…"],
  "dedx": [72, "…"],
  "sign": [1, "…"]
}
```

`trackOffsets` has `eventCount + 1` entries; the tracks of event `i` are the half-open
range `[trackOffsets[i], trackOffsets[i + 1])`. Pairs must only be built inside one event,
so this array is what makes the whole analysis correct.

`manifest.json` lists both datasets with their event and batch counts.

## Mapping from VSD

| JSON | VSD source | Note |
| --- | --- | --- |
| `px`, `py`, `pz` | `fVSD->fR.fP` | GeV/c |
| `p` | derived | stored so the heatmap does not recompute it per frame |
| `dedx` | `fVSD->fR.fStatus` | see quirk below |
| `sign` | `fVSD->fR.fSign` | `+1` or `-1` |

Numbers are rounded to four decimals with trailing zeros removed.

## Known quirks

**dE/dx hides in the status field.** The MasterClass VSD writer stores specific energy
loss in `fStatus`, which normally holds a reconstruction status flag. `JpsiVSDReader.cxx`
in the original code reads it the same way with `track->GetStatus()`. Because `fStatus` is
an integer, dE/dx values are whole numbers. Observed range is 0 to about 1600 with a mean
near 56; a handful of tracks per file have exactly 0.

**No trajectories, no decays.** The web exercise never renders events, so the converter
skips the propagator entirely. This is the main difference from
`data/strangeness/part1/convert_events.C` and the reason the assets stay small.

**No energy column.** The original ROOT exercise assigns a mass per track with
`mass2 = (dedx > 62) ? 0. : 0.019`, which hands the pion mass to low dE/dx tracks
regardless of what the student selected. The web module drops that hack: every track the
student selects is treated as an electron and gets the electron mass, so energy is
computed on the fly as `E = sqrt(p^2 + m_e^2)` during pairing. Storing an energy column
would bake in the old inconsistent hypothesis. See `ci/docs/jpsi-analysis.md`.

## Validation

After conversion the macro prints per dataset: events written, batches, tracks, tracks per
event, dE/dx min/max/mean, count of zero dE/dx, and the charge split. Expected output:

```
=== pp ===
events            : 3800
batches           : 38
tracks            : 84076
tracks per event  : 22.1253
dE/dx min/max/mean: 0 / 1440 / 56.8376
dE/dx == 0        : 66
sign +/-          : 42413 / 41663  (other: 0)

=== pPb ===
events            : 2300
batches           : 23
tracks            : 111679
tracks per event  : 48.5561
dE/dx min/max/mean: 0 / 1628 / 55.9152
dE/dx == 0        : 70
sign +/-          : 56015 / 55664  (other: 0)
```

Structural check on the emitted JSON:

```bash
cd ../../src/assets/exercises/jpsi
python3 -c "
import json, glob
for f in sorted(glob.glob('*/batch_*.json')):
    d = json.load(open(f))
    assert len(d['trackOffsets']) == d['eventCount'] + 1, f
    n = d['trackOffsets'][-1]
    for col in ['px', 'py', 'pz', 'p', 'dedx', 'sign']:
        assert len(d[col]) == n, (f, col)
print('all batches valid')
"
```

Output size: 2.9 MB for pp, 3.8 MB for p-Pb, 6.7 MB in total. The agreed threshold for
switching to CI-side generation is 100 MB, so committing the assets is comfortably fine.

## Expected physics

With an electron band of `dE/dx` in 70 to 90 and `p` in 0.6 to 10 GeV/c, counting in the
mass window 2.9 to 3.3 GeV/c<sup>2</sup> over the full datasets:

| Dataset | N(J/psi) | Background | S/B | Significance |
| --- | --- | --- | --- | --- |
| pp | 241 | 165 | 1.46 | 12.0 |
| p-Pb | 115 | 170 | 0.68 | 6.8 |

The signal-to-background ratio drops by roughly a factor of two in p-Pb. That contrast is
the point of the exercise: more particles per collision means more random pairs, so the
same signal is harder to extract.

## Pb-Pb dataset (AO2D)

`pbPb` is generated by a **separate** macro, `convert_ao2d_events.C`, from an O2 AOD file
rather than a VSD. See "Why a separate macro" below for why the two cannot share a reader,
and "Validation" for an important, honest caveat about the resulting signal quality —
**read that section before deciding whether to enable this dataset for students.**

### Getting the input file

Unlike the VSD files, there is no single canonical small download: the source is a Pb-Pb
run from ALICE Open Data, format O2 AOD.

```bash
# Example used during development (LHC15o, one AO2D.root from
# https://opendata.cern.ch/record/11537):
mkdir -p data/jpsi/ao2d
# place/copy the downloaded AO2D.root at data/jpsi/ao2d/AO2D.root
```

The file is **not committed** (same policy as the VSD inputs); `data/jpsi/ao2d/` is in
`.gitignore`.

### Why a separate macro

`convert_events.C` reads `TEveVSD` / `EventNNN` directories and treats `fStatus` as dE/dx.
AO2D has none of that: it stores per-timeframe `DF_*` directories, each holding the
`O2track` / `O2trackextra_*` / `O2collision_*` TTrees, and momentum has to be reconstructed
from helix parameters instead of being read directly. `convert_ao2d_events.C` reuses only
the JSON-writing layer (`BatchBuffer`, `formatNumber`, `writeBatch`) verbatim; the reading
layer is entirely new. Do not try to merge the two readers into one file.

### Mapping

| JSON (UI) | AO2D source | How |
| --- | --- | --- |
| `px`, `py`, `pz`, `p` | `O2track`: `fSigned1Pt`, `fSnp`, `fAlpha`, `fTgl` | momentum reconstruction, see below |
| `sign` | sign of `fSigned1Pt` | `+1` / `-1` |
| `dedx` | `O2trackextra_*`.`fTPCSignal` | same row index as the track |
| `trackOffsets` | `O2track`.`fIndexCollisions` | event boundaries in the batch |
| `datasetId` | constant | `"pbPb"` |

`O2track` and `O2trackextra_*` inside one `DF_*` are row-aligned (same `GetEntry(i)`), but
the extra/collision table names are versioned (`O2trackextra_002`, `O2collision_001` in the
file used during development) and are **not hardcoded**: the macro finds the single tree
per `DF_*` whose name starts with `O2trackextra` / `O2collision` and aborts with a clear
error if that is not unique.

**Momentum formula** (matches O2's `getPt()`, i.e. **unsigned** `pt = 1/|fSigned1Pt|`):

```cpp
const Double_t pt = 1.0 / TMath::Abs(fSigned1Pt);
const Double_t phi = TMath::ASin(clamp(fSnp, -1, 1)) + fAlpha;
const Double_t px = pt * TMath::Cos(phi);
const Double_t py = pt * TMath::Sin(phi);
const Double_t pz = pt * fTgl;
```

This was verified empirically (see Validation): the two conventions (signed vs. unsigned
`pt`) differ by a π shift in `phi` for negative tracks, which would silently flip the
apparent charge asymmetry without crashing anything.

### Cuts (all mandatory, constants at the top of `convert_ao2d_events.C`)

Without cuts a single Pb-Pb event has thousands of tracks; 1000+ events at that rate would
produce a JSON asset in the hundreds of MB and blow past `MAX_PAIRS` in
`jpsi.models.ts`. Cuts, in order:

| Cut | Value | Why |
| --- | --- | --- |
| Event vertex | `\|fPosZ\| < 10` cm | standard primary-vertex cut; collisions outside the range become **empty events** (still counted, so event numbering stays in sync), not dropped |
| Track pt validity | `\|fSigned1Pt\| > 1e-9` | guards `1/\|fSigned1Pt\|` against blowing up |
| Track momentum | `0.1 ≤ p ≤ 10` GeV/c | matches the PID heatmap axis range |
| Track dE/dx sanity | `0 < fTPCSignal < 2000` | drops the small tail of absurd/placeholder values |
| Track TPC quality | `fTPCNClsFindable - fTPCNClsFindableMinusFound ≥ 70` | see "Known quirks" for why it is computed this way; **70 was tried against 120 and 70 measurably preserves more of the weak excess described below — do not raise it without re-running the significance scan** |

Even after cuts, Pb-Pb tracks/event (~1150) is roughly **50x** p-Pb's ~48/event — this
dataset is inherently far busier, by design; see "Validation" for the physics consequence.

### Running

```bash
cd alice-masterclass-js/data/jpsi
./convert_ao2d.sh ao2d/AO2D.root
```

or directly:

```bash
root -l -b -q 'convert_ao2d_events.C("ao2d/AO2D.root", "../../src/assets/exercises/jpsi")'
```

`kTrimTo` (top of the macro) controls how many events are written; it must stay a multiple
of 100. It is currently `1400` — close to the full ~1408 collisions in the file used during
development — because, unlike pp/p-Pb, more statistics measurably helps here (see below).

**No automatic manifest update.** `convert_events.C` intentionally never links a JSON
library (see the comment near `formatNumber`); patching one entry into `manifest.json` with
hand-rolled text parsing in a ROOT macro would be more fragile than the value it adds.
Instead the macro prints, on the last line of its output, the exact object to add to the
`datasets` array in `src/assets/exercises/jpsi/manifest.json`:

```json
{ "id": "pbPb", "labelKey": "JPSI.DATASET.PBPB", "nEvents": 1400, "batches": 14 }
```

Add this **by hand** (the file today has two entries; this is a one-line edit).

### Known quirks

**~46% of tracks have `fSigned1Pt` / `fTPCSignal` equal to `NaN` simultaneously.** Observed
on the development file across every `DF_*` (not a corruption of one timeframe). All cuts
above use plain numeric comparisons (`>`, `<`, `<=`), which are always `false` against
`NaN` in C++, so these rows fall out of every cut automatically — no explicit `isnan()`
check was needed, but the momentum-formula code comments call this out so it is not
"accidentally correct".

**TPC cluster count is stored as a subtraction, not a count.** `O2trackextra_*` has no
`nClsFound` column; the real count is
`fTPCNClsFindable - fTPCNClsFindableMinusFound` (an O2 AOD space-saving convention). Both
are read through `TLeaf::GetValue()` rather than `SetBranchAddress` with a hardcoded type,
since the exact integer width is a schema-version detail.

**`dedx` is on a different scale/pipeline than pp/p-Pb.** pp/p-Pb `dedx` is
`fStatus` from the old AliRoot VSD writer (see "Known quirks" above), an integer with mean
≈56. Pb-Pb `dedx` is `fTPCSignal` from O2's own TPC reconstruction, mean ≈102 on the
development file. Same physical quantity (TPC specific energy loss), different calibration
— the two are **not** directly comparable bin-for-bin, and the electron band that works for
pp/p-Pb (70–90) does **not** work for Pb-Pb (see Validation).

**`px,py,pz` are computed, not copied.** pp/p-Pb momentum comes straight from `fR.fP` in
the VSD. Pb-Pb momentum is reconstructed from helix parameters — an extra step pp/p-Pb
structurally does not have, hence the sanity checks below.

**pp/p-Pb have no track-level cuts at all** (`convert_events.C` takes every track in
`RecTracks`); Pb-Pb **must** cut on vertex, momentum range, dE/dx sanity and TPC quality, or
the assets are unusably large. The three datasets in this exercise therefore represent data
selected under different criteria, not just different collision systems — worth saying
explicitly if results are ever compared bin-for-bin instead of just via the S/B trend.

### Validation

Run in this order (a standalone diagnostic, not part of the shipped macro):

1. `root -l -b -q inspect_ao2d.C` — confirms tree names/versioning per `DF_*`, `fTPCSignal`
   range, NaN fractions, TPC cluster distribution, and a pre-cut multiplicity estimate.
2. **Momentum sanity check**, done inside `inspect_ao2d.C`: `sqrt(px²+py²) - 1/|fSigned1Pt|`
   averaged `-3.6e-20` (rms `5.2e-17`) over ~1.1M tracks — the trig arithmetic is exact
   modulo floating-point noise. Separately, `atan2(py,px)` for `sign>0` vs. `sign<0` is flat
   over `[-π,π]` for both, with matching means (`-0.0074` vs. `-0.0077`) and **no systematic
   phase shift** — this confirms the unsigned-`pt` convention is the right one; a signed-`pt`
   bug would show up here as a ~π offset between the two charge signs.
3. Structural check on the emitted JSON (same script as the pp/p-Pb section above, run
   against `pbPb/*.json`).
4. **Signal check — read this before enabling the dataset for students.** Using the same
   pair-forming and like-sign background subtraction as `JpsiPairingService` /
   `JpsiSignalService`, scanning `dE/dx` bands and `p` ranges for the largest excess in the
   2.9–3.3 GeV/c² window over the full 1400-event dataset:

   | p range (GeV/c) | dE/dx band | Unlike | Like | Signal | S/B | Significance |
   | --- | --- | --- | --- | --- | --- | --- |
   | 1.0–5.0 | 20–40 | 106 957 | 106 029 | 928 | 0.009 | **2.8σ** |

   This is the **best** combination found across a broad scan (dozens of `p`/`dE/dx`
   windows); every combination near the pp/p-Pb electron band (`dE/dx` 70–140) gives
   **zero** excess (unlike ≈ like or unlike < like). Two more data points make this look
   like a statistical fluctuation rather than a real, extractable peak:
     - Re-running the same scan at 1000 events (instead of 1400) gave **3.25σ** in the same
       band — significance went *down*, not up, when 40% more statistics were added, which
       is the opposite of what a genuine signal does.
     - S/B (≈0.9%) is roughly **160x worse** than pp (1.46) and **75x worse** than p-Pb
       (0.68) — not "a bit worse", a different regime.

   **Interpretation:** this is expected, not a bug. Real ALICE Pb-Pb J/ψ→e⁺e⁻ analyses
   combine TPC dE/dx with TOF and often preshower/EMCal information, use momentum-dependent
   (n-sigma) PID bands instead of a flat ADC window, and need far more than ~1400
   minimum-bias events to see a clean peak over Pb-Pb's much larger combinatorial
   background. One AO2D file with TPC-only PID is simply not enough statistics/PID power to
   reproduce the clean pp/p-Pb peaks.
   - The TPC-quality cut was tried at both 70 and 120 clusters; 70 gave a *higher*
     significance (3.25σ vs. 2.84σ at 1000 events), consistent with a stricter cut removing
     real electrons rather than removing background — but the effect is much too small to
     turn this into a convincing peak either way.
   - **Before wiring this dataset into the UI**, decide explicitly whether a dataset with no
     confirmed peak is acceptable for the exercise (e.g. framed as "even harder — can you
     find anything at all?") or whether it should stay out of `manifest.json` until either
     more AO2D files are added for statistics or the PID cut is replaced with something more
     powerful than a flat dE/dx window.
