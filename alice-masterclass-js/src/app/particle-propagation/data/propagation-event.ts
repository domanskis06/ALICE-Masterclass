/**
 * On-disk schema for the curated Particle Propagation events under
 * `assets/exercises/particle-propagation/event_<n>.json`.
 *
 * Distilled from gpu_propagator `data/events.json` by
 * `scripts/curate-propagation-events.mjs`:
 *   - primary tracks from the IP with ground-truth `charge` (±1)
 *   - colouring is charge-based (red +, blue −); `origin` stays `primary`
 *
 * Kept deliberately minimal: only the fields the RK4 pre-computation + colouring need.
 */

/** Where the particle was produced — drives vertex pinning and track colour. */
export type TrackOrigin = 'primary' | 'v0';

/** A single charged particle ready for RK4 (primary from IP, or V0 daughter). */
export interface PropagationRawTrack {
  /** Electric charge in units of |e| (+1 or -1). */
  charge: number;
  /** Production role: collision (primary) vs secondary V0 decay. */
  origin: TrackOrigin;
  /**
   * Production vertex, cm.
   * Primary: written as 0,0,0 (IP). V0: secondary vertex from VA `trajectory[0]`.
   */
  X: number;
  Y: number;
  Z: number;
  /** Momentum vector, GeV/c. */
  px: number;
  py: number;
  pz: number;
  /** Total energy, GeV. */
  E: number;
  /** Rest mass, GeV/c^2. */
  mass: number;
}

export interface PropagationEvent {
  tracks: PropagationRawTrack[];
}
