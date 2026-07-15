/**
 * Loads curated collision-event particle data for the Particle Propagation
 * module and maps it into `PropagationParticle`s ready for RK4 pre-computation.
 *
 * Source: `assets/exercises/particle-propagation/event_<n>.json`, distilled
 * from https://github.com/pnwkw/gpu_propagator by
 * `scripts/curate-propagation-events.mjs`. Each track carries a real electric
 * `charge` (+-1) — that (not the always-zero `sign` of the strangeness data)
 * is what drives the Lorentz-force curvature, so this module maps from it.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { MAX_TRACKED_PARTICLES, PARTICLE_EVENT_COUNT, PARTICLE_EVENT_DATA_BASE_PATH } from '../physics/constants';
import { PropagationParticle } from '../physics/propagation-types';
import { PropagationEvent, PropagationRawTrack } from './propagation-event';

export interface EventRef {
  event: number;
}

function momentumMagnitude(particle: PropagationParticle): number {
  const { x, y, z } = particle.momentum;
  return Math.hypot(x, y, z);
}

@Injectable({ providedIn: 'root' })
export class ParticleDataService {
  constructor(private readonly http: HttpClient) {}

  /** Fetches `event_{eventId}.json` and maps it to propagation-ready particles. */
  loadEvent(eventId = 0): Observable<PropagationParticle[]> {
    const url = `${PARTICLE_EVENT_DATA_BASE_PATH}/event_${eventId}.json`;
    return this.http.get<PropagationEvent>(url).pipe(map((event) => this.toPropagationParticles(event)));
  }

  /** Every available curated event index, for populating a GUI dropdown. */
  listAvailableEvents(): EventRef[] {
    return Array.from({ length: PARTICLE_EVENT_COUNT }, (_, event) => ({ event }));
  }

  private toPropagationParticles(event: PropagationEvent): PropagationParticle[] {
    const particles: PropagationParticle[] = [];
    (event.tracks ?? []).forEach((track, i) => {
      const particle = this.trackToParticle(track, `track-${i}`);
      if (particle) particles.push(particle);
    });
    return this.capToMaxTracked(particles);
  }

  private capToMaxTracked(particles: PropagationParticle[]): PropagationParticle[] {
    if (particles.length <= MAX_TRACKED_PARTICLES) {
      return particles;
    }
    particles.sort((a, b) => momentumMagnitude(b) - momentumMagnitude(a));
    // eslint-disable-next-line no-console
    console.warn(
      `[ParticleDataService] event has ${particles.length} particles; truncating to the ` +
        `${MAX_TRACKED_PARTICLES} with the highest |p| to stay within MAX_TRACKED_PARTICLES.`
    );
    return particles.slice(0, MAX_TRACKED_PARTICLES);
  }

  private trackToParticle(track: PropagationRawTrack, id: string): PropagationParticle | null {
    // Only genuinely charged tracks curve; drop anything else defensively.
    if (track.charge !== 1 && track.charge !== -1) {
      return null;
    }
    return {
      id,
      // The collision vertex is pinned to the world origin (see docs/plan §2):
      // the raw X/Y/Z beam-spot offsets are sub-cm and would only nudge the
      // shared start point off the detector's central (beam) axis, which reads
      // as "tracks don't start in the middle of the detector".
      vertex: { x: 0, y: 0, z: 0 },
      momentum: { x: track.px, y: track.py, z: track.pz },
      charge: track.charge,
      mass: track.mass,
      energy: track.E,
    };
  }
}
