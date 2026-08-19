# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Monorepo with three deployables, each with its own `.gitlab-ci.yml` included from the root one:

| Folder | Role | Local port |
| --- | --- | --- |
| `alice-masterclass-django` | REST API (Django + DRF), `/api/v1/` | 8000 |
| `alice-masterclass-js` | Student Angular app (workshop **and** demo build) | 4200 |
| `alice-masterclass-teacher` | Teacher Angular panel | 4201 |

Both Angular apps expect Django on **8000**. Cross-cutting docs live in `ci/docs/` — start at
`ci/docs/README.md`; it indexes the architecture docs (`event-display.md`, `particle-propagation.md`,
`demo-app.md`, `tutorials.md`, `E2E.md`) and the per-feature changelogs.

## Commands

### Student app (`alice-masterclass-js`)

```bash
npm start                # ng serve -c web  → localhost:4200, API on :8000
npm run start:demo       # ng serve -c demo → offline, no Django
npm run build:dev        # dev environment
npm run build:prod       # runs make-prod.mjs first; REQUIRES API_URL env var
npm run build:demo       # runs make-demo.mjs first
npm test                 # Karma unit tests, single run (needs CHROME_BIN)
npm run test:ci          # ChromeHeadlessCI
npm run lint             # ng lint (@angular-eslint, .eslintrc.json, src/**/*.ts)
```

Single unit test: narrow with `fdescribe`/`fit` in the spec, or
`npm test -- --include='**/raa-analysis.service.spec.ts'`.

Never run `build:prod` locally without `API_URL` — `make-prod.mjs` exits non-zero rather than
writing `apiUrl: 'undefined'` into the tracked `environment.prod.ts`.

### E2E (Playwright, all from `alice-masterclass-js`)

```bash
npx playwright install chromium   # once
npm run e2e            # student, e2e/*.spec.ts excluding e2e/django/ (stubbed API)
npm run e2e:smoke      # same config, only @smoke
npm run e2e:django     # student + real Django, e2e/django/  (@django)
npm run e2e:teacher    # teacher on :4201 + Django, e2e-teacher/  (@teacher)
npm run e2e:ui
```

Single spec/test: `npx playwright test e2e/home.spec.ts -g "test name"` (add
`--config=playwright.django.config.ts` for the django suite).

The django/teacher suites start Django themselves via `e2e/scripts/start-django-e2e.sh`, which
prefers `../alice-masterclass-django/venv/bin/python` (override with `E2E_PYTHON`) and runs the
`seed_playwright_e2e` management command. `E2E_SESSION_PASSWORD` (default `playwright-e2e`) must
match between that seed command and the tests. Free ports 8000/4200/4201 first. Full detail:
`ci/docs/E2E.md`.

### Django

```bash
cd alice-masterclass-django && source venv/bin/activate
python manage.py migrate --noinput
python manage.py runserver 127.0.0.1:8000
python manage.py test                       # all
python manage.py test strangeness.tests.SomeTest.test_x   # single
```

### Teacher app

```bash
npm start        # ng serve --port 4201
npm test
```

## Architecture

### Environments and the demo build (student app)

`angular.json` swaps `src/environments/environment.ts` per configuration: `dev`, `web` (local dev
against Django), `production`, `demo`. `environment.prod.ts` and `environment.demo.ts` are
**regenerated** by `make-prod.mjs` / `make-demo.mjs` during their builds.

`AppConfig.demoMode` is read in exactly one place — `shared/demo/demo.tokens.ts`, which exposes it
as the `DEMO_MODE` injection token; `DemoConfig` wraps it for consumers. Tests flip demo behaviour
by overriding the token, never by patching the environment file. Keep that invariant.

Demo mode means: no session login, no upload to Django, results persisted in `sessionStorage`
(`shared/demo/demo-results-store.service.ts`), VA histograms shared across datasets, extra LSA
summary. See `ci/docs/demo-app.md`.

### Student app modules

No lazy loading: every exercise is an NgModule imported eagerly in `app.module.ts`, and each ships a
`RouterModule.forChild` routing module wired into `app-routing.module.ts` (routes: `home`, `strangeness-visual-analysis`,
`strangeness-large-scale-analysis`, `particle-propagation`,
`nuclear-modification-event-exploration`, `nuclear-modification-spectrum-analysis`).

Shared layer under `src/app/shared/`: `components/` (incl. `event-display`, `histogram`,
`fit-histogram`), `services/` (`api.service.ts` owns auth/session state and the domain enums
`ParticleType` / `CollisionType` / `CentralityType`; plus `fit`, `flight`, `side-view-scale`,
`track-volume-clip`), `three/` (mesh merge + detector-part optimisation helpers), `demo/`,
`models/`, `utils/`.

