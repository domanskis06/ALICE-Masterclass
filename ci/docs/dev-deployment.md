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

Routes are **public on the Internet** (no IP allowlist / no browser tunnel). See
[`dev-remote-access.md`](dev-remote-access.md). The OKD *cluster* API
(`api.paas.okd.cern.ch`) remains CERN-network / tunnel for `oc`.

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
[`ci/redeploy-openshift.sh`](../ci/redeploy-openshift.sh):

```
oc import-image <app>:latest --confirm ...
oc rollout status dc/<app> --timeout=10m
# if ImageChange did not finish: oc rollout latest, then status again
```

This matches the production flow without a fixed `sleep`. `import-image` refreshes
`ImageStreamTag:latest`; the `ImageChange` trigger on each DeploymentConfig creates
the new rollout. If that does not complete in time, the script triggers an explicit
`rollout latest`.

After a successful Django redeploy, a **manual** job `migrate_django` (stage
`migrate`) can run `python manage.py migrate --noinput` in the API pod. Use it after
schema changes; skip it when the image has no new migrations.

### 3.4 Pipeline flow (on a protected tag `v*-dev`)

```
convert ─▶ unit_tests_* ─▶ build_website ─▶ dockerize ─▶ openshift_redeploy ─▶ migrate_django (manual)
              ▲
              └── e2e_playwright runs in parallel (allow_failure; does not block deploy)
```

Deploy jobs use `rules: if: $CI_COMMIT_TAG =~ /^v.*-dev$/` so only protected-style
dev tags build and redeploy. Unit tests must succeed before dockerize/redeploy
(`needs`).

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

**Cluster drift rule:** any manual `oc` change (env, image, PVC, routes) must be
followed by a PR updating `openshift/dev/`. Otherwise the next `oc apply -f
openshift/dev/` can silently revert production-like fixes (OAuth secret mapping,
PG15 claim, etc.).

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

> DeploymentConfig is deprecated in OKD 4.14+. Migrating to `Deployment` is a
> separate follow-up (dev first, then prod); keep DC until that epik lands.

---

## 5. Configuration

### 5.1 GitLab CI/CD variables

Set under **Settings → CI/CD → Variables**. Deploy/build config is available only on
**protected tags** matching `v*-dev` (see below).

| Key | Value | Masked | Protected | Expand | Notes |
|-----|-------|--------|-----------|--------|-------|
| `NAMESPACE` | `alice-web-masterclass-dev` | no | **yes** | **no** | Target OKD namespace |
| `IMAGE_IMPORT_TOKEN` | *(secret)* | **yes** | **yes** | **no** | `gitlab-ci` SA token (`edit`); only real CI secret |
| `API_URL` | `https://api-alice-web-masterclass-dev.app.cern.ch/api/v1/` | no | **yes** | **no** | Injected into both SPAs at build |
| `MASTERCLASS_HOST` | `https://alice-web-masterclass-dev.app.cern.ch/` | no | **yes** | **no** | Student host (teacher app) |
| `OPENID_CONFIG_URL` | `https://auth.cern.ch/auth/realms/cern/.well-known/openid-configuration` | no | **yes** | **no** | Teacher OIDC discovery |
| `REDIRECT_URI` | `https://api-alice-web-masterclass-dev.app.cern.ch/oauth` | no | **yes** | **no** | Must match Application Portal |
| `CLIENT_ID` | `alice-masterclass-dev` | no | **yes** | **no** | Portal app id; baked into teacher SPA |

Do **not** store `CLIENT_SECRET` in GitLab CI variables. The teacher SPA only needs
`CLIENT_ID`; Django reads the confidential secret from OKD secret
`oidc-app-credentials` (see §5.2).

Django `settings.py` has **no** committed default for `CLIENT_SECRET` (empty locally;
required in production via `REQUIRED_PRODUCTION_VARS`). If you ever find a UUID-looking
default next to `webframeworks-paas-alice-masterclass2` in git history, treat it as
compromised for that Application Portal app until you verify/rotate (§ below: “OAuth
client secret hygiene”).

