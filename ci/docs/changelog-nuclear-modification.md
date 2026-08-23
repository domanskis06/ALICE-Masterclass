# Changelog detail — Nuclear Modification (R_AA)

[← Back to CHANGELOG](../../CHANGELOG.md)

Two exercises measuring the nuclear modification factor **R<sub>AA</sub>**: *Event Exploration*
(part 1, single events by hand) and *Spectrum Analysis* (part 2, a Blockly-built analysis chain over
the full sample). Both are ports of the desktop ROOT MasterClass; this file records where the web
version **deliberately differs** from that baseline and why.

| | |
| --- | --- |
| **Modules** | `alice-masterclass-js/src/app/nuclear-modification-event-exploration/`, `alice-masterclass-js/src/app/nuclear-modification-spectrum-analysis/` |
| **Shared** | `shared/utils/raa-ops.ts`, `shared/utils/raa-calc.ts`, `shared/utils/raa-centrality.ts`, `services/raa-analysis.service.ts`, `services/raa-data.service.ts` |
| **Assets** | `src/assets/exercises/raa/` (committed; generators in `alice-masterclass-js/data/raa/`) |
| **Baseline** | Desktop ROOT MasterClass (`libRaa.so`, `headers/Raa/`, `share/vsdData/Raa/AliVSD_MasterClass_{1..10}.root`) |

---

## Why

The desktop exercise is faithful but leaves several things unsaid or unchecked: it silently divides
every dataset's Pb–Pb events by the same three correction constants, offers a binning choice that
teaches nothing, and gives no feedback when a block chain is assembled in an order that produces a
wrong answer. The changes below keep the **numbers** compatible with the desktop (see *Parity* at the
end) while making the reasoning visible and the wrong paths impossible or at least reported.

## Data corrections

| Item | Change |
| --- | --- |
| `assets/exercises/raa/metadata.json` — `datasets[*][1]` | The second event of every pack is now a deliberately **low-multiplicity pp event (3–8 primary tracks)**. Previously 7 of 10 packs had ≤2 primaries there and three had **zero**, so the tutorial's "click every primary track" step had nothing to click. Chosen per pack from a census of all 340 converted events. |
| `assets/exercises/raa/metadata.json` — `datasets["10"][31]` | Was event `148`, whose source directory in `AliVSD_MasterClass_10.root` is a **defective stub**: `RecTracks` has `GetEntries() == 0` and only 32 ITS clusters, against 15 000–25 000 clusters in every other Pb–Pb event. Dataset 10 could therefore never produce a peripheral R<sub>AA</sub> point. Re-pointed at event `225`, a real peripheral event, copied in as `event_10_225.json`. Packs already share their Pb–Pb events (159, 211, 234, 274 each serve two packs); after this change **every peripheral event is used exactly twice**, so the reuse stays even. Event `148` exists in no other VSD file, so there was nothing to recover — the upstream fix is to re-export that ROOT file. |

Track extraction itself was verified against the source, not assumed: reading all ten VSD files with
`uproot` gives **30 233 `RecTracks` entries against 30 233 tracks in the JSONs**, equal on every one of
the 340 events, with the primary flag independently reproduced from the raw `fDcaXY` / `fDcaZ`
branches. `convert_events.C` drops nothing. The 37 empty event JSONs correspond exactly to 37 empty
trees in the source.

## Event Exploration (part 1)

