#!/usr/bin/env python3
"""Digitize Fig. 15 top panels (unlike + like) into assets/exercises/jpsi/minv/*.json.

Requires: Pillow. Run from this directory after:
  pdftoppm -png -r 300 pb-pb-jpsi.pdf fig15
  cp fig15-1.png fig15-300dpi.png
"""
from __future__ import annotations

import csv
import json
import math
import os
from collections import defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]  # alice-masterclass-js
OUT_DIR = ROOT / "src" / "assets" / "exercises" / "jpsi" / "minv"
IMG = Path(__file__).resolve().parent / "fig15-300dpi.png"

PANELS = {
    "50_70": dict(
        x_search=(420, 1280),
        y_max_entries=3000,
        nEvents=36480000,
        nTotal=11082,
        nTotalErr=105,
        nBkg=9366,
        nBkgErr=96,
        nJpsi=1478,
        nJpsiErr=153,
        sOverB=0.154,
        significance=10.3,
        aGaussHint=[1500, 3.1, 0.05],
    ),
    "70_90": dict(
        x_search=(1320, 2180),
        y_max_entries=250,
        nEvents=36380000,
        nTotal=785,
        nTotalErr=28,
        nBkg=448,
        nBkgErr=21,
        nJpsi=310,
        nJpsiErr=37,
        sOverB=0.654,
        significance=8.7,
        aGaussHint=[320, 3.1, 0.05],
    ),
}

BIN_WIDTH = 0.04
X_MASS_MIN, X_MASS_MAX = 2.0, 3.6
N_BINS = int(round((3.72 - 2.0) / BIN_WIDTH))
CENTERS = [2.0 + (i + 0.5) * BIN_WIDTH for i in range(N_BINS)]
WIN = (2.9, 3.2)


def is_red(r, g, b):
    return r > 150 and g < 120 and b < 130 and r >= g + 35 and r >= b + 35


def is_blue(r, g, b):
    return b > 125 and r < 135 and g < 175 and b > r + 25


def is_dark(r, g, b):
    return r + g + b < 200


