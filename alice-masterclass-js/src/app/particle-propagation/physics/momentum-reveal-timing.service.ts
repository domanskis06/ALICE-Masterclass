/**
 * Angular façade for pedagogical momentum-based track-reveal timing.
 * Heavy math lives in `momentum-reveal-timing.ts`; this service is the inject
 * point for Particle Propagation (keeps algorithms out of the component).
 */

import { Injectable } from '@angular/core';

import { BufferedTrack, PropagationParticle } from './propagation-types';
import {
  MomentumRevealOptions,
  REVEAL_STRENGTH_DEFAULT,
  attachMomentumRevealTimes,
} from './momentum-reveal-timing';

@Injectable({ providedIn: 'root' })
export class MomentumRevealTimingService {
  /**
   * Attaches `timesVis` to each track from |p|-mapped β_eff and returns the
   * presentation `maxTimeNs` for the scrubber / timeline.
   */
  attachRevealTimes(
    tracks: BufferedTrack[],
    particles: PropagationParticle[],
    options: MomentumRevealOptions = { strength: REVEAL_STRENGTH_DEFAULT }
  ): number {
    return attachMomentumRevealTimes(tracks, particles, options);
  }
}