> `API_URL` must end with `/api/v1/`: both SPAs append endpoint paths without that prefix.
> Leave **Expand variable reference** unchecked for all of the above (raw URL/token strings).

#### Protected tags and who can deploy

| Setting | Value |
|---------|--------|
| Protected tags (Settings → Repository) | Wildcard `v*-dev` |
| Allowed to create | **Maintainers** (and Owners) |
| CI variables | Protected → exported only on protected tags/branches |

Only group/project **Maintainers** (or **Owners**) can push tags such as
`v0.1.7-dev`. **Developers** can push code but not release tags, so they do not
receive `IMAGE_IMPORT_TOKEN` or bake/deploy with these variables.

Membership is often inherited from group **ALICE MasterClass Dev**
(`alice-masterclass-dev-group`). To grant deploy rights, raise the user to
Maintainer on the **group** (Manage → Members), or invite them as Maintainer on
the project.

Release flow:

```bash
git tag v0.1.7-dev
git push origin v0.1.7-dev   # must be Maintainer/Owner
```

### 5.2 OpenShift secrets

| Secret | Keys | Purpose |
|--------|------|---------|
| `masterclass-database` | `database-name`, `database-user`, `database-password` | PostgreSQL credentials (shared by DB pod and Django) |
| `django-config` | `SERVICE_HOST`, `SERVICE_PORT`, `DJANGO_SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, `REDIRECT_URI`, `FRONTEND_URL` | Django runtime configuration |
| `oidc-app-credentials` | `clientID`, `clientSecret` | **Django** OAuth credentials for Portal app `alice-masterclass-dev` |
| `oidc-client-secret` | `clientID`, `clientSecret`, `issuerURL`, … | CERN-managed (AuthzOidcSecretImport); **do not use for Django** |

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

#### OAuth credentials: why `oidc-app-credentials`

OKD also creates `oidc-client-secret` for the PaaS webframeworks / Authz OIDC
integration. That secret is owned by `AuthzOidcSecretImport` and typically holds
the auto-provisioned client id `webframeworks-paas-alice-web-masterclass-dev`.
Manual patches to it are **reverted**.

The teacher SPA and Django must use the **user-managed** Application Portal app
`alice-masterclass-dev` (matching redirect URI and confidential client secret).
Store those credentials in an unmanaged secret and wire Django to it:

```bash
# Create / update (never commit the secret value)
oc create secret generic oidc-app-credentials \
  --from-literal=clientID=alice-masterclass-dev \
  --from-literal=clientSecret='<portal-client-secret>' \
  -n alice-web-masterclass-dev \
  --dry-run=client -o yaml | oc apply -f -
