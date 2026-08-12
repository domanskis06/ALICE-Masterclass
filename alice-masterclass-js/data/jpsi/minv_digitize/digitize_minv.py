#!/usr/bin/env python3
"""Digitize published Pb-Pb J/psi Minv panels into
assets/exercises/jpsi/minv/*.json, across two source figures / 8 centrality
classes.

Requires: Pillow. Run from this directory after rendering both source PDFs
at 300 DPI:
  pdftoppm -png -r 300 pb-pb-jpsi.pdf fig15   && cp fig15-1.png  fig15-300dpi.png
  pdftoppm -png -r 300 pb-pb-jpsi2.pdf fig14  && cp fig14-1.png  fig14-300dpi.png

Both source figures share the same ROOT canvas template (same legend
layout, same tick style, same top/bottom sub-pad split), which is why a
single set of pixel heuristics below works for every panel in both figures.

Digitization strategy (v2): `unlike` is read from the top sub-pad's red
markers (unchanged from v1). `like` is *derived* as `unlike - residual`,
where `residual` is read directly from the bottom sub-pad's black "Raw
J/psi signal" markers, instead of independently digitizing the top pad's
overlapping blue markers. The top pad shows unlike/like at ~10^5-10^6
counts with only a ~1-2 px visual separation (S/B ~ 1-3% in central
classes), so subtracting two independent reads of those curves amplifies
pixel noise into a large relative error in the difference. The bottom pad
already shows that small difference on its own, appropriately-scaled axis,
so reading it directly avoids this catastrophic-cancellation problem (see
assets/.../minv/README.md, "Known digitization issue #3").
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
# pixel scan removes the legend without ever discarding real data. (Only
# relevant to the top pad's red/unlike scan now -- see is_black comment
# above for why v2 no longer digitizes the top pad's blue/like markers.)
LEGEND_REL_X = (420, 520)
LEGEND_Y_OFFSET = 158

# The bottom pad's in-plot text annotations ("N_J/psi:.. S/B:.. S/sqrt(S+2B).."
# on the left, "chi2/ndf.. Fit all:.. Fit bkg:.. Fit all-Fit bkg.. Fit J/psi.."
# on the right) must be excluded from the black-marker scan. Their extent was
# measured directly on the Figure 14, 0-5% panel (the one with the longest
# printed numbers, so the widest text): real data -- including the tallest
# J/psi-peak marker and its error bar -- never crosses x_left+505 while
# inside the text's y-band, and the text's *left* edge is fixed by the ROOT
# TPaveText's on-pad position (identical for every panel of a figure; only
# the printed numbers' length varies with the value, which only extends the
# text further right, never left). RIGHT_TEXT_REL_X has no upper bound
# because everything right of the threshold, in that y-band, is text.
LEFT_TEXT_REL_X = (0, 300)
LEFT_TEXT_REL_Y = (0, 165)
RIGHT_TEXT_REL_X_MIN = 505
RIGHT_TEXT_REL_Y = (0, 220)

# Search window (px, below the top pad's x-axis) for the bottom pad's own
# bottom frame border.
BOTTOM_PAD_SEARCH = (300, 500)

# Fraction of the bottom pad's height at which the y=0 reference row sits.
# ROOT renders this tick noticeably bolder/longer than the other major
# ticks (confirmed on every one of the 8 panels: ~39px vs ~22-24px for
# regular majors), which is a far more robust signal than trying to read
# the axis' printed numbers -- but as a sanity net (this is calibration,
# not measurement, so a silent mis-detection would corrupt every bin's
# sign), the detected zero-row's fractional position is also required to
# fall in this empirically-observed band (0.78 on every panel checked).
ZERO_ROW_FRACTION_BAND = (0.70, 0.86)


def is_red(r, g, b):
    return r > 150 and g < 120 and b < 130 and r >= g + 35 and r >= b + 35


def is_dark(r, g, b):
    return r + g + b < 200


def is_black(r, g, b):
    """Strict near-black test for the bottom pad's "Raw J/psi signal"
    markers and their error bars -- deliberately tighter than is_dark
    (used for frame/axis structural elements) so it doesn't pick up
    anti-aliased edge pixels of the green/red/blue fit curves that
    visually overlap the black markers near the J/psi peak (confirmed by
    direct pixel classification: at the peak column, red "MC+Pol1 Fit"
    pixels and black marker pixels coexist in the same rows, but only the
    marker pixels satisfy this stricter test)."""
    return max(r, g, b) < 95 and (max(r, g, b) - min(r, g, b)) < 30


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


def fill_gaps(arr, clamp_nonneg=True):
    """Linearly interpolate short (<=2 bin) gaps of undetected markers;
    longer gaps fall back to 0. `clamp_nonneg=False` is used for the
    residual, which legitimately dips slightly negative in sideband bins
    (a real background fluctuation already present in the published
    figure) -- clamping it to 0 would erase that real signal."""
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
    if clamp_nonneg:
        return [max(0.0, float(v)) for v in a]
    return [float(v) for v in a]


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

    # --- Bottom pad (residual "Raw J/psi signal") geometry -----------------
    # Its top border *is* the top pad's x-axis (shared row, y_bot); its own
    # bottom border is a second near-full-width dark row further down; it
    # shares x_left/x_right with the top pad (all confirmed identical across
    # a Figure 14 and a Figure 15 panel -- no new per-panel search box
    # needed).
    y_top2 = y_bot
    y_bot2 = find_horizontal_axis(
        x_lo + 40, x_hi - 40, y_top2 + BOTTOM_PAD_SEARCH[0], y_top2 + BOTTOM_PAD_SEARCH[1]
    )
    if y_bot2 is None:
        raise RuntimeError(f"{tag}: could not detect bottom pad's frame border")

    def find_major_ticks_vertical(x_axis, y0, y1, min_len=8):
        """Like find_major_tick_spacing, but rotated 90 degrees: scans tick
        length to the *right* of the y-axis for each row instead of tick
        length *below* the x-axis for each column. A min_len floor on the
        raw per-row length is required here (unlike the x-axis version)
        because on some panels x_axis+1 is itself part of the axis line's
        anti-aliasing, which would otherwise register a spurious length>=1
        on every row and merge every real tick into one giant run."""
        lengths = {}
        for y in range(y0, y1):
            length = 0
            for dx in range(1, 40):
                if is_dark(*px[x_axis + dx, y]):
                    length = dx
                else:
                    break
            if length >= min_len:
                lengths[y] = length
        runs, cur, prev = [], [], None
        for y in sorted(lengths):
            if prev is not None and y - prev > 2:
                runs.append(cur)
                cur = []
            cur.append(y)
            prev = y
        if cur:
            runs.append(cur)
        return [(sum(r) / len(r), max(lengths[y] for y in r)) for r in runs]

    def find_zero_row():
        """Locate the bottom pad's y=0 reference row. ROOT renders this
        particular tick noticeably bolder/longer than the other major
        ticks -- confirmed on every one of the 8 panels (~39px vs ~22-24px
        for regular majors) by direct pixel measurement, and cross-checked
        by eye against each panel's rendered "0" label during development.
        This is far more robust than trying to read the axis' printed
        numbers, and needs no per-panel hand-transcription."""
        ticks = find_major_ticks_vertical(x_left, y_top2 + 2, y_bot2 - 2)
        majors = [(row, length) for row, length in ticks if length >= 15]
        if len(majors) < 3:
            raise RuntimeError(
                f"{tag}: too few y-axis major ticks found ({len(majors)}) "
                f"on the bottom pad to calibrate zero-row"
            )
        normal_len = sorted(length for _, length in majors)[len(majors) // 2]
        bold = [(row, length) for row, length in majors if length > 1.4 * normal_len]
        if len(bold) != 1:
            raise RuntimeError(
                f"{tag}: expected exactly one bold zero-tick among bottom "
                f"pad y-axis majors, found {len(bold)} "
                f"(lengths={[l for _, l in majors]}) -- refusing to guess "
                f"zero-row calibration"
            )
        zero_row = bold[0][0]
        frac = (zero_row - y_top2) / (y_bot2 - y_top2)
        if not (ZERO_ROW_FRACTION_BAND[0] <= frac <= ZERO_ROW_FRACTION_BAND[1]):
            raise RuntimeError(
                f"{tag}: zero-row at {frac:.2f} of bottom-pad height is "
                f"outside the expected {ZERO_ROW_FRACTION_BAND} band seen "
                f"on every other panel -- likely a mis-detection, refusing "
                f"to calibrate"
            )
        return zero_row

    zero_row = find_zero_row()
    left_text_x0, left_text_x1 = x_left + LEFT_TEXT_REL_X[0], x_left + LEFT_TEXT_REL_X[1]
    left_text_y0, left_text_y1 = y_top2 + LEFT_TEXT_REL_Y[0], y_top2 + LEFT_TEXT_REL_Y[1]
    right_text_x0 = x_left + RIGHT_TEXT_REL_X_MIN
    right_text_y0, right_text_y1 = y_top2 + RIGHT_TEXT_REL_Y[0], y_top2 + RIGHT_TEXT_REL_Y[1]

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
    max_jump_px2 = 0.35 * (y_bot2 - y_top2)

    unlike, residual_raw = [], []
    last_ry, last_ky = None, None
    for c in CENTERS:
        if c < X_MASS_MIN - 1e-9 or c > X_MASS_MAX + 0.02:
            unlike.append(None)
            residual_raw.append(None)
            continue
        xc = mass_to_x(c)
        x0, x1 = int(xc - half), int(xc + half)

        red_ys = []
        for x in range(max(x_left + 2, x0), min(x_right - 2, x1) + 1):
            in_legend_x = legend_x0 <= x <= legend_x1
            y_scan_min = legend_y_max if in_legend_x else (y_top + 3)
            for y in range(y_scan_min, y_bot - 3):
                if is_red(*px[x, y]):
                    red_ys.append(y)

        black_ys = []
        for x in range(max(x_left + 2, x0), min(x_right - 2, x1) + 1):
            in_left_text = left_text_x0 <= x <= left_text_x1
            in_right_text = x >= right_text_x0
            for y in range(y_top2 + 3, y_bot2 - 3):
                if in_left_text and left_text_y0 <= y <= left_text_y1:
                    continue
                if in_right_text and right_text_y0 <= y <= right_text_y1:
                    continue
                if is_black(*px[x, y]):
                    black_ys.append(y)

        ry = pick_continuous(peak_y_candidates(red_ys), last_ry, max_jump_px)
        ky = pick_continuous(peak_y_candidates(black_ys), last_ky, max_jump_px2)
        if ry is not None:
            last_ry = ry
        if ky is not None:
            last_ky = ky
        unlike.append(y_to_entries(ry) if ry is not None else None)
        # Positive above the zero row, negative below -- residual can be
        # legitimately negative in sideband bins (see fill_gaps docstring).
        residual_raw.append(float(zero_row - ky) if ky is not None else None)

    u = fill_gaps(unlike)
    residual = fill_gaps(residual_raw, clamp_nonneg=False)

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
    warn_anomalies(residual, "residual")

    su, sr = sum_win(u), sum_win(residual)
    nTotal, nBkg = panel_cfg["nTotal"], panel_cfg["nBkg"]
    if abs(sr) < 1e-9:
        raise RuntimeError(f"{tag}: residual window-sum is ~0, cannot normalise")
    u = [v * (nTotal / su) for v in u]
    residual = [v * ((nTotal - nBkg) / sr) for v in residual]

    # like is *derived*, not independently digitized: unlike - like == residual
    # by construction, so (unlike - residual) can only fall below 0 from
    # genuine digitization noise in the residual read, not from the old
    # systematic "two independent near-overlapping curves" bias -- this is
    # therefore a plain physical floor, not the old didactic min(like,unlike)
    # clamp. See "Known digitization issue #3" in the README.
    like_raw = [uu - rr for uu, rr in zip(u, residual)]
    n_negative = sum(1 for v in like_raw if v < 0)
    if n_negative:
        print(f"  {tag}: floored like to 0 in {n_negative}/{len(u)} bins (residual > unlike)")
    u = [round(v, 3) for v in u]
    l = [round(max(0.0, v), 3) for v in like_raw]

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
            "digitizedWith": "Python per-bin strip digitization (v2: residual read from bottom pad)",
            "renderDpi": 300,
            "binWidthGeV": BIN_WIDTH,
            "nEvents": panel_cfg["nEvents"],
            "calibration": (
                "unlike: shape from top-pad red markers, scaled so its "
                "[2.9,3.2) window sum matches published N_total. residual: "
                "shape from bottom-pad black 'Raw J/psi signal' markers "
                "(read directly, not as unlike-minus-independently-digitized-like), "
                "scaled so its window sum matches N_total-N_bkg; "
                "like = max(0, unlike - residual)"
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
        wri.writerow(["binCenter", "unlike", "like", "residual"])
        for c, uu, ll, rr in zip(CENTERS, u, l, residual):
            wri.writerow([f"{c:.4f}", f"{uu:.3f}", f"{ll:.3f}", f"{rr:.3f}"])

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
