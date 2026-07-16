# ALICE MasterClass — Django API

Backend for the student and teacher apps (`/api/v1/`).

## Prerequisites

- Python 3.12+ (matches `requirements.txt`)
- Virtualenv in this folder: `venv/`

## Setup (once)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate --noinput
```

## Run locally

```bash
source venv/bin/activate
python manage.py runserver 127.0.0.1:8000
```

API base URL used by the Angular apps: [http://127.0.0.1:8000/api/v1/](http://127.0.0.1:8000/api/v1/).

Local mode uses SQLite (`masterclass.sqlite`) when `DJANGO_ENV` is unset / local.

## E2E seed

Playwright integration tests call `seed_playwright_e2e` via
[`alice-masterclass-js/e2e/scripts/start-django-e2e.sh`](../alice-masterclass-js/e2e/scripts/start-django-e2e.sh).
That script prefers `venv/bin/python` in this directory. Full E2E docs: [`docs/E2E.md`](../docs/E2E.md).

## Related

- Monorepo overview: [`../README.md`](../README.md)
- Dev deployment: [`../docs/dev-deployment.md`](../docs/dev-deployment.md)
