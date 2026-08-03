/**
 * Single source of truth mapping "time from the GUI" to "what's visible".
 *
 * The rest of the module (Angular Material controls on the right sidebar) only ever calls
 * `applyTime(globalTimeMs)` — it never touches `CollisionIntro` or the track
 * lines directly. `globalTimeMs` spans three phases (KRYTYCZNE, patrz plan):
 *
 *   - `t < 0`  (intro):        Pb nuclei fly in, tracks hidden.
 *   - `t = 0`  (collision):    one-shot flash callback, nuclei vanish.
 *   - `t > 0`  (propagation):  tracks revealed via `setDrawRange` (Faza 9).
 *
 * No physics or Chebyshev evaluation happens here — only visibility toggles
 * and a binary-search lookup delegated to `track-renderer.ts`.
 */

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { BufferedTrack } from '../physics/propagation-types';
import { updateDrawRange } from './track-renderer';
import { CollisionIntro } from './collision-intro';
import { INTRO_DURATION_MS } from './timeline-constants';

export interface PropagationTimelineOptions {
  /** ns of physical time-of-flight mapped to 1 ms of `globalTime` during the propagation phase. Defaults to 1 (1:1, i.e. `playbackSpeed = 1`). */
  nsPerMs?: number;
  /** Fired once per crossing from `t < 0` to `t >= 0` — e.g. to trigger a light-flash/scale-pop effect. Never fired for `reset()`. */
  onCollisionMoment?: () => void;
}

export class PropagationTimeline {
  readonly introDurationMs = INTRO_DURATION_MS;
  readonly propagationDurationMs: number;

  private readonly nsPerMs: number;
  private lastAppliedTimeMs: number | null = null;

  constructor(
    private readonly collisionIntro: CollisionIntro,
    private readonly tracksGroup: THREE.Group,
    private readonly tracks: BufferedTrack[],
    private readonly lines: Line2[],
    maxTimeNs: number,
    private readonly options: PropagationTimelineOptions = {}
  ) {
    this.nsPerMs = options.nsPerMs ?? 1;
    this.propagationDurationMs = this.nsPerMs > 0 ? maxTimeNs / this.nsPerMs : maxTimeNs;
  }

  /** Lower bound for the time slider: start of the intro. */
  get minTimeMs(): number {
    return -this.introDurationMs;
  }

  /** Upper bound for the time slider: end of the pre-computed propagation. */
  get maxTimeMs(): number {
    return this.propagationDurationMs;
  }

  /**
   * Applies `globalTimeMs` (clamped to `[minTimeMs, maxTimeMs]` by the caller
   * / GUI) to the scene. Idempotent and scrub-safe: can be called with a time
   * before *or* after the previously applied one in any order.
   */
  applyTime(globalTimeMs: number): void {
    const crossedIntoCollision = this.lastAppliedTimeMs !== null && this.lastAppliedTimeMs < 0 && globalTimeMs >= 0;
    this.lastAppliedTimeMs = globalTimeMs;
    if (crossedIntoCollision) {
      this.options.onCollisionMoment?.();
    }

    // CollisionIntro.update() already hides the nuclei for t >= 0 and
    // repositions them for t < 0 — safe to call unconditionally.
    this.collisionIntro.update(globalTimeMs);

    if (globalTimeMs < 0) {
      this.tracksGroup.visible = false;
      return;
    }

    this.tracksGroup.visible = true;
    const tNs = globalTimeMs * this.nsPerMs;
    for (let i = 0; i < this.tracks.length; i++) {
      updateDrawRange(this.lines[i], this.tracks[i], tNs);
    }
  }

  /** Rewinds to the very start of the intro (`t = minTimeMs`) without firing `onCollisionMoment`. */
  reset(): void {
    this.lastAppliedTimeMs = null;
    this.applyTime(this.minTimeMs);
  }
}
