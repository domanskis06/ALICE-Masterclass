import { PbPbCentralityId } from './jpsi-raa.models';

/**
 * Physics constants for the R_AA calculation. Full provenance in `ci/docs/jpsi-analysis-teacher.md`.
 *
 *  - <Npart> / <Ncoll>: Glauber MC table for Pb-Pb at sqrt(sNN) = 5.02 TeV
 *    (ALICE centrality determination note CDS 2636623 / user-supplied table screenshot).
 *    The exercise's 0-5, 5-10, 10-20, 20-30, 30-40 and 40-50% classes match published bins
 *    exactly; 50-70% and 70-90% are plain averages of the four underlying 5%-wide bins.
 *
 *  - Acc x epsilon (full acceptance x efficiency, PID included, BEFORE the branching-ratio
 *    and mass-window corrections applied separately below), used in
 *    Yield = signal / ((A x epsilon) * epsilon_window * BR_ee * nEvents):
 *      * Pb-Pb: Fig. 25 (A x epsilon w/o PID, ~0.126, flat vs centrality) times Fig. 31
 *        (PID efficiency) from ALICE-ANA-2020-xxx (`pid-efficiency.pdf`); cross-checked
 *        against ~6.5% in 0-10% from arXiv:2303.13361.
 *      * pp: 9.9% at 5.02 TeV midrapidity dielectron (arXiv:1905.07211); same number at
 *        13 TeV (arXiv:2108.01906).
 *      * p-Pb: 8.9% at 5.02 TeV midrapidity dielectron (arXiv:1503.07179).
 *
 *  - BR_JPSI_EE: every Acc x epsilon above is a detector-level number (acceptance, tracking,
 *    PID) for the dielectron decay; it does NOT include the branching ratio. The measured
 *    signals are dielectron counts, so BR_JPSI_EE must be divided out separately to turn
 *    them into inclusive (all-channel) J/psi yields, comparable to PP_YIELD_5_02_TEV_REF below.
 *
 *  - PP_YIELD_5_02_TEV_REF: a FIXED, physically-sourced pp reference yield used as the R_AA
 *    denominator - confirmed with the physics supervisors as the intended design for this
 *    exercise, not a stopgap. See "Why a fixed pp reference?" in
 *    `ci/docs/jpsi-analysis-teacher.md` for the full reasoning. In short: R_AA compares two
 *    different collision systems and does not require them to be measured at the same
 *    collision energy (the earlier assumption that a 7-to-5.02 TeV energy mismatch was the
 *    core problem was wrong - the supervisors confirmed R_AA does not scale with energy that
 *    way, and even theoretical R_AA predictions mix Pb-Pb at 5.02 TeV with pp at other
 *    energies). The actual reason the student's own pp/p-Pb measurement cannot be the R_AA
 *    denominator is that the exercise sample is deliberately enriched in J/psi so fitting a
 *    visible peak is possible in the time available - the same simplification the Strangeness
 *    Large Scale Analysis module already uses for its own fixed pp reference yields
 *    (`LsaEnhancementService`). The student's pp/p-Pb submission is still accepted by this
 *    exercise, but is not shown in the teacher Results table and never feeds R_AA.
 *
 *  - epsilon_window (JPSI_MASS_MEAN_GEV / JPSI_MASS_SIGMA_GEV / JPSI_REFERENCE_MASS_WINDOW /
 *    the window-efficiency clamp bounds): a mass-window safety net. The Acc x epsilon
 *    constants above are implicitly calibrated to a specific analysis mass window
 *    (JPSI_REFERENCE_MASS_WINDOW). If a student picks a narrower or wider window, the
 *    fraction of the true J/psi peak they capture changes, and Acc x epsilon should change
 *    with it - otherwise a narrow window silently underestimates the yield (and R_AA) and
 *    a wide one overestimates it. `JpsiRaaService.windowEfficiencyFactor` models this with a
 *    single representative Gaussian peak shape; see "Mass-window safety net" in
 *    `ci/docs/jpsi-analysis-teacher.md`.
 *
 * A per-J/psi pT is not available in the student app (`JpsiPairingService` stores only the
 * invariant-mass bin), so every Acc x epsilon constant is a single pT-integrated number.
 */

export const PBPB_NPART: Readonly<Record<PbPbCentralityId, number>> = {
  pbPb_0_5: 383.4,
  pbPb_5_10: 331.2,
  pbPb_10_20: 262,
  pbPb_20_30: 187.9,
  pbPb_30_40: 130.8,
  pbPb_40_50: 87.14,
  pbPb_50_70: 42.65,
  pbPb_70_90: 11.34,
};