Exercise-level data services live in `src/app/services/`: `strangeness-data.service.ts`
(dataset/event-id maps for VA and LSA), `raa-data.service.ts` (RAA asset fetching with
`shareReplay`), `raa-analysis.service.ts`, `lsa-enhancement.service.ts`.

`shared/components/event-display/event-display.component.ts` is a ~5k-line Three.js "god component"
shared by the strangeness and nuclear-modification exercises — side views (Rφ/ρz masks with zoom
sync), detector loading, track rendering. Read `ci/docs/event-display.md` before touching it; it
explains how to extend via Services rather than by growing the component.

Particle Propagation has its own Three.js scene under `particle-propagation/scene/` and physics
under `particle-propagation/physics/` (RK4 integration, ALICE Chebyshev field map with binary
tables in `src/assets/field/*.bin`). That physics code is **ported GPL-3.0 work** from
`pnwkw/gpu_propagator` and `pnwkw/distributed_field` — attribution lives in file headers and the
app README; preserve it.

Guided tours use driver.js and live in per-exercise `*-tutorial/*.service.ts` files
(`va-tutorial`, `lsa-tutorial`, `ee-tutorial`, `sa-tutorial`). Demo vs workshop step lists differ —
see `ci/docs/tutorials.md`.

UI strings go through `@ngx-translate`; `src/assets/i18n/{en,pl,de,fr,es}.json`. Don't assert on
translated copy in tests unless the test sets the language explicitly.

### Generated exercise data

`src/assets/exercises/strangeness/part1/*` and `part2/*` are **gitignored and produced by CI**
(`convert_strangeness_events`, `convert_strangeness_invariant` jobs) from the generator sources in
`alice-masterclass-js/data/`:

- `data/strangeness/part1/convert_events.C` — ROOT macro, AliVSD → host event JSON
- `data/strangeness/part1_Xi/` — Ξ/Ξ̅ cascades from a FemtoUniverse dump, converted then merged into
  host events (`convert_xi_params.py`, `merge_cascades_into_hosts.py`, seed map
  `cascade_host_map.json`); see its README
- `data/strangeness/part2/convert.py` — invariant-mass histograms
- `data/raa/part2/build_assets.py` — RAA spectrum assets

RAA assets under `src/assets/exercises/raa/` are committed. If strangeness exercises show no data
locally, the generators haven't been run — that's expected on a fresh checkout, not a bug.

### Django API

Single flat URLconf in `alice_masterclass_django/urls.py`. Two apps: `masterclass` (CERN OAuth,
DRF tokens, `Event`, `Session`, `check_session`; a `post_save` signal mints an auth token per user)
and `strangeness` (`VisualAnalysisResult` / `LargeScaleAnalysisResult` + entry rows, keyed by
`session` + `student`). Students authenticate by session **password**, not user accounts
(`sessionByPassword`).

Note: only the strangeness exercises persist results server-side. The nuclear-modification (RAA)
exercises are frontend-only.

`settings.py` resolves mode via `resolve_django_env()`: `DJANGO_ENV=local|production`, then legacy
`DJANGO_LOCAL=1`, then `DATABASE_NAME`+`SERVICE_HOST` present → production, else local. Local uses
SQLite (`masterclass.sqlite`), `DEBUG=True`, CORS open. Production hard-fails at import if any of
`DATABASE_*`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `DJANGO_SECRET_KEY` is missing.

## CI / deploy

GitLab CI stages: `convert → test → build_website → dockerize → openshift_redeploy → migrate`.
Deployment is **tag-driven** on OpenShift (CERN OKD):

- `v*-dev` → full workshop stack (student + teacher + Django), `ci/docs/dev-deployment.md` §7.1
- `v*-demo` → public demo SPA only, `ci/docs/demo-app.md` §5

Manifests in `openshift/dev/` and `openshift/demo/`; redeploy helper `ci/redeploy-openshift.sh`.
The `migrate_django` job is manual. `e2e_playwright` is `allow_failure: true` and always uploads
HTML reports/traces as artifacts.

## Conventions

- E2E selectors: prefer `data-testid` on stable hooks (auth dialog, nav, exercise shell, upload),
  `getByRole` where semantics are stable.
- Changes worth documenting go into `CHANGELOG.md` (summary vs upstream `0.0.6`) with detail in the
  matching `ci/docs/changelog-*.md`.
- `alice-masterclass-js/.gitignore` excludes `src/**/*.js` — don't commit compiled output.