def main() -> None:
    im = Image.open(IMG).convert("RGB")
    px = im.load()

    def find_horizontal_axis(x0, x1, y_lo, y_hi):
        best_y, best_score = None, 0
        for y in range(y_lo, y_hi):
            score = sum(1 for x in range(x0, x1, 2) if is_dark(*px[x, y]))
            if score > best_score:
                best_score, best_y = score, y
        return best_y

    def find_vertical_axis(y0, y1, x_lo, x_hi, from_left=True):
        best_x, best_score = None, 0
        xs = range(x_lo, x_hi) if from_left else range(x_hi - 1, x_lo - 1, -1)
        for x in xs:
            score = sum(1 for y in range(y0, y1, 2) if is_dark(*px[x, y]))
            if score > best_score:
                best_score, best_x = score, x
        return best_x

    def find_top_frame(y0, y1, x0, x1):
        best_y, best_score = None, 0
        for y in range(y0, y1):
            score = sum(1 for x in range(x0, x1, 2) if is_dark(*px[x, y]))
            if score > best_score:
                best_score, best_y = score, y
        return best_y

    def sum_win(arr, lo=WIN[0], hi=WIN[1]):
        return sum(arr[i] for i, c in enumerate(CENTERS) if lo <= c < hi)

    def fill_gaps(arr):
        a = list(arr)
        i = 0
        while i < len(a):
            if a[i] is not None:
                i += 1
                continue
            j = i
            while j < len(a) and a[j] is None:
                j += 1
            gap = j - i
            left = a[i - 1] if i > 0 else None
            right = a[j] if j < len(a) else None
            if gap <= 2 and left is not None and right is not None:
                for k in range(i, j):
                    t = (k - i + 1) / (gap + 1)
                    a[k] = left * (1 - t) + right * t
            else:
                for k in range(i, j):
                    a[k] = 0.0
            i = j
        return [max(0.0, float(v)) for v in a]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    histograms = []

    for tag, cfg in PANELS.items():
        x_lo, x_hi = cfg["x_search"]
        y_bot = find_horizontal_axis(x_lo + 40, x_hi - 40, 780, 980)
        y_top = find_top_frame(360, 520, x_lo + 40, x_hi - 40)
        x_left = find_vertical_axis(y_top + 10, y_bot - 10, x_lo, x_lo + 120, True)
        x_right = find_vertical_axis(y_top + 10, y_bot - 10, x_hi - 120, x_hi, False)

        def mass_to_x(m, _xl=x_left, _xr=x_right):
            return _xl + (m - X_MASS_MIN) / (X_MASS_MAX - X_MASS_MIN) * (_xr - _xl)

        def y_to_entries(y, _yt=y_top, _yb=y_bot, _ymax=cfg["y_max_entries"]):
            return _ymax * (_yb - y) / (_yb - _yt)

        half = abs(mass_to_x(2.0 + BIN_WIDTH) - mass_to_x(2.0)) * 0.4
        unlike, like = [], []
        for c in CENTERS:
            if c < X_MASS_MIN - 1e-9 or c > X_MASS_MAX + 0.02:
                unlike.append(None)
                like.append(None)
                continue
            xc = mass_to_x(c)
            x0, x1 = int(xc - half), int(xc + half)
            red_ys, blue_ys = [], []
            for x in range(max(x_left + 2, x0), min(x_right - 2, x1) + 1):
                for y in range(y_top + 3, y_bot - 3):
                    r, g, b = px[x, y]
                    if is_red(r, g, b):
                        red_ys.append(y)
                    elif is_blue(r, g, b):
                        blue_ys.append(y)

            def peak_y(ys, bin_px=3):
                if len(ys) < 3:
                    return None
                hist = defaultdict(int)
                for y in ys:
                    hist[y // bin_px] += 1
                k = max(hist, key=hist.get)
                band = sorted(y for y in ys if y // bin_px == k)
                return band[len(band) // 2]

            ry, by = peak_y(red_ys), peak_y(blue_ys)
            unlike.append(y_to_entries(ry) if ry is not None else None)
            like.append(y_to_entries(by) if by is not None else None)

        u, l = fill_gaps(unlike), fill_gaps(like)
        su, sl = sum_win(u), sum_win(l)
        u = [v * (cfg["nTotal"] / su) for v in u]
        l = [v * (cfg["nBkg"] / sl) for v in l]
        u = [round(v, 3) for v in u]
        l = [round(v, 3) for v in l]
        uerr = [round(math.sqrt(max(v, 0)), 3) for v in u]
        lerr = [round(math.sqrt(max(v, 0)), 3) for v in l]

        obj = {
            "schemaVersion": 1,
            "datasetId": "pbPb",
            "centrality": tag,
            "centralityLabel": tag.replace("_", "-") + "%",
            "source": {
                "note": "Inclusive J/psi analysis notes from 2018 data, Figure 15",
                "figure": 15,
                "localPdf": "data/jpsi/minv_digitize/pb-pb-jpsi.pdf",
                "url": "https://alice-notes.web.cern.ch/system/files/notes/analysis/953/2024-01-28-Inclusive_Jpsi_analysis_notes__from_2018_PbPb.pdf",
                "digitizedWith": "Python per-bin strip digitization + window-scale calibration",
                "renderDpi": 300,
                "binWidthGeV": BIN_WIDTH,
                "nEvents": cfg["nEvents"],
                "calibration": (
                    "Shape from Fig.15 top-panel markers; absolute scale set so sums in "
                    "[2.9,3.2) match published N_total / N_bkg"
                ),
            },
            "xmin": 2.0,
            "xmax": round(2.0 + N_BINS * BIN_WIDTH, 4),
            "bins": N_BINS,
            "binCenters": [round(c, 4) for c in CENTERS],
            "unlike": u,
            "like": l,
            "unlikeErr": uerr,
            "likeErr": lerr,
            "published": {
                "nTotal": cfg["nTotal"],
                "nTotalErr": cfg["nTotalErr"],
                "nBkg": cfg["nBkg"],
                "nBkgErr": cfg["nBkgErr"],
                "nJpsi": cfg["nJpsi"],
                "nJpsiErr": cfg["nJpsiErr"],
                "sOverB": cfg["sOverB"],
                "significance": cfg["significance"],
                "significanceNote": "S/sqrt(S+2B) as on figure (like-sign method)",
            },
            "fitHint": {
                "signalWindow": [2.9, 3.2],
                "peakMean": 3.1,
                "peakSigma": 0.05,
                "aGaussHint": cfg["aGaussHint"],
            },
        }
        out = OUT_DIR / f"pbPb_{tag}.json"
        out.write_text(json.dumps(obj, indent=2) + "\n")
        print("wrote", out, "window residual", round(sum_win(u) - sum_win(l), 1))

        with open(Path(__file__).parent / f"{tag}_unlike_like.csv", "w", newline="") as f:
            wri = csv.writer(f)
            wri.writerow(["binCenter", "unlike", "like"])
            for c, uu, ll in zip(CENTERS, u, l):
                wri.writerow([f"{c:.4f}", f"{uu:.3f}", f"{ll:.3f}"])

        histograms.append({"id": f"pbPb_{tag}", "file": f"pbPb_{tag}.json", "centrality": tag})

    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"histograms": histograms}, indent=2) + "\n"
    )
    print("done")


if __name__ == "__main__":
    main()
