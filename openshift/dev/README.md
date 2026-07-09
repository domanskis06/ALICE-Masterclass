# OpenShift dev manifests

These manifests are the source of truth for `alice-web-masterclass-dev`.
They intentionally exclude runtime-only metadata (`status`, `uid`, `resourceVersion`)
and exclude secret values.

## Files

- `dc.yaml` - DeploymentConfigs for student, teacher, django, and postgres
- `is.yaml` - ImageStreams pointing to GitLab registry sub-images
- `svc.yaml` - Internal Services for all components
- `route.yaml` - Public Routes for student, teacher, and API

## Apply order

```bash
oc project alice-web-masterclass-dev
oc apply -f openshift/dev/svc.yaml
oc apply -f openshift/dev/is.yaml
oc apply -f openshift/dev/dc.yaml
oc apply -f openshift/dev/route.yaml
```

After any manual `oc` change, update these files in the same PR so the cluster
and git stay aligned (see `docs/dev-deployment.md` §4).

## Required secrets / storage

These resources must exist before successful rollout:

- secret `masterclass-database` with `database-name`, `database-user`, `database-password`
- secret `django-config` with app/env keys (`SERVICE_HOST`, `ALLOWED_HOSTS`, `REDIRECT_URI`, `FRONTEND_URL`, etc.)
- secret `oidc-app-credentials` with `clientID`, `clientSecret` (Portal app `alice-masterclass-dev`)
- PVC `masterclass-database-v2` (PostgreSQL 15 data volume)

Do **not** point Django `CLIENT_ID` / `CLIENT_SECRET` at `oidc-client-secret`.
That secret is owned by CERN `AuthzOidcSecretImport` (webframeworks PaaS client) and
manual edits are reverted. See `docs/dev-deployment.md` §5.2–5.3.

Create / refresh the unmanaged OAuth secret:

```bash
oc create secret generic oidc-app-credentials \
  --from-literal=clientID=alice-masterclass-dev \
  --from-literal=clientSecret='<portal-client-secret>' \
  -n alice-web-masterclass-dev \
  --dry-run=client -o yaml | oc apply -f -
```

## PostgreSQL version

Django 5.2 requires PostgreSQL 14+. Dev currently runs:

- image: `registry.cern.ch/quay.io/sclorg/postgresql-15-c9s:latest` (15.12)
- PVC: `masterclass-database-v2` (1Gi, `cephfs-ah2-ssd`)
- credentials: secret `masterclass-database` (unchanged)

The previous PG10 PVC `masterclass-database` is retained as a rollback source and
should not be deleted until the PG15 deployment is accepted. Full narrative:
`docs/dev-deployment.md` §6.3.

### Upgrade path used on dev (10 → 15)

In-place major upgrade of the same data dir was avoided. Steps:

1. Scale down `dc/masterclass-database`.
2. Create PVC `masterclass-database-v2`.
3. `oc set image` → `postgresql-15-c9s:latest`.
4. Patch volume claimName → `masterclass-database-v2`.
5. Scale up, then `oc exec dc/alice-masterclass-django -- python manage.py migrate`.

On this cluster the PG10 dump had no app tables (migrations never ran on 10.6),
so a fresh migrate on PG15 was sufficient — no restore from dump.

### Rollback to PG10 (dev only)

```bash
oc project alice-web-masterclass-dev
oc scale dc/masterclass-database --replicas=0
oc set image dc/masterclass-database postgresql=registry.cern.ch/docker.io/centos/postgresql-10-centos8:latest
oc patch dc/masterclass-database --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/volumes/0/persistentVolumeClaim/claimName","value":"masterclass-database"}]'
oc scale dc/masterclass-database --replicas=1
oc rollout latest dc/masterclass-database
```

Note: Django 5.2 will not run against PG10; rollback is only for inspecting old
volume contents or recovering a dump.

### Apply Django migrations after DB changes

```bash
oc exec -n alice-web-masterclass-dev dc/alice-masterclass-django -- python manage.py migrate
```