# ALICE MasterClass (monorepo)

Student web app, teacher panel, and Django API for the ALICE MasterClass exercises.

## Modules

| Folder | Role | Local URL |
| --- | --- | --- |
| [`alice-masterclass-django`](alice-masterclass-django/README.md) | REST API (Python / Django) | http://127.0.0.1:8000/api/v1/ |
| [`alice-masterclass-js`](alice-masterclass-js/README.md) | Student Angular app | http://localhost:4200 |
| [`alice-masterclass-teacher`](alice-masterclass-teacher/README.md) | Teacher Angular app | http://localhost:4201 |

Cross-cutting docs live in [`ci/docs/README.md`](ci/docs/README.md). Ops notes for OpenShift: [`openshift/dev/README.md`](openshift/dev/README.md).

## Run all three locally

Use **three terminals**. Student and teacher expect the API on port **8000**.

### 1. Django

```bash
cd alice-masterclass-django
source venv/bin/activate
python manage.py migrate --noinput
python manage.py runserver 127.0.0.1:8000
```

If `venv/` is missing, create it once:

```bash
cd alice-masterclass-django
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Student app

```bash
cd alice-masterclass-js
npm install   # first time only
npm start
```

### 3. Teacher app

```bash
cd alice-masterclass-teacher
npm install   # first time only
npm start
```

## Documentation

See [`ci/docs/README.md`](ci/docs/README.md) for the full index (E2E, EventDisplay, Particle Propagation, deployment, database).

Dev redeploy (tag → CI → OpenShift): [`ci/docs/dev-deployment.md`](ci/docs/dev-deployment.md) §7.1.
