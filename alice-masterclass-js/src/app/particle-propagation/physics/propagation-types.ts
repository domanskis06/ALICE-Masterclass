/** Plain 3D vector used throughout the physics layer (kept independent of THREE.Vector3 on purpose). */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Production role — primary (IP) vs V0 secondary; mirrored from on-disk `origin`. */
export type ParticleOrigin = 'primary' | 'v0';

/** A single charged/neutral particle ready for propagation. */
export interface PropagationParticle {
  /** Stable identifier (e.g. `track-3` or `decay-1-0`), used to correlate results back to input. */
  id: string;
  /** Production role: collision primary vs V0 daughter (drives track colour). */
  origin: ParticleOrigin;
  /** Production vertex, in cm (IP for primary, secondary vertex for V0). */
  vertex: Vec3;
  /** Momentum vector, in GeV/c. */
  momentum: Vec3;
  /** Electric charge in units of |e| (typically -1, 0, +1). */
  charge: number;
  /** Rest mass, in GeV/c^2 (not used by the RK4 step itself, kept for UI/labeling). */
  mass: number;
  /** Total energy, in GeV (used to derive beta = |p| / E for the time axis). */
  energy: number;
}

/**
 * Pre-computed trajectory for a single particle.
 *
 * `positions` and `times` are pre-allocated, fixed-capacity buffers filled up to
 * `pointCount`. This lets the renderer call `BufferGeometry.setDrawRange()` without
 * ever re-allocating or re-computing physics while scrubbing/animating.
 */
export interface BufferedTrack {
  particleId: string;
  /** Flat [x0,y0,z0, x1,y1,z1, ...] positions, in cm. Length = capacity * 3. */
  positions: Float32Array;
  /** Time-of-flight at each vertex, in ns, monotonically increasing. Length = capacity. */
  times: Float32Array;
  /** Number of valid points actually written into `positions`/`times`. */
  pointCount: number;
  charge: number;
  /** Copied from the input particle so the renderer can colour primary vs V0. */
  origin: ParticleOrigin;
}

/** Aggregate result of a full pre-computation pass over an event. */
export interface PropagationResult {
  tracks: BufferedTrack[];
  /** Largest `times[pointCount - 1]` across all tracks, in ns — drives the scrubber upper bound. */
  maxTimeNs: number;
}

/** Progress payload emitted while the worker (or chunked fallback) is still computing. */
export interface PropagationProgress {
  done: number;
  total: number;
}

// ---------------------------------------------------------------------------
// Worker protocol (propagation-physics.worker.ts <-> rk4-propagator.service.ts)
// ---------------------------------------------------------------------------

/** Message posted *to* the worker to kick off a precomputation pass. */
export interface PropagationWorkerRequest {
  particles: PropagationParticle[];
  fieldBuffers: import('./cheb-field-data').ChebFieldBuffers;
  options?: import('./rk4-integrator').RK4Options;
  /**
   * Extra scale on top of {@link import('./constants').FIELD_SCALE}, so the worker
   * matches the selected UI field strength (`B_ui / NOMINAL_SOLENOID_B_T`). Defaults to 1.
   */
  fieldStrengthScale?: number;
}

/** Messages posted *from* the worker back to the main thread. */
export type PropagationWorkerMessage =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; tracks: BufferedTrack[]; maxTimeNs: number }
  | { type: 'error'; message: string };