```

Django DeploymentConfig env mapping (see `openshift/dev/dc.yaml`):

| Env var | Secret / key |
|---------|----------------|
| `CLIENT_ID` | `oidc-app-credentials` / `clientID` |
| `CLIENT_SECRET` | `oidc-app-credentials` / `clientSecret` |
| `REDIRECT_URI` | `django-config` / `REDIRECT_URI` |
| `FRONTEND_URL` | `django-config` / `FRONTEND_URL` |

Leave `oidc-client-secret` alone; do not delete it or point Django at it.

> When setting env from a secret, prefer an explicit JSON patch that sets env
> **names** `CLIENT_ID` / `CLIENT_SECRET`. `oc set env --from=secret/...` can
> invent names like `CLIENTID` / `CLIENTSECRET` (no underscores), which Django
> does not read.

#### Django runtime mode (`DJANGO_ENV`)

Django chooses local vs production mode via `DJANGO_ENV` in
[`alice_masterclass_django/settings.py`](../alice-masterclass-django/alice_masterclass_django/settings.py):

| Mode | Effect |
|------|--------|
| `local` | SQLite, `DEBUG=True`, dummy auth, skip CERN well-known fetch |
| `production` | PostgreSQL, `DEBUG=False`, real SSO, strict CORS/hosts |

OpenShift **does not require** a new secret key: if `DJANGO_ENV` is unset, Django
treats the pod as production when both `DATABASE_NAME` and `SERVICE_HOST` are
present (already true for `dc/alice-masterclass-django`). Legacy `DJANGO_LOCAL=1`
still forces local mode (CI).

Optional clarity on the cluster (not required for correctness):

```bash
oc set env dc/alice-masterclass-django DJANGO_ENV=production -n alice-web-masterclass-dev
```

If you do that, also update [`openshift/dev/dc.yaml`](../openshift/dev/dc.yaml) so
manifests stay in sync (§4).

### 5.3 CERN Application Portal (OAuth)

Use the dedicated Portal application **`alice-masterclass-dev`** (not the
auto-created `webframeworks-paas-alice-web-masterclass-dev` client):

- Category: **Test** (pre-production).
- SSO registration: **OpenID Connect**, **confidential** client.
- Redirect URI: `https://api-alice-web-masterclass-dev.app.cern.ch/oauth`
  (must match GitLab `REDIRECT_URI`, `django-config.REDIRECT_URI`, and the
  teacher SPA build-time `redirectUri` exactly).
- `Client ID` (`alice-masterclass-dev`) → GitLab `CLIENT_ID` **and**
  `oidc-app-credentials.clientID`.
- `Client Secret` → `oidc-app-credentials.clientSecret` only (never exposed to
  the browser; the SPA only needs the public client id).

All three must agree on the same client id and redirect URI: teacher build
(GitLab vars), Django pod env, and Application Portal.

---

## 6. Migration Fixes Applied

The applications were upgraded (Angular 21, Node 22, Django 5.2) but the build/test
tooling and runtime images had not been aligned. Subsections below cover the main
runtime incidents; the bullet lists are the smaller CI/build fixes.

### 6.1 Build / CI blockers

- `alice-masterclass-django/Dockerfile`: base image `python:3.12-slim-bookworm`, removed
  the `apt-get` layer (EOL Debian buster repos; `psycopg2-binary` needs no build deps).
- Frontend base image: EOL `quay.io/centos7/httpd-24-centos7` was replaced. Alpine
  `httpd:2.4` built in CI but crash-looped on OKD (non-root / filesystem layout).
  Final runtime image for both SPAs:
  `registry.cern.ch/quay.io/sclorg/httpd-24-c9s` (DocumentRoot `/var/www/html/`,
  port 8080, OpenShift-compatible).
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

### 6.2 Teacher SPA: CentOS test page instead of Angular

**Symptom.** After a successful teacher deploy,  
`https://teacher-alice-web-masterclass-dev.app.cern.ch` returned HTTP 200 with the
default CentOS “HTTP Server Test Page”, not the Angular app (`title` was not
`ALICE Masterclass Teacher`).

**Root cause.** Teacher uses Angular’s `@angular/build:application` builder, which
writes the browser bundle under `dist/browser/` (not flat `dist/`). The Dockerfile
and CI still treated the output like the student app:

| Piece | Before (broken) | After (fixed) |
|-------|-----------------|---------------|
| CI | `cp .htaccess ./dist/` | `cp .htaccess ./dist/browser/` |
| Dockerfile | `COPY ./dist/ /var/www/html/` | `COPY ./dist/browser/ /var/www/html/` |
| Student (unchanged) | flat `dist/` | flat `dist/` |

Apache’s DocumentRoot therefore contained only the builder’s parent folder layout
(or was empty of `index.html` at the root), so sclorg httpd served its default
welcome page.

**Fix (shipped as tag `v0.1.5-dev`).**

1. [`alice-masterclass-teacher/.gitlab-ci.yml`](../alice-masterclass-teacher/.gitlab-ci.yml)  
   — after `npm run build`, copy `.htaccess` into `dist/browser/`.
