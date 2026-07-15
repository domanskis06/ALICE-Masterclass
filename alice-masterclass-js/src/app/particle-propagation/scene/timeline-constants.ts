/**
 * Presentation/timing constants for the Particle Propagation scene.
 *
 * Deliberately kept separate from `physics/constants.ts`: these are visual
 * pacing knobs (milliseconds of wall-clock animation), not physical
 * quantities, and are shared only between `scene/collision-intro.ts` and
 * `scene/propagation-timeline.ts` (Faza 10).
 */

/** Duration, in ms, of the pre-collision proton approach (`t` in `[-INTRO_DURATION_MS, 0]`). */
export const INTRO_DURATION_MS = 2500;

/** Half-distance (world units) between the two protons at `t = -INTRO_DURATION_MS`. */
export const PROTON_HALF_SEPARATION_START = 0.42;

/** Target on-screen diameter (world units) each proton model is rescaled to. */
export const PROTON_TARGET_DIAMETER_WORLD = 0.1;

/**
 * Physics-ns of trajectory time-of-flight mapped to 1ms of `globalTime`
 * (`PropagationTimeline`'s `nsPerMs` option). Chosen so a typical ~15ns
 * detector traversal plays out over a few visible seconds by default
 * (`propagationDurationMs = maxTimeNs / DEFAULT_NS_PER_MS`).
 */
export const DEFAULT_NS_PER_MS = 0.005;

/** Duration, in ms, of the one-shot light flash at the moment of collision (`t = 0`). */
export const COLLISION_FLASH_DURATION_MS = 250;

/** Peak intensity of the transient `THREE.PointLight` used for the collision flash. */
export const COLLISION_FLASH_PEAK_INTENSITY = 6;
