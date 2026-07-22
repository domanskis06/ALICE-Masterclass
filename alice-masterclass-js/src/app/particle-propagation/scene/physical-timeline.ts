/**
 * Maps the presentation scrubber clock (`globalTimeMs` in
 * {@link PropagationTimeline}) to physical detector time (ns) for the UI
 * readout / slider labels.
 *
 * Animation pacing stays in wall-clock ms; only the displayed axis is remapped:
 *
 *   - Intro (`t < 0`): option A — linear map
 *     `[-INTRO_DURATION_MS, 0]` → `[-INTRO_APPROACH_DURATION_NS, 0]`,
 *     where the approach duration is light-travel time over
 *     {@link PROTON_HALF_SEPARATION_START}.
 *   - Propagation (`t ≥ 0`): `t_ns = t_ms * nsPerMs` (same scale the timeline
 *     already uses to index track TOF buffers).
 */

import { SPEED_OF_LIGHT_CM_PER_NS } from '../physics/constants';
import { PropagationScene } from './propagation-scene';
import {
  DEFAULT_NS_PER_MS,
  INTRO_DURATION_MS,
  PROTON_HALF_SEPARATION_START,
} from './timeline-constants';

/** cm per Three.js world unit (`1 / PropagationScene.objectScale`). */
const CM_PER_WORLD_UNIT = 1 / PropagationScene.objectScale;

/**
 * Physical duration of the proton approach shown in the intro: half-separation
 * along the beam axis divided by c (≈ 19 ns for the default start distance).
 */
export const INTRO_APPROACH_DURATION_NS =
  (PROTON_HALF_SEPARATION_START * CM_PER_WORLD_UNIT) / SPEED_OF_LIGHT_CM_PER_NS;

export interface PhysicalTimelineScale {
  /** Presentation intro length in ms (default {@link INTRO_DURATION_MS}). */
  introDurationMs?: number;
  /** Physical intro length in ns (default {@link INTRO_APPROACH_DURATION_NS}). */
  introDurationNs?: number;
  /** Propagation scale: physics-ns per presentation-ms (default {@link DEFAULT_NS_PER_MS}). */
  nsPerMs?: number;
}

function resolveScale(scale: PhysicalTimelineScale = {}): {
  introDurationMs: number;
  introDurationNs: number;
  nsPerMs: number;
} {
  return {
    introDurationMs: scale.introDurationMs ?? INTRO_DURATION_MS,
    introDurationNs: scale.introDurationNs ?? INTRO_APPROACH_DURATION_NS,
    nsPerMs: scale.nsPerMs ?? DEFAULT_NS_PER_MS,
  };
}

/** Presentation `globalTimeMs` → physical detector time in ns (option A for intro). */
export function presentationMsToPhysicalNs(
  globalTimeMs: number,
  scale: PhysicalTimelineScale = {}
): number {
  const { introDurationMs, introDurationNs, nsPerMs } = resolveScale(scale);
  if (globalTimeMs < 0) {
    if (!(introDurationMs > 0)) return 0;
    return globalTimeMs * (introDurationNs / introDurationMs);
  }
  return globalTimeMs * nsPerMs;
}

/** Inverse of {@link presentationMsToPhysicalNs} for scrubbing the slider in ns. */
export function physicalNsToPresentationMs(
  physicalNs: number,
  scale: PhysicalTimelineScale = {}
): number {
  const { introDurationMs, introDurationNs, nsPerMs } = resolveScale(scale);
  if (physicalNs < 0) {
    if (!(introDurationNs > 0)) return 0;
    return physicalNs * (introDurationMs / introDurationNs);
  }
  return nsPerMs > 0 ? physicalNs / nsPerMs : physicalNs;
}
