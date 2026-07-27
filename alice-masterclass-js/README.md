# ALICE MasterClass (student web app)

Angular application for the ALICE MasterClass student experience, served in the browser.

Monorepo overview and running Django + teacher together: [`../README.md`](../README.md). Docs index: [`../ci/docs/README.md`](../ci/docs/README.md).

## Prerequisites

- [Node.js](https://nodejs.org) (LTS recommended)
- Django API on port **8000** for real backend calls (see [`../alice-masterclass-django/README.md`](../alice-masterclass-django/README.md))

## Setup

From this folder (or after cloning the monorepo):

```bash
npm install
```

## Run locally

Development server with the `web` environment (API defaults to `http://localhost:8000/api/v1/`):

```bash
npm start
```

Equivalent:

```bash
npm run ng:serve
```

Then open the URL shown in the terminal (typically [http://localhost:4200](http://localhost:4200)).

## Build

```bash
npm run build          # default configuration
npm run build:dev      # dev environment
npm run build:prod     # production (runs `make-prod.mjs` first)
```

Output is written to `dist/`.

## Architecture notes

- [EventDisplay](../ci/docs/event-display.md) — Three.js god component, zones of responsibility, how to extend via Services
- [Particle Propagation](../ci/docs/particle-propagation.md) — own Three.js scene, RK4 / field map, detector shell including shared `L3.glb` magnet stand-in (CAD archived as `L3_original.glb`)

## Third-party attribution

The **Particle Propagation** module (`src/app/particle-propagation/physics/`) ports the ALICE magnetic
field model (Chebyshev polynomial parametrization) and its binary lookup tables
(`src/assets/field/*.bin`) from:

- [pnwkw/gpu_propagator](https://github.com/pnwkw/gpu_propagator) — GPU propagation and visualisation of particle collisions with accurate model of ALICE detector magnetic field
- [pnwkw/distributed_field](https://github.com/pnwkw/distributed_field) — Distributed Simulation And Visualization of The ALICE Detector Magnetic Field

Both are licensed under **GPL-3.0**. The ported logic lives in
`src/app/particle-propagation/physics/cheb-field-data.ts` and
`src/app/particle-propagation/physics/magnetic-field.service.ts` (see file headers for details).

## Tests

### Unit tests (Karma)

```bash
npm test
```

Requires a Chrome/Chromium installation (set `CHROME_BIN` if the binary is not on `PATH`).

### End-to-end tests (Playwright)

**Full E2E documentation:** [ci/docs/E2E.md](../ci/docs/E2E.md) — layout, Django seed, CI, tags, troubleshooting.

First-time browser download:

```bash
npx playwright install chromium
```

| Command | What it runs |
| --- | --- |
| `npm run e2e` | Student app: `e2e/*.spec.ts` **excluding** `e2e/django/` (`ng serve` on **4200** only) |
| `npm run e2e:smoke` | Same config, only tests tagged **`@smoke`** (stubbed API, fast) |
| `npm run e2e:django` | Student app + Django: `e2e/django/` (tags **`@django`**) |
| `npm run e2e:teacher` | Teacher app on **4201** + Django: `e2e-teacher/` (tags **`@teacher`**) |
| `npm run e2e:ui` | Playwright UI mode |

**Smoke E2E** (Angular only; `api-stub` fakes `check_session` — no Django):

```bash
npm run e2e
```

Faster subset (stubbed flows only):

```bash
npm run e2e:smoke
```

Interactive UI:

```bash
npm run e2e:ui
```

**E2E with real Django** (`npm run e2e:django`): starts Django + `ng serve`, seeds data, runs tests under `e2e/django/` against the real API (session, auth dialog, strangeness shell, `PUT strangeness_visual_analysis`, etc.).

**Teacher E2E** (`npm run e2e:teacher`): requires a sibling [alice-masterclass-teacher](../alice-masterclass-teacher) with `npm ci` already run there (CI installs both apps). Uses the same Django seed as the student django suite.

Requirements:

- Sibling checkout: [alice-masterclass-django](../alice-masterclass-django) next to this folder (same parent as `alice-masterclass-js`).
- Python 3 with Django dependencies. Easiest: a venv inside the Django repo (used automatically if it exists):

```bash
cd ../alice-masterclass-django
python3 -m venv venv
. venv/bin/activate
pip install -r requirements.txt
python manage.py migrate --noinput
deactivate
cd ../alice-masterclass-js
npm run e2e:django
```

The start script uses `../alice-masterclass-django/venv/bin/python` when present, or `E2E_PYTHON` if set. Optional `E2E_SESSION_PASSWORD` (default `playwright-e2e`) must match between the [seed_playwright_e2e](../alice-masterclass-django/masterclass/management/commands/seed_playwright_e2e.py) command and the browser test.

Stop any other process on ports **8000** and **4200** (and **4201** for teacher) before running, or rely on Playwright’s `reuseExistingServer` when **not** in CI.

### Tags and selectors

- **`@smoke`** — quick student tests with stubbed `check_session` (`e2e/`).
- **`@django`** — integration tests that need a running Django + seed (`e2e/django/`).
- **`@teacher`** — teacher UI against Django (`e2e-teacher/`).

Examples:

```bash
npx playwright test --grep @smoke
npx playwright test --config=playwright.django.config.ts --grep @django
npx playwright test --config=playwright.teacher.config.ts --grep @teacher
```

Prefer **`data-testid`** on stable hooks (auth dialog, nav, exercise shell, upload). Use **`getByRole`** where semantics are stable. Avoid coupling assertions to translated copy unless the test explicitly sets the language.

### CI artifacts

GitLab job **`e2e_playwright`** currently has **`allow_failure: true`**. It uploads HTML reports and traces (**`when: always`**) under `playwright-report-django/`, `playwright-report-teacher/`, and matching `test-results-*` folders when tests fail or retries capture traces. See [ci/docs/E2E.md](../ci/docs/E2E.md) for the full CI layout.
