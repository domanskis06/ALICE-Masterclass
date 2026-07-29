# ALICE MasterClass dev — remote access via SSH SOCKS tunnel

> **Before starting this guide:** activate **AFS service (AFS account, `/afs/cern.ch/user/` area)** at  
> `https://resources-portal.web.cern.ch/service/central-compute-services`.  
> Without active AFS (and LXPLUS/Linux access), SSH tunneling to `lxtunnel.cern.ch` may fail.

This guide explains how to open the **dev** web apps from **outside the CERN
network** (home, mobile hotspot, university Wi‑Fi, etc.).

The dev OpenShift Routes use an IP allowlist (`haproxy.router.openshift.io/ip_whitelist`)
limited to CERN address ranges. From a non‑CERN network the hostnames resolve, but
the router drops the connection before the app is reached. An SSH SOCKS tunnel
through `lxtunnel.cern.ch` makes your browser appear to come from CERN.

> **On CERN Wi‑Fi / eduroam at CERN:** you can open the dev URLs directly — no
> tunnel required. See [§6 Verifying the tunnel while on CERN Wi‑Fi](#6-verifying-the-tunnel-while-on-cern-wi-fi)
> if you want to confirm the tunnel setup before leaving the site.

---

## 1. Dev endpoints

| App | URL |
| --- | --- |
| Student | `https://alice-web-masterclass-dev.app.cern.ch` |
| Teacher | `https://teacher-alice-web-masterclass-dev.app.cern.ch` |
| API | `https://api-alice-web-masterclass-dev.app.cern.ch` |

Example deep link:  
`https://alice-web-masterclass-dev.app.cern.ch/particle-propagation`

---

## 2. Prerequisites

| Requirement | Notes |
| --- | --- |
| Valid **CERN account** | e.g. `sdomansk` — use your CERN username, not your Linux login |
| **SSH access** to `lxtunnel.cern.ch` | Password + 2FA when connecting from outside CERN |
| **Firefox** (recommended) | Per‑browser proxy; Opera/Chrome need a different workflow |
| Local **SSH client** | Preinstalled on Ubuntu / macOS |

GitLab **Maintainer** role and e‑group membership (`alice-masterclass-dev`) control
**deploy** access and project membership — they do **not** bypass the Route IP
allowlist. Each developer needs their own CERN account and tunnel.

---

## 3. One‑time SSH config (optional)

Add to `~/.ssh/config` so you do not have to type the username every time:

```ssh-config
Host lxtunnel
  HostName lxtunnel.cern.ch
  User YOUR_CERN_USERNAME
```

Replace `YOUR_CERN_USERNAME` with your account (e.g. `sdomansk`).

---

## 4. Connect — step by step

You need **two things at once**: a running SSH tunnel (terminal) and a browser
configured to use it as a SOCKS proxy.

### Step 1 — start the tunnel (local terminal)

Open a terminal on your machine (any directory). Run:

```bash
ssh -D 8888 -N YOUR_CERN_USERNAME@lxtunnel.cern.ch
```

Or, with the SSH config above:

```bash
ssh -D 8888 -N lxtunnel
```

- Enter your **CERN password** and **2FA** if prompted.
- On success the command prints **nothing** and appears to hang — that is normal.
- **Leave this terminal window open** for the whole testing session.
- Stop the tunnel later with **Ctrl+C**.

What the flags mean:

| Flag | Purpose |
| --- | --- |
| `-D 8888` | Open a local SOCKS proxy on port `8888` |
| `-N` | Do not open a remote shell — tunnel only |

> Run this command on **your laptop**, not inside an existing `lxtunnel` SSH
> session. `lxtunnel` is a restricted hop host; it is not meant for nested tunnels.

### Step 2 — configure Firefox proxy

1. Open **Firefox**.
2. **Settings** → **General** → **Network Settings** → **Settings…**
3. Select **Manual proxy configuration**.
4. Set:

   | Field | Value |
   | --- | --- |
   | **SOCKS Host** | `127.0.0.1` |
   | **Port** | `8888` |
   | **SOCKS v5** | selected |
   | **Proxy DNS when using SOCKS v5** | **checked** |

5. Leave **HTTP Proxy** and **HTTPS Proxy** empty.
6. Click **OK**.

Firefox proxy settings apply **only to Firefox**. Other browsers (e.g. Opera GX)
are unaffected.

**Recommended workflow:** use Firefox only for dev testing, or create a separate
Firefox profile (`firefox -ProfileManager`) with proxy enabled, and keep your
daily browser on “No proxy”.

### Step 3 — open the dev app

With the tunnel running and Firefox proxy enabled, navigate to e.g.:

`https://alice-web-masterclass-dev.app.cern.ch/particle-propagation`

### Step 4 — disconnect

1. In the tunnel terminal: **Ctrl+C**
2. In Firefox: **Network Settings** → **No proxy** → **OK**

If you leave proxy enabled without a running tunnel, Firefox cannot reach most
sites (it tries to connect to `127.0.0.1:8888` where nothing is listening).

---

## 5. Traffic path (mental model)

```
Firefox  →  localhost:8888 (SOCKS proxy)
              ↓
         SSH encrypted tunnel
              ↓
         lxtunnel.cern.ch (CERN)
              ↓
         https://alice-web-masterclass-dev.app.cern.ch
              ↓
         Dev app loads (source IP is in the allowlist)
```

---

## 6. Verifying the tunnel while on CERN Wi‑Fi

You can confirm the tunnel + proxy setup **without leaving CERN**, even though
direct access already works on site Wi‑Fi.

### Test A — proxy ON, tunnel OFF

1. Firefox: proxy enabled (§4 Step 2).
2. **Do not** run `ssh -D …`.
3. Open a dev URL.

**Expected:** page **fails** to load (connection error / timeout).

This proves Firefox is routing through the local proxy, not bypassing it.

### Test B — proxy ON, tunnel ON

1. Start the tunnel (§4 Step 1).
2. Open the same dev URL in Firefox.

**Expected:** page **loads**.

If Test A fails and Test B succeeds, the remote‑access setup is correct and will
work from home or mobile data.

### Test C — control (optional)

- Proxy **off**, on CERN Wi‑Fi → dev URL loads directly (normal on‑site access).

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `(szymon@lxtunnel…) Password` then disconnect | Wrong username (local Linux login used instead of CERN) | Use `YOUR_CERN_USERNAME@lxtunnel.cern.ch` |
| `Connection closed` after password | Wrong password or account issue | Check CERN credentials; contact CERN IT if needed |
| Page never loads with proxy on | Tunnel not running | Start `ssh -D 8888 -N …` and keep terminal open |
| `Connection refused` to localhost | Tunnel not running | Same as above |
| Works on CERN Wi‑Fi without proxy, not from home | Expected — allowlist | Use tunnel + proxy from outside CERN |
| Entire Firefox slow / broken | Proxy on without tunnel, or tunnel routes all traffic | Disable proxy when done; use a dedicated Firefox profile for dev |
| `ssh: command not found` inside lxtunnel session | Tunnel command run on wrong machine | `exit` back to your laptop, run `ssh -D` locally |

---

## 8. Security notes

- Do not share your CERN password or SSH session.
- Stop the tunnel when you are finished testing.
- The dev environment is intentionally **not** public; this method keeps the
  Route allowlist while allowing authenticated CERN users to work remotely.
- Opening the Route to the whole Internet (`ip_whitelist: ""`) is a separate,
  deliberate decision — see [`dev-deployment.md`](dev-deployment.md).

---

## 9. Related docs

| Doc | Topic |
| --- | --- |
| [`dev-deployment.md`](dev-deployment.md) | Dev OpenShift deploy, Routes, OAuth, CI |
| [`../openshift/dev/README.md`](../openshift/dev/README.md) | Cluster manifests |
| CERN KB | [lxtunnel service](https://cern.service-now.com/service-portal?id=kb_article&n=KB0008504) |
| CERN PaaS | [Network visibility](https://paas.docs.cern.ch/5._Exposing_The_Application/2-network-visibility/) |
