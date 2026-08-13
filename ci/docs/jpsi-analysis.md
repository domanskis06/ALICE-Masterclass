# J/psi analysis

Students measure how many J/psi mesons were produced in two collision systems, by pairing
electron candidates and removing the combinatorial background with the like-sign method.

| | |
| --- | --- |
| **Module** | `alice-masterclass-js/src/app/jpsi-analysis/` |
| **Route** | `/jpsi-analysis` |
| **Menu** | `JPSI.MENU` — "J/ψ analysis" |
| **Assets** | `assets/exercises/jpsi/manifest.json`, `assets/exercises/jpsi/{pp,pPb}/batch_NNN.json` (~6.7 MB total) |
| **Converter** | `alice-masterclass-js/data/jpsi/` — see its [`README.md`](../../alice-masterclass-js/data/jpsi/README.md) |
| **Event display** | Not used. This exercise has no 3D scene. |

Architecture reminder (`.cursor/rules/architecture.mdc`): all physics lives in services, none
of it in a component.

---

## The physics the student performs

A J/psi can decay into an electron and a positron. Their invariant mass reconstructs the
mass of the parent, so a peak at 3.1 GeV/c² means J/psi mesons were produced.

The problem is that the detector does not tell us which electron belongs to which positron.
Every positron is paired with every electron in the event, and almost all of those pairs are
random combinations. They form a smooth **combinatorial background** that dwarfs the peak.

The way out is that a J/psi never decays into two particles of the same charge. So pairs of
two positrons and pairs of two electrons contain background and nothing else, built from the
same tracks under the same selection. Their sum estimates the background hiding under the
opposite-charge distribution:

```
N = max(0, U - L)          U = opposite-charge pairs in the mass window
B = L                      L = same-charge pairs in the same window (e+e+ plus e-e-)
S/B = N / B
significance = N / sqrt(N + B)
```

Both collision systems are analysed independently and then compared. p-Pb events are much
busier, so the number of random combinations grows faster than the signal and the peak is
harder to see — that difficulty is the lesson, not a defect.

### Deliberate simplifications

- Every track inside the selection rectangle is treated as an electron, exactly as the ROOT
  MasterClass does. The rectangle is the particle identification.
- The energy uses the true electron mass, `E = sqrt(p² + mₑ²)`. The classic ROOT code used a
  dE/dx-dependent stand-in mass; the difference is far below the bin width.
- Signal and background are built with the identical hypothesis and identical cut. This is
  what makes the subtraction meaningful.
- Bins that fluctuate below zero after subtraction are **drawn** as zero, because a negative
  bar confuses students. The reported N and B are summed from the raw histograms, so the
  clamp never inflates a yield. `JpsiSignalService` keeps the two paths separate on purpose.

---

## Data

`data/jpsi/convert_events.C` turns the two ROOT VSD files of the classic MasterClass into
columnar JSON. Only what the exercise needs survives the conversion: `px`, `py`, `pz`, `p`,
`dedx`, `sign`. There are no trajectories, because nothing is drawn in 3D.

Events are written in batches of 100. Each batch carries a `trackOffsets` array marking where
each event's tracks begin — **pairs may only be formed inside one event**, so flattening the
batch would silently corrupt every count downstream.

Datasets are trimmed to round numbers (pp 3800, p-Pb 2300) so the Quick Analysis presets of
100/200/500/1000 events divide evenly and "All" is not a strange leftover.

The VSD inputs are not committed; `data/jpsi/vsd/` is git-ignored and the README explains how
to fetch them.

---

## Module layout