| File | Change |
| --- | --- |
| `nuclear-modification-event-exploration.component.ts` | **The primary filter now colours instead of deletes.** Submitting the filter used to hide every secondary track, so the student saw the picture get emptier without ever seeing what the rule rejected. The kept set is drawn in the selected colour and the rejected tracks stay visible (`filterHighlightActive`, `buildFilterSelection`). |
| `nuclear-modification-event-exploration.component.ts` | **The magnet-off event is shown, not measured** (`isDemonstrationEvent`). The first event of each pack was recorded with the field off, so its tracks are straight; it belongs to no centrality class and its multiplicity is not comparable with the rest. It no longer enters the histograms or the R<sub>AA</sub> records, and no longer blocks the upload. |
| `nuclear-modification-event-exploration.component.ts` | `allEventsAnalyzed` also skips events whose source genuinely holds **no tracks**. 37 such events exist, so requiring them made the upload unreachable in 8 of 10 packs. |
| `nuclear-modification-event-exploration.component.{ts,html}` | A **Build / Edit track filter** button in the sidebar. The workshop path no longer opens the builder on its own, so there has to be a way in. |
| `event-characteristics.component.{ts,html,scss}` | **Pb–Pb no longer histograms multiplicity, multiplicity above 1 GeV/c or the secondary count.** A pack holds one event per centrality class, so those histograms were three bars of height one. They are per-class **readouts** now, each with the same collision icon the R<sub>AA</sub> Analysis tab uses (beam offset = impact parameter). |
| `event-characteristics.component.{ts,html}` | The three per-track distributions (p<sub>T</sub>, charge, normalized φ) stay as plots and gain **one checkbox per centrality class**. A class becomes tickable only once its event has been analysed. |
| `shared/components/event-display/event-display.component.ts` | New `selectedTrackIndices` input: persistent per-track colouring, re-applied on every rebuild. Distinct from the existing imperative `setEmphasizedTrackIndices`, which paints a transient gold emphasis for the tutorial's picking challenge; the two compose. |
| `shared/globals/colors/colors.ts` | `selectedTrackColor` (amber) — separates from the blue base track, the red/green decay pair and the purple clusters at once. |

### Tutorial

| File | Change |
| --- | --- |
| `ee-tutorial/ee-tutorial-welcome-dialog.component.{ts,html,scss}` | Two explicit paths instead of "Start / Skip": **I am in a workshop** (accent-coloured) and **Guide me through it**. The workshop path forces nothing — no guided tour, no dataset prompt, no filter builder — because an instructor is talking the group through the events. |
| `ee-tutorial/ee-tutorial.service.ts` | New **magnet-off step** before the picking challenge: shows the first event and explains that the straight tracks come from the field being off, then moves on. |
| `ee-tutorial/ee-tutorial.service.ts` | The dataset prompt cannot be dismissed: `allowClose: false`, no buttons, overlay clicks ignored, and Enter is swallowed on the capture phase (driver.js otherwise treats Enter as "advance the only step" and tore the popover down, leaving an empty detector). Enter still works inside the `mat-select` itself. |
| `ee-tutorial/ee-tutorial.constants.ts` | Gate indices shifted by one for the inserted step. |
| `nuclear-modification-event-exploration.component.ts` | The picking challenge moved from the magnet-off event to the **second** event (`NMF_EE_PICK_EVENT_INDEX`), the curated low-multiplicity one. |

## Spectrum Analysis (part 2)

| File | Change |
| --- | --- |
| `shared/utils/raa-ops.ts`, `shared/models/raa/spectrum.ts` | **The binning choice is gone.** `RaaBinningId` collapses to a single `'fixed'` grid: uniform **0.2 GeV/c** bins from 0.2 to 15 GeV/c. Picking between ALICE / equal-0.5 / equal-1 / coarse bins cost time without teaching anything the rest of the chain did not already cover. |
| `shared/utils/raa-ops.ts` | New `rebinDensity()`: the published pp reference ships only on the ALICE grid, so it is integrated onto the fixed grid to stay divisible bin by bin. Exact below 4 GeV/c, where the target edges fall on source edges; a flat-within-source-bin approximation above it, which the smooth reference tolerates. |
| `services/raa-analysis.service.ts` | The `PP_NEEDS_ALICE_BINNING` error and `binningLabel()` are gone — unreachable once there is one grid. |
| `services/raa-analysis.service.ts` | **R_CP ordering bug fixed.** `load_peripheral` used to normalise the denominator by replaying whatever scalings had been applied *at that point in the chain*. A student who placed the block above the `Divide by …` blocks got a raw-count denominator against a normalised numerator — wrong by ~10⁵, **with no problem reported**, because validation only inspected the numerator. The peripheral sample is now stored raw and normalised at `divide_reference` time from the numerator's own ops, so block order cannot matter (`normalisedLike`). |
| `blockly-workspace/raa-blockly.ts` | `raa_load_peripheral` and `raa_clone_spectrum` removed from the palette. R_CP is a separate optional measurement that no checklist step or tutorial gate asks for, and `Clone spectrum` existed only to serve it. The interpreter path is kept (and now correct) so it can be re-offered. |
| `blockly-workspace/raa-blockly.ts`, `blockly-workspace.component.ts` | `fullRecipe()` / `buildFullRecipe()` and a **Build it for me** button beside Run / Clear: a group that cannot assemble the chain still gets to run the analysis and see what R<sub>AA</sub> looks like. |
| `services/raa-analysis.service.ts` | New `MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS` warning. `Plot multiplicity vs centrality` always covers the whole sample, so building it after `If centrality` does not change the data — but it teaches the wrong idea, that a class must be picked before the plot that defines the classes can be drawn. |

