"""
Cross-check of the web engine's normalisation chain against the assets.

Reproduces, in a few lines of Python, exactly what `raa-ops.ts` does for one
centrality class, and prints R_AA at the two momenta the Masterclass collects.
Run it after regenerating the assets: if the printed values stop looking like
the published measurement, the chain — not the data — is what changed.

    python3 data/raa/part2/check_chain.py 0-5
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
WEB = HERE.parents[2]
ASSETS = WEB / "src" / "assets" / "exercises" / "raa" / "part2"

REPORT_MOMENTA = (5.5, 10.0)


def load(name: str) -> dict:
    with open(ASSETS / name, encoding="utf-8") as handle:
        return json.load(handle)


def raa(centrality: str) -> list[tuple[float, float, float]]:
    tracks = load("tracks_fine.json")
    pp = load("pp_reference.json")
    entry = tracks["classes"][centrality]
    edges = pp["bins"]
    fine_min, fine_step = tracks["ptMin"], tracks["ptStep"]

    out = []
    for i in range(len(edges) - 1):
        low, high = edges[i], edges[i + 1]
        a = round((low - fine_min) / fine_step)
        b = round((high - fine_min) / fine_step)
        counts = sum(entry["counts"][a:b])
        if counts == 0 or pp["values"][i] <= 0:
            continue
        yield_per_gev = counts / (high - low) / entry["nEvents"] / entry["nColl"]
        out.append((low, high, yield_per_gev / pp["values"][i]))
    return out


def main() -> None:
    centrality = sys.argv[1] if len(sys.argv) > 1 else "0-5"
    values = raa(centrality)
    print(f"centrality {centrality}: {len(values)} filled bins")
    for low, high, value in values:
        for pt in REPORT_MOMENTA:
            if low <= pt < high:
                print(f"  R_AA({pt} GeV/c) = {value:.3f}   [{low}, {high}) GeV/c")
    lowest = values[0]
    print(f"  R_AA(lowest bin {lowest[0]}–{lowest[1]}) = {lowest[2]:.3f}")


if __name__ == "__main__":
    main()
