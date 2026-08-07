/**
 * Integrated R_AA = M_PbPb / (M_pp * ⟨N_coll⟩).
 * Returns 0 when any input is not positive.
 */
export function calcRaa(meanPbPb: number, meanPP: number, nColl: number): number {
  if (!(meanPbPb > 0) || !(meanPP > 0) || !(nColl > 0)) {
    return 0;
  }
  const raa = meanPbPb / (meanPP * nColl);
  return raa > 0 && Number.isFinite(raa) ? raa : 0;
}

/** Sample mean of a list (0 if empty). */
export function meanOf(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}
