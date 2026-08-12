#!/usr/bin/env python3
"""Digitize published Pb-Pb J/psi Minv top panels (unlike + like) into
assets/exercises/jpsi/minv/*.json, across two source figures / 8 centrality
classes.

Requires: Pillow. Run from this directory after rendering both source PDFs
at 300 DPI:
  pdftoppm -png -r 300 pb-pb-jpsi.pdf fig15   && cp fig15-1.png  fig15-300dpi.png
  pdftoppm -png -r 300 pb-pb-jpsi2.pdf fig14  && cp fig14-1.png  fig14-300dpi.png

Both source figures share the same ROOT canvas template (same legend
layout, same tick style, same top/bottom sub-pad split), which is why a
single set of pixel heuristics below works for every panel in both figures.

After window-sum normalisation to published N_total / N_bkg, applies a
didactic clamp like[i] = min(like[i], unlike[i]) so digitization noise
cannot leave background bars taller than unlike-sign in the MasterClass UI
(see assets/.../minv/README.md, Known digitization issue #3).
"""
from __future__ import annotations

import csv
import json
import math
from collections import defaultdict
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[3]  # alice-masterclass-js
OUT_DIR = ROOT / "src" / "assets" / "exercises" / "jpsi" / "minv"
IMG_DIR = Path(__file__).resolve().parent

BIN_WIDTH = 0.04
X_MASS_MIN, X_MASS_MAX = 2.0, 3.6
N_BINS = int(round((3.72 - 2.0) / BIN_WIDTH))
CENTERS = [2.0 + (i + 0.5) * BIN_WIDTH for i in range(N_BINS)]
WIN = (2.9, 3.2)

# The legend ("Unlike-sign same event" / "Like sign same event" / "Raw J/psi
# signal" / "MC" / "MC+Pol1 Fit" / "Pol1 Residual") is drawn *inside* the top
# sub-panel, with its swatch column (dots and short lines, all colour-
# matched to real data markers) sitting at a fixed offset relative to each
# panel's own frame -- verified by pixel inspection across all 8 panels in
# both source figures: the swatch column is always at x_left+[420,520] px,
# and the legend rows span y_top+[0,158] px, regardless of the panel's
# absolute position on the page or its y-axis scale. A real data point is
# never found above y_top+158 anywhere near that column (checked with >15px
# margin for every panel), so excluding this rectangle from the per-column
# pixel scan removes the legend without ever discarding real data.
LEGEND_REL_X = (420, 520)
LEGEND_Y_OFFSET = 158


def is_red(r, g, b):
    return r > 150 and g < 120 and b < 130 and r >= g + 35 and r >= b + 35


def is_blue(r, g, b):
    return b > 125 and r < 135 and g < 175 and b > r + 25


def is_dark(r, g, b):
    return r + g + b < 200


