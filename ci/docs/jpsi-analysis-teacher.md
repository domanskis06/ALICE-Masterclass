# J/psi analysis — teacher module (R_AA)

Teacher-side counterpart to the student [J/psi analysis](jpsi-analysis.md) exercise: turns the
J/psi yield students measure in Pb-Pb collisions into the nuclear modification factor R_AA as a
function of Pb-Pb centrality, using a **fixed, published pp reference yield** rather than the
student's own pp/p-Pb measurement (see "Why a fixed pp reference?" below).

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
  jpsi-raa.models.ts       collision-system ids, raw signal input (incl. mass window), result row, plot entry
  jpsi-raa.constants.ts    Ncoll / Npart / Acc×ε / BR / fixed pp reference / mass-window model
  jpsi-raa.service.ts      JpsiRaaService — corrected yield, mass-window safety net, R_AA
  jpsi-analysis.component.{ts,html,scss}   shell: Event dropdown, sample data, wiring
  raa-plot/                R_AA vs. <Npart> scatter (D3-on-SVG, modelled on the LSA enhancement plot)
  results/                 Results table (Collision system, Npart, N events, signal, A×ε,
                            yield, Ncoll, R_AA) - Pb-Pb rows only, see "The calculation" below
  instructions/            Help panel (yield/R_AA formulas rendered with KaTeX)
