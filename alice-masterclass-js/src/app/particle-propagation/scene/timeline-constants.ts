/**
 * Presentation/timing constants for the Particle Propagation scene.
 *
 * Deliberately kept separate from `physics/constants.ts`: these are visual
 * pacing knobs (milliseconds of wall-clock animation), not physical
 * quantities, and are shared only between `scene/collision-intro.ts` and
 * `scene/propagation-timeline.ts` (Faza 10).
 *
 * The sidebar shows detector-frame ns via `scene/physical-timeline.ts`
 * (intro option A + `nsPerMs` for propagation); these ms values stay the
 * internal animation clock.
 */

/** Duration, in ms, of the pre-collision nucleus approach (`t` in `[-INTRO_DURATION_MS, 0]`). */
export const INTRO_DURATION_MS = 900;

/**
 * Half-distance (world units) between the two nuclei at `t = -INTRO_DURATION_MS`
 * — i.e. how far out on the beam axis they start their approach.
 *
 * Set so the nuclei visually originate from *inside* the beam pipe
 * (`BP.glb`), just shy of its end, rather than floating in empty space
 * beyond it. `BP.glb` is authored asymmetrically about the interaction
 * point — after the same ITS-based recenter `detector-loader.ts` applies to
 * the whole detector group, it spans `z ≈ [-12.95, +5.81]` at
 * `PropagationScene.objectScale = 1e-2` (measured via
 * `Box3.setFromObject(bpRoot)` post-recenter; see
 * `recenterOnBeamAxis()`/`beamAxisReference()` in `detector-loader.ts`,
 * which deliberately ignores BP itself as the recenter reference for this
 * exact reason). Using a *symmetric* start distance means only the shorter
 * (`+z`, ≈5.81) side bounds the value — a larger distance would start the
 * `+z` nucleus past the pipe's cut end again. `5.7` leaves a small margin
 * inside that shorter end on both sides. Kept as a static constant rather
 * than measured at runtime — `CollisionIntro` loads independently of (in
 * parallel with) the detector model, so there is no guaranteed-ready `BP`
 * root to measure from at intro-creation time. Re-measure and update this
 * constant if `BP.glb` or `objectScale` ever change.
 */
export const BEAM_HALF_SEPARATION_START = 5.7;

/** @deprecated Use {@link BEAM_HALF_SEPARATION_START}. */
export const PROTON_HALF_SEPARATION_START = BEAM_HALF_SEPARATION_START;

/**
 * Exponent for the ease-in curve applied to intro progress (see
 * `collision-intro.ts`): `easedProgress = progress ** INTRO_EASE_IN_POWER`.
 * `1` = linear. Values `> 1` keep the nuclei slow while still far down the
 * beam pipe and let them accelerate sharply into the collision, which reads
 * as "fast" despite the much longer travel distance from L3.
 */
export const INTRO_EASE_IN_POWER = 2.4;

/**
 * Target on-screen diameter (world units) each Pb nucleus is rescaled to.
 * Kept equal to the former proton diameter so the beams still fit the pipe.
 */
export const NUCLEUS_TARGET_DIAMETER_WORLD = 0.1;

/** @deprecated Use {@link NUCLEUS_TARGET_DIAMETER_WORLD}. */
export const PROTON_TARGET_DIAMETER_WORLD = NUCLEUS_TARGET_DIAMETER_WORLD;

/**
 * Physics-ns of trajectory time-of-flight mapped to 1ms of `globalTime`
 * (`PropagationTimeline`'s `nsPerMs` option). Chosen so a typical ~15ns
 * detector traversal plays out over a few visible seconds by default
 * (`propagationDurationMs = maxTimeNs / DEFAULT_NS_PER_MS`).
 *
 * When momentum-reveal exaggeration is active, `maxTimeNs` is the max of
 * presentation `timesVis` (see `physics/momentum-reveal-timing.ts`).
 */
export const DEFAULT_NS_PER_MS = 0.005;

/** Duration, in ms, of the one-shot light flash at the moment of collision (`t = 0`). */
export const COLLISION_FLASH_DURATION_MS = 250;

/** Peak intensity of the transient `THREE.PointLight` used for the collision flash. */
export const COLLISION_FLASH_PEAK_INTENSITY = 6;
