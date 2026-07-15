/**
 * On-disk schema for the curated Particle Propagation events under
 * `assets/exercises/particle-propagation/event_<n>.json`.
 *
 * These are distilled from https://github.com/pnwkw/gpu_propagator's
 * `data/events.json` by `scripts/curate-propagation-events.mjs`. Unlike the
 * strangeness dataset, each track carries a real electric `charge` (+-1) — the
 * `sign` field in the original data is always 0 and is intentionally dropped.
 *
 * Kept deliberately minimal: only the fields the RK4 pre-computation needs.
 */

/** A single charged final-state particle at (near) the interaction point. */
export interface PropagationRawTrack {
  /** Electric charge in units of |e| (+1 or -1). */
  charge: number;
  /** Production vertex, cm (beam-spot; pinned to the origin at map time). */
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
