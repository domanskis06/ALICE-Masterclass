import { PbPbCentralityId } from './jpsi-raa.models';

/**
 * Physics constants for the R_AA calculation. Full provenance in `ci/docs/jpsi-analysis-teacher.md`.
 *
 *  - <Npart> / <Ncoll>: Glauber MC table for Pb-Pb at sqrt(sNN) = 5.02 TeV
 *    (ALICE centrality determination note CDS 2636623 / user-supplied table screenshot).
 *    The exercise's 0-5, 5-10, 10-20, 20-30, 30-40 and 40-50% classes match published bins
 *    exactly; 50-70% and 70-90% are plain averages of the four underlying 5%-wide bins.
 *
 *  - Acc x epsilon (full acceptance x efficiency including PID), used in
 *    Yield = signal / ((A x epsilon) * nEvents):
 *      * Pb-Pb: Fig. 25 (A x epsilon w/o PID, ~0.126, flat vs centrality) times Fig. 31
 *        (PID efficiency) from ALICE-ANA-2020-xxx (`pid-efficiency.pdf`); cross-checked
 *        against ~6.5% in 0-10% from arXiv:2303.13361.
 *      * pp: 9.9% at 5.02 TeV midrapidity dielectron (arXiv:1905.07211); same number at
 *        13 TeV (arXiv:2108.01906).
 *      * p-Pb: 8.9% at 5.02 TeV midrapidity dielectron (arXiv:1503.07179).
 *
 *  - PP_ENERGY_SCALE_7_TO_5_02: the student pp sample is at 7 TeV, while Pb-Pb is at
 *    5.02 TeV. R_AA uses the student Acc x epsilon-corrected pp yield rescaled by
 *    sigma_J/psi(5.02) / sigma_J/psi(7) so the absolute R_AA scale matches a same-energy
 *    reference, while session-to-session variation from the student measurement is kept.
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

/** Published midrapidity inclusive J/psi cross sections used only for the energy rescaling. */
export const PP_DSIGDY_5_02_TEV_UB = 5.64; // arXiv:1905.07211, dσ/dy (|y|<0.9)
export const PP_SIGMA_7_TEV_MIDRAP_UB = 12.4; // arXiv:1105.0380, σ(|y|<0.9)
export const PP_MIDRAP_DY = 1.8; // |y|<0.9

/**
 * Multiplies the student Acc x epsilon-corrected pp yield before it enters R_AA:
 * Y_pp_ref(5.02) = Y_pp_student(7) x PP_ENERGY_SCALE_7_TO_5_02.
 * ≈ 0.819 — R_AA would otherwise be ~18% too low from the energy mismatch alone.
 */
export const PP_ENERGY_SCALE_7_TO_5_02 =
  (PP_DSIGDY_5_02_TEV_UB * PP_MIDRAP_DY) / PP_SIGMA_7_TEV_MIDRAP_UB;
