# E2E tests (Playwright)

This document describes the end-to-end test layer around the student app
(`alice-masterclass-js`), integration with **Django**, and a minimal suite for the
**teacher app** (`alice-masterclass-teacher`). It complements the short section in
[`alice-masterclass-js/README.md`](../alice-masterclass-js/README.md).

## Goals

- **Fast feedback** — smoke tests without a backend (stubbed HTTP) so local and CI
  runs catch routing and basic UI regressions quickly.
- **Real API integration** — a few scenarios against Django + seed data, without
  duplicating full business logic (that remains covered by Django API tests).
- **Minimal teacher smoke** — confirm that the login bypass, routing, and reading
  events from the API work together against the same backend.

E2E does **not** replace Angular unit tests or Django API tests — it complements
them for browser behaviour, CORS, routing, and response timing.

## File layout

Paths below are relative to `alice-masterclass-js/` unless noted.

| Path | Purpose |
| --- | --- |
| `playwright.config.ts` | Default config: only `e2e/*.spec.ts`, **excluding** `e2e/django/` (`testIgnore`); one `webServer` = `ng serve` on **4200**. |
| `playwright.django.config.ts` | Student + Django: `webServer` = Django start script + `ng serve` on **4200**; test dir `e2e/django/`. |
| `playwright.teacher.config.ts` | Teacher + Django: Django + teacher `ng serve` on **4201**; test dir `e2e-teacher/`. |
| `e2e/` | Smoke / stub tests (e.g. `home.spec.ts`, `routing.spec.ts`, `api-stub.spec.ts`, `fixtures.ts`). |
| `e2e/django/` | Integration against a live backend. |
| `e2e-teacher/` | Teacher app smoke. |
| `e2e/scripts/start-django-e2e.sh` | Migrations, `seed_playwright_e2e`, `runserver` on `127.0.0.1:8000`. |
| `e2e/scripts/start-teacher-e2e.sh` | `ng serve` in `../alice-masterclass-teacher` on **4201**. |

## npm scripts

Run from `alice-masterclass-js/`:

| Script | Description |
| --- | --- |
| `npm run e2e` | All tests from the default config (student, **without** the `django` folder). |
| `npm run e2e:smoke` | Only tests tagged `@smoke` (fast subset). |
| `npm run e2e:django` | Django config + scenarios in `e2e/django/`. |
| `npm run e2e:teacher` | Teacher config + Django + `e2e-teacher/`. |
| `npm run e2e:ui` | Playwright UI mode. |

First-time Playwright browser install:

```bash
npx playwright install chromium
```

## Playwright tags

- **`@smoke`** — student scenarios with a stubbed `check_session` (no Django required).
- **`@django`** — scenarios that need the seed and API on port **8000**.
- **`@teacher`** — teacher app scenarios.

Filter examples:

```bash
npx playwright test --grep @smoke
npx playwright test --config=playwright.django.config.ts --grep @django
npx playwright test --config=playwright.teacher.config.ts --grep @teacher
```

## Backend and seed

Django command:
[`masterclass/management/commands/seed_playwright_e2e.py`](../alice-masterclass-django/masterclass/management/commands/seed_playwright_e2e.py)
in **`alice-masterclass-django`**.

- Creates (idempotently) event **`PlaywrightE2EEvent`** and session **`PlaywrightE2ESession`**.
- Session password: env **`E2E_SESSION_PASSWORD`**, default **`playwright-e2e`** — must
  **match** what the browser tests / API request bodies use.

`start-django-e2e.sh` sets the default password, runs migrations and the seed before
`runserver`.

Python interpreter: **`E2E_PYTHON`**, or automatically
`../alice-masterclass-django/venv/bin/python` when that path exists.

## `e2e/django/` scenarios (summary)

1. **`real-session.spec.ts`** — `sessionStorage` + `check_session` from the browser;
   asserts document title (session name from the seed).
2. **`auth-dialog.spec.ts`** — password dialog happy path (`data-testid` on fields and
   Proceed).
3. **`strangeness-exercise.spec.ts`** — navigate to the visual analysis route; assert
   key UI (toolbar, dataset selector, page container).
4. **`visual-analysis-put.spec.ts`** — short **`PUT /api/v1/strangeness_visual_analysis/0/1/`**
   via Playwright `request` (contract aligned with Django tests in `strangeness/tests.py`).

## `data-testid` (stable UI hooks)

Present among others on:

- auth dialog (`auth-student-id`, `auth-session-password`, `auth-dialog-proceed`),
- CERN toolbar (`cern-toolbar`),
- navigation (`nav-menu-toggle`, `nav-link-visual-analysis`),
- visual analysis page (`strangeness-visual-analysis-page`, `va-dataset-select`),
- histogram upload button (`va-upload-results`),
- teacher panel (`teacher-events-title` in `alice-masterclass-teacher`).

Rule: prefer **`getByTestId`** in new tests where copy depends on i18n.

## CI (GitLab)

In [`alice-masterclass-js/.gitlab-ci.yml`](../alice-masterclass-js/.gitlab-ci.yml),
job **`e2e_playwright`**:

- Image **`mcr.microsoft.com/playwright`** (browser included; currently
  `v1.59.1-noble`).
- Python deps in a venv; `pip install` from `alice-masterclass-django/requirements.txt`.
- **`npm ci`** in `alice-masterclass-js` and in **`../alice-masterclass-teacher`**
  (teacher tests).
- Order: **`npm run e2e:django`**, then **`npm run e2e:teacher`**.
- Job currently has **`allow_failure: true`** — a failure does not fail the whole
  pipeline (smoke/deploy can still proceed). Treat green E2E as a strong signal,
  not a hard gate, until that flag is removed.
- **Artifacts** (`when: always`): HTML reports and `test-results*` directories (including
  traces on retry), e.g. `playwright-report-django/`, `playwright-report-teacher/`.

The monorepo pipeline overview (including that E2E runs in parallel with unit tests)
is in [`dev-deployment.md`](dev-deployment.md) §3.3–3.4.

## Teacher app — npm dependencies

For **`npm ci`** in `alice-masterclass-teacher` with Angular 21, **CDK and Material**
must be on the same major/minor line (currently `^21.2.x`). The theme in
`src/alice-theme.scss` uses Material **M2** APIs (`mat.m2-define-palette`, …),
compatible with Material 17+.

## Common issues

| Symptom | Cause / fix |
| --- | --- |
| `npm run e2e` runs Django tests and fails without an API | Default config **ignores** `e2e/django/` — use `npm run e2e:django` for backend integration. |
| `ECONNREFUSED 127.0.0.1:8000` | Django did not start or the port is busy; free **8000**, or avoid conflicting `reuseExistingServer` with another process. |
| Missing Playwright Chromium | `npx playwright install chromium`. |
| Title without session name under `e2e:django` | Check seed, `E2E_SESSION_PASSWORD`, Django logs. |
| Wrong working directory | Paths are relative — run from `alice-masterclass-js` next to `alice-masterclass-django` (and teacher for teacher E2E). |

## Further work (indicative)

- Extend **`e2e/django/`** only for **critical** flows (e.g. UI upload once stable);
  do not duplicate every button.
- Add **`data-testid`** on new elements that matter for E2E.
- Consider extra tags (e.g. `@slow`) if long scenarios appear.
- Drop `allow_failure: true` on `e2e_playwright` once the suite is stable enough to
  gate merges/deploys.
