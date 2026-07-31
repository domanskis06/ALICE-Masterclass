import { TestBed } from '@angular/core/testing';
import { LSAData } from '../models';

import { FitService } from './fit.service';
import { pbpbp_k0, pbpbp_lambda } from './fit.service.spec.data';

describe('FitService', () => {
  let service: FitService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ FitService ]
    });
    service = TestBed.inject(FitService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should correctly fit K0', () => {
    service.data = pbpbp_k0;
    service.backgroundFitRange = [0.4, 0.6];
    service.signalFitRange = [0.48, 0.508];
    service.aGaussHint = [10.730, 0.498, 0.004];

    service.fit();

    expect(service.result.total).toBe(3445);
    expect(service.result.signal).toBe(2635);
    expect(service.result.background).toBe(810);

    expect(service.result.p1Gauss[0]).toBeCloseTo(2.556);
    expect(service.result.p1Gauss[1]).toBeCloseTo(0.497);
    expect(service.result.p1Gauss[2]).toBeCloseTo(0.004);

    expect(service.result.p1Polynomial[0]).toBeCloseTo(42.259);
    expect(service.result.p1Polynomial[1]).toBeCloseTo(101.362);
    expect(service.result.p1Polynomial[2]).toBeCloseTo(-257.625);
  });

  it('should correctly fit Lambda', () => {
    service.data = pbpbp_lambda;
    service.backgroundFitRange = [1.09, 1.16];
    service.signalFitRange = [1.111, 1.121];
    service.aGaussHint = [2.461, 1.116, 0.002];

    service.fit();

    expect(service.result.total).toBe(1039);
    expect(service.result.signal).toBe(679);
    expect(service.result.background).toBe(360);

    expect(service.result.p1Gauss[0]).toBeCloseTo(0.665);
    expect(service.result.p1Gauss[1]).toBeCloseTo(1.115);
    expect(service.result.p1Gauss[2]).toBeCloseTo(0.001);

    expect(service.result.p1Polynomial[0]).toBeCloseTo(5.056);
    expect(service.result.p1Polynomial[1]).toBeCloseTo(9.112);
    expect(service.result.p1Polynomial[2]).toBeCloseTo(17.277);
  });

  it('clampRangeToView clips a partially visible interval', () => {
    expect(FitService.clampRangeToView([0.45, 0.55], [0.50, 0.60])).toEqual([0.50, 0.55]);
    expect(FitService.clampRangeToView([0.45, 0.55], [0.40, 0.48])).toEqual([0.45, 0.48]);
  });

  it('clampRangeToView shifts an interval that lies entirely outside the view', () => {
    expect(FitService.clampRangeToView([0.40, 0.45], [0.50, 0.60])).toEqual([0.50, 0.55]);
    const shifted = FitService.clampRangeToView([0.70, 0.78], [0.50, 0.60]);
    expect(shifted[0]).toBeCloseTo(0.52, 10);
    expect(shifted[1]).toBeCloseTo(0.60, 10);
  });

  it('clearFit drops the current result and curve functions', () => {
    service.data = pbpbp_k0;
    service.backgroundFitRange = [0.4, 0.6];
    service.signalFitRange = [0.48, 0.508];
    service.aGaussHint = [10.730, 0.498, 0.004];
    service.fit();
    expect(service.result).not.toBeNull();

    service.clearFit();

    expect(service.result).toBeNull();
    expect(service.signalFunction(0.5)).toBe(0);
    expect(service.backgroundFunction(0.5)).toBe(0);
    expect(service.data.data.length).toBeGreaterThan(0);
  });
});
