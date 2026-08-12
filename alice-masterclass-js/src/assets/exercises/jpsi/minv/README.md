# Published Pb–Pb J/ψ invariant-mass histograms

Binned unlike-sign and like-sign dielectron invariant-mass spectra digitized from
two ALICE analysis-note figures, covering **8 centrality classes** spanning
0–90%:

| Centrality | Source |
| --- | --- |
| 0–5%, 5–10%, 10–20%, 20–30%, 30–40%, 40–50% | Figure 14, *ALICE Analysis Note 2020* |
| 50–70%, 70–90% | Figure 15, *Inclusive J/ψ analysis notes from 2018 Pb–Pb data* (2024) |

> <https://alice-notes.web.cern.ch/system/files/notes/analysis/953/2024-01-28-Inclusive_Jpsi_analysis_notes__from_2018_PbPb.pdf>

These assets power the MasterClass J/ψ exercise workflow:
**show unlike + like → subtract background → fit residual (LSA-style)**.

---

## Why digitized histograms instead of track-level data?

We initially attempted to convert raw Pb–Pb track data from ALICE Open Data
(`AO2D.root` from <https://opendata.cern.ch/record/11537>, O2 format) into the
columnar JSON format used by the pp and p–Pb exercises. However:

1. **Weak J/ψ signal** — after applying standard PID and quality cuts, the
   resulting dielectron mass spectrum showed only a ~3σ fluctuation near
   \(m_{J/\psi}\), far below the pedagogically useful threshold (~7σ).
2. **Different dE/dx scale** — TPC signal in AO2D is in raw ADC counts (50–300),
   incompatible with the Bethe–Bloch bands calibrated for the existing pp/p–Pb
   PID heatmap.
3. **Insufficient statistics** — the available Open Data sample (~50 M events)
   is too small for the simplified like-sign subtraction method to produce a
   clean peak for students.

Because producing a pedagogically sound track-level Pb–Pb dataset would require
a specially skimmed or simulated sample (not currently available on Open Data),
we instead digitize **published** spectra that already demonstrate a clear J/ψ
signal, letting students experience the full subtract + fit workflow on real
ALICE results, across the full centrality range.

---

## Files

| File | Content |
| --- | --- |
| `pbPb_0_5.json` … `pbPb_40_50.json` | Central classes, from Figure 14 |
| `pbPb_50_70.json`, `pbPb_70_90.json` | Peripheral classes, from Figure 15 |
| `manifest.json` | Index listing all 8 histograms, central → peripheral |
| `README.md` | This file |

---

## Provenance & digitization pipeline

### Sources

- `data/jpsi/minv_digitize/pb-pb-jpsi.pdf` — Figure 15 (50–70%, 70–90%)
- `data/jpsi/minv_digitize/pb-pb-jpsi2.pdf` — Figure 14 (0–5% … 40–50%, a 3×2
  grid of 6 centrality panels on one page)
- Both figures use the **same ROOT canvas template**: each panel has a top
  sub-pad (unlike-sign / like-sign histograms — the only one we digitize) and
  a bottom sub-pad (raw signal + MC fit, not used here), the same 6-entry
  legend, and the same tick style. This is why one script/heuristic set
  handles all 8 panels.
- Only the **top sub-panel** of each is digitized (unlike-sign and like-sign
  \(m_{ee}\) spectra); the bottom fit panel is not used — we redo the fit
  ourselves in the app (LSA-style) from the digitized top panel.

### Steps

1. **Render each PDF → PNG at 300 DPI**
   ```bash
   cd data/jpsi/minv_digitize/
   pdftoppm -png -r 300 pb-pb-jpsi.pdf  fig15 && cp fig15-1.png fig15-300dpi.png
   pdftoppm -png -r 300 pb-pb-jpsi2.pdf fig14 && cp fig14-1.png fig14-300dpi.png
   ```

2. **Digitize with Python** (`digitize_minv.py`)
   - For each of the 8 panels, locates its frame (top/bottom/left/right) via
     pixel-darkness axis detection, within a rough per-panel search box
     (`x_search`/`y_search` in the `FIGURES` config)
   - Calibrates the mass ↔ pixel scale from the **major tick spacing**
     (0.2 GeV apart), not from the outer frame border — see "Known issue #2" below
   - For each 0.04 GeV bin, scans a vertical strip to find the marker centroid
     (unlike-sign = filled red circles, like-sign = open blue circles)
   - Excludes the in-plot legend's pixel rectangle from the scan (a fixed
     offset relative to each panel's own frame, verified safe for all 8
     panels — see "Known issue #1" below), and prefers the y-cluster closest
     to the previous bin's value when several candidate clusters exist
   - Converts pixel y-coordinate → an arbitrary-but-consistent entry count
     (the absolute scale cancels out in the normalisation step below, so we
     don't need to read each panel's, sometimes ×10³-scaled, y-axis)

