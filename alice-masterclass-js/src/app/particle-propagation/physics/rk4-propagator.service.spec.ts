import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { Rk4PropagatorService, PrecomputeEvent } from './rk4-propagator.service';
import { MagneticFieldService } from './magnetic-field.service';
import { PropagationParticle } from './propagation-types';

function collectEvents(obs: { subscribe: Function }): Promise<PrecomputeEvent[]> {
  return new Promise((resolve, reject) => {
    const events: PrecomputeEvent[] = [];
    obs.subscribe({
      next: (e: PrecomputeEvent) => events.push(e),
      error: reject,
      complete: () => resolve(events),
    });
  });
}

const testParticles: PropagationParticle[] = [
  { id: 'p1', vertex: { x: 0, y: 0, z: 0 }, momentum: { x: 1, y: 0, z: 0.5 }, charge: 1, mass: 0.1396, energy: 1.16 },
  { id: 'p2', vertex: { x: 0, y: 0, z: 0 }, momentum: { x: -0.6, y: 0.4, z: 0.2 }, charge: -1, mass: 0.1396, energy: 0.77 },
];

describe('Rk4PropagatorService', () => {
  let service: Rk4PropagatorService;
  let magneticField: MagneticFieldService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    });
    service = TestBed.inject(Rk4PropagatorService);
    magneticField = TestBed.inject(MagneticFieldService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('errors if the magnetic field map has not been loaded yet', async () => {
    await expectAsync(collectEvents(service.precompute(testParticles))).toBeRejectedWithError(/load\(\)/);
  });

  it('precomputes real trajectories end-to-end via the Web Worker', async () => {
    await magneticField.load();

    const events = await collectEvents(
      service.precompute(testParticles, { stepCm: 5, maxSteps: 20 })
    );

    const resultEvent = events.find((e) => e.type === 'result') as { type: 'result'; result: import('./propagation-types').PropagationResult } | undefined;
    expect(resultEvent).toBeTruthy();
    expect(resultEvent!.result.tracks.length).toBe(testParticles.length);
    for (const track of resultEvent!.result.tracks) {
      expect(track.pointCount).toBeGreaterThan(1);
      expect(Number.isFinite(track.positions[0])).toBe(true);
    }
    expect(resultEvent!.result.maxTimeNs).toBeGreaterThan(0);
  }, 15000);

  it('falls back to a chunked main-thread computation when Worker is unavailable', async () => {
    await magneticField.load();

    const originalWorker = (globalThis as { Worker?: unknown }).Worker;
    (globalThis as { Worker?: unknown }).Worker = undefined;
    try {
      const events = await collectEvents(
        service.precompute(testParticles, { stepCm: 5, maxSteps: 20 })
      );
      const resultEvent = events.find((e) => e.type === 'result') as { type: 'result'; result: import('./propagation-types').PropagationResult } | undefined;
      expect(resultEvent).toBeTruthy();
      expect(resultEvent!.result.tracks.length).toBe(testParticles.length);
      // At least one progress event should have been emitted by the chunked fallback.
      expect(events.some((e) => e.type === 'progress')).toBe(true);
    } finally {
      (globalThis as { Worker?: unknown }).Worker = originalWorker;
    }
  }, 15000);
});