```
jpsi-analysis/
  models/jpsi.models.ts            constants, state shape, bin-edge snapping
  services/
    jpsi-data.service.ts           manifest + batch loading, per-batch cache
    jpsi-pairing.service.ts        cut -> pairs -> the three mass histograms
    jpsi-signal.service.ts         N, B, S/B, significance; residual and background series
    jpsi-analysis-state.service.ts owns both dataset states, emits changes$
    jpsi-quick-analysis.service.ts the appendable run loop
    jpsi-tutorial.service.ts       driver.js tour
  components/
    dataset-toolbar/               collision system, preset, Analyse, Reset histograms
    pid-heatmap/                   dE/dx vs p density plus the cut rectangle
    pid-cut-controls/              sliders and number inputs for the cut
    mass-panel/                    the three series, subtraction, mass window, live numbers
    results-table/                 accepted rows, Upload data placeholder
    compare-panel/                 pp versus p-Pb once both rows exist
  welcome/, instructions/          dialog and Help panel
```

### State

`JpsiAnalysisStateService` holds a full `DatasetAnalysisState` for **both** datasets at once,
so switching collision systems mid-exercise never loses progress: the student returns to a
filled heatmap, their cut, and their histograms. Nothing is persisted — a reload restarts the
exercise, which is what "memory for the duration of the tab session" was specified to mean.

Anything that changes what the histograms contain (appending events, changing or resetting
the cut) drops the mass panel back to explore mode and clears the live result. A residual on
screen must always match the pairs it was computed from. An accepted table row is a frozen
measurement with its own event count, so it survives **Reset histograms** on purpose.

### Quick Analysis

Runs are **appendable**: pressing Analyse again adds the next slice of events rather than
starting over, until the dataset is exhausted. The loop fetches one batch, hands it to the
state in chunks of 25, and yields to the browser between chunks so the heatmap visibly fills.
Only the newly appended events are paired; the existing histograms are added to.

A run that fails mid-way keeps the events already appended, and the component surfaces
`JPSI.ERRORS.BATCH`.

### Performance guard

Pair counts are quadratic in track multiplicity but can be **counted** in linear time, so
before every filling pass `JpsiPairingService.isSelectionTooWide` checks the total against
`MAX_PAIRS` (5 million). Above it the histograms are left empty, subtraction is disabled, and
the panel asks the student to narrow the selection. The widest selection the shipped datasets
allow is about three million pairs on p-Pb, so this is a guard against a future, larger
dataset rather than something a student can trigger today.

### Charts

Both charts measure their container with a `ResizeObserver` and let the observer deliver the
first size. Measuring synchronously in `ngAfterViewInit` would write width and height after
Angular checked the bindings that read them, which is an `NG0100` in dev mode.

The heatmap paints its 120x120 cells on a canvas — that many SVG rectangles could not be
repainted fast enough while a run is in progress — and keeps axes, the colour bar and the cut
rectangle in an SVG overlay so they stay crisp. Colour uses a fixed 20-step palette (violet → red) sampled from the ROOT MasterClass PID
colour bar, indexed as `floor(0.01 + count/max * 20)`. The colours never change; as
`maxCount` grows, each colour simply covers a wider count range.

The dE/dx axis uses one bin per unit because the VSD stores dE/dx as whole numbers. The
earlier 100 bins over a range of 120 gave a bin width of 1.2, which made every fifth bin
collect two dE/dx values and its neighbours one, and painted periodic bright rows over the
whole plot. Any change to `PID_DEDX_MIN`, `PID_DEDX_MAX` or `PID_DEDX_BINS` has to keep the
bin width at a whole number.

The mass panel draws bars rather than smooth densities: the whole lesson is that these are
counts being subtracted from each other. After subtraction the student fits a first-degree
polynomial to the residual background *outside* the peak, then counts the excess inside a
**fixed-width** signal window (0.25 GeV/c² for pp/p-Pb, 0.24 GeV/c² for Pb-Pb — matching the
window Acc×ε is calibrated to on the teacher side). The window can only be slid, not resized,
and starts parked at the **left** of the axis so it does not already cover the peak. There is
no brush-zoom on this chart.

---

## Workshop integration

