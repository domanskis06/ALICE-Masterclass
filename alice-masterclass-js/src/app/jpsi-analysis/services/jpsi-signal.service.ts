import { Injectable } from '@angular/core';

import { MASS_BINS, MassHistograms } from '../models/jpsi.models';

/**
 * Builds the residual (unlike-sign minus like-sign) drawn on the mass panel. The actual J/psi
 * yield is no longer computed here: `JpsiResidualFitService.fitPol1` fits the residual
 * background outside the signal window and counts the excess inside it (see
 * `alice-masterclass-js/src/assets/exercises/jpsi/minv/README.md`).
 */
@Injectable()
export class JpsiSignalService {
  /**
   * Series drawn after subtraction. Bins that fluctuate below zero are shown as zero because
   * a negative bar confuses students. Presentation only — the Pol1 fit reads `rawResidualSeries`
   * instead, so a downward fluctuation clamped to zero here never biases the fit upward.
   */
  residualSeries(mass: MassHistograms): Float64Array {
    const residual = new Float64Array(MASS_BINS);
    for (let bin = 0; bin < MASS_BINS; bin++) {
      residual[bin] = Math.max(0, mass.unlike[bin] - mass.posPos[bin] - mass.negNeg[bin]);
    }
    return residual;
  }

  /** Same as `residualSeries`, but unclamped — what `JpsiResidualFitService.fitPol1` fits. */
  rawResidualSeries(mass: MassHistograms): Float64Array {
    const residual = new Float64Array(MASS_BINS);
    for (let bin = 0; bin < MASS_BINS; bin++) {
      residual[bin] = mass.unlike[bin] - mass.posPos[bin] - mass.negNeg[bin];
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
}
