# ALICE MasterClass — Production database cutover (OKD → CERN DBOD)

This document is the full record of how production PostgreSQL moved from an
in-cluster OpenShift (OKD) pod to **CERN Database On Demand (DBOD)**, why the old
pod CrashLooped, what was verified, and how to operate the database going forward.

Related:

- Dev in-cluster PG15: [`docs/dev-deployment.md`](dev-deployment.md) §6.3
- DBOD portal: https://dbod.web.cern.ch/pages/instance/alice_masterclass
- DBOD user guide (backup/restore): https://dbod-user-guide.web.cern.ch/instance_management/backup/

---

## 1. Summary

| | Before | After (current) |
|--|--------|-----------------|
| Where Postgres runs | Pod in OKD namespace `alice-web-masterclass` | CERN **DBOD** instance `alice_masterclass` |
| How Django connects | Cluster Service `masterclass-database:5432` | `dbod-alice-masterclass.cern.ch:6625` |
| Engine | PostgreSQL 10 (centos image) | PostgreSQL **15.15** |
| Data | PVC `masterclass-database` | DBOD storage (app tables restored/migrated there) |
| Old OKD DB DC | Running / later CrashLoop | **Scaled to 0** (2026-07-09); PVC retained |

Application pods (student, teacher, Django) still run on OKD. Only the **database
server** left the cluster. Both old and new setups are CERN infrastructure; DBOD
is a managed DBA platform, not a third-party cloud outside CERN.

**Dev is unchanged:** `alice-web-masterclass-dev` keeps in-cluster PostgreSQL 15
on PVC `masterclass-database-v2`. Do **not** point dev at prod DBOD.

---

## 2. Architecture

### 2.1 Before (in-cluster Postgres)

```
Browser → Routes → Student / Teacher / Django pods (OKD)
                                      │
                                      ▼
                         Service masterclass-database:5432
                                      │
                                      ▼
                         DC masterclass-database (PG10)
                         PVC masterclass-database
```

### 2.2 After (DBOD)

```
Browser → Routes → Student / Teacher / Django pods (OKD)
                                      │
                                      ▼
                    SERVICE_HOST=dbod-alice-masterclass.cern.ch
                    SERVICE_PORT=6625
                                      │
                                      ▼
                         CERN DBOD alice_masterclass (PG 15.15)

DC masterclass-database ── replicas: 0 (retired; PVC kept for retention)
```

Django reads connection settings from environment
([`alice_masterclass_django/settings.py`](../alice-masterclass-django/alice_masterclass_django/settings.py)):

- `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD`
- `SERVICE_HOST`, `SERVICE_PORT` (Postgres host and port)

---

## 3. Current production coordinates

| Item | Value |
|------|-------|
| OKD namespace | `alice-web-masterclass` |
| DBOD instance | `alice_masterclass` |
| Category | PROD |
| Owner | `sdomansk` |
| E-group | `alice-masterclass-admi` (admin group on DBOD) |
| Host | `dbod-alice-masterclass.cern.ch` |
| Port | `6625` |
| Engine | PostgreSQL 15.15 |
| Database name | `alice_masterclass` |
| App DB user | `admin` |
| Portal | https://dbod.web.cern.ch/pages/instance/alice_masterclass |

### OpenShift secrets (prod)

| Secret | Keys used for DB | Role |
|--------|------------------|------|
| `django-config` | `SERVICE_HOST`, `SERVICE_PORT` | Host/port of DBOD |
| `masterclass-database` | `database-name`, `database-user`, `database-password` | DB name, user, password |

Secret **names** were kept for compatibility with the DeploymentConfig env
refs; values now describe DBOD, not the old in-cluster Service.

Verified Django env after cutover:

```text
DATABASE_NAME=alice_masterclass
DATABASE_USER=admin
SERVICE_HOST=dbod-alice-masterclass.cern.ch
SERVICE_PORT=6625
```

---

## 4. Why the old OKD pod CrashLooped

After data/credentials were moved to DBOD, the legacy DeploymentConfig
`masterclass-database` still tried to start PostgreSQL 10 on the old PVC.

Typical log:

```text
=> sourcing .../set_passwords.sh ...
ERROR: role "admin" does not exist
```

**Mechanism:** the sclorg/centos Postgres image runs `set_passwords.sh` on every
start and runs `ALTER USER` for `POSTGRESQL_USER` from the Secret. The Secret
had `database-user=admin` (aligned with DBOD’s DBA user), but the **PVC data
directory** was initialized earlier with a **different** role. Hence CrashLoop —
this was a mismatch on the **retired** volume, not a failure of DBOD.

Fixing that PVC (revert Secret / `CREATE ROLE admin` on the old volume) was
**not** required once Django already used DBOD. The operational fix was to
**stop** the old DC.

---

## 5. What was done (timeline)