### Checklist and progress

| File | Change |
| --- | --- |
| `sa-tutorial/sa-tutorial.constants.ts` | `MISSION_GROUPS` — one source of truth for the "To-do list", each step carrying the same gate the tutorial uses. Two steps were **missing entirely**: the guided tour required a multiplicity histogram and a multiplicity-vs-centrality plot that the list never mentioned. Renumbered 1–12. |
| `sa-tutorial/sa-tutorial.constants.ts` | `NmfSaGate.forbidProblemKeys`: a gate can be blocked by a problem the last run raised, even when the blocks are all present. Used so the multiplicity-vs-centrality step does not tick when the run warned about the centrality filter. |
| `sa-tutorial/sa-tutorial.service.ts` | `isMissionStepDone()` — checkmarks are **sticky and Run-based**: a step ticks when the blocks were present in a recipe that actually ran, and stays ticked afterwards, like a paper checklist. |
| `mission-strip/` *(new)* | Once the first plot exists, the full card is replaced by a compact progress strip docked beside the block picker, so the plan stays in view while the student keeps building. |
| `raa-plots/raa-plots.component.ts` | While the tutorial is running, a new plot no longer steals the active tab — the tour presses Run at every step, which was overriding the student's own tab choice. |

## Shared histogram component

| File | Change |
| --- | --- |
| `shared/components/histogram/histogram.component.ts` | Mean and **median** lines, drawn in the margin **above** the plot rather than over the bars, where the label was unreadable against dense bins. Mean left, median right, distinct colours. |
| `shared/components/histogram/histogram.component.ts` | `recomputeYDomain()` also runs on a **bin-count change**. Moving the dialog's bin slider left a stale y-max from the previous binning, so bars rendered off-scale — the enlarged plot could end up a single full-height block. |

## Parity with the desktop

Reproducing the desktop's own arithmetic (pp mean from a `TH1D(10, 0, 50)`, i.e. bin centres; Pb–Pb
from the single event's raw primary count; the three fixed correction constants) gives:

| | peripheral | semi-central | central |
| --- | --- | --- | --- |
| Desktop, averaged over the ten packs | 0.229 | 0.210 | 0.109 |
| This app, averaged over the ten packs | 0.220 | 0.210 | 0.109 |

Per pack the two agree to ~10%, the difference being the desktop's binned pp mean against an exact
arithmetic one.

**Five of the ten packs violate peripheral > semi-central > central — in the desktop too.** This is
inherited, not introduced. `Raa::EventDisplay::NewEvent` switches on the **event index**, not on
centrality, and feeds a compile-time constant per slot into `RaaCalculator`; the VSD files carry no
centrality, impact parameter or event header, so the desktop could not do otherwise. Measured against
the part-2 multiplicity calibration, the "semi-central" slot actually spans 0–5% to ~27% (multiplicity
480 to 1695 across packs), so it is not a centrality class at all — pack 7's semi-central event is
twice as central as pack 4's central one.

The exercise is therefore only meaningful **averaged across groups**, which is what the teacher panel
collects: the class average is monotonic in both the desktop and this app. A single pack is one
measurement with a large uncertainty, and the UI should say so.

Absolute values sit below the published ALICE R<sub>AA</sub>. The Pb–Pb side is raw reconstructed
MasterClass tracks with no efficiency or acceptance correction, while the pp reference is a fully
corrected published spectrum. The desktop behaves identically.

## Not present upstream

Both modules, the Blockly recipe interpreter (`services/raa-analysis.service.ts`), the checklist and
mission strip, the docked block picker (`shared/blockly/nmf-docked-flyout.ts`), the primary-filter
builder and the R<sub>AA</sub> Analysis panel have no equivalent in
[`gitlab.cern.ch/alice-masterclass/alice-masterclass-js`](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js)
`0.0.6`; the upstream app has no nuclear-modification exercise at all.
