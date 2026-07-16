# ALICE MasterClass — Teacher app

Angular panel for teachers (sessions, events, results). Talks to the Django API.

## Prerequisites

- [Node.js](https://nodejs.org) (LTS recommended)
- Django API running on [http://127.0.0.1:8000](http://127.0.0.1:8000) (see [`../alice-masterclass-django/README.md`](../alice-masterclass-django/README.md))

## Setup

```bash
npm install
```

## Run locally

Dev server on port **4201** (student app uses 4200):

```bash
npm start
```

Then open [http://localhost:4201](http://localhost:4201).

Local `environment.ts` points at:

- API: `http://localhost:8000/api/v1/`
- Student host: `http://localhost:4200/`

## Build

```bash
npm run build        # default
npm run build:prod   # production (runs `make-prod.mjs` first when configured)
```

## Tests

- Unit: `npm test` (Karma)
- E2E (from the student repo, with Django): see [`../docs/E2E.md`](../docs/E2E.md) (`npm run e2e:teacher` in `alice-masterclass-js`)

## Related

- Monorepo overview: [`../README.md`](../README.md)
