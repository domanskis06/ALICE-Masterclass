# OpenShift demo manifests

Source of truth for `alice-web-masterclass-demo` (static student SPA only).

No Django, teacher, DB, or OAuth secrets.

## Apply

```bash
oc project alice-web-masterclass-demo
oc apply -f openshift/demo/svc.yaml
oc apply -f openshift/demo/is.yaml
oc apply -f openshift/demo/dc.yaml
oc apply -f openshift/demo/route.yaml
```

## CI

Protected tags `v*-demo` run `npm run build:demo` (`environment.demo.ts`,
`demoMode: true`), push image
`gitlab-registry.cern.ch/.../alice-masterclass-demo`, and redeploy via
`redeploy_js_demo` (see `alice-masterclass-js/.gitlab-ci.yml`).

Local: `cd alice-masterclass-js && npm run start:demo`

Route may keep `ip_whitelist` (CERN-only) until the app is ready for
educational-resources; remove that annotation to publish on the Internet.
