import { Injectable } from '@angular/core';

import {
  BR_JPSI_EE,
  JPSI_MASS_MEAN_GEV,
  JPSI_MASS_SIGMA_GEV,
  JPSI_REFERENCE_MASS_WINDOW,
  MAX_WINDOW_EFFICIENCY,
  MIN_WINDOW_EFFICIENCY,
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
 * where Yield = signal / ((A x epsilon) x epsilon_window x BR_ee x nEvents):
 *  - (A x epsilon) is the base, centrality-dependent detector Acc x efficiency;
 *  - epsilon_window is a mass-window safety-net factor (see `windowEfficiencyFactor`) that
 *    rescales (A x epsilon) for how much of the J/psi peak the student's own mass window
 *    captures, relative to the window the (A x epsilon) constants were calibrated against;
 *  - BR_ee converts the measured dielectron count into an inclusive J/psi yield.
 *
 * PP_YIELD_5_02_TEV_REF is a FIXED, physically-sourced pp reference yield (not derived from
 * the student's own pp measurement - see `jpsi-raa.constants.ts` and
 * `ci/docs/jpsi-analysis-teacher.md`, "Why a fixed physical pp reference (temporary)?"). The
 * student's pp/p-Pb rows are still shown in the Results table with their own corrected yield,
 * but only as a reference - they do not enter the R_AA formula.
 */
@Injectable()
export class JpsiRaaService {
  efficiencyFor(system: CollisionSystemId): number {
    if (isPbPbCentrality(system)) {
      return PBPB_ACC_EFF[system];
    }
    return system === 'pp' ? PP_ACC_EFF : PPB_ACC_EFF;
  }

  /**
   * Fraction of the J/psi peak (modelled as a single representative Gaussian, see
   * `jpsi-raa.constants.ts`) captured by `window`, relative to the fraction captured by
   * `JPSI_REFERENCE_MASS_WINDOW` (the window the Acc x epsilon constants are calibrated
   * against). Equal to 1 when `window` is the reference window; clamped so a pathologically
   * narrow or wide student window cannot blow up or zero out the corrected yield.
   */
  windowEfficiencyFactor(window: readonly [number, number]): number {
    const peakFraction = (range: readonly [number, number]): number => {
      const cdf = (mass: number): number =>
        standardNormalCdf((mass - JPSI_MASS_MEAN_GEV) / JPSI_MASS_SIGMA_GEV);
      return cdf(range[1]) - cdf(range[0]);
    };

    const referenceFraction = peakFraction(JPSI_REFERENCE_MASS_WINDOW);
    if (referenceFraction <= 0) {
      return 1;
    }

    const factor = peakFraction(window) / referenceFraction;
    return Math.min(MAX_WINDOW_EFFICIENCY, Math.max(MIN_WINDOW_EFFICIENCY, factor));
  }

  correctedYield(signal: JpsiRawSignal): number {
    const efficiency = this.effectiveEfficiency(signal);
    if (signal.nEvents <= 0 || efficiency <= 0) {
      return 0;
    }
    return signal.signal / (efficiency * BR_JPSI_EE * signal.nEvents);
  }

  /** Base Acc x epsilon times the mass-window correction - what `correctedYield` actually divides by. */
  private effectiveEfficiency(signal: JpsiRawSignal): number {
    return this.efficiencyFor(signal.system) * this.windowEfficiencyFactor(signal.massWindow);
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
        windowFactor: this.windowEfficiencyFactor(signal.massWindow),
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

/**
 * Standard normal CDF via the Abramowitz-Stegun 7.1.26 approximation (max error ~1.5e-7).
 * No existing dependency in this app provides erf/normal CDF, and the mass-window safety net
 * only needs a peak-shape *ratio*, so this level of precision is more than sufficient.
 */
function standardNormalCdf(z: number): number {
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;

  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

  return 0.5 * (1 + sign * y);
}
