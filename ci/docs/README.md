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
| [`../../alice-masterclass-js/data/strangeness/part1_Xi/README.md`](../../alice-masterclass-js/data/strangeness/part1_Xi/README.md) | Ξ / Ξ̅ cascade VA data — FemtoUniverse dump, helix converter, merge into host events, regenerate |

## Changelogs (vs upstream `0.0.6`)

| Doc | Topic |
| --- | --- |
| [`../../CHANGELOG.md`](../../CHANGELOG.md) | Student-app summary (VA / LSA / PP / home) |
| [`changelog-visual-analysis-histograms.md`](changelog-visual-analysis-histograms.md) | VA multi-entry histograms, flight animation, bin control |
| [`changelog-visual-analysis-visualisation.md`](changelog-visual-analysis-visualisation.md) | VA theme, calorimeter bars, linked side views, lets-us panel |
| [`changelog-visual-analysis-construction.md`](changelog-visual-analysis-construction.md) | VA guided detector assembly |
| [`changelog-visual-analysis-model.md`](changelog-visual-analysis-model.md) | O2 → GLB pipeline + EventDisplay runtime merge/prune |
| [`changelog-large-scale-analysis.md`](changelog-large-scale-analysis.md) | LSA driver.js tour + fit UX (range indicator / zoom) |

## Testing

| Doc | Topic |
| --- | --- |
| [`E2E.md`](E2E.md) | Playwright smoke / Django / teacher E2E |

## Ops & deploy

| Doc | Topic |
| --- | --- |
| [`dev-deployment.md`](dev-deployment.md) | Dev OpenShift / CI deploy — **redeploy via `v*-dev` tag**: §7.1 |
| [`dev-remote-access.md`](dev-remote-access.md) | Dev app from outside CERN — SSH SOCKS tunnel + Firefox |
| [`prod-database.md`](prod-database.md) | Production database notes |
| [`../../openshift/dev/README.md`](../../openshift/dev/README.md) | OpenShift dev cluster helpers |
