# ALICE MasterClass — Development Deployment (CERN OKD)

This document describes the development (`dev`) deployment of the ALICE MasterClass
platform to CERN PaaS (OKD/OpenShift), including the repository layout, CI/CD
pipeline, OpenShift resources, configuration, and the deployment procedure.

The goal of the `dev` environment is to be a 1:1 replica of production, including
full CERN OAuth, so that changes can be validated end-to-end before promotion.

---

## 1. Overview

The project is a **monorepo** containing three components plus a database:

| Component | Folder | Role |
|-----------|--------|------|
| Django REST API | `alice-masterclass-django` | Backend API, CERN OAuth token exchange, data storage |
| Student app | `alice-masterclass-js` | Angular SPA used by students |
| Teacher app | `alice-masterclass-teacher` | Angular SPA used by teachers (CERN SSO login) |
| Database | (OpenShift template) | PostgreSQL instance backing the API |

### Environments and endpoints (dev)

| Service | URL |
|---------|-----|
| Student app | `https://alice-web-masterclass-dev.app.cern.ch` |
| Teacher app | `https://teacher-alice-web-masterclass-dev.app.cern.ch` |
| API | `https://api-alice-web-masterclass-dev.app.cern.ch` |

### Platform coordinates

| Item | Value |
|------|-------|
| Git remote | `ssh://git@gitlab.cern.ch:7999/alice-masterclass-dev-group/ALICE-MasterClass-Dev.git` |
| Container registry | `gitlab-registry.cern.ch/alice-masterclass-dev-group/alice-masterclass-dev` |
| OKD cluster API | `https://api.paas.okd.cern.ch` |
| OKD namespace | `alice-web-masterclass-dev` |

---

## 2. Architecture

```
                         ┌─────────────────────────────┐
   Browser (student)  ─▶ │ Route: alice-web-...-dev     │ ─▶ Service ─▶ Student SPA pod
                         └─────────────────────────────┘
                         ┌─────────────────────────────┐
   Browser (teacher)  ─▶ │ Route: teacher-...-dev       │ ─▶ Service ─▶ Teacher SPA pod
                         └─────────────────────────────┘
                         ┌─────────────────────────────┐
   SPA / OAuth flow   ─▶ │ Route: api-...-dev           │ ─▶ Service ─▶ Django API pod ─▶ PostgreSQL
                         └─────────────────────────────┘
                                                                         (masterclass-database)
```

Authentication: the teacher SPA starts an OpenID Connect (authorization code) flow
against CERN SSO. CERN redirects the authorization `code` to the API endpoint
`/oauth`, where Django exchanges it for a token using the confidential client
secret, then redirects back to the teacher app with a session token.

---

## 3. CI/CD Pipeline

### 3.1 Monorepo structure

A root [`.gitlab-ci.yml`](../.gitlab-ci.yml) declares the shared stages and includes
the three component pipelines:

```yaml
stages:
  - convert
  - test
  - build_website
  - build
  - dockerize
  - openshift_redeploy

include:
  - local: 'alice-masterclass-django/.gitlab-ci.yml'
  - local: 'alice-masterclass-js/.gitlab-ci.yml'
  - local: 'alice-masterclass-teacher/.gitlab-ci.yml'
```

Because all three pipelines are merged into one, each component's jobs use
**unique names** (e.g. `build_docker_django`, `build_website_js`,
`redeploy_teacher`) to avoid collisions, and every job `cd`s into its own
component subfolder. Artifact paths are prefixed with the component folder.

### 3.2 Images

Each component builds and pushes a dedicated sub-image, matching the OpenShift
ImageStreams:

| Component | Image |
|-----------|-------|
| Student | `$CI_REGISTRY_IMAGE/alice-masterclass` |
| Django | `$CI_REGISTRY_IMAGE/alice-masterclass-django` |
| Teacher | `$CI_REGISTRY_IMAGE/alice-masterclass-teacher` |

Images are tagged with both `:$CI_COMMIT_TAG` and `:latest`. Docker build jobs are
tag-only (`only: tags`) and run on the `docker-privileged-xl` runner (Docker-in-Docker).

### 3.3 Deployment jobs

The `openshift_redeploy` stage jobs call a shared script at
`ci/redeploy-openshift.sh`:

```
oc import-image <app> --all --server=$SERVER --namespace $NAMESPACE --token=$IMAGE_IMPORT_TOKEN
sleep 30s
oc rollout status dc/<app> --server=$SERVER --namespace $NAMESPACE --token=$IMAGE_IMPORT_TOKEN
```

This matches the production flow. `import-image` refreshes `ImageStreamTag:latest`;
the `ImageChange` trigger on each DeploymentConfig creates the new rollout.

### 3.4 Pipeline flow (on a tag)