2. [`alice-masterclass-teacher/Dockerfile`](../alice-masterclass-teacher/Dockerfile)  
   — `COPY ./dist/browser/ /var/www/html/`.

**Verify.**

```bash
curl -sI https://teacher-alice-web-masterclass-dev.app.cern.ch | head -5
curl -s https://teacher-alice-web-masterclass-dev.app.cern.ch | grep -o '<title>[^<]*</title>'
# expect: <title>ALICE Masterclass Teacher</title>

oc exec dc/alice-masterclass-teacher -n alice-web-masterclass-dev -- \
  ls -la /var/www/html/ | head
# expect index.html (and assets/) at DocumentRoot, not only a nested browser/ dir
```

### 6.3 PostgreSQL upgrade (10.6 → 15.12)

**Symptom.** Django pod / `manage.py migrate` failed with PostgreSQL
`NotSupportedError`: Django 5.2 requires PostgreSQL **14+**. The original
`masterclass-database` DeploymentConfig still ran
`centos/postgresql-10-centos8` (PG **10.6**) on PVC `masterclass-database`.

**Approach on dev.** In-place major-version upgrade of the same data directory is
unsafe/unsupported across 10→15. Dev used a **new empty PVC** and a new image;
the old volume was kept for rollback. A logical dump of PG10 showed **no
application tables** (migrations had never succeeded on PG10), so there was
nothing useful to restore — fresh `migrate` on PG15 was correct.

| Item | Before | After |
|------|--------|-------|
| Image | `registry.cern.ch/docker.io/centos/postgresql-10-centos8:latest` | `registry.cern.ch/quay.io/sclorg/postgresql-15-c9s:latest` (15.12) |
| PVC | `masterclass-database` | `masterclass-database-v2` (1Gi, `cephfs-ah2-ssd`) |
| Credentials secret | `masterclass-database` | unchanged (same secret keys) |

**Procedure that was applied (dev only).**

```bash
oc project alice-web-masterclass-dev

# 1) Optional: logical backup of old engine (dev dump was empty of app tables)
oc scale dc/masterclass-database --replicas=1   # if needed to take a dump
# oc exec dc/masterclass-database -- bash -lc 'pg_dumpall -U $POSTGRESQL_USER' > pg10-backup.sql

# 2) Stop DB, create new PVC, switch image + claim
oc scale dc/masterclass-database --replicas=0

# PVC manifest (example): name masterclass-database-v2, 1Gi, storageClassName cephfs-ah2-ssd
# oc apply -f masterclass-database-v2-pvc.yaml

oc set image dc/masterclass-database \
  postgresql=registry.cern.ch/quay.io/sclorg/postgresql-15-c9s:latest
oc patch dc/masterclass-database --type=json -p='[
  {"op":"replace",
   "path":"/spec/template/spec/volumes/0/persistentVolumeClaim/claimName",
   "value":"masterclass-database-v2"}
]'

oc scale dc/masterclass-database --replicas=1
oc rollout status dc/masterclass-database --timeout=5m

# 3) Confirm engine version, then apply Django schema
oc exec dc/masterclass-database -- bash -lc 'psql -U $POSTGRESQL_USER -c "SELECT version();"'
oc rollout latest dc/alice-masterclass-django   # or wait for healthy DB then restart API
oc exec dc/alice-masterclass-django -- python manage.py migrate
```

After migrate, API endpoints that need auth return **401** (DB reachable) instead of
**503** / version errors. Do **not** delete PVC `masterclass-database` until PG15 is
accepted; rollback steps live in [`openshift/dev/README.md`](../openshift/dev/README.md).

> Production (`alice-web-masterclass`) still had a separate DB CrashLoop
> (`role "admin" does not exist`) and was **not** upgraded by this work.

---

## 7. Deployment Procedure

