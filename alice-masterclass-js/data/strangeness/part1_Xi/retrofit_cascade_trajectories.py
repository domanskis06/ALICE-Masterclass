#!/usr/bin/env python3
"""
One-off retrofit: recompute `trajectory` for the 32 already-merged Ξ/Ξ̅
cascades after fixing the curvature sign bug in `convert_xi_params.py`
(`propagate_helix` bent tracks the wrong way for their charge sign).

Only the `trajectory` array of each of the 3 cascade tracks is touched.
`E`, `mass`, `particleId`, `sign`, `px/py/pz`, `decayId`, and the host's
`tracks[]` / `decays[]` structure are left byte-for-byte untouched — those
were never wrong (the bug was purely in the visual curvature direction).

Demo dataset 0 (`event_0_3.json`, from the legacy ROOT pipeline) is never
touched: it isn't in `cascade_host_map.json` and was already correct — it's
the reference this fix was validated against.

Usage (from alice-masterclass-js/):
  python3 data/strangeness/part1_Xi/retrofit_cascade_trajectories.py [--dry-run]

See README.md in this folder for the full pipeline background.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
_JS_ROOT = _HERE.parents[2]
_DEFAULT_ASSETS = _JS_ROOT / "src" / "assets" / "exercises" / "strangeness" / "part1"
_DEFAULT_MAP = _HERE / "cascade_host_map.json"

# Must stay identical to convert_xi_params.py's constants.
B2C = 0.299792458e-2
B_FIELD_T = 0.5
STEP_CM = 1.5
MAX_R_CM = 600.0
MAX_Z_CM = 600.0
MAX_PATH_CM = 500.0
MAX_POINTS = 2000

TRACK_TYPE_CASCADE = 2
TRACK_TYPE_CASCADE_BACHELOR = 3


def propagate_helix_fixed(px: float, py: float, pz: float, sign: float, start: list[float]) -> list[list[float]]:
    """Same formula as the fixed convert_xi_params.py::propagate_helix."""
    p = math.hypot(px, py, pz)
    if p < 1e-12:
        return [list(start)]
    q = float(sign)
    ux, uy, uz = px / p, py / p, pz / p
    k = q * B2C * B_FIELD_T / p

    x, y, z = float(start[0]), float(start[1]), float(start[2])
    pts: list[list[float]] = [[x, y, z]]
    path = 0.0
    for _ in range(MAX_POINTS - 1):
        dux = -k * uy
        duy = k * ux
        ux2 = ux + dux * STEP_CM
        uy2 = uy + duy * STEP_CM
        uz2 = uz
        n = math.hypot(ux2, uy2, uz2)
        if n < 1e-15:
            break
        ux, uy, uz = ux2 / n, uy2 / n, uz2 / n
        x += ux * STEP_CM
        y += uy * STEP_CM
        z += uz * STEP_CM
        path += STEP_CM
        pts.append([x, y, z])
        if math.hypot(x, y) > MAX_R_CM or abs(z) > MAX_Z_CM or path >= MAX_PATH_CM:
            break
    return pts


def is_cascade_decay(particle_list: list[dict[str, Any]]) -> bool:
    if len(particle_list) != 3:
        return False
    types = [t.get("type") for t in particle_list]
    return types == [TRACK_TYPE_CASCADE, TRACK_TYPE_CASCADE, TRACK_TYPE_CASCADE_BACHELOR]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=_DEFAULT_ASSETS)
    parser.add_argument("--map", type=Path, default=_DEFAULT_MAP, dest="map_path")
    parser.add_argument("--dry-run", action="store_true", help="Report what would change without writing")
    args = parser.parse_args()

    host_map = json.loads(args.map_path.read_text(encoding="utf-8"))
    assignments = host_map["assignments"]
    if len(assignments) != 32:
        raise SystemExit(f"{args.map_path}: expected 32 assignments, got {len(assignments)}")

    n_hosts = 0
    n_tracks = 0
    for a in sorted(assignments, key=lambda a: (a["dataset"], a["event"])):
        path = args.assets / f"event_{a['dataset']}_{a['event']}.json"
        if not path.is_file():
            raise FileNotFoundError(path)
        event = json.loads(path.read_text(encoding="utf-8"))

        cascade_decays = [d for d in (event.get("decays") or []) if is_cascade_decay(d)]
        if len(cascade_decays) != 1:
            raise SystemExit(
                f"{path.name}: expected exactly one cascade decay, found {len(cascade_decays)}"
            )
        decay = cascade_decays[0]

        for t in decay:
            old_start = t["trajectory"][0]
            new_traj = propagate_helix_fixed(t["px"], t["py"], t["pz"], t["sign"], old_start)
            if new_traj[0] != old_start:
                raise SystemExit(f"{path.name}: start point drifted for particleId={t['particleId']}")
            t["trajectory"] = new_traj
            n_tracks += 1

        if not args.dry_run:
            path.write_text(json.dumps(event) + "\n", encoding="utf-8")
        n_hosts += 1
        print(f"{'[dry-run] ' if args.dry_run else ''}retrofit {path.name} (cascade {a['cascadeIndex']})")

    print(f"done: {n_hosts} host files, {n_tracks} tracks re-propagated"
          f"{' (dry-run, nothing written)' if args.dry_run else ''}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
