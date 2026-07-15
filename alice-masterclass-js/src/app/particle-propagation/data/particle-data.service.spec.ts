import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { ParticleDataService } from './particle-data.service';
import { PropagationEvent, PropagationRawTrack } from './propagation-event';
import { MAX_TRACKED_PARTICLES, PARTICLE_EVENT_COUNT, PARTICLE_EVENT_DATA_BASE_PATH } from '../physics/constants';

function makeTrack(overrides: Partial<PropagationRawTrack> = {}): PropagationRawTrack {
  return {
    charge: 1,
    X: 0.06,
    Y: 0.36,
    Z: -1.1,
    px: 0.1,
    py: 0.2,
    pz: 0.3,
    E: 1,
    mass: 0.13957,
    ...overrides,
  };
}

describe('ParticleDataService (real curated event fixture)', () => {
  let service: ParticleDataService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(ParticleDataService);
  });

  it('loads a real curated event and maps every charged track to an origin-vertex particle', async () => {
    const particles = await firstValueFrom(service.loadEvent(0));

    expect(particles.length).toBeGreaterThanOrEqual(15);
    expect(particles.length).toBeLessThanOrEqual(MAX_TRACKED_PARTICLES);
    // Curated data is exclusively charged; nothing should map to a neutral particle.
    expect(particles.every((p) => p.charge === 1 || p.charge === -1)).toBe(true);
    // Both charge signs should be represented (this is a "red vs blue" exercise).
    expect(particles.some((p) => p.charge > 0)).toBe(true);
    expect(particles.some((p) => p.charge < 0)).toBe(true);

    for (const p of particles) {
      // Vertex pinned to the detector's central axis.
      expect(p.vertex).toEqual({ x: 0, y: 0, z: 0 });
      expect(Number.isFinite(p.momentum.x)).toBe(true);
      expect(Number.isFinite(p.energy)).toBe(true);
    }
  });

  it('lists exactly the curated event count', () => {
    const refs = service.listAvailableEvents();
    expect(refs.length).toBe(PARTICLE_EVENT_COUNT);
    expect(refs[0]).toEqual({ event: 0 });
    expect(refs[refs.length - 1]).toEqual({ event: PARTICLE_EVENT_COUNT - 1 });
  });
});

describe('ParticleDataService (synthetic fixtures via HttpTestingController)', () => {
  let service: ParticleDataService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ParticleDataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('maps charge/momentum/energy correctly and forces the vertex to the origin', async () => {
    const event: PropagationEvent = {
      tracks: [makeTrack({ charge: -1, px: 1, py: 2, pz: 3, E: 4.5, X: 0.1, Y: 0.4, Z: -2 })],
    };

    const promise = firstValueFrom(service.loadEvent(0));
    httpMock.expectOne(`${PARTICLE_EVENT_DATA_BASE_PATH}/event_0.json`).flush(event);
    const particles = await promise;

    expect(particles.length).toBe(1);
    expect(particles[0]).toEqual({
      id: 'track-0',
      vertex: { x: 0, y: 0, z: 0 },
      momentum: { x: 1, y: 2, z: 3 },
      charge: -1,
      mass: 0.13957,
      energy: 4.5,
    });
  });

  it('drops non-charged tracks defensively', async () => {
    const event: PropagationEvent = {
      tracks: [makeTrack({ charge: 1 }), makeTrack({ charge: 0 }), makeTrack({ charge: -1 })],
    };

    const promise = firstValueFrom(service.loadEvent(2));
    httpMock.expectOne(`${PARTICLE_EVENT_DATA_BASE_PATH}/event_2.json`).flush(event);
    const particles = await promise;

    expect(particles.length).toBe(2);
    expect(particles.every((p) => p.charge !== 0)).toBe(true);
  });

  it('truncates to MAX_TRACKED_PARTICLES, keeping the highest-|p| particles, and warns once', async () => {
    const extraCount = MAX_TRACKED_PARTICLES + 50;
    const tracks: PropagationRawTrack[] = Array.from({ length: extraCount }, (_, i) =>
      makeTrack({ px: i + 1, py: 0, pz: 0 }) // momentum magnitude == i+1, strictly increasing
    );
    const event: PropagationEvent = { tracks };

    const warnSpy = spyOn(console, 'warn');
    const promise = firstValueFrom(service.loadEvent(7));
    httpMock.expectOne(`${PARTICLE_EVENT_DATA_BASE_PATH}/event_7.json`).flush(event);
    const particles = await promise;

    expect(particles.length).toBe(MAX_TRACKED_PARTICLES);
    // Highest-momentum track had px = extraCount; it must have survived truncation.
    expect(particles[0].momentum.x).toBe(extraCount);
    expect(warnSpy).toHaveBeenCalled();
  });
});