> **Public demo SPA** (no Django/teacher) uses a different namespace and tag
> pattern (`v*-demo`). See [`demo-app.md`](demo-app.md) — do not use the
> commands in §7.1 for the demo Route.

### 7.1 Redeploy dev with a git tag (copy-paste)

Pushing a **new** protected tag matching `v*-dev` triggers the full pipeline
(tests → build → dockerize → OpenShift redeploy). Requires **Maintainer/Owner**
(see §5.1). The tag is created on whatever commit is checked out.

```bash
# 1. Point HEAD at the branch/commit you want on dev
git fetch origin
git checkout <branch>          # e.g. calorimeters, main, …
git pull origin <branch>

# 2. Pick the next unused tag (list existing, then bump patch)
git fetch origin --tags
git tag -l 'v*-dev' | sort -V | tail -5
# e.g. last is v0.1.11-dev → use v0.1.12-dev

# 3. Tag HEAD and push the tag (not the branch)
git tag v0.1.12-dev
git push origin v0.1.12-dev
```

Watch the GitLab pipeline for that tag. It builds and pushes the three images,
imports them into the ImageStreams, and rolls out student, teacher, and Django
DeploymentConfigs. If the tag introduces Django schema changes, play the manual
`migrate_django` job after `redeploy_django` succeeds.

Do **not** reuse an existing tag name — GitLab will not re-run deploy for a
retag unless you delete the remote tag first (avoid that; always bump).

### 7.2 First-deployment manual steps

The database DeploymentConfig is not driven by CI and must be started once (and
after DB engine changes). Prefer the pipeline `migrate_django` job for schema
updates; the equivalent manual command is:

```bash
# Start / refresh the PostgreSQL instance
oc rollout latest dc/masterclass-database -n alice-web-masterclass-dev
oc rollout status dc/masterclass-database -n alice-web-masterclass-dev --timeout=5m

# Apply Django migrations once the API pod can reach the DB
oc exec -n alice-web-masterclass-dev dc/alice-masterclass-django -- python manage.py migrate --noinput
```

Until migrations run, the SPAs load but API-backed features (login, sessions) return
database errors. Dev DB must already be on PostgreSQL 14+ (see §6.3).

---

## 8. Verification

1. Pipeline is green in GitLab on a `v*-dev` tag
   (`unit_tests_* → build_* → build_docker_* → redeploy_*`; optional manual `migrate_django`).
2. In the OKD Topology, all four workloads show running pods.
3. Endpoints respond:
   - Student: `https://alice-web-masterclass-dev.app.cern.ch`
   - Teacher: `https://teacher-alice-web-masterclass-dev.app.cern.ch`
   - API: `https://api-alice-web-masterclass-dev.app.cern.ch`
4. Django OAuth env points at the Portal app (not webframeworks):
   ```bash
   oc exec dc/alice-masterclass-django -n alice-web-masterclass-dev -- printenv CLIENT_ID
   # expect: alice-masterclass-dev
   ```
5. Teacher CERN SSO login succeeds (private window) and a student session can be created.

### Useful commands

```bash
oc get pods -n alice-web-masterclass-dev
oc rollout status dc/alice-masterclass-django -n alice-web-masterclass-dev
oc logs -n alice-web-masterclass-dev dc/alice-masterclass-django
oc get dc alice-masterclass-django -o jsonpath='{range .spec.template.spec.containers[0].env[*]}{.name}{" -> "}{.valueFrom.secretKeyRef.name}{"/"}{.valueFrom.secretKeyRef.key}{"\n"}{end}' | grep -iE 'client|redirect|frontend'
```

### OAuth client secret hygiene

Two different Application Portal apps matter:

| App (Client ID) | Where used | Secret source |
|-----------------|------------|---------------|
| `alice-masterclass-dev` | OKD **dev** (`alice-web-masterclass-dev`) | OKD `oidc-app-credentials` / `clientSecret` |
| `webframeworks-paas-alice-masterclass2` | Local defaults / older prod-style naming | Must live only in OKD / Portal — **not** in git |

