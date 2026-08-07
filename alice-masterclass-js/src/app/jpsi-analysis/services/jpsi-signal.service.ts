import { Injectable } from '@angular/core';

import {
  MASS_BINS,
  MASS_BIN_WIDTH,
  MASS_XMIN,
  MassHistograms,
  SignalResult,
} from '../models/jpsi.models';

/**
 * Extracts the J/psi yield with the classic like-sign method:
 *
 *   N = max(0, U - L),  B = L,  S/B = N / B,  significance = N / sqrt(N + B)
 *
 * where U counts opposite-charge pairs in the mass window and L counts same-charge pairs
 * in the same window.
 */
@Injectable()
export class JpsiSignalService {
  compute(mass: MassHistograms, window: [number, number]): SignalResult {
    const [firstBin, lastBin] = this.windowToBins(window);

    let unlikeSum = 0;
    let likeSum = 0;

    for (let bin = firstBin; bin < lastBin; bin++) {
      unlikeSum += mass.unlike[bin];
      likeSum += mass.posPos[bin] + mass.negNeg[bin];
    }

    const signal = Math.max(0, unlikeSum - likeSum);
    const signalError = Math.sqrt(unlikeSum + likeSum);
    const denominator = signal + likeSum;

    return {
      windowMin: window[0],
      windowMax: window[1],
      unlikeSum,
      likeSum,
      signal,
      signalError,
      signalToBackground: likeSum > 0 ? signal / likeSum : null,
      significance: denominator > 0 ? signal / Math.sqrt(denominator) : 0,
    };
  }

  /**
   * Series drawn after subtraction. Bins that fluctuate below zero are shown as zero
   * because a negative bar confuses students.
   *
   * This clamp is presentation only. compute() sums the raw histograms, so the reported
   * N and B are unaffected by it.
   */
  residualSeries(mass: MassHistograms): Float64Array {
    const residual = new Float64Array(MASS_BINS);
    for (let bin = 0; bin < MASS_BINS; bin++) {
      residual[bin] = Math.max(0, mass.unlike[bin] - mass.posPos[bin] - mass.negNeg[bin]);
    }
    return residual;
  }

  /** Same-charge pairs added up: the object the student actually subtracts. */
  backgroundSeries(mass: MassHistograms): Float64Array {
    const background = new Float64Array(MASS_BINS);
    for (let bin = 0; bin < MASS_BINS; bin++) {
      background[bin] = mass.posPos[bin] + mass.negNeg[bin];
    }
    return background;
  }

  /** Half-open bin range [first, last) covered by the window. */
  private windowToBins(window: [number, number]): [number, number] {
    const first = Math.round((window[0] - MASS_XMIN) / MASS_BIN_WIDTH);
    const last = Math.round((window[1] - MASS_XMIN) / MASS_BIN_WIDTH);

    return [
      Math.min(MASS_BINS, Math.max(0, first)),
      Math.min(MASS_BINS, Math.max(0, last)),
    ];
  }
}
