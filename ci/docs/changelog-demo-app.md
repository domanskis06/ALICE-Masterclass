# Changelog detail — Public demo app

[← Back to CHANGELOG](../../CHANGELOG.md)

Offline / public student SPA: same Angular codebase as the workshop build, selected
at compile time with `demoMode: true`. No Django, teacher app, or database.

| | |
| --- | --- |
| **Module** | `alice-masterclass-js` (configuration `demo`) |
| **OKD** | `alice-web-masterclass-demo` — [`openshift/demo/`](../../openshift/demo/) |
| **Guide** | [`demo-app.md`](demo-app.md) |
| **Tutorials** | [`tutorials.md`](tutorials.md) |
| **Baseline** | Workshop student app in this monorepo (`demoMode: false`) |

---

## Why

Educational-resources and similar public pages need a walkthrough of the MasterClass
without CERN accounts or a live workshop backend. A separate OKD namespace serves only
the static SPA; browser-local persistence replaces uploads.

---

## What changed

### Build, CI, OpenShift

| File / area | Change |
| --- | --- |
| `environment.demo.ts` / `make-demo.mjs` | `demoMode: true`, empty `apiUrl`, version from `VERSION` |
| `angular.json` | `demo` build/serve configuration + `fileReplacements` |
| `package.json` | `start:demo`, `build:demo`, `config:demo` |
| `.gitlab-ci.yml` | Jobs `build_website_js_demo`, `build_docker_js_demo`, `redeploy_js_demo` on tags `v*-demo` |
| `openshift/demo/*` | DC, Service, Route, ImageStream for SPA-only deploy |
| `make-prod.mjs` | Fail fast if `API_URL` unset (protects local `environment.prod.ts`) |

### Demo flag and shell UX

| File / area | Change |
| --- | --- |
| `shared/demo/demo.tokens.ts` | `DEMO_MODE` InjectionToken from `AppConfig.demoMode` |
| `shared/demo/demo-config.service.ts` | Read-only `enabled` for components |
| `demo-info-dialog/` | One-time info dialog (`localStorage` `demo:infoShown`) |
| `home.component.ts` / `nav.component.ts` | Show info dialog instead of auth; nav menu label `APP_INFO.MENU`; session badge hidden in demo |
| `assets/i18n/{en,pl,de,fr}.json` | `APP_INFO.*`, enhancement / Undo / tutorial keys |

### Persistence (replaces Django upload)

| File / area | Change |
| --- | --- |
| `shared/demo/demo-results-store.service.ts` | VA + LSA snapshots in `sessionStorage` (`demo:va:*`, `demo:lsa:*`); clears legacy `localStorage` |
| `services/strangeness-data.service.ts` | Hydrate/persist when demo; LSA undo stack (`_lsaUndoStack` / `undoLastLargeScaleAnalysisResult`) |
| `strangeness-data.service.demo.spec.ts` | Unit tests for persist + undo |

### Visual Analysis (demo)

| File / area | Change |
| --- | --- |
| `strangeness-visual-analysis.component.ts` | `eventKeyFor()` = `` `${datasetID}:${eventId}` ``; do not clear results on dataset change |
| `mass-histograms/` | Hide Upload when `demo` |

Shared histograms across datasets: all entries stay in one in-memory map; switching
dataset no longer wipes progress.

### Large Scale Analysis (demo layout)

| File / area | Change |
| --- | --- |
| `strangeness-large-scale-analysis.component.{html,scss,ts}` | `@if (demo)` layout: 50/50 histogram \| enhancement plot; fit selector; full-width Results; enhancement refresh |
| `services/lsa-enhancement.service.ts` (+ spec) | Yields / enhancement table + plot series (teacher colours: Kaon blue, Λ green, anti-Λ red) |
| `enhancement-plot/` | D3 enhancement vs participants |
| `enhancement-results/` | Teacher-style summary table |
| `fit-selector/` | Undo button (demo only); Clear fit retained |
| Upload | Hidden in demo (workshop Upload step remains for non-demo) |

### Tutorials

VA and LSA tours exist in both builds; auto-welcome only in demo. Demo LSA steps
cover enhancement plot / Results and omit Upload. See [`tutorials.md`](tutorials.md)
and updates in [`changelog-large-scale-analysis.md`](changelog-large-scale-analysis.md).

---

## Not present upstream

Entire `demoMode` path, OKD demo namespace, enhancement LSA layout, and
`DemoResultsStore` have no equivalent in upstream `alice-masterclass-js` `0.0.6`.
