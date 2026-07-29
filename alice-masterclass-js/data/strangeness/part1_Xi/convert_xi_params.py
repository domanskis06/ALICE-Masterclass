#!/usr/bin/env python3
"""
Convert FemtoUniverse Xi_params.txt (or normalized JSON) into VA cascade JSON.

Propagation mirrors convert_events.C / TEveTrackPropagator:
  uniform B = 0.5 T, step ~1.5 cm, stop at R = 600 cm.

Full pipeline docs (host merge, seed map, ROOT restore):
  data/strangeness/part1_Xi/README.md

Source data and this converter live under data/strangeness/part1_Xi/.
This script writes regenerable artefacts under part1_Xi/_out/ only.
Promote into production hosts with merge_cascades_into_hosts.py (cascades
are appended into existing event_{1-20}_{0-14}.json — no *_15/*_16 slots).

Usage:
  python3 data/strangeness/part1_Xi/convert_xi_params.py

  python3 data/strangeness/part1_Xi/convert_xi_params.py \\
    --input data/strangeness/part1_Xi/Xi_params.txt \\
    --cascades-out data/strangeness/part1_Xi/_out/xi_cascades.json \\
    --events-out data/strangeness/part1_Xi/_out/xi_events \\
    --dataset 21

  # After restoring clean hosts from ROOT (see README), merge:
  python3 data/strangeness/part1_Xi/merge_cascades_into_hosts.py \\
    --cascades data/strangeness/part1_Xi/_out/xi_cascades.json
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent

# AliRoot / convert_events.C style constants
B2C = 0.299792458e-2  # GeV/(c·T·cm)
B_FIELD_T = 0.5
STEP_CM = 1.5
MAX_R_CM = 600.0
MAX_Z_CM = 600.0
# Low-pT tracks can helix forever inside MaxR; cap path length like practical TEve runs.
MAX_PATH_CM = 500.0
MAX_POINTS = 2000

MASS_PION = 0.1395704
MASS_PROTON = 0.9382721

TRACK_TYPE_CASCADE = 2
TRACK_TYPE_CASCADE_BACHELOR = 3

ROLE_PX = re.compile(
    r"(pos daughter|neg daughter|bachelor):\s*"
    r"px\s*=\s*([-\d.eE+]+),\s*py\s*=\s*([-\d.eE+]+),\s*pz\s*=\s*([-\d.eE+]+)"
)
ROLE_XYZ = re.compile(
    r"(pos daughter|neg daughter|bachelor):\s*"
    r"x\s*=\s*([-\d.eE+]+),\s*y\s*=\s*([-\d.eE+]+),\s*z\s*=\s*([-\d.eE+]+)"
)
ROLE_SIGN = re.compile(
    r"(pos daughter|neg daughter|bachelor):\s*sign\s*=\s*([-\d.eE+]+)"
)

ROLE_KEY = {
    "pos daughter": "pos",
    "neg daughter": "neg",
    "bachelor": "bachelor",
}


def parse_xi_params_txt(path: Path) -> list[dict[str, Any]]:
    """Parse FemtoUniverse log dump into normalized cascade records."""
    text = path.read_text(encoding="utf-8", errors="replace").splitlines()
    cascades: list[dict[str, Any]] = []
    cur: dict[str, dict[str, float]] = {}

    def flush_if_complete() -> None:
        nonlocal cur
        needed = ("pos", "neg", "bachelor")
        if all(r in cur and "sign" in cur[r] and "px" in cur[r] and "x" in cur[r] for r in needed):
            cascades.append(
                {
                    "pos": dict(cur["pos"]),
                    "neg": dict(cur["neg"]),
                    "bachelor": dict(cur["bachelor"]),
                }
            )
            cur = {}

    for line in text:
        m = ROLE_PX.search(line)
        if m:
            role = ROLE_KEY[m.group(1)]
            cur.setdefault(role, {})
            cur[role].update(
                px=float(m.group(2)),
                py=float(m.group(3)),
                pz=float(m.group(4)),
            )
            continue
        m = ROLE_XYZ.search(line)
        if m:
            role = ROLE_KEY[m.group(1)]
            cur.setdefault(role, {})
            cur[role].update(
                x=float(m.group(2)),
                y=float(m.group(3)),
                z=float(m.group(4)),
            )
            continue
        m = ROLE_SIGN.search(line)
        if m:
            role = ROLE_KEY[m.group(1)]
            cur.setdefault(role, {})
            cur[role]["sign"] = float(m.group(2))
            flush_if_complete()

    return cascades


def load_normalized_json(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "cascades" in data:
        raw = data["cascades"]
    elif isinstance(data, list):
        raw = data
    else:
        raise ValueError(f"Unsupported JSON shape in {path}")
    out: list[dict[str, Any]] = []
    for item in raw:
        if "pos" in item and "neg" in item and "bachelor" in item:
            out.append(
                {
                    "pos": dict(item["pos"]),
                    "neg": dict(item["neg"]),
                    "bachelor": dict(item["bachelor"]),
                }
            )
        else:
            raise ValueError(f"Cascade missing pos/neg/bachelor: keys={list(item.keys())}")
    return out


def species_from_bachelor(sign: float) -> tuple[str, int]:
    if sign < 0:
        return "Xi", 3312
    if sign > 0:
        return "antiXi", -3312
    raise ValueError("bachelor sign must be non-zero")


def hypothesis(species: str) -> dict[str, tuple[int, float]]:
    """Return particleId and mass for pos / neg / bachelor."""
    if species == "Xi":
        return {
            "pos": (2212, MASS_PROTON),
            "neg": (-211, MASS_PION),
            "bachelor": (-211, MASS_PION),
        }
    if species == "antiXi":
        return {
            "pos": (211, MASS_PION),
            "neg": (-2212, MASS_PROTON),
            "bachelor": (211, MASS_PION),
        }
    raise ValueError(f"Unknown species {species}")


def midpoint(a: dict[str, float], b: dict[str, float]) -> list[float]:
    return [
        0.5 * (a["x"] + b["x"]),
        0.5 * (a["y"] + b["y"]),
        0.5 * (a["z"] + b["z"]),
    ]


def propagate_helix(
    px: float,
    py: float,
    pz: float,
    sign: float,
    start: list[float],
    *,
    b_field_t: float = B_FIELD_T,
    step_cm: float = STEP_CM,
    max_r_cm: float = MAX_R_CM,
    max_z_cm: float = MAX_Z_CM,
    max_path_cm: float = MAX_PATH_CM,
    max_points: int = MAX_POINTS,
) -> list[list[float]]:
    """
    Uniform-Bz helix via Euler steps on the unit direction.

    Convention: empirically matched to convert_events.C / TEveTrackPropagator,
    which produced the trusted legacy V0 (event_0_0.json) and cascade
    (event_0_3.json) trajectories: sign=+1 bends CCW, sign=-1 bends CW (in the
    stored x/y physics coordinates). Verified directly against event_0_3.json's
    proton (sign=+1) and pion (sign=-1) trajectory arrays — do not "simplify"
    this back to the naive textbook +(u × B) rotation without re-checking
    against that file, it reproduces the OPPOSITE (wrong) bending sense.
    """
    p = math.hypot(px, py, pz)
    if p < 1e-12:
        return [list(start)]

    q = float(sign)
    if abs(q) < 1e-12:
        raise ValueError("charge sign must be non-zero for helix propagation")

    ux, uy, uz = px / p, py / p, pz / p
    k = q * B2C * b_field_t / p

    x, y, z = float(start[0]), float(start[1]), float(start[2])
    pts: list[list[float]] = [[x, y, z]]
    path = 0.0

    for _ in range(max_points - 1):
        # u × e_z = (uy, -ux, 0), but flipped in sign relative to the naive
        # textbook formula to match convert_events.C's actual bending sense
        # (see docstring above).
        dux = -k * uy
        duy = k * ux
        ux2 = ux + dux * step_cm
        uy2 = uy + duy * step_cm
        uz2 = uz
        n = math.hypot(ux2, uy2, uz2)
        if n < 1e-15:
            break
        ux, uy, uz = ux2 / n, uy2 / n, uz2 / n
        x += ux * step_cm
        y += uy * step_cm
        z += uz * step_cm
        path += step_cm
        pts.append([x, y, z])
        if math.hypot(x, y) > max_r_cm or abs(z) > max_z_cm or path >= max_path_cm:
            break

    return pts


def track_energy(px: float, py: float, pz: float, mass: float) -> float:
    return math.sqrt(mass * mass + px * px + py * py + pz * pz)


def build_track(
    leg: dict[str, float],
    *,
    particle_id: int,
    mass: float,
    track_type: int,
    decay_id: int,
    start: list[float],
) -> dict[str, Any]:
    px, py, pz = float(leg["px"]), float(leg["py"]), float(leg["pz"])
    sign = int(leg["sign"])
    return {
        "E": track_energy(px, py, pz, mass),
        "decayId": decay_id,
        "mass": mass,
        "particleId": particle_id,
        "px": px,
        "py": py,
        "pz": pz,
        "sign": sign,
        "type": track_type,
        "trajectory": propagate_helix(px, py, pz, sign, start),
    }


def invariant_mass(tracks: list[dict[str, Any]]) -> float:
    e = sum(t["E"] for t in tracks)
    px = sum(t["px"] for t in tracks)
    py = sum(t["py"] for t in tracks)
    pz = sum(t["pz"] for t in tracks)
    m2 = e * e - px * px - py * py - pz * pz
    return math.sqrt(m2) if m2 > 0 else 0.0


def normalize_cascade(raw: dict[str, Any], index: int) -> dict[str, Any]:
    bach_sign = float(raw["bachelor"]["sign"])
    species, pdg_parent = species_from_bachelor(bach_sign)
    hypo = hypothesis(species)

    pos = raw["pos"]
    neg = raw["neg"]
    bachelor = raw["bachelor"]

    if int(pos["sign"]) != 1:
        raise ValueError(f"cascade {index}: pos.sign must be +1, got {pos['sign']}")
    if int(neg["sign"]) != -1:
        raise ValueError(f"cascade {index}: neg.sign must be -1, got {neg['sign']}")

    vertex_v0 = midpoint(pos, neg)
    vertex_cascade = [float(bachelor["x"]), float(bachelor["y"]), float(bachelor["z"])]

    return {
        "index": index,
        "species": species,
        "pdg_parent": pdg_parent,
        "vertex_v0": vertex_v0,
        "vertex_cascade": vertex_cascade,
        "pos": pos,
        "neg": neg,
        "bachelor": bachelor,
        "hypo": hypo,
    }


def build_decay_tracks(norm: dict[str, Any]) -> list[dict[str, Any]]:
    decay_id = int(norm["index"])
    hypo = norm["hypo"]
    pid_neg, mass_neg = hypo["neg"]
    pid_pos, mass_pos = hypo["pos"]
    pid_b, mass_b = hypo["bachelor"]

    neg = build_track(
        norm["neg"],
        particle_id=pid_neg,
        mass=mass_neg,
        track_type=TRACK_TYPE_CASCADE,
        decay_id=decay_id,
        start=norm["vertex_v0"],
    )
    pos = build_track(
        norm["pos"],
        particle_id=pid_pos,
        mass=mass_pos,
        track_type=TRACK_TYPE_CASCADE,
        decay_id=decay_id,
        start=norm["vertex_v0"],
    )
    bach = build_track(
        norm["bachelor"],
        particle_id=pid_b,
        mass=mass_b,
        track_type=TRACK_TYPE_CASCADE_BACHELOR,
        decay_id=decay_id,
        start=norm["vertex_cascade"],
    )
    # VA / convert_events.C order: [neg, pos, bachelor]
    return [neg, pos, bach]


def cascade_record(norm: dict[str, Any], decay: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "index": norm["index"],
        "species": norm["species"],
        "pdg_parent": norm["pdg_parent"],
        "vertex_v0": norm["vertex_v0"],
        "vertex_cascade": norm["vertex_cascade"],
        "invariant_mass": invariant_mass(decay),
        "decay": decay,
    }


def event_from_decay(decay: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "tracks": [],
        "decays": [decay],
        "clusters": [],
    }


def validate_cascades(cascades: list[dict[str, Any]]) -> None:
    if len(cascades) == 0:
        raise SystemExit("No cascades produced")
    n_xi = sum(1 for c in cascades if c["species"] == "Xi")
    n_antixi = sum(1 for c in cascades if c["species"] == "antiXi")
    print(f"cascades: {len(cascades)} (Xi={n_xi}, antiXi={n_antixi})")

    for c in cascades:
        decay = c["decay"]
        if len(decay) != 3:
            raise SystemExit(f"cascade {c['index']}: expected 3 tracks, got {len(decay)}")
        types = [t["type"] for t in decay]
        if types != [TRACK_TYPE_CASCADE, TRACK_TYPE_CASCADE, TRACK_TYPE_CASCADE_BACHELOR]:
            raise SystemExit(f"cascade {c['index']}: bad types {types}")
        if decay[0]["trajectory"][0] != decay[1]["trajectory"][0]:
            raise SystemExit(f"cascade {c['index']}: V0 daughter starts differ")
        for t in decay:
            if len(t["trajectory"]) < 2:
                raise SystemExit(f"cascade {c['index']}: trajectory too short")
        m = c["invariant_mass"]
        if not (1.20 <= m <= 1.50):
            print(f"WARNING cascade {c['index']}: invariant mass {m:.4f} outside 1.20–1.50", file=sys.stderr)

    masses = [c["invariant_mass"] for c in cascades]
    print(
        f"invariant mass: min={min(masses):.4f} max={max(masses):.4f} "
        f"mean={sum(masses)/len(masses):.4f}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        type=Path,
        default=_HERE / "Xi_params.txt",
        help="Xi_params.txt or normalized cascades JSON",
    )
    parser.add_argument(
        "--cascades-out",
        type=Path,
        default=_HERE / "_out" / "xi_cascades.json",
        help="Intermediate cascades JSON (regenerable)",
    )
    parser.add_argument(
        "--events-out",
        type=Path,
        default=_HERE / "_out" / "xi_events",
        help="Directory for event_<dataset>_<id>.json files (regenerable)",
    )
    parser.add_argument(
        "--dataset",
        type=int,
        default=21,
        help="Dataset id used in event_<dataset>_<id>.json names",
    )
    parser.add_argument(
        "--normalized-out",
        type=Path,
        default=None,
        help="Optional path to write normalized pre-propagation JSON",
    )
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"Input not found: {args.input}", file=sys.stderr)
        return 1

    suffix = args.input.suffix.lower()
    if suffix == ".json":
        raw_list = load_normalized_json(args.input)
    else:
        raw_list = parse_xi_params_txt(args.input)

    norms = [normalize_cascade(raw, i) for i, raw in enumerate(raw_list)]

    if args.normalized_out is not None:
        payload = {
            "source": str(args.input),
            "count": len(norms),
            "cascades": [
                {
                    "index": n["index"],
                    "species": n["species"],
                    "pdg_parent": n["pdg_parent"],
                    "vertex_v0": n["vertex_v0"],
                    "vertex_cascade": n["vertex_cascade"],
                    "pos": n["pos"],
                    "neg": n["neg"],
                    "bachelor": n["bachelor"],
                }
                for n in norms
            ],
        }
        args.normalized_out.parent.mkdir(parents=True, exist_ok=True)
        args.normalized_out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
        print(f"wrote normalized: {args.normalized_out}")

    cascade_records: list[dict[str, Any]] = []
    for norm in norms:
        decay = build_decay_tracks(norm)
        cascade_records.append(cascade_record(norm, decay))

    validate_cascades(cascade_records)

    cascades_payload = {
        "source": str(args.input),
        "b_field_t": B_FIELD_T,
        "step_cm": STEP_CM,
        "max_r_cm": MAX_R_CM,
        "max_z_cm": MAX_Z_CM,
        "max_path_cm": MAX_PATH_CM,
        "count": len(cascade_records),
        "n_xi": sum(1 for c in cascade_records if c["species"] == "Xi"),
        "n_antixi": sum(1 for c in cascade_records if c["species"] == "antiXi"),
        "cascades": cascade_records,
    }
    args.cascades_out.parent.mkdir(parents=True, exist_ok=True)
    args.cascades_out.write_text(json.dumps(cascades_payload, indent=2) + "\n", encoding="utf-8")
    print(f"wrote cascades: {args.cascades_out}")

    args.events_out.mkdir(parents=True, exist_ok=True)
    for c in cascade_records:
        event = event_from_decay(c["decay"])
        out_path = args.events_out / f"event_{args.dataset}_{c['index']}.json"
        out_path.write_text(json.dumps(event) + "\n", encoding="utf-8")
    print(f"wrote {len(cascade_records)} events → {args.events_out}/event_{args.dataset}_*.json")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
