import { calcRaa, meanOf } from './raa-calc';

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
