import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { StrangenessDataService } from './strangeness-data.service';
import { ApiService, ParticleType } from '../shared/services/api.service';
import { TranslateModule } from '@ngx-translate/core';

describe('StrangenessDataService', () => {
  let service: StrangenessDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [TranslateModule.forRoot()],
    providers: [ApiService, provideHttpClient(withInterceptorsFromDi())]
});
    service = TestBed.inject(StrangenessDataService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('allows only one histogram claim per track key', () => {
    const key = '0';
    expect(service.claimTracksForHistogram(key, ['0:+', '0:-'])).toBeTrue();
    expect(service.isTrackAnalyzed(key, '0:+')).toBeTrue();
    expect(service.claimTracksForHistogram(key, ['0:+', '1:-'])).toBeFalse();
    expect(service.claimTracksForHistogram(key, ['1:+', '1:-'])).toBeTrue();
  });

  it('allows claiming a cross-decay mix when none of the tracks were used', () => {
    const key = '0';
    expect(service.claimTracksForHistogram(key, ['0:+', '1:-'])).toBeTrue();
    expect(service.isTrackAnalyzed(key, '0:+')).toBeTrue();
    expect(service.isTrackAnalyzed(key, '1:-')).toBeTrue();
    expect(service.isTrackAnalyzed(key, '0:-')).toBeFalse();
    expect(service.claimTracksForHistogram(key, ['0:-', '1:+'])).toBeTrue();
  });

  it('marks event done only after every required track key is claimed', () => {
    const key = '1';
    const required = ['0:+', '0:-', '1:+', '1:-'];
    service.claimTracksForHistogram(key, ['0:+', '1:-']);
    expect(service.areAllTracksAnalyzed(key, required)).toBeFalse();
    service.addVisualAnalysisResult(key, { particle: ParticleType.KAON, mass: 0.5 }, ['0:-', '1:+']);
    expect(service.areAllTracksAnalyzed(key, required)).toBeTrue();
    expect(service.visualAnalysisResults.get(key)?.length).toBe(1);
  });
});
