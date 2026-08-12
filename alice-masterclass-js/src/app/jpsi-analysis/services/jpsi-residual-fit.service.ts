import { Injectable } from '@angular/core';

/**
 * Result of fitting a first-degree polynomial (Pol1) to the residual background outside the
 * signal window, then counting the excess inside it. No Gaussian, no Monte Carlo template —
 * the signal is the student's chosen mass window, not a fitted curve (see
 * `alice-masterclass-js/src/assets/exercises/jpsi/minv/README.md`, "Intended exercise workflow").
 */
export interface ResidualFitResult {
  backgroundFitRange: [number, number];
  signalWindow: [number, number];
  /** [a, b] such that the residual background is modelled as f(m) = a + b*m. */
  pol1: [number, number];
  /** Sum of the (unclamped) residual bins inside the signal window. */
  total: number;
  /** Sum of floor(f(bin center)) inside the signal window — the residual sideband alone. */
  residualBackground: number;
  /**
   * Sum of the combinatorial (like-sign) series inside the signal window — the background
   * already removed by the like-sign subtraction, before this Pol1 fit ever ran.
   */
  combinatorialBackground: number;
  /**
   * round(residualBackground + combinatorialBackground): the *total* background under the
   * unlike-sign peak. This — not `residualBackground` alone — is what S/B and significance are
   * computed against, otherwise both look artificially good: the like-sign subtraction already
   * removed most of the background before the student ever sees the residual.
   */
  background: number;
  /** round(total - residualBackground). */
  signal: number;
  /** round(sqrt(max(0, total))) — Poisson error on the observed count in the window. */
  signalError: number;
  /** null when background is zero and the ratio is undefined. */
  signalToBackground: number | null;
  significance: number;
}

/**
 * Fits the residual (unlike-sign minus like-sign) left after combinatorial-background
 * subtraction. Used identically by pp/p-Pb (fixed binning) and every Pb-Pb centrality
 * (per-histogram binning), since both hand this service already-binned per-bin counts plus
 * their own (xmin, xmax, bins) — no dataset-specific knowledge lives here.
 */
@Injectable()
export class JpsiResidualFitService {
  /**
   * @param values Residual per bin, UNCLAMPED (negative fluctuations must stay negative here,
   *   or the fit would be systematically biased upward — clamping to zero is presentation-only,
   *   applied by callers when they draw the bars, never before this fit).
   */
  fitPol1(
    values: Float64Array | number[],
    xmin: number,
    xmax: number,
    bins: number,
    backgroundFitRange: [number, number],
    signalWindow: [number, number],
    /**
     * Combinatorial (like-sign) background already subtracted out of `values` before this fit
     * — e.g. posPos+negNeg for pp/p-Pb, or the like-sign histogram for Pb-Pb. Defaults to all
     * zero so callers that only care about the residual step (e.g. most unit tests) keep working.
     */
    combinatorial: Float64Array | number[] = []
  ): ResidualFitResult {
    const binWidth = (xmax - xmin) / bins;
    const binCenter = (i: number): number => xmin + (i + 0.5) * binWidth;

    const toBinRange = (range: [number, number]): [number, number] => {
      const a = Math.max(0, Math.min(bins, Math.round((range[0] - xmin) / binWidth)));
      const b = Math.max(0, Math.min(bins, Math.round((range[1] - xmin) / binWidth)));
      return a <= b ? [a, b] : [b, a];
    };

    const [bgLo, bgHi] = toBinRange(backgroundFitRange);
    const [sigLo, sigHi] = toBinRange(signalWindow);

    // Weighted linear regression in closed form — Pol1 has no local minima to get stuck in,
    // so there is no optimizer, no starting point and no way for the fit to fail to converge.
    let sw = 0;
    let swx = 0;
    let swy = 0;
    let swxx = 0;
    let swxy = 0;

    for (let i = bgLo; i < bgHi; i++) {
      // Sideband fit: the signal window is excluded from the background fit itself, exactly
      // like the sideband pattern in the shared LSA FitService.
      if (i >= sigLo && i < sigHi) {
        continue;
      }
      const y = values[i];
      const x = binCenter(i);
      const w = 1 / Math.max(1, Math.abs(y));
      sw += w;
      swx += w * x;
      swy += w * y;
      swxx += w * x * x;
      swxy += w * x * y;
    }

    let a = 0;
    let b = 0;
    const denom = sw * swxx - swx * swx;
    if (sw > 0) {
      if (Math.abs(denom) > 1e-9) {
        b = (sw * swxy - swx * swy) / denom;
        a = (swy - b * swx) / sw;
      } else {
        // Degenerate sideband (e.g. a single bin): fall back to a flat line through it.
        a = swy / sw;
        b = 0;
      }
    }

    let total = 0;
    let residualBackground = 0;
    let combinatorialBackground = 0;
    // A tiny epsilon guards against floating-point noise (e.g. an exact-integer background
    // landing on 9.999999999999998 from the closed-form sums above) flooring one whole unit
    // too low; real histogram counts are never close enough to an integer boundary for this
    // to matter, so it never changes a genuine floor.
    for (let i = sigLo; i < sigHi; i++) {
      total += values[i];
      residualBackground += Math.floor(a + b * binCenter(i) + 1e-9);
      combinatorialBackground += combinatorial[i] ?? 0;
    }

    // Both counts are rounded to whole events — see `signal`/`background` doc comments — so S/B
    // and significance are computed from the same integers the student sees on screen.
    const signal = Math.round(total - residualBackground);
    const background = Math.round(residualBackground + combinatorialBackground);
    const signalError = Math.round(Math.sqrt(Math.max(0, total)));
    const signalToBackground = background > 0 ? signal / background : null;
    const significanceDenominator = signal + background;

    return {
      backgroundFitRange,
      signalWindow,
      pol1: [a, b],
      total,
      residualBackground,
      combinatorialBackground,
      background,
      signal,
      signalError,
      signalToBackground,
      significance: significanceDenominator > 0 ? signal / Math.sqrt(significanceDenominator) : 0,
    };
  }
}
