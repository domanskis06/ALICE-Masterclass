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

  it('reports workshop and full-dataset event counts', () => {
    expect(service.getEventsInDataset(0)).toBe(4);
    expect(service.getEventsInDataset(1)).toBe(15);
    expect(service.getEventsInDataset(12)).toBe(15);
    expect(service.getEventsInDataset(19)).toBe(15);
    expect(service.getEventsInDataset(20)).toBe(4);
    expect(service.FULL_EVENT_FILE_IDS).toEqual([0, 1, 2, 3]);
  });

  it('maps picker ids to on-disk dataset numbers', () => {
    expect(service.resolveDatasetNum(-1)).toBe(0);
    expect(service.resolveDatasetNum(-2)).toBe(20);
    expect(service.resolveDatasetNum(7)).toBe(7);
  });
});
