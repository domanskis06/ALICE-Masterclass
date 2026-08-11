/**
 * Shared colour tokens for J/psi Minv histograms, used by both the track-based mass panel
 * (pp/p-Pb) and the published Pb-Pb U/L panel: `unlike` is always opposite-charge pairs,
 * `background`/`posPos`/`negNeg` are always same-charge (combinatorial background).
 */
export const SERIES_COLOURS = {
  unlike: '#e53935',
  posPos: '#1e88e5',
  negNeg: '#43a047',
  background: '#f9a825',
  residual: '#fb8c00',
} as const;
