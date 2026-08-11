# Published Pb–Pb J/ψ invariant-mass histograms

Binned unlike-sign and like-sign dielectron invariant-mass spectra digitized from
**Figure 15** of the ALICE analysis note:

> *Inclusive J/ψ analysis notes from 2018 Pb–Pb data*
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
ALICE results.

---

## Files

| File | Content |
| --- | --- |
| `pbPb_50_70.json` | 50–70% centrality histogram |
| `pbPb_70_90.json` | 70–90% centrality histogram |
| `manifest.json` | Index listing available histograms |
| `README.md` | This file |

---

## Provenance & digitization pipeline

### Source

- PDF: `data/jpsi/minv_digitize/pb-pb-jpsi.pdf` (local copy of the ALICE note)
- Figure 15, **top panels only** (unlike-sign and like-sign m_ee spectra)
- Two centrality classes: 50–70% and 70–90%

### Steps

1. **Render PDF → PNG at 300 DPI**
   ```bash
   cd data/jpsi/minv_digitize/
   pdftoppm -png -r 300 pb-pb-jpsi.pdf fig15
   cp fig15-1.png fig15-300dpi.png
   ```

2. **Digitize with Python** (`digitize_fig15.py`)
   - Opens the 300 DPI raster
   - Locates axes for each panel via pixel colour detection (axis lines)
   - For each 0.04 GeV bin, scans a vertical strip to find the marker centroid
     (unlike-sign = black/dark markers, like-sign = red markers)
   - Converts pixel y-coordinate → entry count using the panel's y-axis scale

3. **Absolute normalisation**
   - Raw digitized counts are proportional but not perfectly scaled
   - Each series is rescaled so that the **sum in the signal window [2.9, 3.2) GeV**
     matches the published values printed on the figure:
     - Unlike-sign sum → \(N_\text{total}\)
     - Like-sign sum → \(N_\text{bkg}\)
   - This ensures the residual \(U - L\) in the signal window equals
     \(N_\text{total} - N_\text{bkg}\), consistent with published \(N_{J/\psi}\)

4. **Output** → JSON files in `src/assets/exercises/jpsi/minv/`

### Reproduction

```bash
cd alice-masterclass-js/data/jpsi/minv_digitize/
python3 -m venv .venv && source .venv/bin/activate
pip install Pillow
python digitize_fig15.py
```

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
    "figure": 15,
    "localPdf": "data/jpsi/minv_digitize/pb-pb-jpsi.pdf",
    "url": "https://...",
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
| `published` block | Allows validation: student's fit yield can be compared to ALICE result |
| `fitHint` | Seeds the Gauss+poly fitter with reasonable starting parameters |
| Separate files per centrality | Smaller payloads; manifest enables lazy loading |
| Poisson errors stored | Enables error bars on histograms and χ² in fit |

---

## Intended exercise workflow

1. Student selects a centrality class (50–70% or 70–90%)
2. Application displays unlike-sign and like-sign histograms overlaid
3. Student clicks **"Subtract background"** → residual \(R_i = U_i - L_i\) is shown
4. Student selects signal and background fit ranges (sliders, LSA-style)
5. Student clicks **"Fit"** → Gauss + polynomial is fitted to the residual
6. Result: extracted J/ψ yield compared to the published value

---

## Related work

- Track-level Pb–Pb conversion attempt: branch `j/psi-exercise-pb-pb-dataset`
  (converter `data/jpsi/inspect_ao2d.C`, physics check `data/jpsi/jpsi_physics_check.py`)
- Large Scale Analysis strangeness exercise: uses `FitService` with unbinned `LSAData`
- pp / p–Pb track-level datasets: `src/assets/exercises/jpsi/manifest.json`
