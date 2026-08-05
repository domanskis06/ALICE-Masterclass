# Changelog detail — Large Scale Analysis

[← Back to CHANGELOG](../../CHANGELOG.md)

An interactive, step-aware onboarding tour for the Large Scale Analysis (LSA) exercise, built on
[driver.js](https://driverjs.com/).

| | |
| --- | --- |
| **Module** | `alice-masterclass-js/src/app/strangeness-large-scale-analysis/` |
| **New sub-module** | `alice-masterclass-js/src/app/strangeness-large-scale-analysis/lsa-tutorial/` |
| **Dependency** | `driver.js` (added to `package.json`) |
| **Baseline** | [`gitlab.cern.ch/alice-masterclass/alice-masterclass-js`](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js) `master` (tag `0.0.6`) |

---

## Why

Upstream's LSA page is four cards (histogram selector → histogram display → fit selector → results)
with an instructions dialog but no in-context guidance. Students had to read the instructions once and
then work out the click order themselves. This round adds a guided tour that walks through the real UI
elements and **advances itself** when the student performs the expected action (opens a histogram, runs
a fit), rather than only advancing on "Next".

## What changed

### Tutorial service and welcome dialog

| File | Change |
| --- | --- |
| `lsa-tutorial/lsa-tutorial.service.ts` *(new)* | `LsaTutorialService` (module-scoped provider, needs `FitService`). `shouldShow()` / `dismiss()` persist state under a `localStorage` key so a dismissed tour does not reappear. `startMainTour()` builds the `driver.js` step list. `notifyHistogramReady()` auto-advances the tour once histogram JSON has loaded, if the tour is waiting on the "Open histogram" step. `notifyFitClicked()` auto-advances once the student runs a fit, if the tour is on the Fit step. |
| `lsa-tutorial/lsa-tutorial.constants.ts` *(new)* | `LSA_TUTORIAL_STORAGE_KEY`, `LSA_TUTORIAL_STORAGE_VALUE_DISMISSED`, step-index constants (`LSA_TUTORIAL_STEP_INDEX_OPEN_HISTOGRAM`, `LSA_TUTORIAL_STEP_INDEX_FIT`, `LSA_TUTORIAL_STEP_INDEX_ACCEPT`) so the service and step definitions stay in sync. |
| `lsa-tutorial/lsa-tutorial-welcome-dialog.component.{ts,html,scss}` *(new)* | Dialog shown before the guided tour starts; closing with "Start" begins the tour, "Skip" dismisses it permanently. |
| `lsa-tutorial/lsa-tutorial.service.spec.ts` *(new)* | Unit tests for show/dismiss persistence and step-advance notifications. |

### Wiring into the main component

| File | Change |
| --- | --- |
| `strangeness-large-scale-analysis.component.ts` | `DestroyRef` + `takeUntilDestroyed` for the dialog subscription (no manual unsubscribe bookkeeping). `ngAfterViewInit` schedules `tryOpenTutorialWelcome()` **twice** (`setTimeout(…, 0)` and `setTimeout(…, 120)`, run outside Angular then back in) so the dialog reliably attaches to the overlay on both a cold load and an F5 reload — `welcomeDialogScheduled` guards against opening it twice. Explicit "Skip" closes the dialog with `false` and permanently dismisses the tour; any other close (including backdrop) leaves it eligible to show again next visit. |
| `strangeness-large-scale-analysis.component.spec.ts` | Specs covering the welcome-dialog scheduling and dismiss behaviour. |

### Tour anchors in the exercise UI

| File | Change |
| --- | --- |
| `histogram-selector/histogram-selector.component.html` | `id="lsa-tour-histogram-selector"` on the card, `id="lsa-tour-particle-field"` / `id="lsa-tour-collision-field"` on the pickers, `id="lsa-tour-open-histogram"` on the submit button — the tour text explicitly names this control and auto-advances when `notifyHistogramReady()` fires. |
| `histogram-display/histogram-display.component.html` | `id="lsa-tour-histogram-display"` anchor referenced by two separate tour steps (open-histogram result, and reviewing the fit overlay). |
| `fit-selector/fit-selector.component.html` | Added labelled signal/background slider groups (`id="lsa-tour-signal-group"` / `id="lsa-tour-background-group"`, each with a translated caption above the `ngx-slider`) plus `id="lsa-tour-fit-button"` / `id="lsa-tour-accept-button"` — the Fit step explains that the curves are a background(polynomial) + signal(Gaussian) model to sanity-check by eye. |
| `results/results.component.html` | Tour anchor for the Accept step. |
| `instructions/instructions.component.{ts,html,scss}` | Instructions dialog can now re-open or hand off into the guided tour. |

### Styling and dependency

| File | Change |
| --- | --- |
| `src/styles.scss` | Global `driver.js` popover theme overrides so the tour matches the app's Material look. |
| `package.json` / `package-lock.json` | `driver.js` added as a dependency. |

### Fit UX — range indicator, zoom, slider restyle

Follow-up work on the live fit loop (histogram brush zoom + signal/background intervals), not present in the
original tutorial-only changelog pass.

| File | Change |
| --- | --- |
| `shared/components/fit-histogram/` | Brush-zoom on the mass axis; visible **range indicator** for the current zoom/fit domain; denser nice ticks after zoom-in; Unzoom path back to the full histogram domain. |
| `shared/services/fit.service.ts` | `clampRangeToView(range, view)` keeps signal/background intervals inside the visible axis (clip or shift, preserving width when possible). `clearFit()` drops curves/result without wiping histogram data or accepted results. |
| `fit-selector/` | Restyled signal/background `ngx-slider` groups (distinct colours), tighter Accept / Fit button layout; sliders clamp when `axisRange` / `domainResetToken` change after a zoom or particle switch; `resetRangesToAxisExtremes` restores both intervals to the axis floor/ceil. |
| `histogram-display/` | Unzoom + **Reset range** controls wired to the fit histogram; `isZoomed` tracks brush state for enable/disable without ViewChild races; emits `rangeChangeEvent` / `resetRangeEvent` to the parent. |
| `strangeness-large-scale-analysis.component.{ts,html}` | Parent wiring for axis range / domain reset tokens into the fit selector and display. |

## Not present upstream

`lsa-tutorial/` (service, constants, welcome dialog, and all `lsa-tour-*` anchors across the selector/display/fit-selector/results templates) has no equivalent upstream — the upstream LSA flow has a static instructions dialog and no in-context tour. Brush-zoom range indicators and `clampRangeToView` / Reset-range controls are also fork-only UX on top of the shared `FitService` polynomial+Gaussian model.
