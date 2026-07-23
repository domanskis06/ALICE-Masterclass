# Changelog detail — Visual Analysis: Construction mode

[← Back to CHANGELOG](../../CHANGELOG.md)

Guided, drag-and-drop assembly of the ALICE detector (multipart GLBs) before a student can start
analysing events, with a per-session skip and a persisted "already assembled" flag.

| | |
| --- | --- |
| **Component** | `alice-masterclass-js/src/app/shared/components/event-display/` (palette + drag-drop) |
| **Parent / coach state** | `alice-masterclass-js/src/app/strangeness-visual-analysis/strangeness-visual-analysis.component.ts` |
| **Assets** | `alice-masterclass-js/src/assets/images/detector-parts/*.png` |
| **Baseline** | [`gitlab.cern.ch/alice-masterclass/alice-masterclass-js`](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js) `master` (tag `0.0.6`) |

---

## Why

Upstream loads the full ALICE detector model in one shot — there is no assembly step, so first-time
students never get an explicit tour of what ITS / TPC / TRD / TOF / calorimeters / L3 actually are. This
round turns first load into a short guided build: one palette card (with a reference photo) unlocks at a
time, dragging it onto the scene reveals that layer, and a completed build is remembered for the rest of
the browser session.

## What changed

### Coach state machine

| File | Change |
| --- | --- |
| `strangeness-visual-analysis.component.ts` | `vaCoachOverlayVisible`, `vaCoachWelcomePhase`, `vaCoachVictoryPhase`, `vaCoachPieceHintIndex` drive a **welcome → piece-by-piece → victory** sequence. `tryScheduleVaCoach()` is scheduled twice — once off `ApplicationRef.isStable` and once on a fixed timeout — so the coach reliably opens on both a cold load and a fast reload. `assemblyCoachSteps` filters `ALICE_DETECTOR_MODEL` so EMCal+DCal present as a single "Calorimeters" step (`EventDisplayComponent.isDcalAssetPath`). `assemblyCoachHighlightPath` / `assemblyAllowedDragPath` gate which single palette card may currently be dragged. |
| `strangeness-visual-analysis.component.html` | Coach overlay markup (welcome card, per-piece hint, victory card) plus a **skip** action that unlocks the analysis UI immediately. |

### Detector palette + drag-drop

| File | Change |
| --- | --- |
| `event-display.component.ts` | `DetectorPartToggleModel` (layer id, label, `opacity`, palette accent colour, and optional grouped GLBs such as DCal riding with EMCal). `CdkDragEnd` handling for dropping a palette card onto the scene. `assemblyPalettePresentation(...)` — static helper producing the EMCal+DCal combined presentation. `_detectorInteractiveAssemblyDone` gate: while `false`, only the currently-highlighted palette card is interactive. |
| `event-display.component.html` | Palette card list bound to `DetectorPartToggleModel[]`, drag handles, per-part opacity slider. |
| `event-display.component.scss` | Palette card styling, drag-over affordance. |

### Session persistence (skip on repeat visits)

| File | Change |
| --- | --- |
| `event-display.component.ts` | `detectorAssemblyPathsSignature(paths)` fingerprints the current `ALICE_DETECTOR_MODEL` list; `isStoredDetectorAssemblyComplete(paths)` reads it back from `sessionStorage`; `persistDetectorAssemblyCompleted(paths)` writes it once assembly finishes. Guarded against private-browsing / quota errors (silently ignored). Effect: once a student finishes the build once in a tab, later visits in the same session skip straight to analysis. |

### Reference photos

| File | Change |
| --- | --- |
| `assets/images/detector-parts/{ITS,FIT,TPC,TRD,TOF,EMCAL,L3,PHOS}.png` *(new, binary)* | One reference photo per palette card, shown while that piece is the active build step. |

### Backend / data model changes feeding "what counts as one piece"

- FIT detector addition and related backend/model clean-up landed alongside construction-mode work (`d98ee2f fixes of detector building process, FIT addition`); see also the [Histograms](changelog-visual-analysis-histograms.md) doc for the Django-side multi-V0 changes shipped in the same series of commits.

## Not present upstream

Construction mode does not exist upstream: `EventDisplayComponent` there has no `DetectorPartToggleModel`, no drag-and-drop palette, and no session-persisted assembly state — the detector loads fully assembled with no coach.
