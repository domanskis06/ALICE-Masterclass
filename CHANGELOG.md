# Changelog

All notable changes to the ALICE MasterClass student app are documented here. Each area below is
compared against the upstream repository
[`gitlab.cern.ch/alice-masterclass/alice-masterclass-js`](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js)
(`master`, tag `0.0.6`) — the version this monorepo forked from before the features below were added.

Version tags follow the existing release flows: `v*-dev` for the workshop stack
([`ci/docs/dev-deployment.md`](ci/docs/dev-deployment.md)) and `v*-demo` for the
public SPA ([`ci/docs/demo-app.md`](ci/docs/demo-app.md)).

## [0.4.0] - 2026-08-07

New **J/psi analysis** exercise: students measure J/psi production in proton-proton and
proton-lead collisions and remove the combinatorial background with the like-sign method.
Detail: [`ci/docs/jpsi-analysis.md`](ci/docs/jpsi-analysis.md).

### **J/psi analysis**

Own module at `/jpsi-analysis`, with no event display. Quick Analysis fills a live dE/dx vs
momentum heatmap in presets of 100/200/500/1000 events or all of them, appending to what is
already analysed rather than starting over. The student selects electron candidates with a
cut rectangle, then compares opposite-charge against same-charge pairs on a single overlaid
mass chart and subtracts the background sum to expose the peak at 3.1 GeV/c². Signal,
background, S/B and significance are read off a mass window and saved to a results table.

Both collision systems are analysed independently; their state is kept side by side, so
switching back and forth never loses progress. A compare panel opens once both rows exist.

Data comes from the classic ROOT MasterClass VSD files, converted offline to PID-only
columnar JSON batches (`data/jpsi/convert_events.C`, ~6.7 MB of assets).

Upload data is a placeholder: there is no J/psi endpoint in the Django API yet, and the
teacher module is untouched.

→ Details: [`ci/docs/jpsi-analysis.md`](ci/docs/jpsi-analysis.md)
→ Data pipeline: [`alice-masterclass-js/data/jpsi/README.md`](alice-masterclass-js/data/jpsi/README.md)

## [0.3.0] - 2026-08-05

Public **demo** student SPA (offline, no Django/teacher) plus guided **VA / LSA
tutorials** in both demo and workshop builds. Detail:
[`ci/docs/demo-app.md`](ci/docs/demo-app.md),
[`ci/docs/tutorials.md`](ci/docs/tutorials.md),
[`ci/docs/changelog-demo-app.md`](ci/docs/changelog-demo-app.md).

### **Public demo app**

Separate OKD namespace `alice-web-masterclass-demo` serving only the student Angular
build with `demoMode: true`. Results persist in `sessionStorage` (refresh-safe,
new tab resets). One-time info dialog (no permanent banner). VA histograms are
shared across datasets; LSA adds enhancement plot + teacher-style Results table,
Undo on accepted fits, and no Upload. Deploy with tags `v*-demo`.

→ Details: [`ci/docs/changelog-demo-app.md`](ci/docs/changelog-demo-app.md)
→ Ops / redeploy: [`ci/docs/demo-app.md`](ci/docs/demo-app.md)

### **Tutorials (VA & LSA)**

driver.js tours for Visual Analysis and Large Scale Analysis. In the **demo**, a
Skip/Start welcome opens on exercise entry; in **workshop** builds the same tours
start from Help → Start tutorial. Demo step lists omit Upload and (LSA) walk
through the enhancement plot and Results summary. Next/Done controls styled red
with white labels in both builds.

→ Behaviour matrix: [`ci/docs/tutorials.md`](ci/docs/tutorials.md)
→ LSA tour history: [`ci/docs/changelog-large-scale-analysis.md`](ci/docs/changelog-large-scale-analysis.md)

## [0.2.0] - 2026-08-03

