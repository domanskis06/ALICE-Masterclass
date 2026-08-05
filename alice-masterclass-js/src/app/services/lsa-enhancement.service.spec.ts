import { TestBed } from '@angular/core/testing';

import { LsaEnhancementService } from './lsa-enhancement.service';
import {
  CentralityType,
  CollisionType,
  LargeScaleAnalysisResultsEntry,
  ParticleType,
} from '../shared/services/api.service';

describe('LsaEnhancementService', () => {
  let service: LsaEnhancementService;

  const result = (
    particle: ParticleType,
    collision: CollisionType,
    centrality: CentralityType,
    signal: number,
  ): LargeScaleAnalysisResultsEntry => ({ particle, collision, centrality, signal });

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(LsaEnhancementService);
  });

  it('reports one row per prepared centrality bin', () => {
    const rows = service.buildRows(new Map());

    expect(rows.length).toBe(8);
    expect(rows[0].centrality).toBe(CentralityType.C000_010);
    expect(rows[0].nParticipants).toBe(360);
  });

  it('leaves bins without a fit at zero', () => {
    const rows = service.buildRows(new Map());

    expect(rows.every((row) => row.nKaons === 0 && row.yieldKaons === 0 && row.enhKaons === 0)).toBeTrue();
  });

  it('turns an accepted Pb-Pb signal into a yield and an enhancement', () => {
    const results = new Map<string, LargeScaleAnalysisResultsEntry>([
      ['k0_pbpb_000_010', result(ParticleType.KAON, CollisionType.PBPB, CentralityType.C000_010, 1000)],
    ]);

    const row = service.buildRows(results)[0];
    const expectedYield = 1000 / (row.nEvents * row.effKaons);

    expect(row.nKaons).toBe(1000);
    expect(row.yieldKaons).toBeCloseTo(expectedYield, 10);
    expect(row.enhKaons).toBeCloseTo(expectedYield / row.nParticipants / (0.25 / 2), 10);
    // Other species in the same bin remain unmeasured.
    expect(row.yieldLambdas).toBe(0);
  });

  it('keeps lambda and anti-lambda separate within one bin', () => {
    const results = new Map<string, LargeScaleAnalysisResultsEntry>([
      ['lambda_pbpb_010_020', result(ParticleType.LAMBDA, CollisionType.PBPB, CentralityType.C010_020, 400)],
      ['antilambda_pbpb_010_020', result(ParticleType.ANTI_LAMBDA, CollisionType.PBPB, CentralityType.C010_020, 200)],
    ]);

    const row = service.buildRows(results).find((r) => r.centrality === CentralityType.C010_020)!;

    expect(row.nLambdas).toBe(400);
    expect(row.nAntiLambdas).toBe(200);
    expect(row.enhLambdas).toBeGreaterThan(row.enhAntiLambdas);
  });

  it('ignores the pp reference fit', () => {
    const results = new Map<string, LargeScaleAnalysisResultsEntry>([
      ['k0_pp', result(ParticleType.KAON, CollisionType.PP, CentralityType.C000_000, 5000)],
    ]);

    const rows = service.buildRows(results);

    expect(rows.every((row) => row.nKaons === 0)).toBeTrue();
  });

  it('emits three plot points per bin', () => {
    const rows = service.buildRows(new Map());
    const points = service.buildPlotData(rows);

    expect(points.length).toBe(rows.length * 3);
    expect(points.filter((point) => point.particle === ParticleType.KAON).length).toBe(rows.length);
  });

  it('spans the participant numbers of the prepared sample', () => {
    const [min, max] = service.participantsDomain();

    expect(min).toBe(0);
    expect(max).toBeGreaterThan(360);
  });
});