3. **Absolute normalisation**
   - Each series is rescaled so that the **sum in the signal window [2.9, 3.2) GeV**
     matches the published values printed on the figure:
     - Unlike-sign sum → \(N_\text{total}\)
     - Like-sign sum → \(N_\text{bkg}\)
   - This ensures the residual \(U - L\) in the signal window equals
     \(N_\text{total} - N_\text{bkg}\), consistent with published \(N_{J/\psi}\)

4. **Didactic clamp** `like[i] = min(like[i], unlike[i])`
   — see **Known digitization issue #3** below.

5. **Output** → JSON + manifest in `src/assets/exercises/jpsi/minv/`

### Reproduction

```bash
cd alice-masterclass-js/data/jpsi/minv_digitize/
python3 -m venv .venv && source .venv/bin/activate
pip install Pillow
python digitize_minv.py
```

Published numbers (`nTotal`, `nBkg`, `nJpsi`, `sOverB`, `significance`,
`nEvents`) for each panel are hand-transcribed from the on-plot text
annotations into the `FIGURES` config at the top of `digitize_minv.py` —
verified by direct zoomed inspection of the 300 DPI render for every panel.

---

## JSON schema (v1)

```jsonc
{
  "schemaVersion": 1,
  "datasetId": "pbPb",
  "centrality": "50_70",           // key identifier
  "centralityLabel": "50–70%",     // display label

  "source": {
    "note": "...",
    "figure": 15,                  // 14 or 15
    "localPdf": "data/jpsi/minv_digitize/pb-pb-jpsi.pdf",
    "url": "https://...",          // null for Figure 14 (no public note URL on hand)
    "digitizedWith": "Python/Pillow (per-bin strip scan)",
    "renderDpi": 300,
    "binWidthGeV": 0.04,
    "nEvents": 36480000            // total events in centrality class
  },

  // Binning
  "xmin": 2.0,                     // GeV/c²
  "xmax": 3.72,
  "bins": 43,                      // number of bins
  "binCenters": [2.02, 2.06, ...], // GeV/c², length = bins

  // Counts per bin
  "unlike": [n₁, n₂, ...],        // unlike-sign pairs (signal + combinatorial bkg)
  "like":   [n₁, n₂, ...],        // like-sign pairs (combinatorial bkg estimate)
  "unlikeErr": [...],              // √(unlike) Poisson errors
  "likeErr":   [...],              // √(like) Poisson errors

  // Published results (from figure annotations)
  "published": {
    "nTotal": 11082,               // sum of unlike in [2.9, 3.2)
    "nTotalErr": 105,
    "nBkg": 9366,                  // sum of like in [2.9, 3.2)
    "nBkgErr": 96,
    "nJpsi": 1478,                 // fitted J/ψ yield (MC template + pol1)
    "nJpsiErr": 153,
    "sOverB": 0.154,
    "significance": 10.3,          // S/√(S+2B), like-sign method
    "significanceNote": "..."
  },

  // Hints for the LSA-style Gauss+poly fit
  "fitHint": {
    "signalWindow": [2.9, 3.2],
    "peakMean": 3.1,
    "peakSigma": 0.05,
    "aGaussHint": [amplitude, mean, sigma]
  }
}
```

### Design rationale

| Decision | Why |
| --- | --- |
| Binned counts (`unlike`/`like`) instead of unbinned `data` array | Faithful representation of the published histogram; no information loss vs. figure |
| Residual not stored | Computed at runtime as `unlike[i] - like[i]`; avoids redundancy |
| Didactic `like ≤ unlike` clamp | Avoids digitization flips that made blue bars taller than red in the UI; see issue #3 |
| `published` block | Allows validation: student's fit yield can be compared to ALICE result |
| `fitHint` | Seeds the Gauss+poly fitter with reasonable starting parameters |
| Separate files per centrality | Smaller payloads; manifest enables lazy loading |
| Poisson errors stored | Enables error bars on histograms and χ² in fit |

---

## Intended exercise workflow

1. Student selects a centrality class (0–5% … 70–90%)
2. Application displays unlike-sign and like-sign histograms overlaid
3. Student clicks **"Subtract background"** → residual \(R_i = U_i - L_i\) is shown
4. Student selects signal and background fit ranges (sliders, LSA-style)
5. Student clicks **"Fit"** → Gauss + polynomial is fitted to the residual
6. Result: extracted J/ψ yield compared to the published value; S/B visibly
   grows from central (0–5%, S/B≈0.01) to peripheral (70–90%, S/B≈0.65)
   collisions, illustrating how combinatorial background scales with
   multiplicity

---

## Known digitization issue #1 (fixed): legend contaminating the scan

