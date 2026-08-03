# Changelog detail - Visual Analysis: Visualisation

[← Back to CHANGELOG](../../CHANGELOG.md)

Rendering/UX rework of the 3D event display: light/dark mode, calorimeter readouts, performance tuning,
the proton–proton collision intro, and the corner-overlay detector-part panel.


|                   |                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Component**     | `alice-masterclass-js/src/app/shared/components/event-display/` (god node — see `[event-display.md](event-display.md)`)                         |
| **Parent**        | `alice-masterclass-js/src/app/strangeness-visual-analysis/`                                                                                     |
| **New component** | `alice-masterclass-js/src/app/strangeness-visual-analysis/lets-us-panel/`                                                                       |
| **Assets**        | `alice-masterclass-js/src/assets/videos/proton_collision_animation.mp4`                                                                         |
| **Baseline**      | `[gitlab.cern.ch/alice-masterclass/alice-masterclass-js](https://gitlab.cern.ch/alice-masterclass/alice-masterclass-js)` `master` (tag `0.0.6`) |


---



## Why

Upstream's `EventDisplayComponent` renders a single fixed-appearance scene: one background, one light
rig, no calorimeter energy readout, no collision intro. This round adds a themeable scene (for
classroom projectors and low-light use), the calorimeter bar visualisation the physics content needed,
and a short cinematic intro so a session starts with "why are we even looking at this" instead of a
bare detector.

## What changed



### Light / dark mode


| File                                       | Change                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event-display.component.ts`               | `_backgroundColor` + `backgroundColor` getter, `syncSceneBackground()`; `@Input() showThemeToggle`; `darkMode` getter/setter (`@Input`) with `darkModeHostClass` and `darkModeChange` output. Separate light/dark presets: `LIGHT_MODE_AMBIENT` / `LIGHT_MODE_HEMISPHERE` / `LIGHT_MODE_DIRECTIONAL_INTENSITY` vs `DARK_MODE_*` equivalents; `LIGHT_MODE_TRACK_WIDTH_SCALE` bumps track line width in light mode for contrast. |
| `strangeness-visual-analysis.component.ts` | `visualDarkMode`, `visualLightBackgroundColor` (`0xFFFFFF`) / `visualDarkBackgroundColor` (`0x0a1832`) wired to the toggle.                                                                                                                                                                                                                                                                                                    |
| `calculator/calculator.component.ts`       | `darkMode` input + `calculatorDarkModeClass` host binding; `particleSelectPanelClass` swaps the mat-select overlay panel class so dropdowns stay legible on dark backgrounds.                                                                                                                                                                                                                                                  |




### Calorimeter readout + bloom


| File                              | Change                                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event-display.component.ts`      | New calorimeter-bar rendering path: `caloBarMaterial` / `caloBarGeometry`, `CALO_BAR_MAX_COUNT` (3200), `CALO_BAR_PITCH_FILL`, `CALO_BAR_MIN_HEIGHT` / `CALO_BAR_MAX_HEIGHT`, `CALO_BAR_DARK_EMISSIVE`. Bloom post-processing constants tuned: `BLOOM_STRENGTH` (0.22), `BLOOM_RADIUS` (0.28), `BLOOM_THRESHOLD` (0.72), plus `DETECTOR_NEON_EMISSIVE_INTENSITY`. |
| `event-display.component.spec.ts` | New specs locking calorimeter-readout scene graph behaviour (fixes a regression where EMCal/DCal readouts silently disappeared after a rename — see commit `dde0a7b`).                                                                                                                                                                                            |




### Detector opacity / layer materials


| File                         | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event-display.component.ts` | Per-layer opacity constants replacing a single flat value: `DETECTOR_COMPONENT_OPACITY` (0.78), `DETECTOR_INNER_OPACITY` (0.80), `DETECTOR_OUTER_OPACITY` (0.75), `DETECTOR_LAYER_RADIAL_INFLATE_STEP`; `FADE_OPACITY` / `DETECTOR_FADE_OPACITY` for hover/selection fades. `applyTrackMaterialWidths()` + `effectiveTrackWidth` centralise track/highlight/decay line widths (`trackHighlightWidth`, `trackDecayWidth`) instead of scattered literals. |




### Proton–proton collision intro


| File                                                           | Change                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strangeness-visual-analysis.component.ts`                     | `collisionVideoUrl` (`assets/videos/proton_collision_animation.mp4`), `collisionVideoRef`, `eventReadyForProtonIntro` / `protonCollisionIntroFinished` flags — the intro only plays once the first real event has loaded (not on the empty stub event) and never replays once finished or skipped. |
| `strangeness-visual-analysis.component.html`                   | `<video>` element + intro overlay markup.                                                                                                                                                                                                                                                          |
| `assets/videos/proton_collision_animation.mp4` *(new, binary)* | Collision intro clip.                                                                                                                                                                                                                                                                              |




### Detector-part info panel


| File                                                 | Change                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `strangeness-visual-analysis/lets-us-panel/` *(new)* | `LetsUsPanelComponent` — corner overlay showing bullet points (`PART_DESC` i18n keys) for the currently highlighted detector part, replacing an inline tooltip. Two follow-up fixes projected it correctly: render the tip via `TemplateRef` instead of `ng-content` (`fc9e9ee`), and project it into the corner overlay rather than the card title (`81cd5ee`), plus keeping it below the CERN/app toolbars (`6db1379`). |




### Camera / interaction tuning


| File                         | Change                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event-display.component.ts` | `SIDE_VIEW_PIXEL_RATIO_FACTOR` / `SIDE_VIEW_MIN_PIXEL_RATIO` / `SIDE_VIEW_RENDER_INTERVAL` throttle the side-view render loop; `PAN_SPEED_FACTOR`, `WHEEL_PAN_FACTOR`, `MOUSE_DRAG_PAN_FACTOR`, `MARKER_PROXIMITY_PX` (vertex/cascade marker hit-testing), `STRAIGHT_TRACK_EPS`, `DECAY_BG_MOMENTUM_COS_MIN` / `DECAY_BG_MOMENTUM_ABS_DP` (background-track classification near a decay vertex). |


### Detector mesh load (draw-call cut)

Runtime optimisation of multipart detector GLBs for Visual Analysis (batched merge / prune; FIT extra
`gltfpack`) lives outside this visualisation changelog — see
[`event-display.md`](event-display.md) § “Detector load optimisation” and
[`changelog-visual-analysis-model.md`](changelog-visual-analysis-model.md) § 3b.




### Cleanup

- `acbf54e` removed a leftover track-animation code path that was superseded by the flight animation described in the [Histograms](changelog-visual-analysis-histograms.md) doc.



## Not present upstream

Light/dark mode, the calorimeter bar readout, the collision intro video, and `lets-us-panel/` do not exist in the upstream repository — `EventDisplayComponent` there renders a single static-theme scene with no calorimeter visualisation.