export const PBPB_NCOLL: Readonly<Record<PbPbCentralityId, number>> = {
  pbPb_0_5: 1763,
  pbPb_5_10: 1382,
  pbPb_10_20: 973.4,
  pbPb_20_30: 592.7,
  pbPb_30_40: 343.8,
  pbPb_40_50: 185.7,
  pbPb_50_70: 65.95,
  pbPb_70_90: 10.88,
};

/**
 * Full Acc x epsilon (acceptance x tracking x mass window x PID) per Pb-Pb centrality.
 * = Acc x epsilon(w/o PID, Fig. 25 ≈ 0.126) x PID(Fig. 31).
 */
export const PBPB_ACC_EFF: Readonly<Record<PbPbCentralityId, number>> = {
  pbPb_0_5: 0.066,
  pbPb_5_10: 0.07,
  pbPb_10_20: 0.074,
  pbPb_20_30: 0.077,
  pbPb_30_40: 0.079,
  pbPb_40_50: 0.08,
  pbPb_50_70: 0.081,
  pbPb_70_90: 0.082,
};

/** Full Acc x epsilon for pp at midrapidity (dielectron). Same 9.9% at 5.02 and 13 TeV. */
export const PP_ACC_EFF = 0.099;

/** Full Acc x epsilon for p-Pb at 5.02 TeV midrapidity (dielectron). */
export const PPB_ACC_EFF = 0.089;

/** J/psi -> e+e- branching ratio (PDG). Divides out of every measured dielectron signal. */
export const BR_JPSI_EE = 0.0597;

/** Published midrapidity inclusive J/psi cross section at 5.02 TeV (arXiv:1905.07211). */
export const PP_DSIGDY_5_02_TEV_UB = 5.64; // dσ/dy (|y|<0.9), in μb
export const PP_MIDRAP_DY = 1.8; // |y|<0.9

/**
 * pp inelastic cross section at 5.02 TeV, in mb. ALICE has not published a direct
 * measurement at this energy (see arXiv:1509.03893 discussion); this is a log-interpolation
 * in sqrt(s) between the two nearest ALICE-measured energies from arXiv:1208.4968
 * (Eur. Phys. J. C 73 (2013) 2456): 62.8 mb at 2.76 TeV and 73.2 mb at 7 TeV. Flagged as an
 * approximation, not a direct measurement.
 */
export const PP_SIGMA_INEL_5_02_TEV_MB = 69;

/**
 * FIXED physical pp reference yield: inclusive J/psi per pp inelastic event at 5.02 TeV,
 * midrapidity (|y|<0.9). Used directly as the R_AA denominator's pp term - see the
 * "PP_YIELD_5_02_TEV_REF" bullet in the header comment above and
 * "Why a fixed physical pp reference (temporary)?" in `ci/docs/jpsi-analysis-teacher.md`.
 * ≈ 1.47e-4.
 */
export const PP_YIELD_5_02_TEV_REF =
  (PP_DSIGDY_5_02_TEV_UB * PP_MIDRAP_DY * 1e-6) / (PP_SIGMA_INEL_5_02_TEV_MB * 1e-3);

/** PDG J/psi mass, GeV/c^2. */
export const JPSI_MASS_MEAN_GEV = 3.0969;

/**
 * Representative Gaussian width (GeV/c^2) of the reconstructed dielectron J/psi mass peak.
 * A single pT- and system-independent approximation, NOT a fitted per-system detector
 * resolution - see "Mass-window safety net" in `ci/docs/jpsi-analysis-teacher.md`.
 */
export const JPSI_MASS_SIGMA_GEV = 0.075;

/**
 * The invariant-mass window ALICE's own dielectron J/psi analyses use to extract the signal
 * (cross-checked against EPJ Web Conf. 171, 18018 (2018): "the signal is extracted in the
 * invariant mass window 2.92 < m_ee < 3.16 GeV/c^2"). The Acc x epsilon constants above are
 * implicitly calibrated against this window, so it is also the reference window for
 * `JpsiRaaService.windowEfficiencyFactor`.
 */
export const JPSI_REFERENCE_MASS_WINDOW: readonly [number, number] = [2.92, 3.16];

/**
 * Clamp bounds for the mass-window efficiency factor, so a pathologically narrow or wide
 * student window cannot blow up or zero out the corrected yield. With the Gaussian model
 * above, the largest possible ratio (a window wide enough to capture the whole peak, divided
 * by the reference window's own fraction) is ~1.26, so MAX_WINDOW_EFFICIENCY is set below
 * that natural ceiling to guarantee the clamp is actually reachable.
 */
export const MIN_WINDOW_EFFICIENCY = 0.2;
export const MAX_WINDOW_EFFICIENCY = 1.2;
