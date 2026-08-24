import { Injectable } from '@angular/core';

import { PbPbCentralityId, PbPbYieldRow, PBPB_CENTRALITY_IDS } from '../jpsi-analysis/models/pbpb-minv.models';

/**
 * Physics constants for the R_AA calculation, ported from the teacher app
 * (`alice-masterclass-teacher/src/app/jpsi-analysis/jpsi-raa.constants.ts`). Full provenance in
 * `ci/docs/jpsi-analysis-teacher.md`.
 *
 *  - <Npart> / <Ncoll>: Glauber MC table for Pb-Pb at sqrt(sNN) = 5.02 TeV
 *    (ALICE centrality determination note CDS 2636623 / user-supplied table screenshot).
 *
 *  - Acc x epsilon (full acceptance x efficiency, PID included), used in
 *    Yield = signal / ((A x epsilon) * BR_ee * nEvents):
 *      * Pb-Pb: Fig. 25 (A x epsilon w/o PID, ~0.126, flat vs centrality) times Fig. 31
 *        (PID efficiency) from ALICE-ANA-2020-xxx (`pid-efficiency.pdf`).
 *
 *  - BR_JPSI_EE: every Acc x epsilon above is a detector-level number for the dielectron decay;
 *    it does not include the branching ratio, so the measured (dielectron) signals must be
 *    divided by it to become inclusive J/psi yields, comparable to PP_YIELD_5_02_TEV_REF below.
 *
 *  - PP_YIELD_5_02_TEV_REF: a FIXED, physically-sourced pp reference yield used as the R_AA
 *    denominator, not the student's own pp/p-Pb measurement — same simplification the Strangeness
 *    Large Scale Analysis module already uses for its own fixed pp reference yields
 *    (`LsaEnhancementService`). See "Why a fixed pp reference?" in
 *    `ci/docs/jpsi-analysis-teacher.md` for the full reasoning.
 *
 * `PbPbCentralityId`/`PBPB_CENTRALITY_IDS` are the student app's own types (`pbpb-minv.models.ts`)
 * — not re-declared here, unlike the teacher app which has its own copy.
 */
export const PBPB_NEVENTS: Readonly<Record<PbPbCentralityId, number>> = {
  pbPb_0_5: 40090000,
  pbPb_5_10: 40070000,
  pbPb_10_20: 18140000,
  pbPb_20_30: 18180000,
  pbPb_30_40: 39760000,
  pbPb_40_50: 39830000,
  pbPb_50_70: 36480000,
  pbPb_70_90: 36380000,
};

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

/** Full Acc x epsilon (acceptance x tracking x mass window x PID) per Pb-Pb centrality. */
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

/** J/psi -> e+e- branching ratio (PDG). Divides out of every measured dielectron signal. */
export const BR_JPSI_EE = 0.0597;

/** Published midrapidity inclusive J/psi cross section at 5.02 TeV (arXiv:1905.07211). */
const PP_DSIGDY_5_02_TEV_UB = 5.64; // dσ/dy (|y|<0.9), in μb
const PP_MIDRAP_DY = 1.8; // |y|<0.9

/**
 * pp inelastic cross section at 5.02 TeV, in mb — log-interpolation between the two nearest
 * ALICE-measured energies (arXiv:1208.4968): 62.8 mb at 2.76 TeV and 73.2 mb at 7 TeV.
 */
const PP_SIGMA_INEL_5_02_TEV_MB = 69;

/**
 * FIXED physical pp reference yield: inclusive J/psi per pp inelastic event at 5.02 TeV,
 * midrapidity (|y|<0.9). Used directly as the R_AA denominator's pp term. ≈ 1.47e-4.
 */
export const PP_YIELD_5_02_TEV_REF =
  (PP_DSIGDY_5_02_TEV_UB * PP_MIDRAP_DY * 1e-6) / (PP_SIGMA_INEL_5_02_TEV_MB * 1e-3);