# Each figure shares one rendered page; panels are (x_search, y_search)
# rectangles roughly bounding the *top* sub-panel (unlike/like histogram),
# generous enough for find_top_frame/find_horizontal_axis/find_vertical_axis
# to lock onto the real frame within them. Published numbers are read
# directly off each panel's on-plot annotations (N_total, N_bkg, N_J/psi,
# S/B, S/sqrt(S+2B)).
FIGURES = [
    dict(
        img="fig15-300dpi.png",
        note="Inclusive J/psi analysis notes from 2018 data, Figure 15",
        figure=15,
        localPdf="data/jpsi/minv_digitize/pb-pb-jpsi.pdf",
        url="https://alice-notes.web.cern.ch/system/files/notes/analysis/953/2024-01-28-Inclusive_Jpsi_analysis_notes__from_2018_PbPb.pdf",
        panels=[
            dict(
                centrality="50_70", x_search=(420, 1280), y_search=(300, 900),
                nEvents=36480000, nTotal=11082, nTotalErr=105, nBkg=9366,
                nBkgErr=96, nJpsi=1478, nJpsiErr=153, sOverB=0.154,
                significance=10.3, aGaussHint=[1500, 3.1, 0.05],
            ),
            dict(
                centrality="70_90", x_search=(1320, 2180), y_search=(300, 900),
                nEvents=36380000, nTotal=785, nTotalErr=28, nBkg=448,
                nBkgErr=21, nJpsi=310, nJpsiErr=37, sOverB=0.654,
                significance=8.7, aGaussHint=[320, 3.1, 0.05],
            ),
        ],
    ),
    dict(
        img="fig14-300dpi.png",
        note="ALICE Analysis Note 2020, Figure 14",
        figure=14,
        localPdf="data/jpsi/minv_digitize/pb-pb-jpsi2.pdf",
        url=None,
        panels=[
            dict(
                centrality="0_5", x_search=(380, 1180), y_search=(300, 900),
                nEvents=40090000, nTotal=3545138, nTotalErr=1882, nBkg=3505801,
                nBkgErr=1872, nJpsi=34662, nJpsiErr=2851, sOverB=0.010,
                significance=13.0, aGaussHint=[35000, 3.1, 0.05],
            ),
            dict(
                centrality="5_10", x_search=(1290, 2100), y_search=(300, 900),
                nEvents=40070000, nTotal=2216856, nTotalErr=1488, nBkg=2181802,
                nBkgErr=1477, nJpsi=33443, nJpsiErr=2251, sOverB=0.015,
                significance=15.9, aGaussHint=[34000, 3.1, 0.05],
            ),
            dict(
                centrality="10_20", x_search=(380, 1180), y_search=(1270, 1870),
                nEvents=18140000, nTotal=524516, nTotalErr=724, nBkg=514866,
                nBkgErr=717, nJpsi=7858, nJpsiErr=1095, sOverB=0.015,
                significance=7.7, aGaussHint=[8000, 3.1, 0.05],
            ),
            dict(
                centrality="20_30", x_search=(1290, 2100), y_search=(1270, 1870),
                nEvents=18180000, nTotal=215637, nTotalErr=464, nBkg=209197,
                nBkgErr=457, nJpsi=5961, nJpsiErr=700, sOverB=0.028,
                significance=9.1, aGaussHint=[6100, 3.1, 0.05],
            ),
            dict(
                centrality="30_40", x_search=(380, 1180), y_search=(2240, 2840),
                nEvents=39760000, nTotal=177972, nTotalErr=421, nBkg=169955,
                nBkgErr=412, nJpsi=7181, nJpsiErr=633, sOverB=0.042,
                significance=12.2, aGaussHint=[7300, 3.1, 0.05],
            ),
            dict(
                centrality="40_50", x_search=(1290, 2100), y_search=(2240, 2840),
                nEvents=39830000, nTotal=60883, nTotalErr=246, nBkg=57021,
                nBkgErr=238, nJpsi=3425, nJpsiErr=368, sOverB=0.060,
                significance=10.0, aGaussHint=[3500, 3.1, 0.05],
            ),
        ],
    ),
]


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


