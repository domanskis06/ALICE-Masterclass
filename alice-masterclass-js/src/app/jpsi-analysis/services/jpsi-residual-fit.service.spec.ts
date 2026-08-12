import { TestBed } from '@angular/core/testing';

import { JpsiResidualFitService } from './jpsi-residual-fit.service';

describe('JpsiResidualFitService', () => {
  let service: JpsiResidualFitService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [JpsiResidualFitService] });
    service = TestBed.inject(JpsiResidualFitService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('fits a flat residual as a constant line with zero excess signal', () => {
    // 10 bins from 0 to 10, all flat at 50.
    const values = new Float64Array(10).fill(50);

    const result = service.fitPol1(values, 0, 10, 10, [0, 10], [4, 6]);

    expect(result.pol1[0]).toBeCloseTo(50, 6);
    expect(result.pol1[1]).toBeCloseTo(0, 6);
    expect(result.total).toBe(100); // 2 bins * 50
    expect(result.background).toBe(100);
    expect(result.signal).toBe(0);
  });

  it('recovers a known rectangular excess inside the signal window', () => {
    // Flat sidebands at 10, plus +20 excess in the 5 window bins (indices 4..8).
    const values = new Float64Array(20).fill(10);
    for (let i = 4; i < 9; i++) {
      values[i] = 30;
    }

    const result = service.fitPol1(values, 0, 20, 20, [0, 20], [4, 9]);

    expect(result.pol1[0]).toBeCloseTo(10, 3);
    expect(result.pol1[1]).toBeCloseTo(0, 3);
    expect(result.total).toBe(150); // 5 * 30
    expect(result.background).toBe(50); // 5 * 10
    expect(result.signal).toBe(100); // 5 * 20 excess
    expect(result.signalToBackground).toBeCloseTo(2, 6);
    expect(result.significance).toBeCloseTo(100 / Math.sqrt(150), 6);
  });

  it('fits a sloped background correctly (b != 0)', () => {
    const bins = 10;
    const values = new Float64Array(bins);
    for (let i = 0; i < bins; i++) {
      // f(x) = 5 + 2x, sampled at bin centers, no noise.
      const x = i + 0.5;
      values[i] = 5 + 2 * x;
    }

    const result = service.fitPol1(values, 0, bins, bins, [0, bins], [4, 5]);

    expect(result.pol1[0]).toBeCloseTo(5, 6);
    expect(result.pol1[1]).toBeCloseTo(2, 6);
    // Window is a single bin (index 4) fully inside the sideband fit's own line -> no excess.
    expect(result.signal).toBeCloseTo(0, 6);
  });

  it('ignores bins outside the background fit range, unlike a full-axis fit', () => {
    const bins = 10;
    const values = new Float64Array(bins).fill(20);
    // Corrupt the tail bins the way digitized Pb-Pb histograms sometimes are (zero edges).
    values[8] = 0;
    values[9] = 0;

    const withTail = service.fitPol1(values, 0, bins, bins, [0, bins], [4, 6]);
    const withoutTail = service.fitPol1(values, 0, bins, bins, [0, 8], [4, 6]);

    // Excluding the empty tail from the background range keeps the fitted line flat at the
    // true value (20) everywhere, including under the signal window. Including the zero tail
    // instead pulls the (now sloped) line down specifically under the window — evaluating the
    // raw y-intercept (pol1[0], the value at x=0, far from the excluded bins) would not show
    // this, since a 2-parameter line can trade slope for intercept; what actually matters for
    // the student is the background level under their signal window, i.e. `background` itself.
    expect(withoutTail.pol1[0]).toBeCloseTo(20, 3);
    expect(withoutTail.background).toBeCloseTo(40, 3); // 2 window bins * 20
    expect(withTail.background).toBeLessThan(withoutTail.background);
  });

  it('reports a null signal-to-background ratio when the fitted background is zero', () => {
    const values = new Float64Array(10).fill(0);
    values[5] = 10;

    const result = service.fitPol1(values, 0, 10, 10, [0, 10], [5, 6]);

    expect(result.background).toBe(0);
    expect(result.signalToBackground).toBeNull();
  });

  it('does not fit against values inside the signal window', () => {
    // Sidebands flat at 10; window bin set to an extreme value that must not leak into a/b.
    const values = new Float64Array(10).fill(10);
    values[5] = 100000;

    const result = service.fitPol1(values, 0, 10, 10, [0, 10], [5, 6]);

    expect(result.pol1[0]).toBeCloseTo(10, 3);
    expect(result.pol1[1]).toBeCloseTo(0, 3);
  });

  it('falls back to a flat line without throwing when the background range is degenerate', () => {
    const values = new Float64Array(10).fill(10);

    const result = service.fitPol1(values, 0, 10, 10, [3, 3], [4, 6]);

    expect(Number.isFinite(result.pol1[0])).toBeTrue();
    expect(Number.isFinite(result.pol1[1])).toBeTrue();
  });
});
