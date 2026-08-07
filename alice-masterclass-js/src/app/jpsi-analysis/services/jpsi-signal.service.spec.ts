import { TestBed } from '@angular/core/testing';

import {
  createMassHistograms,
  MASS_BIN_WIDTH,
  MassHistograms,
  snapToBinEdge,
} from '../models/jpsi.models';
import { JpsiSignalService } from './jpsi-signal.service';

/** Bin index of a mass value, matching the service's own convention. */
function binOf(mass: number): number {
  return Math.round(mass / MASS_BIN_WIDTH);
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

  it('computes signal, background, ratio and significance from the window', () => {
    const bin = binOf(3.0);
    mass.unlike[bin] = 100;
    mass.posPos[bin] = 15;
    mass.negNeg[bin] = 25;

    const result = service.compute(mass, [2.9, 3.3]);

    expect(result.unlikeSum).toBe(100);
    expect(result.likeSum).toBe(40);
    expect(result.signal).toBe(60);
    expect(result.signalError).toBeCloseTo(Math.sqrt(140), 6);
    expect(result.signalToBackground).toBeCloseTo(1.5, 6);
    expect(result.significance).toBeCloseTo(60 / Math.sqrt(100), 6);
  });

  it('never reports a negative signal', () => {
    const bin = binOf(3.0);
    mass.unlike[bin] = 10;
    mass.posPos[bin] = 30;

    expect(service.compute(mass, [2.9, 3.3]).signal).toBe(0);
  });

  it('reports no ratio when the background is empty', () => {
    const bin = binOf(3.0);
    mass.unlike[bin] = 36;

    const result = service.compute(mass, [2.9, 3.3]);

    expect(result.likeSum).toBe(0);
    expect(result.signalToBackground).toBeNull();
    // With no background the significance collapses to sqrt(N).
    expect(result.significance).toBeCloseTo(6, 6);
  });

  it('only counts bins inside the window', () => {
    mass.unlike[binOf(3.0)] = 50;
    mass.unlike[binOf(4.5)] = 999;

    expect(service.compute(mass, [2.9, 3.3]).unlikeSum).toBe(50);
  });

  it('clamps negative bins for drawing without changing the reported numbers', () => {
    const bin = binOf(3.0);
    // A downward fluctuation: more same-charge than opposite-charge pairs in this bin.
    mass.unlike[bin] = 10;
    mass.posPos[bin] = 18;

    const other = binOf(3.1);
    mass.unlike[other] = 100;
    mass.posPos[other] = 20;

    const residual = service.residualSeries(mass);
    const result = service.compute(mass, [2.9, 3.3]);

    expect(residual[bin]).toBe(0);
    expect(residual[other]).toBe(80);

    // The raw sums keep the -8, so the drawn zero must not inflate the yield.
    expect(result.unlikeSum).toBe(110);
    expect(result.likeSum).toBe(38);
    expect(result.signal).toBe(72);
    // Summing the clamped series instead would have given 80.
    expect(result.signal).not.toBe(80);
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
