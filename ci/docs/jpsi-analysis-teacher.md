# J/psi analysis — teacher module (R_AA)

Teacher-side counterpart to the student [J/psi analysis](jpsi-analysis.md) exercise: combines
the J/psi yields students measure in pp, p-Pb and Pb-Pb collisions into the nuclear
modification factor R_AA as a function of Pb-Pb centrality.

| | |
| --- | --- |
| **Module** | `alice-masterclass-teacher/src/app/jpsi-analysis/` |
| **Route** | `/jpsi-analysis` |
| **Nav** | `NAV.JPSI` / `NAV.JPSI_ANALYSIS` — "R_AA Analysis" |
| **Status** | **Layout only.** Results are hard-coded sample data; there is no
`jpsi_analysis`/`jpsi_analysis_results` endpoint in the Django API yet, and no student→teacher
data flow. See "Why layout only" below. |

Architecture reminder (`.cursor/rules/architecture.mdc`): the R_AA/yield math lives in
`JpsiRaaService`, not in the component.

---

## Layout

Same shape as the [Large Scale Analysis](../../alice-masterclass-teacher/src/app/strangeness-large-scale-analysis/)
module it was modelled on: an `Event` dropdown card-title projected into a D3 plot, and a
Material results table underneath.

```
jpsi-analysis/
  jpsi-raa.models.ts       collision-system ids, raw signal input, result row, plot entry
  jpsi-raa.constants.ts    Ncoll / Npart / Acc×ε / pp energy-scale factor
  jpsi-raa.service.ts      JpsiRaaService — corrected yield, energy-rescaled pp reference, R_AA
  jpsi-analysis.component.{ts,html,scss}   shell: Event dropdown, sample data, wiring
  raa-plot/                R_AA vs. <Npart> scatter (D3-on-SVG, modelled on the LSA enhancement plot)
  results/                 Results table (Collision system, Npart, N events, signal, A×ε,
                            yield, Ncoll, R_AA)
  instructions/            Help panel (yield/R_AA formulas rendered with KaTeX)
```

## The calculation

```
Yield(system)      = signal / ((A × ε)(system) * nEvents)
Yield_pp_ref       = Yield(pp) * f_{7→5.02}
R_AA(centrality)   = Yield(Pb-Pb, centrality) / (Ncoll(centrality) * Yield_pp_ref)
```

`signal` and its Poisson error are exactly `SummaryRow.signal`/`signalError` (pp, p-Pb) or
`PbPbYieldRow.fit.signal`/`signalError` (Pb-Pb) from the student app's residual-fit yield
extraction — see [`jpsi-analysis.md`](jpsi-analysis.md). R_AA's statistical error is the
quadrature sum of the relative Poisson errors on the Pb-Pb and the pp signal (the energy
scale factor is treated as exact).

The Results table **Yield** column shows the unscaled Acc×ε-corrected student yield. Only the
value that enters R_AA is energy-rescaled.

**p-Pb is not part of the R_AA formula.** It is shown in the Results table purely as a
reference row (its own Acc×ε-corrected yield, no R_AA/Ncoll).

### Why scale the pp yield?

The student pp sample is at **7 TeV**; Pb-Pb (and p-Pb) are at **5.02 TeV**. A rigorous
R_AA needs the pp reference at the same per-nucleon energy as Pb-Pb. Until a midrapidity
pp @ 5.02 TeV TPC sample is available for the exercise,

\[
f_{7\to 5.02}
= \frac{(\mathrm{d}\sigma/\mathrm{d}y)_{5.02}\cdot \Delta y}{\sigma_{7}(|y|<0.9)}
= \frac{5.64\cdot 1.8}{12.4}
\approx 0.819
\]

([arXiv:1905.07211](https://arxiv.org/abs/1905.07211), [arXiv:1105.0380](https://arxiv.org/abs/1105.0380)).
Student measurements still drive event-to-event R_AA differences; only the absolute scale is
brought in line with a same-energy reference. The UI surfaces this under Results
(`ENERGY_SCALE_NOTE`) and in the Instructions panel.

Without the scale, R_AA would be systematically ~18% too low.

---

## Where the constants come from

`jpsi-raa.constants.ts` has the full citation in its header comment; summary:

- **⟨Npart⟩ / ⟨Ncoll⟩** — Glauber MC table for Pb-Pb at √s_NN = 5.02 TeV
  ([CDS 2636623](https://cds.cern.ch/record/2636623/files/centrality%20determination%20note.pdf)).
  Classes 0–5 … 40–50% match published rows; 50–70% and 70–90% are averages of four 5%-wide
  sub-bins.
- **Pb-Pb Acc×ε** — Fig. 25 (Acc×ε without PID, ≈0.126, flat vs centrality) × Fig. 31 (PID)
  from ALICE-ANA-2020-xxx (`pid-efficiency.pdf`); ≈0.066–0.082 across centrality. Cross-check:
  ~6.5% in 0–10% from [arXiv:2303.13361](https://arxiv.org/abs/2303.13361).
- **pp Acc×ε** — 9.9% midrapidity dielectron ([arXiv:1905.07211](https://arxiv.org/abs/1905.07211);
  same number at 13 TeV in [arXiv:2108.01906](https://arxiv.org/abs/2108.01906)).
- **p-Pb Acc×ε** — 8.9% midrapidity dielectron ([arXiv:1503.07179](https://arxiv.org/abs/1503.07179)).
- **f_{7→5.02}** — see above.
- Neither system can use a pT-binned correction: `JpsiPairingService` never stores pair pT.

---

## Why layout only

Wiring this up to real student submissions needs a `jpsi_analysis`/`jpsi_analysis_results`
Django endpoint pair (PUT from the student app, GET-by-event from here), which does not exist.
Adding it now would also mean deciding how sessions/events are split across the three planned
sub-masterclasses (strangeness, R_AA/LSA, J/psi) — out of scope for this round, so this module
ships as layout with sample data:

- `JpsiAnalysisComponent` keeps a hard-coded `SAMPLE_SIGNALS` array (Pb-Pb numbers reuse the
  published yields already bundled with the student exercise's JSON assets; pp/p-Pb reuse the
  cross-checked example from the student module's README).
- The `Event` dropdown **is** wired to the real, generic `ApiService.getEvents()` (same call
  LSA/VSA use), so the UI looks and behaves like the rest of the teacher app. Selecting an
  event does not fetch per-event results (there is nothing to fetch yet) — it reshuffles the
  sample numbers within a small, deterministically-seeded margin, so the page visibly reacts
  the way it will once real per-event submissions exist.
- The Results table's subtitle (`JPSI_ANALYSIS.SAMPLE_DATA_NOTE`) makes the sample-data status
  explicit in the UI, mirroring the student app's `JPSI.RESULTS.UPLOAD_SOON`.
