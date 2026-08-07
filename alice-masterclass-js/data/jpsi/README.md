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
