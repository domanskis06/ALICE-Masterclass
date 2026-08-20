import { buildEventExplorationSubmission, calcRaa, meanOf } from './raa-calc';

describe('raa-calc', () => {
  it('computes R_AA = M_PbPb / (M_pp * N_coll)', () => {
    expect(calcRaa(100, 10, 5)).toBeCloseTo(2, 6);
  });

  it('returns 0 when inputs are not positive', () => {
    expect(calcRaa(0, 10, 5)).toBe(0);
    expect(calcRaa(10, 0, 5)).toBe(0);
    expect(calcRaa(10, 10, 0)).toBe(0);
  });

  it('meanOf handles empty and filled lists', () => {
    expect(meanOf([])).toBe(0);
    expect(meanOf([2, 4])).toBe(3);
  });
});

describe('buildEventExplorationSubmission', () => {
  const record = (role: string, multiplicity: number, pts: number[]) => ({ role, multiplicity, pts });

  it('averages the pp baseline, all-p_T and p_T > 1 GeV/c alike', () => {
    const submission = buildEventExplorationSubmission(
      [
        record('pp276TeV', 10, [0.5, 1.5, 2.5]),
        record('pp276TeV', 20, [0.5, 0.5, 1.5, 1.5]),
        record('pbPbCentral', 100, [0.5, 1.5, 1.5, 1.5]),
      ],
      { pbPbCentral: 10 },
    );

    expect(submission.ppEvents).toBe(2);
    expect(submission.meanPpMultiplicity).toBeCloseTo(15, 6);
    // pp events see 2 and 2 tracks above 1 GeV/c respectively.
    expect(submission.meanPpMultiplicityMinPt).toBeCloseTo(2, 6);

    expect(submission.classes).toEqual([
      {
        eventClass: 'pbPbCentral',
        nColl: 10,
        multiplicity: 100,
        multiplicityMinPt: 3,
        raa: calcRaa(100, 15, 10),
        raaMinPt: calcRaa(3, 2, 10),
      },
    ]);
  });

  it('omits a class missing its event, its N_coll, or the pp baseline', () => {
    const withEvent = [record('pp276TeV', 10, []), record('pbPbPeripheral', 5, [])];

    expect(buildEventExplorationSubmission(withEvent, {}).classes).toEqual([]);
    expect(buildEventExplorationSubmission(withEvent, { pbPbPeripheral: 0 }).classes).toEqual([]);
    expect(
      buildEventExplorationSubmission([record('pbPbPeripheral', 5, [])], { pbPbPeripheral: 3 })
        .classes,
    ).toEqual([]);
    expect(
      buildEventExplorationSubmission(withEvent, { pbPbSemiCentral: 3 }).classes,
    ).toEqual([]);
  });

  it('is a no-op on an empty analysis', () => {
    expect(buildEventExplorationSubmission([], {})).toEqual({
      ppEvents: 0,
      meanPpMultiplicity: 0,
      meanPpMultiplicityMinPt: 0,
      classes: [],
    });
  });
});
