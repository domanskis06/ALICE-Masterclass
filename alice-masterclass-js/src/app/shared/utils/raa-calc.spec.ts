import { calcRaa, meanOf, rmsOf } from './raa-calc';

describe('raa-calc', () => {
  it('computes R_AA = M_PbPb / (M_pp * N_coll)', () => {
    const { raa } = calcRaa(100, 10, 5, 10, 1);
    expect(raa).toBeCloseTo(2, 6);
  });

  it('returns zeros when inputs are not positive', () => {
    expect(calcRaa(0, 10, 5, 0, 1)).toEqual({ raa: 0, dRaa: 0 });
    expect(calcRaa(10, 0, 5, 1, 0)).toEqual({ raa: 0, dRaa: 0 });
  });

  it('meanOf / rmsOf handle empty and single values', () => {
    expect(meanOf([])).toBe(0);
    expect(meanOf([2, 4])).toBe(3);
    expect(rmsOf([])).toBe(0);
    expect(rmsOf([4])).toBe(2);
  });
});
