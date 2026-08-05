# OpenShift demo manifests

Source of truth for `alice-web-masterclass-demo` (static student SPA only).

No Django, teacher, DB, or OAuth secrets.

**Full guide** (purpose, local run, CI tags, public Internet):
[`ci/docs/demo-app.md`](../../ci/docs/demo-app.md).

## Files

| File | Resource |
| --- | --- |
| `svc.yaml` | Service `alice-masterclass-demo` |
| `is.yaml` | ImageStream → GitLab `alice-masterclass-demo:latest` |
| `dc.yaml` | DeploymentConfig (ImageChange + ConfigChange) |
| `route.yaml` | Host `alice-web-masterclass-demo.app.cern.ch` |

## Apply

```bash
oc project alice-web-masterclass-demo
oc apply -f openshift/demo/svc.yaml
oc apply -f openshift/demo/is.yaml
oc apply -f openshift/demo/dc.yaml
oc apply -f openshift/demo/route.yaml
```

Pull secret for `gitlab-registry.cern.ch` must be linked to SA `default` (same
approach as dev). CI variables: `NAMESPACE_DEMO`, `IMAGE_IMPORT_TOKEN_DEMO`.

## CI / redeploy

Protected tags `v*-demo` run `npm run build:demo` (`environment.demo.ts`,
`demoMode: true`), push image
`gitlab-registry.cern.ch/.../alice-masterclass-demo`, and redeploy via
`redeploy_js_demo` (see `alice-masterclass-js/.gitlab-ci.yml`).

```bash
git checkout main && git pull origin main
git tag v0.1.3-demo    # bump; tag the commit that contains demoMode
git push origin v0.1.3-demo
```

Local: `cd alice-masterclass-js && npm run start:demo`

## Route visibility

Route may keep `haproxy.router.openshift.io/ip_whitelist` (CERN-only) until the
app is ready for educational-resources. Remove that annotation to publish on the
Internet — steps in [`ci/docs/demo-app.md`](../../ci/docs/demo-app.md) §6.
