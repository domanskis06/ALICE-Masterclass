# Documentation index

Entry point for the monorepo: [`../../README.md`](../../README.md).

## Local development

| Doc | Topic |
| --- | --- |
| [`../../README.md`](../../README.md) | Run Django + student + teacher locally |
| [`../../alice-masterclass-django/README.md`](../../alice-masterclass-django/README.md) | API setup / `venv` / `runserver` |
| [`../../alice-masterclass-js/README.md`](../../alice-masterclass-js/README.md) | Student app (`npm start`, build) |
| [`../../alice-masterclass-teacher/README.md`](../../alice-masterclass-teacher/README.md) | Teacher app (`:4201`) |

## Architecture & product

| Doc | Topic |
| --- | --- |
| [`event-display.md`](event-display.md) | Three.js EventDisplay (god component): side views (Rφ/ρz masks + zoom sync), VA detector load optimisation (merge / prune) |
| [`particle-propagation.md`](particle-propagation.md) | Particle Propagation — RK4 / field, Pb–Pb intro, L3 magnet stand-in, architecture |
| [`jpsi-analysis.md`](jpsi-analysis.md) | J/psi analysis — like-sign background subtraction, PID cut, appendable Quick Analysis, pp vs p-Pb |
| [`jpsi-analysis-teacher.md`](jpsi-analysis-teacher.md) | J/psi analysis (teacher, R_AA) — fixed pp reference, `Event.kind` sub-masterclass split, `jpsi_analysis`/`jpsi_analysis_results` API |
| [`demo-app.md`](demo-app.md) | Public offline demo SPA — purpose, `demoMode`, OKD, `v*-demo` redeploy, opening the Route |
| [`tutorials.md`](tutorials.md) | VA / LSA driver.js tours — demo auto-welcome vs workshop Help |
| [`../../alice-masterclass-js/data/strangeness/part1_Xi/README.md`](../../alice-masterclass-js/data/strangeness/part1_Xi/README.md) | Ξ / Ξ̅ cascade VA data — FemtoUniverse dump, helix converter, merge into host events, regenerate |
| [`../../alice-masterclass-js/data/jpsi/README.md`](../../alice-masterclass-js/data/jpsi/README.md) | J/psi PID-only event data — VSD converter, columnar batches, dataset identification |

## Changelogs (vs upstream `0.0.6`)

| Doc | Topic |
| --- | --- |
| [`../../CHANGELOG.md`](../../CHANGELOG.md) | Student-app summary (VA / LSA / PP / demo / tutorials / home) |
| [`changelog-visual-analysis-histograms.md`](changelog-visual-analysis-histograms.md) | VA multi-entry histograms, flight animation, bin control |
| [`changelog-visual-analysis-visualisation.md`](changelog-visual-analysis-visualisation.md) | VA theme, calorimeter bars, linked side views, lets-us panel |
| [`changelog-visual-analysis-construction.md`](changelog-visual-analysis-construction.md) | VA guided detector assembly |
| [`changelog-visual-analysis-model.md`](changelog-visual-analysis-model.md) | O2 → GLB pipeline + EventDisplay runtime merge/prune |
| [`changelog-large-scale-analysis.md`](changelog-large-scale-analysis.md) | LSA driver.js tour + fit UX + demo layout notes |
| [`changelog-nuclear-modification.md`](changelog-nuclear-modification.md) | R_AA parts 1–2: data corrections, fixed binning, R_CP fix, desktop parity |
| [`changelog-demo-app.md`](changelog-demo-app.md) | Offline demo mode, persistence, enhancement LSA, CI/OKD |

## Testing

| Doc | Topic |
| --- | --- |
| [`E2E.md`](E2E.md) | Playwright smoke / Django / teacher E2E |

## Ops & deploy

| Doc | Topic |
| --- | --- |
| [`dev-deployment.md`](dev-deployment.md) | Dev OpenShift / CI deploy — **redeploy via `v*-dev` tag**: §7.1 |
| [`demo-app.md`](demo-app.md) | Demo OpenShift / CI — **redeploy via `v*-demo` tag**: §5 |
| [`dev-remote-access.md`](dev-remote-access.md) | Dev app from outside CERN — SSH SOCKS tunnel + Firefox |
| [`prod-database.md`](prod-database.md) | Production database notes |
| [`../../openshift/dev/README.md`](../../openshift/dev/README.md) | OpenShift dev cluster helpers |
| [`../../openshift/demo/README.md`](../../openshift/demo/README.md) | OpenShift demo manifests (SPA only) |