The results table follows the usual workshop pattern. **Upload data** (`onUploadResults` in
`jpsi-analysis.component.ts`) packages every accepted row — pp/p-Pb rows (`system`, `signal`,
`signalError`, `nEvents`) plus Pb-Pb rows (`system`, `signal`, `signalError`, no `nEvents`, see
below) — and submits them in one `PUT` via `ApiService.submitJpsiAnalysisResults`. Both result
panels have their own **Upload data** button wired to the same `onUploadResults()` — the pp/p-Pb
`ResultsTableComponent` (shown for the pp/p-Pb branch) and the `PbPbResultsComponent` (shown for
the published Pb-Pb branch) — so a student can upload from whichever panel is on screen. Each
button is disabled without a session, or while there is nothing accepted yet on **either**
dataset (`uploadDisabled`, driven by each component's own `hasOtherResults` input pointing at the
*other* panel's rows); a successful or failed submission shows
`JPSI.RESULTS.UPLOAD_SUCCESS`/`UPLOAD_ERROR`.

No mass window is sent: the signal-counting window is a fixed width the student can only slide
(see "The mass panel" above), so there is nothing left to vary or correct for on the teacher
side. `nEvents` is only included for pp/p-Pb — Pb-Pb event counts are a fixed constant the
student has no influence over, so the API rejects `nEvents` on any Pb-Pb entry (and requires it
on pp/p-Pb).

`Event.kind` (`masterclass.models.ExerciseKind`, Django) keeps this exercise's events/sessions
independent from the strangeness and (future) R_AA sub-masterclasses: a J/psi submission can
only target a `kind=jpsi` session (`SubmitJpsiAnalysisResultsAPI` returns 403 otherwise), and a
student id used here does not block that same id in the other sub-masterclasses.

**Client-side kind gating.** `check_session` now also returns the session's `kind`, which
`ApiService` stores as `sessionKind` on successful login. Each exercise's upload button
additionally disables itself when `sessionKind` doesn't match its own kind
(`ApiService.matchesSessionKind` — VA/LSA require `strangeness`, this page requires `jpsi`; see
`wrongExerciseKind` in `ResultsTableComponent`, `PbPbResultsComponent`, `MassHistogramsComponent`
and the strangeness `ResultsComponent`). This is a UX nicety on top of the real, server-side
`Event.kind` guard: it
fails *open* (`sessionKind === null` matches everything) for old cached logins or
`MockApiService`'s demo mode, so it never blocks a legitimate submission the backend would
otherwise accept — it only stops a student from wasting time filling in the wrong exercise for
their session, and shows `PASSWORD.WRONG_EXERCISE_TOOLTIP` explaining why.

The teacher-side module — `jpsi_analysis`/`jpsi_analysis_results` endpoints, R_AA calculation and
display — is documented in [`jpsi-analysis-teacher.md`](jpsi-analysis-teacher.md).

---

## Tour and i18n

`JpsiTutorialService` drives a driver.js tour in the same shape as the LSA one
([`tutorials.md`](tutorials.md)): the welcome dialog offers it on the first visit of a tab,
and Help replays it. Steps advance from real actions — a finished run, a changed cut, a
subtraction, an accepted result — through the `notify*` hooks the component calls.

All strings live under the `JPSI` key in `src/assets/i18n/{en,pl,de,fr}.json`.

---

## Tests

`src/app/jpsi-analysis/**/*.spec.ts` — 39 specs covering pair counts and the electron-mass
invariant mass, the window arithmetic and the presentation-only clamp, per-dataset isolation
and the explore/subtracted transitions, and the appendable run loop.

```bash
cd alice-masterclass-js
npx ng test --watch=false --browsers=ChromeHeadlessCI --include='src/app/jpsi-analysis/**/*.spec.ts'
```

The numbers were cross-checked against an independent recomputation from the JSON assets: pp,
1000 events, dE/dx 70–90, window 2.90–3.30 gives U=86, L=27, N=59, S/B=2.19, significance 6.4.
