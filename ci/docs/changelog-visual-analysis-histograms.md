# Changelog detail — Visual Analysis: Histograms

[← Back to CHANGELOG](../../CHANGELOG.md)

Multi-entry, animated mass histograms with a student-facing bin control, plus the backend/data-model
changes needed to support events with more than one V0/cascade.

| | |
| --- | --- |
| **Module** | `alice-masterclass-js/src/app/strangeness-visual-analysis/mass-histograms/` |
| **Shared component** | `alice-masterclass-js/src/app/shared/components/histogram/` |
| **New component** | `alice-masterclass-js/src/app/strangeness-visual-analysis/histogram-info-dialog/` |
| **New service** | `alice-masterclass-js/src/app/shared/services/flight.service.ts` |
| **Backend** | `alice-masterclass-django/strangeness/` |
| **Baseline** | [`gitlab.cern.ch/alice-masterclass/alice-masterclass-js`](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js) `master` (tag `0.0.6`) |

---

## Why

Upstream stored **one** `VisualAnalysisResultsEntry` per event (`Map<string, VisualAnalysisResultsEntry>`).
Events with several V0/cascade candidates (multi-strange events) could only ever contribute their last
analysed particle to the histograms — earlier picks were silently overwritten. This round adds proper
multi-entry support end to end (frontend model → API payload → Django) and layers a bin-count control
and a landing animation on top so students get feedback when a mass is added.

## What changed

### Bin-count control (shared histogram component)

| File | Change |
| --- | --- |
| `shared/components/histogram/histogram.component.ts` | New `HistogramIncomingBin` / `HistogramBinTarget` interfaces; `X_TICK_LABEL_ROTATE_BINS` (labels rotate −45° past 15 bins); reworked viewBox margins (`BOTTOM`, `BOTTOM_XLABEL`, `BOTTOM_TEXT`) so axis labels no longer clip; `ANIMATION_DURATION` cut 500 → 250 ms; `xTicksRotated` host binding. |
| `shared/components/histogram/histogram.component.html` / `.scss` | Layout to match the new viewBox metrics and rotated-tick state. |
| `strangeness-visual-analysis/mass-histograms/mass-histograms.component.ts` | New `bins` property (default `10`, clamped `1–25` — see `binMin` / `binMax`), `binFillPercent` getter for the slider fill, `@ViewChild` refs per histogram (kaon/lambda/anti-lambda/xi) used to target the landing animation. |
| `strangeness-visual-analysis/mass-histograms/mass-histograms.component.html` | Slider + numeric input pair (`bin-control`) shared by all four histograms. |

### Multi-entry results model (frontend)

| File | Change |
| --- | --- |
| `services/strangeness-data.service.ts` | `visualAnalysisResults` is now `Map<string, VisualAnalysisResultsEntry[]>` (was single entry). `addVisualAnalysisResult(key, value, trackIds)` appends instead of overwriting and records which decay-track `particleId`s were used. New `areAllDecayTracksAnalyzed(key, requiredIds)` backs the "event done" check. |
| `strangeness-visual-analysis/strangeness-visual-analysis.component.ts` | `isCurrentEventDone` now compares analysed decay-track ids against all daughter ids in the event's `decays` (`collectDecayTrackIds`) instead of checking for a single stored entry. `collectSelectedTrackIdsForHistogram` mirrors the calculator's V0/cascade daughter-selection rule so the right ids are marked analysed. |
| `mass-histograms/mass-histograms.component.ts` | `results` setter iterates `entries: VisualAnalysisResultsEntry[]` per key instead of one value per key. |
| `shared/services/api.service.ts` | `submitVisualAnalysisResults(results: Map<string, VisualAnalysisResultsEntry[]>, …)`. Payload stays **backward compatible**: a single-sample key still serialises as one object, multi-sample keys serialise as an array. |

### Backend (Django)

| File | Change |
| --- | --- |
| `alice-masterclass-django/strangeness/models.py` | Removed the `UniqueConstraint(fields=['result', 'eventid'], name='vare_u_fields')` on `VisualAnalysisResultsEntry` — multiple mother particles per event are now allowed. |
| `alice-masterclass-django/strangeness/migrations/0002_remove_vare_u_fields.py` | New migration dropping that constraint. |
| `alice-masterclass-django/strangeness/views.py` | Accepts either the single-object or array payload shape per event key described above. |
| `alice-masterclass-django/strangeness/tests.py` | New tests covering multi-entry submission per event. |

### Landing animation + one-time explainer

| File | Change |
| --- | --- |
| `shared/services/flight.service.ts` *(new)* | Queue-based service that animates a coloured ball from a viewport point to a histogram bin target (`FlightPoint`, `ParticleFlight`, `getFlightOverlayParent`, `viewportToOverlayPoint`). |
| `strangeness-visual-analysis/strangeness-visual-analysis.component.ts` | `pendingFlightEntries` map + `FLIGHT_COLORS` (matches each particle's histogram bar colour); commits the histogram entry only once its flight animation finishes; scroll-to-histogram is delayed (`SCROLL_AFTER_FLIGHT_START_MS`) so the flight is visible first. Entries still in flight are committed on `ngOnDestroy` so a mid-animation navigation never drops data. |
| `strangeness-visual-analysis/histogram-info-dialog/` *(new)* | One-time dialog shown after the first mass lands in a histogram bar, explaining what the chart means. Dismissal is persisted under the `va-histogram-info-seen` `localStorage` key so it is not shown again. |

## Not present upstream

`histogram-info-dialog/`, `shared/services/flight.service.ts` (+ spec), the bin-count control (`binMin`/`binMax`/`binFillPercent`), and the entire multi-entry results path (frontend + Django) have no equivalent in the upstream repository.
