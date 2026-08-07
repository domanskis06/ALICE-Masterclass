# Public demo app (offline student SPA)

Standalone build of the student Angular app for
[CERN Educational Resources](https://educational-resources.web.cern.ch/resources)
and similar public showcases. Visitors explore the MasterClass **without** a CERN
account, Django API, teacher panel, or database.

| | |
| --- | --- |
| **OKD namespace** | `alice-web-masterclass-demo` |
| **URL** | https://alice-web-masterclass-demo.app.cern.ch |
| **Image** | `gitlab-registry.cern.ch/.../alice-masterclass-demo` |
| **Tag pattern (CI)** | `v*-demo` (e.g. `v0.1.2-demo`) |
| **Manifests** | [`openshift/demo/`](../../openshift/demo/) |
| **Flag** | `AppConfig.demoMode === true` → `DEMO_MODE` / `DemoConfig` |

Workshop builds (`web` / `dev` / `production`) keep `demoMode: false` and are
unchanged in behaviour except where they intentionally share UI (e.g. LSA
histogram compact chrome, tutorial Help entry).

---

## 1. Why a separate instance

| Workshop (dev / prod) | Demo |
| --- | --- |
| Django + PostgreSQL + teacher SPA | Student SPA only |
| Session password / CERN OAuth for teacher | No login |
| Results uploaded to the API | Results in the browser (`sessionStorage`) |
| Per-dataset VA histograms (cleared on dataset switch) | Shared VA histograms across datasets |
| LSA: spectrum + workshop results + Upload | LSA: spectrum \| enhancement plot, fit selector, teacher-style Results, Undo |
| Auto tutorial welcome off (Help → Start tutorial) | Auto Skip/Start welcome on first visit to VA/LSA |

Code lives in the **same monorepo and `main` branch**. Demo is selected at
**build time** via Angular `fileReplacements` (`environment.demo.ts`), not a
long-lived fork. Feature work stays on normal branches; demo-only UI is gated
with `DemoConfig` / `@if (demo)`.

### Why this shape (not a separate repo)

Demo is a **build of the student SPA**, not a second product. Workshop needs
Django, sessions, and the teacher app; demo needs none of that — only a static
host and a few UI/persistence differences.

| Approach | Verdict |
| --- | --- |
| **Monorepo + `demoMode` (chosen)** | One fix / new exercise lands once; demo stays a thin overlay (`DemoConfig`, `@if (demo)`, `sessionStorage`). Separate OKD namespace for deploy only. |
| Separate GitLab repo / fork | Looks cleaner at first; every shared UI/physics/i18n change must be ported. Drift and double release cost grow with new exercises. |
| Long-lived `demo` branch | Same merge pain as a fork, without isolation. Avoid. |

**Rules of thumb:** keep demo branches local (auth, upload vs store, LSA layout,
tutorials). Do not fork whole exercise modules. New workshop exercises need not
ship a full demo variant on day one. Revisit a split only if most PRs become
large demo-only duplicates of workshop code.

---

## 2. Architecture

```
Browser ─▶ Route alice-web-masterclass-demo.app.cern.ch
              └─▶ Service ─▶ DeploymentConfig alice-masterclass-demo
                              (static Apache + dist/ from build:demo)

No Django · No teacher · No DB · No OAuth secrets
```

### Build / runtime switch

1. `npm run build:demo` → `make-demo.mjs` writes `environment.demo.ts`
   (`demoMode: true`, empty `apiUrl`, `environment: 'DEMO'`).
2. `angular.json` configuration `demo` replaces the default environment file.
3. `DEMO_MODE` (`InjectionToken`) reads `AppConfig.demoMode` once; `DemoConfig`
   exposes `enabled` to components/services.
4. Workshop paths never call `DemoResultsStore` mutators when `enabled` is false.

Key modules:

| Area | Location |
| --- | --- |
| Tokens / config | `src/app/shared/demo/` |
| Info dialog | `src/app/demo-info-dialog/` |
| Persistence | `DemoResultsStore` → `sessionStorage` keys `demo:*` |
| LSA enhancement math | `src/app/services/lsa-enhancement.service.ts` |
| LSA UI (demo) | `enhancement-plot/`, `enhancement-results/`, Undo in `fit-selector/` |
| VA shared histos | `eventKeyFor()` = `` `${datasetID}:${eventId}` ``; dataset change does **not** clear results |

### Persistence rules

- **Exercise data (VA / LSA):** `sessionStorage` — survives refresh in the same tab;
  a new tab starts clean. Legacy `localStorage` keys under `demo:` are cleared on
  store init.
- **One-time demo info dialog:** `localStorage` key `demo:infoShown` (once per
  browser, reopenable from the nav menu item that replaces the password button).
- **Tutorial Skip/Start dismiss:** in-memory per page load (`dismissedThisSession`);
  see [`tutorials.md`](tutorials.md).

UI copy must **not** put the word “demo” on ordinary buttons; the info dialog and
`APP_INFO.*` i18n explain the offline nature once.

---

## 3. Local development

Django is **not** required.

```bash
cd alice-masterclass-js
npm install          # first time
npm run start:demo   # ng serve -c demo → http://localhost:4200
```

Do **not** run `npm run build:prod` locally unless `API_URL` is set:
`make-prod.mjs` exits with an error if it is missing (avoids writing
`apiUrl: 'undefined'` into `environment.prod.ts`). `start:demo` / `build:demo`
only touch `environment.demo.ts`.

Unit coverage for demo paths: `strangeness-data.service.demo.spec.ts`,
`lsa-enhancement.service.spec.ts`, tutorial specs with `DemoConfig` stubbed.

E2E smoke still targets the **workshop** config (`npm start` / stubbed API).

---

## 4. OpenShift bootstrap (once)

Namespace and Application Portal project: `alice-web-masterclass-demo`.

Manifests (source of truth in git):

```bash
oc project alice-web-masterclass-demo
oc apply -f openshift/demo/svc.yaml
oc apply -f openshift/demo/is.yaml
oc apply -f openshift/demo/dc.yaml
oc apply -f openshift/demo/route.yaml
```

Also required (not in git):

- ImageStream pull from GitLab registry (same pattern as dev): pull secret linked
  to SA `default`.
- GitLab CI/CD variables for redeploy: `NAMESPACE_DEMO`, `IMAGE_IMPORT_TOKEN_DEMO`
  (mapped onto `NAMESPACE` / `IMAGE_IMPORT_TOKEN` in `redeploy_js_demo`).

Details and apply notes: [`../../openshift/demo/README.md`](../../openshift/demo/README.md).

---

## 5. Redeploy with a git tag

Same idea as dev (`v*-dev`), different suffix and image.

```bash
git fetch origin
git checkout main
git pull origin main

# Confirm HEAD is the commit you intend (must include demoMode / build:demo)
git log -1 --oneline

git fetch origin --tags
git tag -l 'v*-demo' | sort -V | tail -5

git tag v0.1.3-demo          # bump; never reuse a tag name
git push origin v0.1.3-demo
```

Pipeline jobs (`alice-masterclass-js/.gitlab-ci.yml`):

1. `build_website_js_demo` — `npm run build:demo`
2. `build_docker_js_demo` — image `…/alice-masterclass-demo:$TAG` + `:latest`
3. `redeploy_js_demo` — import ImageStream + rollout DC `alice-masterclass-demo`

Verify:

```bash
oc project alice-web-masterclass-demo
oc get pods
oc get dc alice-masterclass-demo -o jsonpath='{.spec.template.spec.containers[0].image}{"\n"}'
curl -sI https://alice-web-masterclass-demo.app.cern.ch | head -5
```

**Tag the commit that actually contains the demo feature code.** Tagging an old
scaffolding commit (CI only, still building production config) deploys a workshop
clone even if the pipeline is green.

---

## 6. Public Internet (educational-resources)

The Route may keep `haproxy.router.openshift.io/ip_whitelist` (CERN ranges) until
the demo is ready for the public catalogue.

When ready:

1. Remove the annotation:

   ```bash
   oc annotate route alice-masterclass-demo -n alice-web-masterclass-demo \
     haproxy.router.openshift.io/ip_whitelist-
   ```

   Or delete the row in paas.cern.ch → Networking → Routes → annotations.

2. Confirm from outside CERN: `curl -sI https://alice-web-masterclass-demo.app.cern.ch`
   returns `200` (not a timeout).

3. Only then publish the link on educational-resources.

---

## 7. Related docs

| Doc | Topic |
| --- | --- |
| [`tutorials.md`](tutorials.md) | VA / LSA tours in demo vs workshop |
| [`changelog-demo-app.md`](changelog-demo-app.md) | File-level demo changelog |
| [`changelog-large-scale-analysis.md`](changelog-large-scale-analysis.md) | LSA fit UX + tours |
| [`dev-deployment.md`](dev-deployment.md) | Full workshop stack (dev) |
| [`../../CHANGELOG.md`](../../CHANGELOG.md) | Product summary |
