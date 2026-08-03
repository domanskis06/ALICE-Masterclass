# Changelog

All notable changes to the ALICE MasterClass student app are documented here. Each area below is
compared against the upstream repository
[`gitlab.cern.ch/alice-masterclass/alice-masterclass-js`](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js)
(`master`, tag `0.0.6`) — the version this monorepo forked from before the features below were added.

Version tags follow the existing `v*-dev` release flow (see [`ci/docs/dev-deployment.md`](ci/docs/dev-deployment.md)).

## [0.2.0] - 2026-07-22

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
proton–proton collision intro video, and a corner-overlay panel describing the highlighted detector part.

→ Details, affected files: [`ci/docs/changelog-visual-analysis-visualisation.md`](ci/docs/changelog-visual-analysis-visualisation.md)

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
forced through it again.

→ Details, affected files: [`ci/docs/changelog-large-scale-analysis.md`](ci/docs/changelog-large-scale-analysis.md)

### **Particle Propagation**

Brand-new exercise (no upstream equivalent at all): live RK4 propagation of collision products through
the exact ALICE magnetic field (Chebyshev field model), rendered in its own Three.js scene with a
field-line overlay, time scrubber, and curated teaching events.

→ Details, architecture, file layout: [`ci/docs/particle-propagation.md`](ci/docs/particle-propagation.md)
