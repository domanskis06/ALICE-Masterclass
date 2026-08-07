# Guided tutorials (VA & LSA)

Interactive onboarding tours built with [driver.js](https://driverjs.com/). Both
exercises ship the same tour machinery in **workshop** (`web` / `dev` /
`production`) and **demo** builds; behaviour differs mainly in **when** the tour
auto-starts and **which steps** are included.

| | Visual Analysis | Large Scale Analysis |
| --- | --- | --- |
| **Module** | `strangeness-visual-analysis/va-tutorial/` | `strangeness-large-scale-analysis/lsa-tutorial/` |
| **Service** | `VaTutorialService` | `LsaTutorialService` |
| **Welcome** | `VaTutorialWelcomeDialogComponent` | `LsaTutorialWelcomeDialogComponent` |
| **i18n** | `STRANGENESS.VA_TUTORIAL.*` | `STRANGENESS.LSA_TUTORIAL.*` |
| **Entry from Help** | Instructions → Start tutorial | Instructions → Start tutorial |

Global popover styling (including red **Next →** / **Done →**): `src/styles.scss`
(`.driver-popover.lsa-driver-popover`, VA uses the same theme classes where applicable).

---

## 1. Demo vs workshop — start behaviour

| | Demo (`demoMode: true`) | Workshop |
| --- | --- | --- |
| Auto Skip / Start welcome on exercise entry | Yes (`shouldShow()`) | No |
| How to start the tour | Welcome dialog, or Help | Help → **Start tutorial** only |
| Dismiss persistence | In-memory for the page load (`dismissedThisSession`); refresh can offer welcome again | N/A for auto-welcome |
| Step list | Demo-specific (no Upload; LSA covers enhancement UI) | Workshop layout + Upload |

`shouldShow()` in both services:

```ts
return this.demo && !this.dismissedThisSession;
```

Workshop builds still call `startMainTour()` from the instructions / Help path.
Do not gate the entire tutorial module behind `demoMode`.

---

## 2. Visual Analysis tour

Shared step builder: `buildSharedSteps(includeUpload)`.

| Step (concept) | Demo | Workshop |
| --- | --- | --- |
| 3D scene | ✓ | ✓ |
| Detector visibility | ✓ | ✓ |
| Dataset navigation | ✓ | ✓ |
| Click tracks (auto-advance when V0 pair selected) | ✓ | ✓ |
| Invariant-mass calculator | ✓ | ✓ |
| Identify / Add / Undo | ✓ | ✓ |
| Mass histograms | ✓ | ✓ |
| **Upload** | omitted | ✓ |
| Finish / next event | ✓ | ✓ |

Auto-advance hooks (host component → service):

- `notifyTrackSelected()` — after both V0 daughters are selected
- `notifyAddLanded()` — after a mass is committed to a histogram
- Identify / finish steps disable **Next** until the student acts

Anchors use `#va-tour-*` ids in the VA templates.

---

## 3. Large Scale Analysis tour

Two builders:

- `buildWorkshopSteps()` — spectrum \| workshop results, fit selector, **Upload**
- `buildDemoSteps()` — spectrum \| enhancement plot, fit actions (Clear / Undo),
  enhancement plot card, teacher-style Results table (no Upload)

### Workshop steps (order)

1. Histogram selector setup (Open histogram; auto-advance on load)
2. Spectrum (histogram display)
3. Signal range (expanding highlight: histogram + signal slider)
4. Background range (+ background slider)
5. Fit
6. Check overlay on histogram
7. Accept / result actions
8. Results table (`#lsa-tour-results-table`)
9. Upload

### Demo steps (order)

1. Same setup step (clipped highlight past Open histogram)
2. Spectrum
3. Signal (expanding stage; slight `bottomPad`)
4. Background (stage bottom aligned to Fit Selector card)
5. Fit
6. Check overlay
7. Result actions (Clear fit / Undo — demo copy)
8. Enhancement plot (`#lsa-demo-enhancement-plot`)
9. Results summary (`#lsa-demo-results-table`) — explains yields / strangeness enhancement

Live auto-advance indices (`stepIndexOpenHistogram`, `stepIndexFit`,
`stepIndexAccept`) are resolved after the step list is built so demo offsets stay
correct.

Expanding-stage highlights use a fixed proxy element
(`#lsa-tour-expanding-stage`) whose box is the AABB of the listed selectors.
In demo, when the histogram is included, the stage is clipped to the left chart
column so it does not cover the enhancement plot.

---

## 4. Styling notes

- Tutorial **Next** / **Done** buttons: red background, white label (and arrow in
  i18n strings `Next →` / `Done →`) in both demo and workshop.
- Interactive sliders during expanding steps use `.lsa-driver-range-interactive`
  so students can drag ranges without dismissing the overlay incorrectly.

---

## 5. Related docs

| Doc | Topic |
| --- | --- |
| [`demo-app.md`](demo-app.md) | Demo infrastructure and deploy |
| [`changelog-large-scale-analysis.md`](changelog-large-scale-analysis.md) | LSA tour + fit UX history |
| [`changelog-demo-app.md`](changelog-demo-app.md) | Demo layout / persistence |
