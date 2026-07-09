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

## Required secrets / storage

These resources must exist before successful rollout:

- secret `masterclass-database` with `database-name`, `database-user`, `database-password`
- secret `django-config` with app/env keys (`SERVICE_HOST`, `ALLOWED_HOSTS`, etc.)
- secret `oidc-client-secret` with `clientID`, `clientSecret`
- PVC `masterclass-database-v2` (PostgreSQL 15 data volume)

## PostgreSQL version

Django 5.2 requires PostgreSQL 14+. Dev currently runs:

- image: `registry.cern.ch/quay.io/sclorg/postgresql-15-c9s:latest`
- PVC: `masterclass-database-v2`

The previous PG10 PVC `masterclass-database` is retained as a rollback source and
should not be deleted until the PG15 deployment is accepted.

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

### Apply Django migrations after DB changes

```bash
oc exec -n alice-web-masterclass-dev dc/alice-masterclass-django -- python manage.py migrate
```
