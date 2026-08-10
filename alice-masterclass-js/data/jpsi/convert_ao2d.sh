#!/usr/bin/env bash
# Regenerates the pbPb J/psi PID assets from an O2 AOD (AO2D.root) input.
# See README.md ("Pb-Pb dataset (AO2D)") for how to obtain that input and for the
# manual manifest.json step this script does NOT do for you.
set -euo pipefail

cd "$(dirname "$0")"

AO2D_PATH="${1:-ao2d/AO2D.root}"

if ! command -v root >/dev/null 2>&1; then
  echo "ERROR: ROOT is not on PATH." >&2
  exit 1
fi

if [ ! -f "$AO2D_PATH" ]; then
  echo "ERROR: missing $AO2D_PATH." >&2
  echo "       Pass the path explicitly: ./convert_ao2d.sh /path/to/AO2D.root" >&2
  echo "       See README.md for where to get an AO2D.root (opendata.cern.ch/record/11537)." >&2
  exit 1
fi

root -l -b -q "convert_ao2d_events.C(\"$AO2D_PATH\", \"../../src/assets/exercises/jpsi\")"

echo
echo "Done. Now add the printed manifest fragment to:"
echo "  ../../src/assets/exercises/jpsi/manifest.json"
