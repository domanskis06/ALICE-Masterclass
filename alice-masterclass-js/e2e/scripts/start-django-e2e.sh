#!/usr/bin/env bash
# Start Django for Playwright E2E. Expects sibling repo: alice-masterclass-django
# next to alice-masterclass-js. Override interpreter with E2E_PYTHON (e.g. venv in CI).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JS_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DJANGO_ROOT="$(cd "$JS_ROOT/.." && pwd)/alice-masterclass-django"

if [[ -n "${E2E_PYTHON:-}" ]]; then
  PYTHON="$E2E_PYTHON"
elif [[ -x "$DJANGO_ROOT/venv/bin/python" ]]; then
  PYTHON="$DJANGO_ROOT/venv/bin/python"
else
  PYTHON="python3"
fi

if [[ ! -f "$DJANGO_ROOT/manage.py" ]]; then
  echo "error: Django project not found at $DJANGO_ROOT (expected sibling of $JS_ROOT)" >&2
  exit 1
fi

cd "$DJANGO_ROOT"
export E2E_SESSION_PASSWORD="${E2E_SESSION_PASSWORD:-playwright-e2e}"

"$PYTHON" manage.py migrate --noinput
"$PYTHON" manage.py seed_playwright_e2e
exec "$PYTHON" manage.py runserver 127.0.0.1:8000