```

## The calculation

```
epsilon_window(system)  = windowEfficiencyFactor(massWindow) - see "Mass-window safety net" below
Yield(system)            = signal / ((A × ε)(system) × epsilon_window(system) × BR_ee × nEvents)
R_AA(centrality)         = Yield(Pb-Pb, centrality) / (Ncoll(centrality) × PP_YIELD_5_02_TEV_REF)
```

`signal` and its Poisson error are exactly `SummaryRow.signal`/`signalError` (pp, p-Pb) or
`PbPbYieldRow.fit.signal`/`signalError` (Pb-Pb) from the student app's residual-fit yield
extraction — see [`jpsi-analysis.md`](jpsi-analysis.md). `massWindow` is the mass window that
signal was extracted from. R_AA's statistical error is just the Pb-Pb signal's relative
Poisson error — see "Why a fixed pp reference?" below for why the pp side never contributes a
statistical term.

**Only the eight Pb-Pb centrality rows are shown in the teacher Results table.** Students still
analyse and submit pp and p-Pb signals as part of the exercise (`JpsiRaaService.computeResults`
happily computes a row for them, same as for Pb-Pb), but `JpsiAnalysisComponent` filters those
rows out before they reach `ResultsComponent` — see "Why a fixed pp reference?" below for why
showing them next to a fixed-reference R_AA would be misleading. This was a deliberate decision
by the physics supervisors, not an oversight.

### Why a fixed pp reference?

**This is the confirmed, intended design for this exercise** (per direct guidance from the
physics supervisors), not a temporary stopgap pending better data.

An earlier version of this reasoning assumed the core problem was an *energy* mismatch — the
student pp exercise runs at a different beam energy than the Pb-Pb sample, so a 7→5.02 TeV
rescaling factor was applied to the student's own pp yield before using it as the R_AA
denominator. **This was wrong, and has been removed.** R_AA compares two fundamentally
different collision systems (pp vs. Pb-Pb); it does not need them measured at the same
collision energy to be physically meaningful, and even theoretical R_AA predictions routinely
compare Pb-Pb at 5.02 TeV against pp at other energies. The supervisors were explicit that
R_AA does not "scale" with energy the way that earlier reasoning assumed, and that any such
mismatch is a minor effect, not the dominant one.

The actual, dominant problem is that the student pp/p-Pb exercise sample is not a minimum-bias
sample: it is deliberately enriched in J/psi so that fitting a visible peak is possible in the
time available for the exercise. Its per-event J/psi rate is many orders of magnitude higher
than a real pp collision's — regardless of what energy it was measured at. This is exactly the
same simplification the **Strangeness Large Scale Analysis** module already makes: its teacher
and student-side enhancement calculations (`LsaEnhancementService`) compare the (artificially
amplified) student Pb-Pb sample against **fixed, published pp yield constants**
(`PP_YIELD_KAON`, `PP_YIELD_LAMBDA`), never against a student pp measurement, for exactly this
reason. This module now follows the same established pattern.

Using the enriched student sample's own corrected yield as the R_AA denominator was tried and
sanity-checked against the screenshotted student signals: it produces R_AA ≈ 1e-5 across
every centrality class — unphysical (published ALICE mid-rapidity inclusive J/psi R_AA at
5.02 TeV is of order 0.6–0.9). The problem is not the Pb-Pb side, the mass window, or Ncoll —
it is that the pp denominator is inflated by roughly the same enrichment factor that makes
the exercise fittable, so it cannot double as an absolute-scale reference, no matter what
energy it is nominally measured at.

R_AA therefore divides by a **fixed** reference yield, `PP_YIELD_5_02_TEV_REF`, computed from a
published pp cross section rather than from any per-session student measurement. 5.02 TeV is
used simply because it is the Pb-Pb sample's own collision energy and the most directly
comparable published pp cross section — not because matching energies is a hard physical
requirement:

\[
Y_{\mathrm{pp}}^{\mathrm{ref}}
= \frac{(\mathrm{d}\sigma/\mathrm{d}y)_{5.02}\cdot \Delta y}{\sigma_{\mathrm{INEL}}(5.02\,\mathrm{TeV})}
= \frac{5.64\cdot 1.8}{69}
\approx 1.47\times 10^{-4}
\]

(inclusive J/psi per pp inelastic event, |y|<0.9; [arXiv:1905.07211](https://arxiv.org/abs/1905.07211)
for the cross section, see the σ_INEL source below.) Re-running the sanity check with this
fixed reference (and the branching-ratio fix below) gives R_AA in the **0.3–0.6** range across
centrality classes for the screenshotted student signals — the right order of magnitude and,
critically, no longer collapsing to zero.

Students can still analyse and submit their own pp/p-Pb signal as part of the exercise (that
part of the lesson — extracting a signal from a busier, harder pp/p-Pb sample — is unaffected),
but per the supervisors' decision that submission is **not shown in the teacher Results table**
and **never enters R_AA**, now or in a future round with a real per-session data flow.

### Branching ratio

`(A × ε)` for every system is a **detector-level** number (acceptance, tracking, PID) for the
dielectron decay — it does not include the branching ratio. The measured `signal` values are
therefore dielectron counts, not inclusive J/psi counts, while `PP_YIELD_5_02_TEV_REF` above
is an inclusive (all-channel) yield. `BR_JPSI_EE` (J/psi → e⁺e⁻, PDG) converts every
corrected yield to the same inclusive basis before it is used anywhere, including R_AA. This
was a missing factor in the original implementation, caught during the same sanity check that
motivated the fixed pp reference above.

### Mass-window safety net

`(A × ε)` is implicitly calibrated to a specific analysis mass window
(`JPSI_REFERENCE_MASS_WINDOW`, see below). If a student's chosen mass window is narrower or
wider than that, the fraction of the true J/psi peak they actually capture changes — a
narrower window silently loses signal (and Acc×ε doesn't know to compensate), a wider one
picks up more of the peak (plus more background) than Acc×ε assumes.

`JpsiRaaService.windowEfficiencyFactor` guards against this by modelling the J/psi peak as a
single Gaussian (`JPSI_MASS_MEAN_GEV` = 3.0969 GeV/c², the PDG mass; `JPSI_MASS_SIGMA_GEV` =
75 MeV/c², a representative width — **not** a per-system fitted detector resolution) and
computing the ratio of the peak fraction inside the student's window to the peak fraction
inside `JPSI_REFERENCE_MASS_WINDOW`. A student who uses the reference window gets a factor of
exactly 1 (no change from before this feature existed); the factor is clamped to
`[MIN_WINDOW_EFFICIENCY, MAX_WINDOW_EFFICIENCY]` = `[0.2, 1.2]` so a pathologically narrow or
wide window cannot blow up or zero out the corrected yield. This is a safety net, not a
precise detector-resolution correction — it exists to stop window choice from silently biasing
R_AA, not to model the real per-centrality mass resolution.

All current `SAMPLE_SIGNALS` use `JPSI_REFERENCE_MASS_WINDOW` (they are digitized/published
numbers already calibrated to it), so this factor is inert — exactly 1 — until real,
variable-window student submissions exist.

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
- **BR_JPSI_EE** — J/psi → e⁺e⁻ branching ratio, 5.97% (PDG).
- **PP_YIELD_5_02_TEV_REF** — built from:
  - dσ/dy(J/psi, 5.02 TeV, |y|<0.9) = 5.64 μb
    ([arXiv:1905.07211](https://arxiv.org/abs/1905.07211));
  - σ_INEL(pp, 5.02 TeV) ≈ 69 mb — ALICE has not published a direct measurement at this
    energy ([arXiv:1509.03893](https://ar5iv.labs.arxiv.org/html/1509.03893) discusses why pp
    σ_INEL at LHC energies is model-dependent); this value log-interpolates in √s between the
    two nearest ALICE-measured energies from
    [arXiv:1208.4968](https://link.springer.com/article/10.1140/epjc/s10052-013-2456-0)
    (Eur. Phys. J. C 73 (2013) 2456): 62.8 mb at 2.76 TeV and 73.2 mb at 7 TeV. Flagged in code
    as an approximation, not a direct measurement.
- **JPSI_MASS_MEAN_GEV / JPSI_MASS_SIGMA_GEV / JPSI_REFERENCE_MASS_WINDOW** — PDG J/psi mass
  (3.0969 GeV/c²); a single representative Gaussian width (75 MeV/c², an approximation, see
  above); reference window 2.92–3.16 GeV/c², matching the window ALICE's own dielectron J/psi
  analyses use ("the signal is extracted in the invariant mass window 2.92 < m_ee <
  3.16 GeV/c²" — EPJ Web Conf. 171, 18018 (2018)).
- Neither system can use a pT-binned correction: `JpsiPairingService` never stores pair pT.

---

## Known limitations / next steps

- **The student's pp/p-Pb measurement does not affect R_AA and is not shown in the Results
  table.** This is by design, confirmed with the physics supervisors — see "Why a fixed pp
  reference?" above — not a stopgap awaiting a better pp sample. Students still analyse and
  submit pp/p-Pb signals; the exercise just does not otherwise use that submission here.
- **The mass-window safety net is a single generic Gaussian**, not a per-system/per-centrality
  fitted resolution. It is good enough to stop window choice from silently biasing the yield,
  not to model the real detector response.
- **σ_INEL(pp, 5.02 TeV) is interpolated**, not directly measured by ALICE. If a better sourced
  value becomes available, `PP_SIGMA_INEL_5_02_TEV_MB` should be updated.
- **R_AA's statistical error only propagates the Pb-Pb signal's Poisson error.** The fixed pp
  reference's own published uncertainties (on the cross section and on σ_INEL) are not
  currently propagated.

---

## Why layout only

Wiring this up to real student submissions needs a `jpsi_analysis`/`jpsi_analysis_results`
Django endpoint pair (PUT from the student app, GET-by-event from here), which does not exist.
Adding it now would also mean deciding how sessions/events are split across the three planned
sub-masterclasses (strangeness, R_AA/LSA, J/psi) — out of scope for this round, so this module
ships as layout with sample data:

- `JpsiAnalysisComponent` keeps a hard-coded `SAMPLE_SIGNALS` array (Pb-Pb numbers reuse the
  published yields/event counts already bundled with the student exercise's JSON assets; pp/p-Pb
  reuse the cross-checked example from the student module's README).
- The `Event` dropdown **is** wired to the real, generic `ApiService.getEvents()` (same call
  LSA/VSA use), so the UI looks and behaves like the rest of the teacher app. Selecting an
  event does not fetch per-event results (there is nothing to fetch yet) — it reshuffles the
  sample numbers within a small, deterministically-seeded margin, so the page visibly reacts
  the way it will once real per-event submissions exist.
- The Results table's subtitle (`JPSI_ANALYSIS.SAMPLE_DATA_NOTE`) makes the sample-data status
  explicit in the UI, mirroring the student app's `JPSI.RESULTS.UPLOAD_SOON`.