1. **DBOD instance** created / used for prod (`alice_masterclass`, PG 15.15,
   port 6625). Application data present on DBOD (sessions, events, strangeness
   tables with non-zero row counts).
2. **Django secrets** pointed at DBOD (`SERVICE_HOST` / `SERVICE_PORT` +
   `DATABASE_*`). Confirmed with `psycopg2` from the Django pod:
   - `OK ('admin', 'alice_masterclass')`
   - Roles: `admin`, `dod_dbmon`, `dod_pmm`, `postgres` (DBOD platform roles)
3. **Manual DBOD backup** created in the portal (Backup and Restore) before
   touching the old DC.
4. **2026-07-09:** `oc scale dc/masterclass-database --replicas=0` in
   `alice-web-masterclass` only.
5. **Post-check:** Django still connected to DBOD (e.g. 80 sessions, 58 events);
   API `/api/v1/sessions/` and `/events/` returned 401 (auth required, DB up);
   student/teacher frontends HTTP 200. Topology: old DB component idle (not red).

No production application data was deleted by the scale-down. Scale-down does
not modify DBOD.

---

## 6. Dev vs prod databases

| | Production | Development |
|--|------------|-------------|
| Namespace | `alice-web-masterclass` | `alice-web-masterclass-dev` |
| Postgres location | **DBOD** | **OKD pod** + PVC `masterclass-database-v2` |
| Version | 15.15 (DBOD) | 15.x (`postgresql-15-c9s`) |
| Purpose | Live workshops / real data | CI, experiments, safe breakage |

**Recommendation:** keep dev on in-cluster PG15. A separate DBOD instance for
dev is optional later (never share prod DBOD with dev).

---

## 7. Day-2 operations

### 7.1 Verify connectivity

```bash
oc project alice-web-masterclass

oc exec dc/alice-masterclass-django -- printenv \
  DATABASE_NAME DATABASE_USER SERVICE_HOST SERVICE_PORT

oc exec dc/alice-masterclass-django -- python -c "
import os, psycopg2
conn = psycopg2.connect(
  dbname=os.environ['DATABASE_NAME'],
  user=os.environ['DATABASE_USER'],
  password=os.environ['DATABASE_PASSWORD'],
  host=os.environ['SERVICE_HOST'],
  port=os.environ['SERVICE_PORT'],
  connect_timeout=10)
cur = conn.cursor()
cur.execute('SELECT count(*) FROM masterclass_session')
print('sessions', cur.fetchone()[0])
conn.close()
"
```

### 7.2 Confirm old DC stays off

```bash
oc get dc masterclass-database
# expect replicas: 0

oc get pods -l name=masterclass-database
# expect no pods

oc get pvc masterclass-database
# expect Bound (retained until explicit cleanup)
```

### 7.3 Backups and restore (DBOD)

- Calendar **dots** = storage snapshots (daily automatic + manual **Create backup**).
- Retention is typically on the order of **~one month** (DBOD SOP), not forever.
- **Snapshot restore** or **Point-in-Time Restore (PITR)** can bring data back, but
  restore **overwrites the live instance** and causes downtime.
- Safer inspection: **Clones** tab (temporary clone from snapshot/PITR) —
  https://dbod-user-guide.web.cern.ch/instance_management/clones/
- Create a manual backup before risky DBOD or schema operations.

Password for `admin` is not shown in the DBOD UI; keep it in a password manager.
DBOD docs use `admin` as the instance DBA user for PostgreSQL.

### 7.4 Schema migrations

Run Django migrations against DBOD the same way as before (from the API pod or
CI), e.g.:

```bash
oc exec dc/alice-masterclass-django -- python manage.py migrate --noinput
```

That updates **schema** on DBOD; it does not copy data from the old OKD PVC.

---

## 8. Do not / later cleanup

**Do not**

- Scale `masterclass-database` back to 1 to “fix” CrashLoop — it is not the
  production datastore.
- Point `alice-web-masterclass-dev` at prod DBOD.
- Delete PVC/DC without a written retention decision.
- Commit database passwords to git or chat logs.

**Later (optional cleanup, separate change)**

- After a retention window: delete retired `dc/masterclass-database`, its
  Service (if unused), then PVC `masterclass-database`.
- Document who approved PVC deletion.

---

## 9. Quick reference links

| Resource | URL / command |
|----------|----------------|
| DBOD portal (this instance) | https://dbod.web.cern.ch/pages/instance/alice_masterclass |
| DBOD backup guide | https://dbod-user-guide.web.cern.ch/instance_management/backup/ |
| DBOD getting started (PG) | https://dbod-user-guide.web.cern.ch/getting_started/PostgreSQL/postgresql/ |
| Prod API | https://api-alice-web-masterclass.app.cern.ch |
| OKD project | `oc project alice-web-masterclass` |
