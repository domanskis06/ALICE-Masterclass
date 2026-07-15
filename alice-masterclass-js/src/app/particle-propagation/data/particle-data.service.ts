/**
 * Loads curated collision-event particle data for the Particle Propagation
 * module and maps it into `PropagationParticle`s ready for RK4 pre-computation.
 *
 * Source: `assets/exercises/particle-propagation/event_<n>.json`, distilled
 * from Strangeness Visual Analysis part1 by `scripts/curate-propagation-events.mjs`.
 * Primary tracks carry inferred `charge` (±1) and start at the IP; V0 daughters
 * carry VA `sign` as `charge` and start at the secondary vertex.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { MAX_TRACKED_PARTICLES, PARTICLE_EVENT_COUNT, PARTICLE_EVENT_DATA_BASE_PATH } from '../physics/constants';
import { PropagationParticle } from '../physics/propagation-types';
import { PropagationEvent, PropagationRawTrack, TrackOrigin } from './propagation-event';

export interface EventRef {
  event: number;
}

function momentumMagnitude(particle: PropagationParticle): number {
  const { x, y, z } = particle.momentum;
  return Math.hypot(x, y, z);
}

function normalizeOrigin(raw: string | undefined): TrackOrigin {
  return raw === 'v0' ? 'v0' : 'primary';
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
    // Always keep V0 daughters; truncate primary by |p| if needed.
    const v0 = particles.filter((p) => p.origin === 'v0');
    const primary = particles.filter((p) => p.origin !== 'v0');
    primary.sort((a, b) => momentumMagnitude(b) - momentumMagnitude(a));
    const primarySlots = Math.max(0, MAX_TRACKED_PARTICLES - v0.length);
    const kept = [...primary.slice(0, primarySlots), ...v0];
    // eslint-disable-next-line no-console
    console.warn(
      `[ParticleDataService] event has ${particles.length} particles; truncating to the ` +
        `${kept.length} (kept all ${v0.length} V0 + top-|p| primary) within MAX_TRACKED_PARTICLES.`
    );
    return kept;
  }

  private trackToParticle(track: PropagationRawTrack, id: string): PropagationParticle | null {
    // Only genuinely charged tracks curve; drop anything else defensively.
    if (track.charge !== 1 && track.charge !== -1) {
      return null;
    }
    const origin = normalizeOrigin(track.origin);
    // Primary: pin to IP so the shared start sits on the beam axis.
    // V0: keep the secondary vertex from the JSON (averaged traj[0] of daughters).
    const vertex =
      origin === 'v0'
        ? { x: track.X, y: track.Y, z: track.Z }
        : { x: 0, y: 0, z: 0 };

    return {
      id,
      origin,
      vertex,
      momentum: { x: track.px, y: track.py, z: track.pz },
      charge: track.charge,
      mass: track.mass,
      energy: track.E,
    };
  }
}
