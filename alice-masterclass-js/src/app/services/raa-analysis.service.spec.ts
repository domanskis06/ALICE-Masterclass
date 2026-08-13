import { RaaAnalysisService } from './raa-analysis.service';
import { RaaPipelineStep } from '../shared/models/raa/raa';

describe('RaaAnalysisService.validate', () => {
  let service: RaaAnalysisService;

  beforeEach(() => {
    service = new RaaAnalysisService({} as any);
  });

  it('rejects an empty pipeline', () => {
    const result = service.validate([]);
    expect(result.valid).toBeFalse();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('accepts the canonical R_AA chain', () => {
    const pipeline: RaaPipelineStep[] = [
      { kind: 'load_pbpb' },
      { kind: 'filter_centrality', centrality: '0-5' },
      { kind: 'histogram_pt' },
      { kind: 'norm_events' },
      { kind: 'norm_ncoll' },
      { kind: 'divide_pp' },
      { kind: 'compute_raa' },
      { kind: 'plot' },
    ];
    const result = service.validate(pipeline);
    expect(result.valid).toBeTrue();
    expect(result.warnings).toEqual([]);
  });

  it('warns when N_coll normalization is missing', () => {
    const pipeline: RaaPipelineStep[] = [
      { kind: 'load_pbpb' },
      { kind: 'filter_centrality', centrality: '0-5' },
      { kind: 'histogram_pt' },
      { kind: 'norm_events' },
      { kind: 'divide_pp' },
      { kind: 'compute_raa' },
      { kind: 'plot' },
    ];
    const result = service.validate(pipeline);
    expect(result.valid).toBeFalse();
    expect(result.warnings.some((w) => w.includes('N_coll'))).toBeTrue();
  });

  it('warns when step order is reversed', () => {
    const pipeline: RaaPipelineStep[] = [
      { kind: 'filter_centrality', centrality: '0-5' },
      { kind: 'load_pbpb' },
      { kind: 'histogram_pt' },
      { kind: 'norm_events' },
      { kind: 'norm_ncoll' },
      { kind: 'divide_pp' },
      { kind: 'compute_raa' },
      { kind: 'plot' },
    ];
    const result = service.validate(pipeline);
    expect(result.valid).toBeFalse();
    expect(result.warnings.some((w) => w.includes('should come after'))).toBeTrue();
  });
});