An earlier version of the script produced a spurious peak in the
**like-sign** (background) series at the same mass as the J/ψ resonance,
mirroring the real peak in unlike-sign — i.e. the background appeared to have
a fake J/ψ-like bump. Root cause: the plot's legend ("Unlike-sign same
event" / "Like sign same event" / "Raw J/ψ signal" / "MC" / "MC+Pol1 Fit" /
"Pol1 Residual") is drawn **inside** the plot area, overlapping the x-range
of the 2.9–3.2 GeV signal window. Its "MC+Pol1 Fit" and "Pol1 Residual" line
swatches are short, solid, ~30 px segments — denser (more matching pixels)
than a real marker + error bar — so the original "most populous y-cluster in
the full column" scan locked onto the legend swatch instead of the real data
point.

Fixed by (see `digitize_minv.py`):

1. **Legend exclusion** — `LEGEND_REL_X` / `LEGEND_Y_OFFSET` define a
   narrow rectangle, positioned *relative to each panel's own frame*
   (`x_left+[420,520]`, `y_top+[0,158]`), that reliably covers the legend's
   swatch column (dot and line markers) in every one of the 8 panels across
   both source figures — verified by direct pixel inspection: the swatch
   column sits at that same relative offset regardless of panel position,
   size, or y-axis scale, and no panel has real data above `y_top+158`
   anywhere near that column (checked with >15 px margin everywhere).
   Deliberately narrow (not "everything right of some x"): several of the
   Figure 14 panels have real data much closer to the legend's y-range than
   Figure 15 did, so a wide exclusion column risks deleting real peak data.
2. **Continuity constraint** (`pick_continuous`) — among several candidate
   y-clusters in a column, prefer the one closest to the previous bin's
   accepted value instead of blindly the most populous one. An independent
   second safeguard against similar artifacts elsewhere in a figure.
3. **Automated anomaly check** (`warn_anomalies`) — after digitizing, warns
   if a bin is flat with an immediate neighbor *and* deviates strongly from
   the wider local trend, to catch regressions if the script is re-run
   against a different render.

## Known digitization issue #2 (fixed): peak shifted ~0.1 GeV low

The J/ψ excess was visibly centered around m≈3.0 GeV instead of ≈3.1 GeV as
in the source figures and `fitHint.peakMean`. Root cause: the mass↔pixel
calibration used the outer plot **frame border** (`x_left`, `x_right`),
assuming the frame's right edge sits exactly at the last labelled axis tick
(3.6 GeV/c²). In reality the frame extends with unlabelled margin out to
≈3.72 GeV/c² — about 7–8% more pixels per GeV than assumed — so every
sampled point was pulled from a pixel column that, on the real axis, sits at
a *higher* true mass than its nominal bin label.

Fixed by `find_major_tick_spacing()`: measuring the actual on-axis tick grid
(major ticks are drawn longer than minor ticks and than the frame border, so
they're distinguishable by pixel length) and calibrating from that true
0.2 GeV tick spacing anchored at `x_left`, instead of the frame border. A
sanity check raises an error if the tick-based and frame-based scales
disagree by more than 15%, to catch future axis-detection failures outright.

## Known digitization issue #3 (fixed): like-sign taller than unlike-sign

After window normalisation, several centralities (especially **0–5%** and
**10–20%**) had `like[i] > unlike[i]` in most bins. In the app that looked
wrong: blue background bars sat **above** the red unlike-sign bars across
large sideband ranges, while on the published figures the two series nearly
overlap with like-sign typically at or slightly below unlike-sign
(S/B ≈ 1% in the most central class).

**Cause.** Unlike and like markers are digitized independently (filled red
vs open blue). At S/B ≈ 1% the vertical separation is only ~1–2 pixels, so
noise easily flips which series is higher. Independent absolute scaling to
published \(N_\text{total}\) / \(N_\text{bkg}\) in `[2.9, 3.2)` then locks
that bad relative shape into the sidebands.

**Fix.** After normalisation, apply a didactic clamp in `digitize_minv.py`:

```text
like[i] = min(like[i], unlike[i])
```

**Pedagogy vs paper.** Real histograms can show a few bins with like slightly
above unlike from Poisson fluctuations; the clamp removes those too. For the
MasterClass that is intentional: students should see a clean
“unlike ≈ like + small excess” picture before subtract/fit, not systematic
negative sideband residuals from digitization. Trade-off: window sum of like
can drop a little below the printed \(N_\text{bkg}\) (residual in the window
then slightly above \(N_\text{total} - N_\text{bkg}\)). The `published`
block still stores the original paper numbers for comparison.

Each JSON records the clamp in `source.calibration`.

---

## Related work

- Track-level Pb–Pb conversion attempt: branch `j/psi-exercise-pb-pb-dataset`
  (converter `data/jpsi/inspect_ao2d.C`, physics check `data/jpsi/jpsi_physics_check.py`)
- Large Scale Analysis strangeness exercise: uses `FitService` with unbinned `LSAData`
- pp / p–Pb track-level datasets: `src/assets/exercises/jpsi/manifest.json`
