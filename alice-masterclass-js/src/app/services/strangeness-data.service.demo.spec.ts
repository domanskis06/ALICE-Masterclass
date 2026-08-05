import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';

import { StrangenessDataService } from './strangeness-data.service';
import { DEMO_MODE } from '../shared/demo/demo.tokens';
import {
  ApiService,
  CentralityType,
  CollisionType,
  LargeScaleAnalysisResultsEntry,
  ParticleType,
} from '../shared/services/api.service';

/** Behaviour that only exists when the app runs as the public demo. */
describe('StrangenessDataService (demo mode)', () => {
  const DEMO_STORAGE_KEYS = [
    'demo:va:results',
    'demo:va:trackKeys',
    'demo:lsa:results',
    'demo:lsa:order',
  ];

  const kaonFit = (centrality: CentralityType, signal: number): LargeScaleAnalysisResultsEntry => ({
    particle: ParticleType.KAON,
    collision: CollisionType.PBPB,
    centrality,
    signal,
  });

  const createService = (): StrangenessDataService => {
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        ApiService,
        provideHttpClient(withInterceptorsFromDi()),
        { provide: DEMO_MODE, useValue: true },
      ],
    });
    return TestBed.inject(StrangenessDataService);
  };

  const clearDemoStorage = () => {
    DEMO_STORAGE_KEYS.forEach((key) => {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    });
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    clearDemoStorage();
  });

  afterEach(() => clearDemoStorage());

  it('persists visual-analysis results to sessionStorage', () => {
    const service = createService();
    service.addVisualAnalysisResult('1:0', { particle: ParticleType.KAON, mass: 0.5 }, ['0:+', '0:-']);

    expect(JSON.parse(sessionStorage.getItem('demo:va:results')!)).toEqual([
      ['1:0', [{ particle: ParticleType.KAON, mass: 0.5 }]],
    ]);
    expect(localStorage.getItem('demo:va:results')).toBeNull();
  });

  it('restores visual-analysis results and track claims on a fresh instance', () => {
    const first = createService();
    first.addVisualAnalysisResult('1:0', { particle: ParticleType.LAMBDA, mass: 1.11 }, ['0:+', '0:-']);

    TestBed.resetTestingModule();
    const restored = createService();

    expect(restored.getVisualAnalysisResultsForEvent('1:0')).toEqual([
      { particle: ParticleType.LAMBDA, mass: 1.11 },
    ]);
    expect(restored.isTrackAnalyzed('1:0', '0:+')).toBeTrue();
    expect(restored.claimTracksForHistogram('1:0', ['0:+'])).toBeFalse();
  });

  it('undoes accepted fits last in, first out', () => {
    const service = createService();
    service.addLargeScaleAnalysisResult('k0_pbpb_000_010', kaonFit(CentralityType.C000_010, 100));
    service.addLargeScaleAnalysisResult('k0_pbpb_010_020', kaonFit(CentralityType.C010_020, 200));

    expect(service.canUndoLargeScaleAnalysisResult).toBeTrue();
    expect(service.undoLastLargeScaleAnalysisResult()).toBeTrue();

    expect(service.largeScaleAnalysisResults.has('k0_pbpb_010_020')).toBeFalse();
    expect(service.largeScaleAnalysisResults.get('k0_pbpb_000_010')!.signal).toBe(100);

    expect(service.undoLastLargeScaleAnalysisResult()).toBeTrue();
    expect(service.largeScaleAnalysisResults.size).toBe(0);
    expect(service.canUndoLargeScaleAnalysisResult).toBeFalse();
    expect(service.undoLastLargeScaleAnalysisResult()).toBeFalse();
  });

  it('undo restores the value an accepted fit overwrote', () => {
    const service = createService();
    service.addLargeScaleAnalysisResult('k0_pbpb_000_010', kaonFit(CentralityType.C000_010, 100));
    service.addLargeScaleAnalysisResult('k0_pbpb_000_010', kaonFit(CentralityType.C000_010, 250));

    expect(service.undoLastLargeScaleAnalysisResult()).toBeTrue();
    expect(service.largeScaleAnalysisResults.get('k0_pbpb_000_010')!.signal).toBe(100);
  });

  it('keeps the undo history across a reload', () => {
    const first = createService();
    first.addLargeScaleAnalysisResult('k0_pbpb_000_010', kaonFit(CentralityType.C000_010, 100));

    TestBed.resetTestingModule();
    const restored = createService();

    expect(restored.largeScaleAnalysisResults.size).toBe(1);
    expect(restored.canUndoLargeScaleAnalysisResult).toBeTrue();
    expect(restored.undoLastLargeScaleAnalysisResult()).toBeTrue();
    expect(restored.largeScaleAnalysisResults.size).toBe(0);
  });

  it('writes nothing outside the demo build', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [ApiService, provideHttpClient(withInterceptorsFromDi())],
    });
    const service = TestBed.inject(StrangenessDataService);

    service.addVisualAnalysisResult('0', { particle: ParticleType.KAON, mass: 0.5 }, ['0:+']);
    service.addLargeScaleAnalysisResult('k0_pbpb_000_010', kaonFit(CentralityType.C000_010, 100));

    expect(DEMO_STORAGE_KEYS.every((key) => sessionStorage.getItem(key) === null)).toBeTrue();
    expect(DEMO_STORAGE_KEYS.every((key) => localStorage.getItem(key) === null)).toBeTrue();
    expect(service.canUndoLargeScaleAnalysisResult).toBeFalse();
  });
});
