#!/usr/bin/env python3
"""
Merge Ξ / Ξ̅ cascade decays into existing VA host events (plan A).

Instead of dedicated empty event_*_15/16.json slots, each cascade is appended
to a host event_{dataset}_{0..14}.json. Workshop hosts that already contain
V0s demote those V0 daughters into tracks[] (type=STANDARD, decayId=-1) so
only the cascade remains interactive in decays[].

Exceptions:
  - dataset 6: four empty-decay hosts (6, 7, 10, 14) each get one cascade
  - dataset 20 / event 1 (Pb–Pb): keep the existing V0 and append the cascade

Usage (from alice-masterclass-js/):

  # Build map (if missing) + merge using current legacy *_15/*_16 assets:
  python3 data/strangeness/part1_Xi/merge_cascades_into_hosts.py

  # Regenerate after convert_xi_params.py (hosts must be clean / ROOT-restored):
  python3 data/strangeness/part1_Xi/convert_xi_params.py
  python3 data/strangeness/part1_Xi/merge_cascades_into_hosts.py \\
    --cascades data/strangeness/part1_Xi/_out/xi_cascades.json

See README.md in this folder.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import random
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
_JS_ROOT = _HERE.parents[2]
_DEFAULT_ASSETS = _JS_ROOT / "src" / "assets" / "exercises" / "strangeness" / "part1"
_DEFAULT_MAP = _HERE / "cascade_host_map.json"

SEED = 20260729
DS6_HOSTS = (6, 7, 10, 14)
TRACK_TYPE_STANDARD = 0
TRACK_TYPE_V0 = 1
TRACK_TYPE_CASCADE = 2
TRACK_TYPE_CASCADE_BACHELOR = 3

# Mirror EventDisplayComponent.momentaMatchDecayToBackground
DECAY_BG_MOMENTUM_COS_MIN = 0.985
DECAY_BG_MOMENTUM_ABS_DP = 0.08


def momenta_match(decay: dict[str, Any], background: dict[str, Any]) -> bool:
    pa = math.hypot(decay["px"], decay["py"], decay["pz"])
    pb = math.hypot(background["px"], background["py"], background["pz"])
    if pa < 1e-9 or pb < 1e-9:
        return False
    cos = (
        decay["px"] * background["px"]
        + decay["py"] * background["py"]
        + decay["pz"] * background["pz"]
    ) / (pa * pb)
    return cos >= DECAY_BG_MOMENTUM_COS_MIN and abs(pa - pb) <= DECAY_BG_MOMENTUM_ABS_DP


def has_matching_background(tracks: list[dict[str, Any]], daughter: dict[str, Any]) -> bool:
    return any(momenta_match(daughter, t) for t in tracks)


def is_v0_decay(particle_list: list[dict[str, Any]]) -> bool:
    return len(particle_list) == 2 and all(t.get("type") == TRACK_TYPE_V0 for t in particle_list)


def is_cascade_decay(particle_list: list[dict[str, Any]]) -> bool:
    if len(particle_list) != 3:
        return False
    types = [t.get("type") for t in particle_list]
    return types == [TRACK_TYPE_CASCADE, TRACK_TYPE_CASCADE, TRACK_TYPE_CASCADE_BACHELOR]


def next_decay_id(event: dict[str, Any]) -> int:
    ids: list[int] = []
    for particle_list in event.get("decays") or []:
        for t in particle_list:
            if "decayId" in t and t["decayId"] is not None and t["decayId"] >= 0:
                ids.append(int(t["decayId"]))
    return (max(ids) + 1) if ids else 0


def demote_v0s(event: dict[str, Any]) -> None:
    """Move V0 daughters into tracks[] as STANDARD; drop those decays."""
    kept: list[list[dict[str, Any]]] = []
    tracks = event.setdefault("tracks", [])
    for particle_list in event.get("decays") or []:
        if not is_v0_decay(particle_list):
            kept.append(particle_list)
            continue
        for daughter in particle_list:
            if has_matching_background(tracks, daughter):
                continue
            demoted = copy.deepcopy(daughter)
            demoted["type"] = TRACK_TYPE_STANDARD
            demoted["decayId"] = -1
            tracks.append(demoted)
    event["decays"] = kept


def append_cascade(event: dict[str, Any], cascade_decay: list[dict[str, Any]]) -> None:
    decay_id = next_decay_id(event)
    decay = copy.deepcopy(cascade_decay)
    for t in decay:
        t["decayId"] = decay_id
    event.setdefault("decays", []).append(decay)


def build_assignments(seed: int = SEED) -> dict[str, Any]:
    rng = random.Random(seed)
    pool = list(range(32))
    rng.shuffle(pool)

    assignments: list[dict[str, int]] = []
    used: dict[int, set[int]] = defaultdict(set)

    for host, cascade_index in zip(DS6_HOSTS, pool[:4]):
        assignments.append({"cascadeIndex": cascade_index, "dataset": 6, "event": host})
        used[6].add(host)

    rest = pool[4:]
    targets = [d for d in range(1, 21) if d != 6]
    assert len(rest) == 28 and len(targets) == 19

    def alloc_host(dataset: int) -> int:
        if dataset == 20:
            used[20].add(1)
            return 1
        candidates = [e for e in range(15) if e not in used[dataset]]
        if not candidates:
            raise RuntimeError(f"no free host slots in dataset {dataset}")
        event_id = rng.choice(candidates)
        used[dataset].add(event_id)
        return event_id

    for cascade_index, dataset in zip(rest[:19], targets):
        assignments.append(
            {
                "cascadeIndex": cascade_index,
                "dataset": dataset,
                "event": alloc_host(dataset),
            }
        )

    # ds20 keeps exactly one cascade (event 1); doubles only among workshop targets.
    double_pool = [d for d in targets if d != 20]
    double_datasets = rng.sample(double_pool, 9)
    for cascade_index, dataset in zip(rest[19:], double_datasets):
        assignments.append(
            {
                "cascadeIndex": cascade_index,
                "dataset": dataset,
                "event": alloc_host(dataset),
            }
        )

    assignments.sort(key=lambda a: (a["dataset"], a["event"], a["cascadeIndex"]))
    return {
        "seed": seed,
        "notes": (
            "Deterministic host map for merging 32 Ξ/Ξ̅ cascades into VA assets. "
            "Dataset 6 uses empty-decay hosts 6/7/10/14; dataset 20 uses event 1 "
            "and keeps its V0; other hosts demote existing V0s (plan A)."
        ),
        "assignments": assignments,
    }


def load_cascades_from_legacy_assets(assets: Path) -> list[list[dict[str, Any]]]:
    """Legacy promote order: indices 0..19 → *_15, 20..31 → *_16."""
    decays: list[list[dict[str, Any]]] = []
    for i in range(32):
        if i < 20:
            path = assets / f"event_{i + 1}_15.json"
        else:
            path = assets / f"event_{i - 19}_16.json"
        if not path.is_file():
            raise FileNotFoundError(f"missing legacy cascade file: {path}")
        event = json.loads(path.read_text(encoding="utf-8"))
        if not event.get("decays"):
            raise SystemExit(f"{path.name}: expected one cascade decay")
        decays.append(event["decays"][0])
    return decays


def load_cascades_from_json(path: Path) -> list[list[dict[str, Any]]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(payload, dict) and "cascades" in payload:
        records = payload["cascades"]
    elif isinstance(payload, list):
        records = payload
    else:
        raise SystemExit(f"unrecognised cascades JSON: {path}")
    if len(records) != 32:
        raise SystemExit(f"expected 32 cascades, got {len(records)} in {path}")
    by_index: dict[int, list[dict[str, Any]]] = {}
    for rec in records:
        idx = int(rec["index"])
        decay = rec["decay"] if "decay" in rec else rec
        by_index[idx] = decay
    return [by_index[i] for i in range(32)]


def load_or_build_map(map_path: Path, seed: int, rebuild: bool) -> dict[str, Any]:
    if map_path.is_file() and not rebuild:
        data = json.loads(map_path.read_text(encoding="utf-8"))
        if len(data.get("assignments", [])) != 32:
            raise SystemExit(f"{map_path}: expected 32 assignments")
        return data
    data = build_assignments(seed)
    map_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    print(f"wrote map: {map_path}")
    return data


def should_demote(dataset: int, event_id: int) -> bool:
    # Pb–Pb full event keeps its single V0 alongside the cascade.
    return not (dataset == 20 and event_id == 1)


def apply_merges(
    assets: Path,
    cascades: list[list[dict[str, Any]]],
    assignments: list[dict[str, int]],
) -> None:
    # Group by host so a host with two cascades (should not happen) is safe;
    # plan guarantees one cascade per host file.
    by_host: dict[tuple[int, int], list[int]] = defaultdict(list)
    for a in assignments:
        by_host[(a["dataset"], a["event"])].append(a["cascadeIndex"])

    for (dataset, event_id), cascade_indices in sorted(by_host.items()):
        if len(cascade_indices) != 1:
            raise SystemExit(
                f"host event_{dataset}_{event_id} has {len(cascade_indices)} cascades; "
                "expected exactly one"
            )
        path = assets / f"event_{dataset}_{event_id}.json"
        if not path.is_file():
            raise FileNotFoundError(path)
        event = json.loads(path.read_text(encoding="utf-8"))

        # Refuse double-merge if a cascade is already present (except we allow
        # re-run only on clean hosts).
        if any(is_cascade_decay(d) for d in event.get("decays") or []):
            raise SystemExit(
                f"{path.name} already contains a cascade — restore hosts from ROOT "
                "via convert_events.C before re-merging"
            )

        if should_demote(dataset, event_id):
            demote_v0s(event)

        append_cascade(event, cascades[cascade_indices[0]])
        path.write_text(json.dumps(event) + "\n", encoding="utf-8")
        print(f"merged cascade {cascade_indices[0]} → {path.name}")


def delete_legacy_slots(assets: Path) -> int:
    removed = 0
    for path in sorted(assets.glob("event_*_15.json")) + sorted(assets.glob("event_*_16.json")):
        path.unlink()
        removed += 1
        print(f"removed {path.name}")
    return removed


def validate_assets(assets: Path, assignments: list[dict[str, int]]) -> None:
    # Count cascade decays in workshop+full assets.
    cascade_hosts: list[tuple[int, int]] = []
    for ds in range(1, 21):
        for ev in range(15):
            path = assets / f"event_{ds}_{ev}.json"
            if not path.is_file():
                continue
            event = json.loads(path.read_text(encoding="utf-8"))
            n_cas = sum(1 for d in event.get("decays") or [] if is_cascade_decay(d))
            if n_cas:
                cascade_hosts.append((ds, ev))
                if n_cas != 1:
                    raise SystemExit(f"{path.name}: expected at most one cascade, got {n_cas}")

    if len(cascade_hosts) != 32:
        raise SystemExit(f"expected 32 host files with a cascade, found {len(cascade_hosts)}")

    expected = {(a["dataset"], a["event"]) for a in assignments}
    if set(cascade_hosts) != expected:
        raise SystemExit(
            f"cascade host set mismatch:\n  extra={set(cascade_hosts) - expected}\n"
            f"  missing={expected - set(cascade_hosts)}"
        )

    # Dataset 6 fixed hosts.
    ds6 = sorted(ev for ds, ev in cascade_hosts if ds == 6)
    if ds6 != list(DS6_HOSTS):
        raise SystemExit(f"dataset 6 hosts expected {list(DS6_HOSTS)}, got {ds6}")

    # Pb–Pb: V0 + cascade.
    pb = json.loads((assets / "event_20_1.json").read_text(encoding="utf-8"))
    types = []
    for d in pb.get("decays") or []:
        if is_v0_decay(d):
            types.append("V0")
        elif is_cascade_decay(d):
            types.append("CASCADE")
        else:
            types.append("OTHER")
    if types != ["V0", "CASCADE"]:
        raise SystemExit(f"event_20_1 decays expected [V0, CASCADE], got {types}")

    # No leftover 15/16.
    leftovers = list(assets.glob("event_*_15.json")) + list(assets.glob("event_*_16.json"))
    if leftovers:
        raise SystemExit(f"legacy slots still present: {[p.name for p in leftovers]}")

    # Demoted hosts (non-PbPb) should have only the cascade in decays.
    for ds, ev in cascade_hosts:
        if ds == 20 and ev == 1:
            continue
        event = json.loads((assets / f"event_{ds}_{ev}.json").read_text(encoding="utf-8"))
        decays = event.get("decays") or []
        if len(decays) != 1 or not is_cascade_decay(decays[0]):
            raise SystemExit(
                f"event_{ds}_{ev}.json: after demote expected single cascade decay, "
                f"got {len(decays)} decays"
            )

    print("validation OK: 32 merged cascades, ds6 hosts, event_20_1 V0+cascade, no *_15/*_16")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assets", type=Path, default=_DEFAULT_ASSETS)
    parser.add_argument("--map", type=Path, default=_DEFAULT_MAP, dest="map_path")
    parser.add_argument("--seed", type=int, default=SEED)
    parser.add_argument(
        "--rebuild-map",
        action="store_true",
        help="Ignore existing cascade_host_map.json and rebuild from --seed",
    )
    parser.add_argument(
        "--cascades",
        type=Path,
        default=None,
        help="xi_cascades.json from convert_xi_params.py (preferred for regenerate)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Build/load map and validate cascade sources only; do not write assets",
    )
    parser.add_argument(
        "--skip-delete",
        action="store_true",
        help="Do not delete legacy *_15/*_16 after merge",
    )
    args = parser.parse_args()

    host_map = load_or_build_map(args.map_path, args.seed, args.rebuild_map)
    assignments = host_map["assignments"]

    # Summarise distribution.
    per_ds: dict[int, int] = defaultdict(int)
    for a in assignments:
        per_ds[a["dataset"]] += 1
    doubles = sorted(ds for ds, n in per_ds.items() if n == 2)
    print(f"seed={host_map['seed']} doubles={doubles} ds6=4 ds20=1")

    if args.dry_run:
        print("dry-run: skipping cascade load / asset writes")
        return 0

    if args.cascades:
        cascades = load_cascades_from_json(args.cascades)
        print(f"loaded 32 cascades from {args.cascades}")
    else:
        legacy = list(args.assets.glob("event_*_15.json")) + list(
            args.assets.glob("event_*_16.json")
        )
        if not legacy:
            raise SystemExit(
                "no --cascades and no legacy *_15/*_16 under assets; "
                "run convert_xi_params.py then pass "
                "--cascades data/strangeness/part1_Xi/_out/xi_cascades.json"
            )
        cascades = load_cascades_from_legacy_assets(args.assets)
        print(f"loaded 32 cascades from legacy *_15/*_16 under {args.assets}")

    apply_merges(args.assets, cascades, assignments)
    if not args.skip_delete:
        delete_legacy_slots(args.assets)
    validate_assets(args.assets, assignments)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
