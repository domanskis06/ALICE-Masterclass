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
- PVC `masterclass-database`
