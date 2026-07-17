/**
 * Turns pre-computed `BufferedTrack`s (Faza 4, RK4 worker output) into fat
 * `Line2` polylines and exposes a **physics-free** way to reveal them
 * incrementally over time via `InstancedBufferGeometry.instanceCount`.
 *
 * Per the architecture rule: this file does zero force/integration math. It
 * only copies+rescales an already-computed position buffer and does a binary
 * search over an already-computed time buffer.
 *
 * Track thickness is {@link DEFAULT_TRACK_LINEWIDTH} (CSS pixels on
 * `LineMaterial.linewidth`) — the same lever EventDisplay uses for
 * `trackWidth`. Change that constant to retune all particle tracks.
 */

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

import { BufferedTrack } from '../physics/propagation-types';

/**
 * Track colours by electric charge (HEP convention for this module):
 * - positive → red
 * - negative → blue
 * Neutral is only a defensive fallback for unknown charge.
 */
export const POSITIVE_TRACK_COLOR = '#E53935';
export const NEGATIVE_TRACK_COLOR = '#2F6BFF';
export const NEUTRAL_TRACK_COLOR = '#B0BEC5';

/**
 * Fat-line width in CSS pixels. Default `2` is ~2× a classic WebGL `THREE.Line`
 * (always 1 px) and matches EventDisplay's default `trackWidth`.
 */
export const DEFAULT_TRACK_LINEWIDTH = 2;

export interface TrackLineOptions {
  /** Override {@link DEFAULT_TRACK_LINEWIDTH}. */
  linewidth?: number;
  /** Canvas size used to initialise `LineMaterial.resolution`. */
  resolution?: { width: number; height: number };
}

function colorForTrack(track: BufferedTrack): THREE.Color {
  if (track.charge > 0) return new THREE.Color(POSITIVE_TRACK_COLOR);
  if (track.charge < 0) return new THREE.Color(NEGATIVE_TRACK_COLOR);
  return new THREE.Color(NEUTRAL_TRACK_COLOR);
}

/**
 * Builds one fat `Line2` per track. `positions` are copied out of the
 * physics buffer (cm) and rescaled to world units (`* scale`, i.e.
 * `PropagationScene.objectScale`) — the original `BufferedTrack.positions`
 * is left untouched so it can still be scrubbed/re-rendered at any scale.
 *
 * Every line starts with `instanceCount = 0`: fully built, but invisible,
 * until `updateDrawRange` reveals it (Faza 10, `t > 0`).
 */
export function createTrackLines(
  tracks: BufferedTrack[],
  scale: number,
  options: TrackLineOptions = {}
): Line2[] {
  const linewidth = options.linewidth ?? DEFAULT_TRACK_LINEWIDTH;
  const resolution = options.resolution ?? { width: 1, height: 1 };
  const res = new THREE.Vector2(Math.max(1, resolution.width), Math.max(1, resolution.height));

  return tracks.map((track) => {
    const scaledPositions = new Float32Array(track.positions.length);
    for (let i = 0; i < track.positions.length; i++) {
      scaledPositions[i] = track.positions[i] * scale;
    }

    const geometry = new LineGeometry();
    if (track.pointCount >= 2) {
      geometry.setPositions(scaledPositions);
    } else if (track.pointCount === 1) {
      // LineGeometry needs ≥2 points; duplicate the lone vertex so the object exists.
      geometry.setPositions([
        scaledPositions[0],
        scaledPositions[1],
        scaledPositions[2],
        scaledPositions[0],
        scaledPositions[1],
        scaledPositions[2],
      ]);
    } else {
      geometry.setPositions([0, 0, 0, 0, 0, 0]);
    }

    const material = new LineMaterial({
      color: colorForTrack(track),
      linewidth,
      resolution: res,
      worldUnits: false,
      transparent: false,
      depthTest: true,
      depthWrite: true,
    });

    const line = new Line2(geometry, material);
    line.computeLineDistances();
    line.geometry.instanceCount = 0;
    line.userData = { particleId: track.particleId, charge: track.charge, origin: track.origin };
    return line;
  });
}

/**
 * Binary-search the last index `i` such that `track.times[i] <= t`. Returns
 * -1 when `t` is before the first sample (nothing visible yet).
 */
function lastVisibleIndex(track: BufferedTrack, t: number): number {
  const { times, pointCount } = track;
  if (pointCount === 0 || t < times[0]) return -1;
  if (t >= times[pointCount - 1]) return pointCount - 1;

  let lo = 0;
  let hi = pointCount - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (times[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Reveals the prefix of `line` corresponding to the physics points already
 * reached by `tSincePropagationStart` (same units as `BufferedTrack.times`,
 * i.e. ns since the particle left its production vertex). Physics-free: pure
 * buffer lookup + `instanceCount` write.
 */
export function updateDrawRange(line: Line2, track: BufferedTrack, tSincePropagationStart: number): void {
  const index = lastVisibleIndex(track, tSincePropagationStart);
  // `index` is the last visible vertex; segment count between 0..index is `index`.
  line.geometry.instanceCount = Math.max(0, index);
}

/** Updates `LineMaterial.resolution` on every line (call on canvas resize). */
export function setTrackLinesResolution(
  lines: Line2[],
  width: number,
  height: number
): void {
  const res = new THREE.Vector2(Math.max(1, width), Math.max(1, height));
  for (const line of lines) {
    (line.material as LineMaterial).resolution.copy(res);
  }
}
