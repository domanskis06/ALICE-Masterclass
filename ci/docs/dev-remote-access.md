# ALICE MasterClass — remote / public access to **dev**

## Current status (public Routes)

The **dev** OpenShift Routes are **publicly reachable from the Internet** (no CERN
IP allowlist / no SSH SOCKS tunnel required for the web apps).

Verified from outside CERN (HTTP 200 on the student and teacher SPAs):

| App | URL |
| --- | --- |
| Student (dev) | https://alice-web-masterclass-dev.app.cern.ch |
| Teacher (dev) | https://teacher-alice-web-masterclass-dev.app.cern.ch |
| API (dev) | https://api-alice-web-masterclass-dev.app.cern.ch |

Public offline **demo** (separate namespace, no Django):  
https://alice-web-masterclass-demo.app.cern.ch

Manifests under [`openshift/dev/route.yaml`](../../openshift/dev/route.yaml) do not
set `haproxy.router.openshift.io/ip_whitelist`.

> **Teacher SSO** still uses CERN OAuth — anyone can load the teacher SPA, but
> logging in requires a CERN account. Student workshop features that talk to the
> API need a valid session password from a teacher-created session.

---

## What still needs CERN network / tunnel

Opening the **dev websites** does **not** need a tunnel anymore.

These still typically need CERN VPN or an SSH SOCKS / LocalForward hop
(`lxtunnel.cern.ch`) from outside CERN:

| Task | Why |
| --- | --- |
| `oc login` / `oc …` against `https://api.paas.okd.cern.ch` | Cluster API is not public |
| Some CERN-only services (GitLab SSH on :7999 usually works; OKD console/API may not) | Network policy |

Example SOCKS hop for **`oc` only** (not required for browsing the student app):

```bash
ssh -D 8888 -N YOUR_CERN_USERNAME@lxtunnel.cern.ch
# other terminal:
export HTTPS_PROXY=socks5://127.0.0.1:8888
export HTTP_PROXY=socks5://127.0.0.1:8888
oc login --token='…' --server=https://api.paas.okd.cern.ch:443
```

If `oc` rejects `socks5h`, use `socks5://` or an SSH `LocalForward` to the API
(see team notes / previous ops practice).

AFS / LXPLUS prerequisites for `lxtunnel`:  
https://resources-portal.web.cern.ch/service/central-compute-services

CERN KB: [lxtunnel](https://cern.service-now.com/service-portal?id=kb_article&n=KB0008504)

---

## Historical note

Earlier, dev Routes used `haproxy.router.openshift.io/ip_whitelist` (CERN ranges
only). From home you then needed Firefox + `ssh -D 8888 -N …@lxtunnel.cern.ch`.
That allowlist was removed; this doc used to be the full tunnel+Firefox guide.
Keep the `oc` / cluster-API section above if you work on OpenShift from outside
CERN.

---

## Related docs

| Doc | Topic |
| --- | --- |
| [`dev-deployment.md`](dev-deployment.md) | Dev OpenShift deploy, OAuth, CI |
| [`demo-app.md`](demo-app.md) | Public demo SPA |
| [`../openshift/dev/README.md`](../openshift/dev/README.md) | Cluster manifests |