/** One row of the demo Results table — always one per Pb-Pb centrality, in ascending order. */
export interface JpsiRaaResultRow {
  centralityId: PbPbCentralityId;
  centralityLabel: string;
  nParticipants: number;
  nColl: number;
  nEvents: number;
  signal: number;
  signalError: number;
  /** Acc x epsilon for this centrality. */
  efficiency: number;
  correctedYield: number;
  raa: number;
  raaError: number;
  /** False for a centrality the student has not accepted a fit for yet (all-zero row). */
  measured: boolean;
}

/** One point of the R_AA vs. N_participants plot. */
export interface JpsiRaaPlotEntry {
  centralityId: PbPbCentralityId;
  centralityLabel: string;
  nParticipants: number;
  raa: number;
  raaError: number;
  /** False for a centrality the student has not accepted a fit for yet — plot hides these. */
  measured: boolean;
}

/**
 * Turns accepted Pb-Pb fits into the R_AA summary a teacher would normally show to the class
 * (`alice-masterclass-teacher/src/app/jpsi-analysis/jpsi-raa.service.ts`), computed entirely
 * client-side from the student's own accepted rows.
 *
 * R_AA(centrality) = Yield(centrality) / (Ncoll(centrality) x PP_YIELD_5_02_TEV_REF)
 * Yield(centrality) = signal / ((A x epsilon) x BR_ee x nEvents)
 *
 * Pure computation: bins without an accepted fit stay at zero (`measured: false`) so the table
 * never shows NaN and the plot/table layout never jumps around as the student works through
 * centralities — same contract as `LsaEnhancementService.buildRows`.
 */
@Injectable({ providedIn: 'root' })
export class JpsiRaaService {
  buildRows(accepted: ReadonlyMap<PbPbCentralityId, PbPbYieldRow>): JpsiRaaResultRow[] {
    return PBPB_CENTRALITY_IDS.map((id) => {
      const row = accepted.get(id);
      const signal = row?.fit.signal ?? 0;
      const signalError = row?.fit.signalError ?? 0;
      const nEvents = PBPB_NEVENTS[id];
      const efficiency = PBPB_ACC_EFF[id];
      const nColl = PBPB_NCOLL[id];

      const correctedYield = this.correctedYield(signal, efficiency, nEvents);
      const raa = this.raa(correctedYield, nColl);
      const raaError = signal > 0 ? raa * (signalError / signal) : 0;

      return {
        centralityId: id,
        centralityLabel: row?.centralityLabel ?? this.fallbackLabel(id),
        nParticipants: PBPB_NPART[id],
        nColl,
        nEvents,
        signal,
        signalError,
        efficiency,
        correctedYield,
        raa,
        raaError,
        measured: signal > 0,
      };
    });
  }

  buildPlotEntries(rows: readonly JpsiRaaResultRow[]): JpsiRaaPlotEntry[] {
    return rows.map((row) => ({
      centralityId: row.centralityId,
      centralityLabel: row.centralityLabel,
      nParticipants: row.nParticipants,
      raa: row.raa,
      raaError: row.raaError,
      measured: row.measured,
    }));
  }

  /** X range of the plot, with a small margin around the fixed participant numbers. */
  participantsDomain(): [number, number] {
    const values = PBPB_CENTRALITY_IDS.map((id) => PBPB_NPART[id]);
    return [0, Math.max(...values) * 1.1];
  }

  private correctedYield(signal: number, efficiency: number, nEvents: number): number {
    if (!(signal > 0) || nEvents <= 0 || efficiency <= 0) {
      return 0;
    }
    return signal / (efficiency * BR_JPSI_EE * nEvents);
  }

  private raa(correctedYield: number, nColl: number): number {
    if (!(correctedYield > 0) || nColl <= 0 || PP_YIELD_5_02_TEV_REF <= 0) {
      return 0;
    }
    return correctedYield / (nColl * PP_YIELD_5_02_TEV_REF);
  }

  /** Used only before a centrality has ever loaded its published label (should not happen in practice). */
  private fallbackLabel(id: PbPbCentralityId): string {
    return id.replace('pbPb_', 'Pb-Pb ').replace('_', '-') + '%';
  }
}
