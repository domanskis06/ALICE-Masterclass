import { Injectable } from '@angular/core';

import {
  PBPB_ACC_EFF,
  PBPB_NCOLL,
  PBPB_NPART,
  PP_ACC_EFF,
  PP_ENERGY_SCALE_7_TO_5_02,
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
 * R_AA(centrality) = Yield_PbPb(centrality) / (Ncoll(centrality) x Yield_pp_ref)
 *
 * where Yield = signal / ((A x epsilon) x nEvents), and Yield_pp_ref is the student
 * Acc x epsilon-corrected pp yield (7 TeV sample) rescaled to 5.02 TeV by
 * PP_ENERGY_SCALE_7_TO_5_02. p-Pb is shown in the Results table only as a reference row
 * and does not enter R_AA (see `ci/docs/jpsi-analysis-teacher.md`).
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
    return signal.signal / (efficiency * signal.nEvents);
  }

  /**
   * pp reference used in R_AA: student Acc x epsilon-corrected yield at 7 TeV, rescaled
   * to the Pb-Pb collision energy of 5.02 TeV. The Results table still shows the unscaled
   * student yield.
   */
  ppReferenceYieldForRaa(pp: JpsiRawSignal): number {
    return this.correctedYield(pp) * PP_ENERGY_SCALE_7_TO_5_02;
  }

  /** Builds one Results-table row per submitted signal, computing R_AA for Pb-Pb rows only. */
  computeResults(signals: readonly JpsiRawSignal[]): JpsiResultRow[] {
    const pp = signals.find((s) => s.system === 'pp') ?? null;
    const ppYieldForRaa = pp ? this.ppReferenceYieldForRaa(pp) : 0;

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
      if (pp && ppYieldForRaa > 0 && nColl) {
        raa = correctedYield / (nColl * ppYieldForRaa);
        raaError = raa * this.relativeStatError(signal, pp);
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

  /** Quadrature sum of the Poisson-error contributions from the Pb-Pb and the pp signal. */
  private relativeStatError(pbPb: JpsiRawSignal, pp: JpsiRawSignal): number {
    const pbPbTerm = pbPb.signal > 0 ? pbPb.signalError / pbPb.signal : 0;
    const ppTerm = pp.signal > 0 ? pp.signalError / pp.signal : 0;
    return Math.sqrt(pbPbTerm * pbPbTerm + ppTerm * ppTerm);
  }
}