def digitize_panel(px, fig_cfg, panel_cfg):
    tag = panel_cfg["centrality"]
    x_lo, x_hi = panel_cfg["x_search"]
    y_lo, y_hi = panel_cfg["y_search"]

    def find_top_frame(y0, y1, x0, x1):
        best_y, best_score = None, 0
        for y in range(y0, y1):
            score = sum(1 for x in range(x0, x1, 2) if is_dark(*px[x, y]))
            if score > best_score:
                best_score, best_y = score, y
        return best_y

    def find_horizontal_axis(x0, x1, y0, y1):
        best_y, best_score = None, 0
        for y in range(y0, y1):
            score = sum(1 for x in range(x0, x1, 2) if is_dark(*px[x, y]))
            if score > best_score:
                best_score, best_y = score, y
        return best_y

    def find_vertical_axis(y0, y1, x0, x1, from_left=True):
        best_x, best_score = None, 0
        xs = range(x0, x1) if from_left else range(x1 - 1, x0 - 1, -1)
        for x in xs:
            score = sum(1 for y in range(y0, y1, 2) if is_dark(*px[x, y]))
            if score > best_score:
                best_score, best_x = score, x
        return best_x

    def find_major_tick_spacing(x0, x1, y_bot):
        """Measure the pixel spacing between labelled major ticks (0.2 GeV
        apart), by how far each tick mark extends below the axis line:
        major ticks are drawn longer (~19px) than minor ticks (~9px), and
        the plot's outer frame border is longer still (~24px). Using the
        *tick grid* rather than the outer frame border matters: the frame's
        right edge does not sit exactly at the last labelled tick
        (3.6 GeV) -- there is extra unlabelled axis margin out to
        ~3.72 GeV. Calibrating from (x_left, x_right) instead of the true
        tick spacing silently compresses the mass scale and shifts every
        digitized feature (e.g. the J/psi peak) toward lower mass."""
        lengths = {}
        for x in range(x0, x1):
            length = 0
            for dy in range(1, 25):
                if is_dark(*px[x, y_bot + dy]):
                    length = dy
                else:
                    break
            if length > 0:
                lengths[x] = length
        runs, cur, prev = [], [], None
        for x in sorted(lengths):
            if prev is not None and x - prev > 2:
                runs.append(cur)
                cur = []
            cur.append(x)
            prev = x
        if cur:
            runs.append(cur)
        majors = [
            sum(r) / len(r) for r in runs if 14 <= max(lengths[x] for x in r) <= 22
        ]
        majors.sort()
        if len(majors) < 2:
            return None
        gaps = sorted(majors[i + 1] - majors[i] for i in range(len(majors) - 1))
        return gaps[len(gaps) // 2]  # median gap = pixels per 0.2 GeV

    y_top = find_top_frame(y_lo, y_lo + 250, x_lo + 40, x_hi - 40)
    y_bot = find_horizontal_axis(x_lo + 40, x_hi - 40, y_top + 350, y_top + 550)
    x_left = find_vertical_axis(y_top + 10, y_bot - 10, x_lo, x_lo + 150, True)
    x_right = find_vertical_axis(y_top + 10, y_bot - 10, x_hi - 150, x_hi, False)

    major_tick_gap = find_major_tick_spacing(x_lo, x_hi, y_bot)
    if major_tick_gap is None:
        raise RuntimeError(f"{tag}: could not detect major tick spacing")
    px_per_gev = major_tick_gap / 0.2
    expected_px_per_gev = (x_right - x_left) / (X_MASS_MAX - X_MASS_MIN)
    if abs(px_per_gev - expected_px_per_gev) / expected_px_per_gev > 0.15:
        raise RuntimeError(
            f"{tag}: tick-based scale ({px_per_gev:.1f} px/GeV) disagrees "
            f"with frame-based scale ({expected_px_per_gev:.1f} px/GeV) by "
            f"more than 15% -- axis detection likely failed, refusing to "
            f"digitize with a possibly-wrong calibration"
        )

    def mass_to_x(m, _xl=x_left, _scale=px_per_gev):
        return _xl + (m - X_MASS_MIN) * _scale

    def y_to_entries(y, _yt=y_top, _yb=y_bot):
        # Any positive constant works here: the window-sum renormalisation
        # below cancels an overall scale factor exactly, so we don't need
        # to read each panel's (sometimes x10^3-scaled) y-axis maximum.
        return 1.0 * (_yb - y) / (_yb - _yt)

    half = abs(mass_to_x(2.0 + BIN_WIDTH) - mass_to_x(2.0)) * 0.4
    legend_x0, legend_x1 = x_left + LEGEND_REL_X[0], x_left + LEGEND_REL_X[1]
    legend_y_max = y_top + LEGEND_Y_OFFSET

    def peak_y_candidates(ys, bin_px=3, top_n=4):
        """Return up to top_n candidate y-clusters, largest first, as
        (median_y, pixel_count) tuples. Returning several candidates
        (instead of just the single most-populous one) lets the caller
        apply a continuity check and reject a densely-populated but
        physically implausible cluster (e.g. a legend line swatch)."""
        if len(ys) < 3:
            return []
        hist = defaultdict(list)
        for y in ys:
            hist[y // bin_px].append(y)
        ranked = sorted(hist.items(), key=lambda kv: -len(kv[1]))
        out = []
        for _, band in ranked[:top_n]:
            band = sorted(band)
            out.append((band[len(band) // 2], len(band)))
        return out

    def pick_continuous(candidates, last_y, max_jump_px):
        """Pick the candidate closest to the previous accepted y (i.e.
        closest to the local trend) among clusters within max_jump_px of
        it; only fall back to the most populous cluster (candidates[0])
        when there is no established trend yet or nothing is close."""
        if not candidates:
            return None
        if last_y is None:
            return candidates[0][0]
        in_range = [c for c in candidates if abs(c[0] - last_y) <= max_jump_px]
        if in_range:
            return min(in_range, key=lambda c: abs(c[0] - last_y))[0]
        return candidates[0][0]

    max_jump_px = 0.35 * (y_bot - y_top)

    unlike, like = [], []
    last_ry, last_by = None, None
    for c in CENTERS:
        if c < X_MASS_MIN - 1e-9 or c > X_MASS_MAX + 0.02:
            unlike.append(None)
            like.append(None)
            continue
        xc = mass_to_x(c)
        x0, x1 = int(xc - half), int(xc + half)
        red_ys, blue_ys = [], []
        for x in range(max(x_left + 2, x0), min(x_right - 2, x1) + 1):
            in_legend_x = legend_x0 <= x <= legend_x1
            y_scan_min = legend_y_max if in_legend_x else (y_top + 3)
            for y in range(y_scan_min, y_bot - 3):
                r, g, b = px[x, y]
                if is_red(r, g, b):
                    red_ys.append(y)
                elif is_blue(r, g, b):
                    blue_ys.append(y)

        ry = pick_continuous(peak_y_candidates(red_ys), last_ry, max_jump_px)
        by = pick_continuous(peak_y_candidates(blue_ys), last_by, max_jump_px)
        if ry is not None:
            last_ry = ry
        if by is not None:
            last_by = by
        unlike.append(y_to_entries(ry) if ry is not None else None)
        like.append(y_to_entries(by) if by is not None else None)

    u, l = fill_gaps(unlike), fill_gaps(like)

    def warn_anomalies(arr, label):
        """Flag bins that look like a residual digitization artifact: a
        value that (a) sits flat with its immediate neighbor (a plausible
        sign the same pixel cluster was reused) AND (b) is itself a strong
        outlier against the wider local trend (bins two steps out on each
        side) -- e.g. a plateau that appears "out of nowhere". Plain
        pixel-quantization plateaus in a slowly-varying region will
        usually fail (b), so this is much quieter than comparing only to
        immediate neighbors."""
        n = len(arr)
        for i in range(2, n - 2):
            if arr[i] <= 0:
                continue
            flat_with_neighbor = arr[i] == arr[i - 1] or arr[i] == arr[i + 1]
            if not flat_with_neighbor:
                continue
            wide_trend = (arr[i - 2] + arr[i + 2]) / 2
            if wide_trend > 0 and abs(arr[i] - wide_trend) > 0.5 * wide_trend:
                print(f"  [WARN] {tag}/{label}: bin {i} (m={CENTERS[i]:.2f}) "
                      f"= {arr[i]:.4g} is flat with a neighbor but deviates "
                      f">50% from the wider trend ({wide_trend:.4g}) -- "
                      f"check for a remaining artifact")

    warn_anomalies(u, "unlike")
    warn_anomalies(l, "like")

    su, sl = sum_win(u), sum_win(l)
    nTotal, nBkg = panel_cfg["nTotal"], panel_cfg["nBkg"]
    u = [round(v * (nTotal / su), 3) for v in u]
    l = [round(v * (nBkg / sl), 3) for v in l]

    # Didactic clamp: on the published figures, like-sign markers sit at or
    # slightly below unlike-sign everywhere (S/B ~ 1% in central Pb-Pb).
    # Marker digitization noise can flip that ordering; clamp so students
    # never see blue bars taller than red after subtract-ready display.
    n_clamped = sum(1 for uu, ll in zip(u, l) if ll > uu)
    if n_clamped:
        print(f"  {tag}: didactic clamp like<=unlike in {n_clamped}/{len(u)} bins")
    l = [min(ll, uu) for uu, ll in zip(u, l)]

    uerr = [round(math.sqrt(max(v, 0)), 3) for v in u]
    lerr = [round(math.sqrt(max(v, 0)), 3) for v in l]

    obj = {
        "schemaVersion": 1,
        "datasetId": "pbPb",
        "centrality": tag,
        "centralityLabel": tag.replace("_", "-") + "%",
        "source": {
            "note": fig_cfg["note"],
            "figure": fig_cfg["figure"],
            "localPdf": fig_cfg["localPdf"],
            "url": fig_cfg["url"],
            "digitizedWith": "Python per-bin strip digitization + window-scale calibration",
            "renderDpi": 300,
            "binWidthGeV": BIN_WIDTH,
            "nEvents": panel_cfg["nEvents"],
            "calibration": (
                "Shape from top-panel markers; absolute scale set so sums in "
                "[2.9,3.2) match published N_total / N_bkg; then didactic "
                "clamp like[i] = min(like[i], unlike[i]) to remove "
                "digitization flips (MasterClass: never show like > unlike)"
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
            "nTotal": panel_cfg["nTotal"],
            "nTotalErr": panel_cfg["nTotalErr"],
            "nBkg": panel_cfg["nBkg"],
            "nBkgErr": panel_cfg["nBkgErr"],
            "nJpsi": panel_cfg["nJpsi"],
            "nJpsiErr": panel_cfg["nJpsiErr"],
            "sOverB": panel_cfg["sOverB"],
            "significance": panel_cfg["significance"],
            "significanceNote": "S/sqrt(S+2B) as on figure (like-sign method)",
        },
        "fitHint": {
            "signalWindow": [2.9, 3.2],
            "peakMean": 3.1,
            "peakSigma": 0.05,
            "aGaussHint": panel_cfg["aGaussHint"],
        },
    }

    out = OUT_DIR / f"pbPb_{tag}.json"
    out.write_text(json.dumps(obj, indent=2) + "\n")
    print("wrote", out, "window residual", round(sum_win(u) - sum_win(l), 1))

    with open(IMG_DIR / f"{tag}_unlike_like.csv", "w", newline="") as f:
        wri = csv.writer(f)
        wri.writerow(["binCenter", "unlike", "like"])
        for c, uu, ll in zip(CENTERS, u, l):
            wri.writerow([f"{c:.4f}", f"{uu:.3f}", f"{ll:.3f}"])

    return {"id": f"pbPb_{tag}", "file": f"pbPb_{tag}.json", "centrality": tag}


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    histograms = []
    for fig_cfg in FIGURES:
        im = Image.open(IMG_DIR / fig_cfg["img"]).convert("RGB")
        px = im.load()
        for panel_cfg in fig_cfg["panels"]:
            histograms.append(digitize_panel(px, fig_cfg, panel_cfg))

    # Sort centrality classes from central to peripheral for a predictable
    # manifest / UI ordering.
    order = ["0_5", "5_10", "10_20", "20_30", "30_40", "40_50", "50_70", "70_90"]
    histograms.sort(key=lambda h: order.index(h["centrality"]))
    (OUT_DIR / "manifest.json").write_text(
        json.dumps({"histograms": histograms}, indent=2) + "\n"
    )
    print("done")


if __name__ == "__main__":
    main()
