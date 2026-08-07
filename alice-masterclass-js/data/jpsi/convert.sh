#!/usr/bin/env bash
# Regenerates the J/psi PID assets from the VSD inputs in ./vsd.
# See README.md for how to obtain those inputs.
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v root >/dev/null 2>&1; then
  echo "ERROR: ROOT is not on PATH. Install ROOT with Eve/VSD support and retry." >&2
  exit 1
fi

if [ ! -f vsd/events_0.root ] || [ ! -f vsd/events_1.root ]; then
  echo "ERROR: missing vsd/events_0.root or vsd/events_1.root." >&2
  echo "       Run the download command from README.md first." >&2
  exit 1
fi

root -l -b -q convert_events.C