Summary of student-app work in this fork versus upstream `0.0.6`. Detail docs under `ci/docs/changelog-*.md`
were refreshed for side-view sync/masks, detector load optimisation, LSA fit UX, and Particle Propagation
Pb–Pb intro (see also [`ci/docs/event-display.md`](ci/docs/event-display.md),
[`ci/docs/particle-propagation.md`](ci/docs/particle-propagation.md)).

### **Visual Analysis**

Rebuilt into three areas: how masses land in histograms, how the 3D scene renders and themes itself,
and a new guided detector-construction step before analysis starts.

##### Histograms

Multi-entry mass histograms (events with several V0/cascade candidates no longer overwrite each other),
a student-facing bin-count control, a flying-ball landing animation, and a one-time explainer dialog.
The Django backend and API payload were updated to accept multiple mother particles per event.

→ Details, affected files: [`ci/docs/changelog-visual-analysis-histograms.md`](ci/docs/changelog-visual-analysis-histograms.md)

##### Visualisation

Light/dark scene mode, a calorimeter energy-bar readout, tuned bloom/opacity/camera constants, a
proton–proton collision intro video, a corner-overlay panel describing the highlighted detector part,
and **linked Rφ/ρz side views**: per-pane detector masks (View 1 / side: ITS+TRD; View 2 / front:
ITS+TPC+TRD+TOF) at opacity 0.5, zoom synced to the main 3D orbit distance with throttled RT refresh.

→ Details, affected files: [`ci/docs/changelog-visual-analysis-visualisation.md`](ci/docs/changelog-visual-analysis-visualisation.md)
→ Live guide: [`ci/docs/event-display.md`](ci/docs/event-display.md) § “Side views (Rφ / ρz)”

##### Construction mode

Guided, drag-and-drop assembly of the ALICE detector (one layer at a time, with a reference photo per
piece) before a student can analyse events, with a per-session skip and a persisted "already built" flag.

→ Details, affected files: [`ci/docs/changelog-visual-analysis-construction.md`](ci/docs/changelog-visual-analysis-construction.md)

##### Model

Detector geometry regenerated from the actual ALICE Run 3 (O2) simulation geometry via `o2-sim` instead
of legacy/approximated assets, converted to GLB with `root2cad`, simplified for the browser with
`gltfpack`, and manually pruned of invisible/low-value elements to keep the scene fast. Visual Analysis
EventDisplay further batches mesh merges at load time (and prunes tiny CAD fragments on non–ITS/TPC
layers; FIT gets an extra `gltfpack` pass) — see the model changelog § 3b.

→ Details, affected files: [`ci/docs/changelog-visual-analysis-model.md`](ci/docs/changelog-visual-analysis-model.md)
→ Live EventDisplay guide: [`ci/docs/event-display.md`](ci/docs/event-display.md) § “Detector load optimisation”

### **Large Scale Analysis**

Interactive onboarding tour (driver.js) that walks through histogram selection, opening a histogram,
fitting signal + background, and accepting a result — advancing itself when the student performs the
expected action instead of only on "Next". Dismiss state is persisted so returning students are not
forced through it again. Fit UX: brush-zoom on the histogram with a visible range indicator, signal /
background slider restyle, Unzoom / Reset-range controls, and `FitService.clampRangeToView` /
`clearFit` so fit intervals stay coherent when the axis zooms.

→ Details, affected files: [`ci/docs/changelog-large-scale-analysis.md`](ci/docs/changelog-large-scale-analysis.md)

### **Particle Propagation**

Brand-new exercise (no upstream equivalent at all): live RK4 propagation of collision products through
the exact ALICE magnetic field (Chebyshev field model), rendered in its own Three.js scene with a
field-line overlay, time scrubber, and curated teaching events. Collision intro supports **proton**
beams and a **Pb–Pb** dense-demo event (procedural lead nuclei); each event change resets to an
independent **Start** (no auto-play across events).

→ Details, architecture, file layout: [`ci/docs/particle-propagation.md`](ci/docs/particle-propagation.md)

### **Home / app shell**

Desktop-app download CTA removed from the home screen; intro copy typography tightened for the web-only
entry path.
