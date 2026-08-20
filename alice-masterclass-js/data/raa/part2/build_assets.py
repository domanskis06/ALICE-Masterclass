#!/usr/bin/env python3
"""Build the Spectrum Analysis (exercise 2) web assets from the Münster raw data.

Inputs (download into ./raw first, see README.md):
  raw/track_info.pkl          tracks as (trackPt, trackCent)
  raw/event_information.csv   events as (multiplicity, centrality)

Outputs (src/assets/exercises/raa/part2/):
  tracks_fine.json    per-centrality track counts on a 0.01 GeV/c grid
  events.json         per-event multiplicity + centrality
  pp_reference.json   pp dN/dpT per event on the 51-bin ALICE grid
  tracks_demo.json    a small sample of real tracks, for the tutorial only

The fine grid is lossless for this exercise: a track carries only (pt, centrality),
so counts per 0.01 GeV/c bin hold the same information as the track list while
being ~2000x smaller. Rebinning it onto the ALICE grid reproduces the reference
spectra, which the self-check at the end asserts.

Usage:
  .venv/bin/python build_assets.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
WEB = HERE.parents[2]
ASSETS = WEB / "src" / "assets" / "exercises" / "raa"
OUT = ASSETS / "part2"

PT_MIN = 0.15
PT_STEP = 0.01
PT_MAX = 15.0

# Centrality is rounded once, before anything is classified, so that the event
# count the app derives from events.json is the same number that ends up in
# tracks_fine.json. Two decimals would move ~90 events across a class edge.
CENT_DECIMALS = 4

MAX_BIN_DRIFT_SIGMA = 0.5

DEMO_CLASSES = ("0-5", "30-40", "70-80")
DEMO_TRACKS = 2000
DEMO_SEED = 20260809

# Centrality classes, lower edge inclusive / upper edge exclusive.
CLASSES: list[tuple[int, int]] = [
    (0, 5),
    (5, 10),
    (10, 20),
    (20, 30),
    (30, 40),
    (40, 50),
    (50, 60),
    (60, 70),
    (70, 80),
    (80, 90),
]

# Glauber <N_coll>. 0-5 .. 70-80 keep the values already shipped in metadata.json;
# 80-90 is new here and comes from the Münster notebook's dictNColl.
N_COLL: dict[str, float] = {
    "0-5": 1686.87,
    "5-10": 1319.89,
    "10-20": 923.26,
    "20-30": 558.68,
    "30-40": 321.2,
    "40-50": 171.67,
    "50-60": 85.13,
    "60-70": 38.51,
    "70-80": 15.78,
    "80-90": 6.32,
}

# The 51-bin ALICE pT binning (ALICE_RAA_Tools.get_bins, and metadata.json from 0.15).
ALICE_EDGES = [
    0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75,
    0.8, 0.85, 0.9, 0.95, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
    2.0, 2.2, 2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.5, 5.0, 5.5, 6.0,
    6.5, 7.0, 8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
]


def class_key(lo: int, hi: int) -> str:
    return f"{lo}-{hi}"


def fine_edges() -> np.ndarray:
    """Fine grid edges, rounded so that ALICE edges land exactly on a fine edge."""
    return np.round(np.arange(PT_MIN, PT_MAX + 1e-9, PT_STEP), 2)


def rebin(fine_counts: np.ndarray, fine: np.ndarray, coarse: np.ndarray) -> np.ndarray:
    idx = np.searchsorted(fine, coarse - 1e-9)
    return np.array(
        [fine_counts[idx[i] : idx[i + 1]].sum() for i in range(len(coarse) - 1)],
        dtype=np.int64,
    )


def load_events() -> pd.DataFrame:
    df = pd.read_csv(
        RAW / "event_information.csv", header=None, names=["mult", "cent"]
    )
    df["cent"] = df["cent"].round(CENT_DECIMALS)
    return df


def load_tracks() -> tuple[np.ndarray, np.ndarray]:
    """Load (pt, centrality) per track, caching as .npy because unpickling is slow."""
    pt_cache, cent_cache = RAW / "_pt.npy", RAW / "_cent.npy"
    if pt_cache.exists() and cent_cache.exists():
        pt, cent = np.load(pt_cache), np.load(cent_cache)
    else:
        try:
            df = pd.read_pickle(RAW / "track_info.pkl")
        except Exception:
            df = pd.read_pickle(RAW / "track_info.pkl", compression="bz2")
        pt = df["trackPt"].to_numpy(dtype=np.float64)
        cent = df["trackCent"].to_numpy(dtype=np.float64)
        np.save(pt_cache, pt)
        np.save(cent_cache, cent)
    return pt, np.round(cent, CENT_DECIMALS)


def build_events(df_events: pd.DataFrame) -> dict:
    return {
        "mult": [int(v) for v in df_events["mult"].to_numpy()],
        "cent": [round(float(v), CENT_DECIMALS) for v in df_events["cent"].to_numpy()],
    }


def build_tracks_fine(
    pt: np.ndarray, cent: np.ndarray, df_events: pd.DataFrame
) -> tuple[dict, dict[str, np.ndarray]]:
    fine = fine_edges()
    classes: dict[str, dict] = {}
    per_class_fine: dict[str, np.ndarray] = {}

    for lo, hi in CLASSES:
        key = class_key(lo, hi)
        pts = pt[(cent >= lo) & (cent < hi)]
        counts, _ = np.histogram(pts, fine)
        n_events = int(((df_events["cent"] >= lo) & (df_events["cent"] < hi)).sum())

        per_class_fine[key] = counts
        classes[key] = {
            "counts": [int(v) for v in counts],
            "nEvents": n_events,
            "nColl": N_COLL[key],
            "overflow": int((pts >= PT_MAX).sum()),
        }
        print(
            f"  {key:>6}  tory={int(counts.sum()):>8}  zdarzenia={n_events:>6}"
            f"  powyzej {PT_MAX:g} GeV={classes[key]['overflow']:>3}"
        )

    return (
        {
            "ptMin": PT_MIN,
            "ptStep": PT_STEP,
            "nFine": len(fine) - 1,
            "aliceBins": ALICE_EDGES,
            "classes": classes,
        },
        per_class_fine,
    )


def build_tracks_demo(pt: np.ndarray, cent: np.ndarray) -> dict:
    """A handful of real tracks per class, so the tutorial can fill a histogram live."""
    rng = np.random.default_rng(DEMO_SEED)
    classes: dict[str, list[float]] = {}
    for key in DEMO_CLASSES:
        lo, hi = (int(part) for part in key.split("-"))
        pts = pt[(cent >= lo) & (cent < hi)]
        picked = rng.choice(pts, size=min(DEMO_TRACKS, len(pts)), replace=False)
        classes[key] = [round(float(v), 3) for v in np.sort(picked)]
    return {"classes": classes}


def build_pp_reference() -> dict:
    """Re-express the shipped pp reference on the 51-bin ALICE grid.

    ASSETS/pp_reference.json carries more digits than raw/pp_reference.dat (it was
    extracted from PP_2760GeV_BaseLine.root), so we keep its values and only drop
    the empty bins below 0.15 GeV/c, where the Pb-Pb data has no tracks either.
    """
    src = json.loads((ASSETS / "pp_reference.json").read_text())
    bins = [float(b) for b in src["bins"]]
    values = [float(v) for v in src["values"]]

    start = bins.index(PT_MIN)
    trimmed_bins = bins[start:]
    trimmed_values = values[start:]

    if [round(b, 6) for b in trimmed_bins] != ALICE_EDGES:
        raise SystemExit("krawedzie referencji pp nie pasuja do siatki ALICE")
    if len(trimmed_values) != len(ALICE_EDGES) - 1:
        raise SystemExit("liczba wartosci referencji pp nie pasuje do siatki ALICE")
    if any(v <= 0 for v in trimmed_values):
        raise SystemExit("referencja pp ma bin niedodatni")

    return {"bins": ALICE_EDGES, "values": trimmed_values}


def verify(per_class_fine: dict[str, np.ndarray], events: dict) -> None:
    """Fail loudly if the generated assets disagree with the shipped reference."""
    fine = fine_edges()
    coarse = np.array(ALICE_EDGES)
    reference = json.loads((ASSETS / "pt_spectra.json").read_text())
    ref_spectra = reference["spectra"]
    n_alice = len(ALICE_EDGES) - 1

    problems: list[str] = []

    for key, counts in per_class_fine.items():
        got = rebin(counts, fine, coarse)
        ref = ref_spectra.get(key)
        if ref is None:
            print(f"  {key:>6}  brak w pt_spectra.json (nowa klasa), pomijam")
            continue
        # The legacy reference grid starts at 0 GeV/c with three empty bins.
        ref_counts = np.array(ref["counts"], dtype=np.int64)[-n_alice:]
        if got.sum() != ref_counts.sum():
            problems.append(f"{key}: suma {got.sum()} != referencyjna {ref_counts.sum()}")
            continue
        # ROOT filled the reference from float32 momenta, so a handful of tracks
        # sit on the other side of a bin edge here. Judge the difference against
        # the bin's own sqrt(N), which is the uncertainty the exercise draws.
        drift = np.abs(got - ref_counts)
        significance = drift / np.sqrt(np.maximum(ref_counts, 1))
        worst = float(significance.max())
        if worst > MAX_BIN_DRIFT_SIGMA:
            problems.append(
                f"{key}: bin rozni sie o {worst:.2f} sigma,"
                f" limit {MAX_BIN_DRIFT_SIGMA:.2f}"
            )
        else:
            print(
                f"  {key:>6}  suma {got.sum()} zgodna, maks. odchylenie binu"
                f" {int(drift.max())} torow ({worst:.3f} sigma)"
            )

    cent = np.array(events["cent"])
    if len(events["mult"]) != len(cent):
        problems.append("events.json: mult i cent maja rozne dlugosci")
    for lo, hi in CLASSES:
        key = class_key(lo, hi)
        from_events = int(((cent >= lo) & (cent < hi)).sum())
        ref = ref_spectra.get(key)
        if ref and from_events != ref["nEvents"]:
            problems.append(
                f"{key}: zdarzen z events.json {from_events} != {ref['nEvents']}"
            )

    if problems:
        print("\nWERYFIKACJA NIEUDANA:", file=sys.stderr)
        for problem in problems:
            print(f"  - {problem}", file=sys.stderr)
        raise SystemExit(1)
    print("\nWeryfikacja OK.")


def sync_metadata() -> None:
    """Keep metadata.json in step with the ten classes the assets now cover."""
    path = ASSETS / "metadata.json"
    meta = json.loads(path.read_text())
    keys = [class_key(lo, hi) for lo, hi in CLASSES]
    changed = meta.get("centralityBins") != keys or meta.get("nColl") != N_COLL
    if not changed:
        return
    meta["centralityBins"] = keys
    meta["nColl"] = dict(N_COLL)
    path.write_text(json.dumps(meta, indent=2) + "\n")
    print(f"  zaktualizowano {path.name} (10 klas centralnosci)")


def write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":")))
    print(f"  {path.relative_to(WEB)}  {path.stat().st_size / 1024:.0f} KB")


def main() -> None:
    missing = [
        name
        for name in ("track_info.pkl", "event_information.csv")
        if not (RAW / name).exists()
    ]
    if missing:
        raise SystemExit(
            f"Brak plikow wejsciowych w {RAW}: {', '.join(missing)}. Zobacz README.md."
        )

    OUT.mkdir(parents=True, exist_ok=True)

    print("Wczytuje zdarzenia...")
    df_events = load_events()
    print(f"  {len(df_events)} zdarzen")

    print("Wczytuje tory...")
    pt, cent = load_tracks()
    print(f"  {len(pt)} torow")

    print("Buduje drobna siatke...")
    tracks_fine, per_class_fine = build_tracks_fine(pt, cent, df_events)

    print("Buduje dane zdarzeniowe i probke do tutoriala...")
    events = build_events(df_events)
    demo = build_tracks_demo(pt, cent)

    print("Buduje referencje pp...")
    pp = build_pp_reference()

    print("Zapisuje...")
    write_json(OUT / "tracks_fine.json", tracks_fine)
    write_json(OUT / "events.json", events)
    write_json(OUT / "pp_reference.json", pp)
    write_json(OUT / "tracks_demo.json", demo)
    sync_metadata()

    print("Weryfikuje wzgledem pt_spectra.json...")
    verify(per_class_fine, events)


if __name__ == "__main__":
    main()
