/** Desktop `Raa::CalcRaa(MeanPbPb, MeanPP, Correction, PbPbRMS, PPRMS)`. */
export interface RaaValue {
  raa: number;
  dRaa: number;
}

/**
 * Integrated R_AA with a simple relative-error combination, matching
 * `Raa::CalcRaa` in the classic MasterClass library.
 */
export function calcRaa(
  meanPbPb: number,
  meanPP: number,
  nColl: number,
  pbPbRms: number,
  ppRms: number,
): RaaValue {
  if (!(meanPbPb > 0) || !(meanPP > 0) || !(nColl > 0)) {
    return { raa: 0, dRaa: 0 };
  }
  const raa = meanPbPb / (meanPP * nColl);
  if (!(raa > 0) || !Number.isFinite(raa)) {
    return { raa: 0, dRaa: 0 };
  }
  const relPb = pbPbRms / meanPbPb;
  const relPp = ppRms / meanPP;
  if (!Number.isFinite(relPb) || !Number.isFinite(relPp)) {
    return { raa, dRaa: 0 };
  }
  const dRaa = raa * Math.sqrt(relPb * relPb + relPp * relPp);
  return {
    raa,
    dRaa: Number.isFinite(dRaa) ? dRaa : 0,
  };
}

/** Sample mean of a list (0 if empty). */
export function meanOf(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sample RMS (population stddev) — 0 for fewer than 2 points. */
export function rmsOf(values: number[]): number {
  if (values.length < 2) {
    return values.length === 1 ? Math.sqrt(Math.max(values[0], 0)) : 0;
  }
  const m = meanOf(values);
  const varSum = values.reduce((acc, v) => acc + (v - m) * (v - m), 0);
  return Math.sqrt(varSum / values.length);
}
