import { Injectable } from '@angular/core';

import {
  BR_JPSI_EE,
  PBPB_ACC_EFF,
  PBPB_NCOLL,
  PBPB_NPART,
  PP_ACC_EFF,
  PP_YIELD_5_02_TEV_REF,
  PPB_ACC_EFF,
} from './jpsi-raa.constants';
import {
  CollisionSystemId,
  JpsiRawSignal,
  JpsiRaaPlotEntry,
  JpsiResultRow,
  PbPbCentralityId,
  collisionSystemLabel,
  isPbPbCentrality,
} from './jpsi-raa.models';

/**
 * Turns the raw J/psi signals submitted per collision system into the numbers the teacher
 * Results table and the R_AA plot need.
 *
 * R_AA(centrality) = Yield_PbPb(centrality) / (Ncoll(centrality) x PP_YIELD_5_02_TEV_REF)
 *
 * where Yield = signal / ((A x epsilon) x BR_ee x nEvents):
 *  - (A x epsilon) is the base, centrality-dependent detector Acc x efficiency, calibrated
 *    against the fixed-width mass window the student app locks the signal window to
 *    (`SIGNAL_WINDOW_WIDTH`/`PBPB_SIGNAL_WINDOW_WIDTH`), so no runtime mass-window correction
 *    is needed - see "Mass-window safety net" in `ci/docs/jpsi-analysis-teacher.md`;
 *  - BR_ee converts the measured dielectron count into an inclusive J/psi yield.
 *
 * PP_YIELD_5_02_TEV_REF is a FIXED, physically-sourced pp reference yield (not derived from
 * the student's own pp measurement - see `jpsi-raa.constants.ts` and
 * `ci/docs/jpsi-analysis-teacher.md`, "Why a fixed pp reference?"). `computeResults` still
 * computes a row for every submitted signal, including pp/p-Pb (so nothing breaks once real
 * per-session pp/p-Pb submissions exist) - but `JpsiAnalysisComponent` only ever passes the
 * Pb-Pb rows on to the teacher Results table, since pp/p-Pb never feed R_AA and showing them
 * next to a fixed-reference R_AA would be misleading.
 */
@Injectable()
export class JpsiRaaService {
  efficiencyFor(system: CollisionSystemId): number {
    if (isPbPbCentrality(system)) {
      return PBPB_ACC_EFF[system];
    }
    return system === 'pp' ? PP_ACC_EFF : PPB_ACC_EFF;
  }

  correctedYield(signal: JpsiRawSignal): number {
    const efficiency = this.efficiencyFor(signal.system);
    if (signal.nEvents <= 0 || efficiency <= 0) {
      return 0;
    }
    return signal.signal / (efficiency * BR_JPSI_EE * signal.nEvents);
  }

  /** Builds one Results-table row per submitted signal, computing R_AA for Pb-Pb rows only. */
  computeResults(signals: readonly JpsiRawSignal[]): JpsiResultRow[] {
    return signals.map((signal) => {
      const system = signal.system;
      const correctedYield = this.correctedYield(signal);

      let nColl: number | null = null;
      let nParticipants: number | null = null;
      if (isPbPbCentrality(system)) {
        nColl = PBPB_NCOLL[system];
        nParticipants = PBPB_NPART[system];
      }

      let raa: number | null = null;
      let raaError: number | null = null;
      if (nColl && PP_YIELD_5_02_TEV_REF > 0) {
        raa = correctedYield / (nColl * PP_YIELD_5_02_TEV_REF);
        raaError = raa * this.relativeStatError(signal);
      }

      const row: JpsiResultRow = {
        system: signal.system,
        systemLabel: collisionSystemLabel(signal.system),
        nParticipants,
        nColl,
        nEvents: signal.nEvents,
        signal: signal.signal,
        signalError: signal.signalError,
        efficiency: this.efficiencyFor(signal.system),
        correctedYield,
        raa,
        raaError,
      };
      return row;
    });
  }

  /** Points for the central R_AA-vs-Npart plot: only rows that got an R_AA above. */
  toPlotEntries(rows: readonly JpsiResultRow[]): JpsiRaaPlotEntry[] {
    return rows
      .filter((row): row is JpsiResultRow & { raa: number; raaError: number; nParticipants: number } =>
        isPbPbCentrality(row.system) && row.raa !== null && row.raaError !== null && row.nParticipants !== null
      )
      .map((row) => ({
        centralityId: row.system as PbPbCentralityId,
        centralityLabel: row.systemLabel,
        nParticipants: row.nParticipants,
        raa: row.raa,
        raaError: row.raaError,
      }));
  }

  /**
   * Relative statistical error on R_AA: just the Pb-Pb signal's relative Poisson error, since
   * the pp reference is now a fixed constant rather than a second measured signal. The
   * published uncertainty on that fixed reference itself is not propagated here.
   */
  private relativeStatError(pbPb: JpsiRawSignal): number {
    return pbPb.signal > 0 ? pbPb.signalError / pbPb.signal : 0;
  }
}
