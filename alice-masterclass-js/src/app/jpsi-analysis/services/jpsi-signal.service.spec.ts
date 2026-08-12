import { TestBed } from '@angular/core/testing';

import { createMassHistograms, MASS_BIN_WIDTH, MASS_XMIN, MassHistograms, snapToBinEdge } from '../models/jpsi.models';
import { JpsiSignalService } from './jpsi-signal.service';

/** Bin index of a mass value, matching the service's own convention. */
function binOf(mass: number): number {
  return Math.round((mass - MASS_XMIN) / MASS_BIN_WIDTH);
}

describe('JpsiSignalService', () => {
  let service: JpsiSignalService;
  let mass: MassHistograms;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [JpsiSignalService] });
    service = TestBed.inject(JpsiSignalService);
    mass = createMassHistograms();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('clamps negative bins to zero for drawing', () => {
    const bin = binOf(3.0);
    // A downward fluctuation: more same-charge than opposite-charge pairs in this bin.
    mass.unlike[bin] = 10;
    mass.posPos[bin] = 18;

    const other = binOf(3.1);
    mass.unlike[other] = 100;
    mass.posPos[other] = 20;

    const residual = service.residualSeries(mass);

    expect(residual[bin]).toBe(0);
    expect(residual[other]).toBe(80);
  });

  it('keeps negative bins unclamped in the raw series used by the Pol1 fit', () => {
    const bin = binOf(3.0);
    mass.unlike[bin] = 10;
    mass.posPos[bin] = 18;

    const raw = service.rawResidualSeries(mass);

    expect(raw[bin]).toBe(-8);
  });

  it('sums the two same-charge series into the background series', () => {
    const bin = binOf(2.0);
    mass.posPos[bin] = 7;
    mass.negNeg[bin] = 5;

    expect(service.backgroundSeries(mass)[bin]).toBe(12);
  });

  it('snaps window edges onto bin boundaries', () => {
    expect(snapToBinEdge(2.92)).toBeCloseTo(2.9, 6);
    expect(snapToBinEdge(3.28)).toBeCloseTo(3.3, 6);
  });
});
