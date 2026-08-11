# Published Pb–Pb Minv histograms (Fig. 15)

Binned unlike-sign / like-sign invariant-mass histograms digitized from
Figure 15 of *Inclusive J/ψ analysis notes from 2018 data* (ALICE), for the
MasterClass workflow: show U+L → subtract background → fit residual (LSA-style).

## Files

| File | Centrality |
| --- | --- |
| `pbPb_50_70.json` | 50–70% |
| `pbPb_70_90.json` | 70–90% |
| `manifest.json` | index |

## Provenance

- Source PDF (local copy): `data/jpsi/minv_digitize/pb-pb-jpsi.pdf`
- Render: `pdftoppm -png -r 300`
- Digitization: per-bin vertical strips on the **top** panels only (Python script in
  `data/jpsi/minv_digitize/digitize_fig15.py`)
- Absolute scale: each series is scaled so the sum in \([2.9, 3.2)\) matches the
  published \(N_\mathrm{total}\) / \(N_\mathrm{bkg}\) boxes on the figure. Shapes
  come from the markers; the residual in that window is therefore
  \(N_\mathrm{total}-N_\mathrm{bkg}\) (close to, but not identical with, the
  fitted \(N_{J/\psi}\) on the figure).

## Schema

See the JSON files: `unlike` / `like` count arrays, `binCenters`, optional
Poisson `unlikeErr` / `likeErr`, `published` metadata, and `fitHint` for the
LSA Gauss+poly fit. Residual \(U-L\) is computed at runtime — not stored.
