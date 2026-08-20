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

/** Charged tracks with p_T over this are the "min p_T" variant everywhere in
 * Event Exploration (histograms, the R_AA Analysis tab). Kept here too so the
 * submission payload cannot drift from what the student sees on screen. */
export const RAA_MIN_PT = 1;

/** One centrality class going into the submitted payload. */
export interface RaaEventExplorationClassEntry {
  eventClass: 'pbPbPeripheral' | 'pbPbSemiCentral' | 'pbPbCentral';
  nColl: number;
  multiplicity: number;
  multiplicityMinPt: number;
  raa: number;
  raaMinPt: number;
}

/** Body of a `PUT /nuclear_modification_event_exploration/<student>/` submission. */
export interface RaaEventExplorationSubmission {
  ppEvents: number;
  meanPpMultiplicity: number;
  meanPpMultiplicityMinPt: number;
  classes: RaaEventExplorationClassEntry[];
}

const PBPB_CLASS_KEYS: RaaEventExplorationClassEntry['eventClass'][] = [
  'pbPbPeripheral',
  'pbPbSemiCentral',
  'pbPbCentral',
];

/**
 * Reduces the analysed events (the same records the R_AA Analysis tab already
 * holds) into a teacher-submittable payload. Recomputes R_AA rather than
 * reading it off `NmfAnalysisPanelComponent`, because that component only
 * carries the all-p_T figure — this also derives the p_T > 1 GeV/c variant the
 * desktop instructor tool expects, from the same accepted-track p_T lists, so
 * the two figures can never drift apart from what is drawn on screen.
 *
 * A class is left out of `classes` when it is not yet ready (no pp baseline,
 * no event analysed for it, or no N_coll figure) — the endpoint accepts a
 * partial list and a later re-submission replaces the row wholesale.
 */
export function buildEventExplorationSubmission(
  records: ReadonlyArray<{ role: string; multiplicity: number; pts: number[] }>,
  nCollPart1: Record<string, number>,
): RaaEventExplorationSubmission {
  const ppRecords = records.filter((r) => r.role === 'pp276TeV');
  const meanPpMultiplicity = meanOf(ppRecords.map((r) => r.multiplicity));
  const meanPpMultiplicityMinPt = meanOf(
    ppRecords.map((r) => r.pts.filter((pt) => pt > RAA_MIN_PT).length),
  );

  const classes: RaaEventExplorationClassEntry[] = [];
  for (const key of PBPB_CLASS_KEYS) {
    const rec = records.find((r) => r.role === key);
    const nColl = nCollPart1[key] ?? 0;
    if (!rec || nColl <= 0 || meanPpMultiplicity <= 0) {
      continue;
    }
    const multiplicityMinPt = rec.pts.filter((pt) => pt > RAA_MIN_PT).length;
    classes.push({
      eventClass: key,
      nColl,
      multiplicity: rec.multiplicity,
      multiplicityMinPt,
      raa: calcRaa(rec.multiplicity, meanPpMultiplicity, nColl),
      raaMinPt: calcRaa(multiplicityMinPt, meanPpMultiplicityMinPt, nColl),
    });
  }

  return {
    ppEvents: ppRecords.length,
    meanPpMultiplicity,
    meanPpMultiplicityMinPt,
    classes,
  };
}