**Is rotation required?** Only if a leaked UUID is still the **active** secret for that Portal app.

1. On a machine with `oc` access to the right namespace, print the live secret and
   compare (do not paste it into chat/git):

   ```bash
   # DEV
   oc get secret oidc-app-credentials -n alice-web-masterclass-dev \
     -o jsonpath='{.data.clientSecret}' | base64 -d; echo
   oc exec dc/alice-masterclass-django -n alice-web-masterclass-dev -- printenv CLIENT_ID
   # expect CLIENT_ID=alice-masterclass-dev — if secret ≠ any value from git history, DEV is fine
   ```

2. In [CERN Application Portal](https://application-portal.web.cern.ch/), open the app
   whose Client ID matches the leak context (often the older
   `webframeworks-paas-alice-masterclass2`). If that app still exists and is used by
   prod/legacy, **regenerate** the client secret there, then update the OKD secret that
   Django reads (`oidc-app-credentials` or the prod equivalent) and roll Django:

   ```bash
   oc create secret generic oidc-app-credentials -n <namespace> \
     --from-literal=clientID='<portal-client-id>' \
     --from-literal=clientSecret='<new-portal-client-secret>' \
     --dry-run=client -o yaml | oc apply -f -
   oc rollout latest dc/alice-masterclass-django -n <namespace>
   ```

3. If the Portal app is retired / unused, or the live OKD secret already differs from
   anything in git history → **no rotation needed** for that environment; removing the
   hardcoded default from `settings.py` is enough going forward.

Never commit the new secret. Never put it in GitLab CI variables.

---

## 9. Current Status

- Repository, CI/CD pipeline, OKD workload manifests, secrets, PVC, service account,
  GitLab CI/CD variables, and CERN OAuth registration are all in place.
- GitLab: CI variables are **Protected** (and `IMAGE_IMPORT_TOKEN` Masked); protected
  tags wildcard `v*-dev` (create = Maintainers). Do not keep `CLIENT_SECRET` in GitLab.
- CI: deploy only on `v*-dev`; unit tests gate dockerize; redeploy waits on rollout
  (no `sleep 30`); manual `migrate_django` job available after Django redeploy.
- Frontend Dockerfiles use OpenShift-ready HTTPD (`registry.cern.ch/quay.io/sclorg/httpd-24-c9s`).
- Teacher DocumentRoot fix (`dist/browser/`): see §6.2; shipped as `v0.1.5-dev`.
  Student remains flat `dist/`.
- Dev database upgrade PG10 → PG15: see §6.3
  (`postgresql-15-c9s` on PVC `masterclass-database-v2`; old PVC retained).
  Django migrations applied on the new instance.
- OAuth: Django uses unmanaged secret `oidc-app-credentials` for Portal app
  `alice-masterclass-dev`; CERN-managed `oidc-client-secret` is left untouched
  (see §5.2–5.3). Teacher SSO login on dev has been verified end-to-end.
- Cluster vs `openshift/dev/` (OAuth env, PG15 image/PVC) audited in sync; keep them
  aligned after every manual `oc` change (§4). DC→Deployment migration is backlog.
- Smoke checks:
  - student app: HTTP 200
  - teacher app: SPA HTML + CERN SSO login OK
  - API `/api/v1/sessions/` and `/api/v1/events/`: HTTP 401 (auth required; DB reachable)
- Production (`alice-web-masterclass`) PostgreSQL runs on **CERN DBOD**
  (`dbod-alice-masterclass.cern.ch:6625`, PG 15.15). Full cutover write-up:
  [`docs/prod-database.md`](prod-database.md). The old in-cluster
  `dc/masterclass-database` was scaled to 0 (CrashLoop retired; PVC retained).
  Dev keeps a separate in-cluster PG15 — do not share prod DBOD with dev.
