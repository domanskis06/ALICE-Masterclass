import { TestBed } from '@angular/core/testing';

import { PbPbCentralityId, PbPbYieldRow } from '../jpsi-analysis/models/pbpb-minv.models';
import { ResidualFitResult } from '../jpsi-analysis/services/jpsi-residual-fit.service';
import { JpsiRaaService, PBPB_NCOLL, PBPB_NEVENTS, PBPB_NPART } from './jpsi-raa.service';

describe('JpsiRaaService', () => {
  let service: JpsiRaaService;

  const fit = (signal: number, signalError: number): ResidualFitResult => ({
    backgroundFitRange: [0, 1],
    signalWindow: [0, 1],
    pol1: [0, 0],
    total: signal,
    residualBackground: 0,
    combinatorialBackground: 0,
    background: 0,
    signal,
    signalError,
    signalToBackground: null,
    significance: 0,
  });

  const row = (centralityId: PbPbCentralityId, signal: number, signalError = Math.sqrt(signal)): PbPbYieldRow => ({
    centralityId,
    centralityLabel: `Pb-Pb ${centralityId}`,
    fit: fit(signal, signalError),
    published: {
      nTotal: 0,
      nTotalErr: 0,
      nBkg: 0,
      nBkgErr: 0,
      nJpsi: 0,
      nJpsiErr: 0,
      sOverB: 0,
      significance: 0,
      significanceNote: '',
    },
    acceptedAt: 0,
  });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(JpsiRaaService);
  });

  it('reports one row per Pb-Pb centrality, in ascending order', () => {
    const rows = service.buildRows(new Map());

    expect(rows.length).toBe(8);
    expect(rows[0].centralityId).toBe('pbPb_0_5');
    expect(rows[0].nParticipants).toBe(PBPB_NPART['pbPb_0_5']);
    expect(rows[0].nColl).toBe(PBPB_NCOLL['pbPb_0_5']);
    expect(rows[0].nEvents).toBe(PBPB_NEVENTS['pbPb_0_5']);
  });

  it('leaves centralities without an accepted fit at zero and unmeasured', () => {
    const rows = service.buildRows(new Map());

    expect(rows.every((r) => r.signal === 0 && r.raa === 0 && !r.measured)).toBeTrue();
  });

  it('turns an accepted Pb-Pb signal into a yield and an R_AA', () => {
    const accepted = new Map<PbPbCentralityId, PbPbYieldRow>([['pbPb_0_5', row('pbPb_0_5', 1000, 32)]]);

    const result = service.buildRows(accepted).find((r) => r.centralityId === 'pbPb_0_5')!;

    expect(result.measured).toBeTrue();
    expect(result.signal).toBe(1000);
    expect(result.correctedYield).toBeGreaterThan(0);
    expect(result.raa).toBeGreaterThan(0);
    expect(result.raaError).toBeCloseTo(result.raa * (32 / 1000), 10);
    // Other centralities in the same map remain unmeasured.
    expect(service.buildRows(accepted).find((r) => r.centralityId === 'pbPb_5_10')!.measured).toBeFalse();
  });

  it('produces one plot entry per row, carrying the measured flag through', () => {
    const accepted = new Map<PbPbCentralityId, PbPbYieldRow>([['pbPb_10_20', row('pbPb_10_20', 500)]]);
    const rows = service.buildRows(accepted);

    const points = service.buildPlotEntries(rows);

    expect(points.length).toBe(8);
    expect(points.find((p) => p.centralityId === 'pbPb_10_20')!.measured).toBeTrue();
    expect(points.filter((p) => p.measured).length).toBe(1);
  });

  it('spans the fixed participant numbers', () => {
    const [min, max] = service.participantsDomain();

    expect(min).toBe(0);
    expect(max).toBeGreaterThan(PBPB_NPART['pbPb_0_5']);
  });
});