```
convert ─▶ build_website ─▶ dockerize ─▶ openshift_redeploy
                    (unit_tests_*, e2e_playwright run in parallel; they do not block deploy)
```

---

## 4. OpenShift (OKD) Resources

All resources live in namespace `alice-web-masterclass-dev`. The workload
manifests were adapted from the production project and re-pointed at the dev
namespace, dev hostnames, and the dev registry sub-images.

The source-of-truth manifests now live in `openshift/dev/`:

- `openshift/dev/dc.yaml`
- `openshift/dev/is.yaml`
- `openshift/dev/svc.yaml`
- `openshift/dev/route.yaml`
- `openshift/dev/README.md`

| Kind | Names |
|------|-------|
| DeploymentConfig | `alice-masterclass`, `alice-masterclass-django`, `alice-masterclass-teacher`, `masterclass-database` |
| Service | one per component + `masterclass-database` |
| Route | student, api, teacher (edge TLS, redirect to HTTPS) |
| ImageStream | `alice-masterclass`, `alice-masterclass-django`, `alice-masterclass-teacher` |
| PersistentVolumeClaim | `masterclass-database-v2` (1Gi, `cephfs-ah2-ssd`, PostgreSQL 15) |
| ServiceAccount | `gitlab-ci` (role `edit`) + token secret `gitlab-ci-token` |

A registry pull secret is configured and linked to the `default` service account so
that pods can pull images from the private GitLab registry.

---

## 5. Configuration

### 5.1 GitLab CI/CD variables

Set under **Settings → CI/CD → Variables**:

| Key | Value | Notes |
|-----|-------|-------|
| `NAMESPACE` | `alice-web-masterclass-dev` | Target OKD namespace |
| `IMAGE_IMPORT_TOKEN` | *(secret)* | `gitlab-ci` service-account token; Masked |
| `API_URL` | `https://api-alice-web-masterclass-dev.app.cern.ch/api/v1/` | Injected into both SPAs at build |
| `MASTERCLASS_HOST` | `https://alice-web-masterclass-dev.app.cern.ch/` | Student host (used by teacher app) |
| `OPENID_CONFIG_URL` | `https://auth.cern.ch/auth/realms/cern/.well-known/openid-configuration` | Teacher OIDC discovery |
| `REDIRECT_URI` | `https://api-alice-web-masterclass-dev.app.cern.ch/oauth` | Must match Application Portal |
| `CLIENT_ID` | *(from Application Portal)* | OAuth client id |

> `API_URL` must end with `/api/v1/`: both SPAs append endpoint paths without that prefix.

### 5.2 OpenShift secrets

| Secret | Keys | Purpose |
|--------|------|---------|
| `masterclass-database` | `database-name`, `database-user`, `database-password` | PostgreSQL credentials (shared by DB pod and Django) |
| `django-config` | `SERVICE_HOST`, `SERVICE_PORT`, `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `REDIRECT_URI`, `FRONTEND_URL` | Django runtime configuration |
| `oidc-client-secret` | `clientID`, `clientSecret` (+ CERN-managed `issuerURL`, `suggestedCookieSecret`) | OAuth client credentials |

`django-config` values (dev):

| Key | Value |
|-----|-------|
| `SERVICE_HOST` | `masterclass-database` |
| `SERVICE_PORT` | `5432` |
| `ALLOWED_HOSTS` | `api-alice-web-masterclass-dev.app.cern.ch` |
| `CORS_ALLOWED_ORIGINS` | `https://alice-web-masterclass-dev.app.cern.ch,https://teacher-alice-web-masterclass-dev.app.cern.ch` |
| `REDIRECT_URI` | `https://api-alice-web-masterclass-dev.app.cern.ch/oauth` |
| `FRONTEND_URL` | `https://teacher-alice-web-masterclass-dev.app.cern.ch/login` |
| `DJANGO_SECRET_KEY` | *(random)* |

> `oidc-client-secret` is provisioned and managed by the CERN SSO integration once the
> application is registered in the Application Portal; it should not be deleted manually.

### 5.3 CERN Application Portal (OAuth)

A dedicated dev application was registered:

- Category: **Test** (pre-production).
- SSO registration: **OpenID Connect**, **confidential** client.
- Redirect URI: `https://api-alice-web-masterclass-dev.app.cern.ch/oauth`
  (must match `REDIRECT_URI` exactly).
- `Client ID` → GitLab `CLIENT_ID` and OKD `oidc-client-secret.clientID`.
- `Client Secret` → OKD `oidc-client-secret.clientSecret` only (never exposed to the browser).

---

## 6. Migration Fixes Applied

The applications were upgraded (Angular 21, Node 22, Django 5.2) but the build/test
tooling had not been aligned. The following fixes were required to make the dev
build and pipeline pass:

**Deployment blockers**
- `alice-masterclass-django/Dockerfile`: base image `python:3.12-slim-bookworm`, removed
  the `apt-get` layer (EOL Debian buster repos; `psycopg2-binary` needs no build deps).
- Frontend runtime images (`alice-masterclass-js` and `alice-masterclass-teacher`) now
  use `registry.cern.ch/quay.io/sclorg/httpd-24-c9s` to align with OpenShift non-root
  behavior and avoid runtime crash loops seen with `httpd:2.4-alpine`.
- Teacher SPA uses Angular `@angular/build:application`, which writes the site under
  `dist/browser/`. The teacher Dockerfile copies `./dist/browser/` into `/var/www/html/`,
  and CI places `.htaccess` in `dist/browser/` so Apache DocumentRoot serves the SPA
  (not the CentOS default test page).
- Teacher build job: image `node:22-bookworm`, pinned `npm@11`.
- Student build job: pinned `npm@11` so `npm ci` matches the npm 11 lockfile.
- `event-display.component.html`: replaced an out-of-scope `#drawer` template reference
  (invalid under the new `@if` control flow) with a `sidebarOpened` toggle.
- Django API: restored `409 Conflict` on duplicate event/session (DRF 3.15 now fails
  serializer validation with `400`; the frontend depends on `409`).

**Unit tests (CI)**
- Unit tests run in the Playwright image (`mcr.microsoft.com/playwright:...`), whose
  Chromium starts on the CERN runner; `CHROME_BIN` is resolved from `/ms-playwright`.
- Enabled software WebGL (`--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`)
  so three.js components can create a WebGL context headless.
- Student `src/test.ts`: removed legacy `require.context` (specs are auto-discovered).
- Teacher spec: `async` → `waitForAsync` (removed from `@angular/core/testing`).
- LSA `InstructionsComponent` spec: provided `LsaTutorialService` and `MatDialogRef`.

Verified locally: Django 20/20, student 36/36, teacher 55/55.

---

## 7. Deployment Procedure

### 7.1 Trigger the pipeline

```bash
git tag v0.1.0-dev
git push origin v0.1.0-dev
```

This builds and pushes the three images, imports them into the ImageStreams, and rolls
out the student, teacher, and Django DeploymentConfigs.

### 7.2 First-deployment manual steps

The database DeploymentConfig and Django migrations are not driven by CI and must be
run once (and after schema changes):

```bash
# Start the PostgreSQL instance
oc rollout latest dc/masterclass-database -n alice-web-masterclass-dev

# Apply Django migrations once the API pod is running
oc exec -n alice-web-masterclass-dev deploy/alice-masterclass-django -- python manage.py migrate
```

Until migrations run, the SPAs load but API-backed features (login, sessions) return
database errors.

---

## 8. Verification

1. Pipeline is green in GitLab (deploy chain: `build_* → build_docker_* → redeploy_*`).
2. In the OKD Topology, all four workloads show running pods.
3. Endpoints respond:
   - Student: `https://alice-web-masterclass-dev.app.cern.ch`
   - Teacher: `https://teacher-alice-web-masterclass-dev.app.cern.ch`
   - API: `https://api-alice-web-masterclass-dev.app.cern.ch`
4. Teacher CERN SSO login succeeds and a student session can be created.

### Useful commands

```bash
oc get pods -n alice-web-masterclass-dev
oc rollout status dc/alice-masterclass-django -n alice-web-masterclass-dev
oc logs -n alice-web-masterclass-dev dc/alice-masterclass-django
```

---

## 9. Current Status

- Repository, CI/CD pipeline, OKD workload manifests, secrets, PVC, service account,
  GitLab CI/CD variables, and CERN OAuth registration are all in place.
- Frontend Dockerfiles use OpenShift-ready HTTPD (`registry.cern.ch/quay.io/sclorg/httpd-24-c9s`).
- Teacher DocumentRoot is `dist/browser/` (Angular application builder); student remains flat `dist/`.
- Dev database was upgraded from PostgreSQL 10.6 to PostgreSQL 15.12
  (`registry.cern.ch/quay.io/sclorg/postgresql-15-c9s:latest` on PVC
  `masterclass-database-v2`). Django 5.2 requires PostgreSQL 14+.
- Django migrations were applied successfully on the new PG15 instance.
- Smoke checks:
  - student app: HTTP 200
  - teacher app: after `v0.1.5-dev`, expect SPA HTML (not CentOS test page), then SSO login
  - API `/api/v1/sessions/` and `/api/v1/events/`: HTTP 401 (auth required; DB reachable)
- Remaining manual verification: teacher CERN SSO login and creating a student session.
- Production (`alice-web-masterclass`) database CrashLoop (`role "admin" does not exist`)
  is a separate incident and was not modified by this work.
