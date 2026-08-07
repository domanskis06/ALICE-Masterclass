import { Injectable } from '@angular/core';

/**
 * Visual-only clipping of event trajectories to detector volumes.
 * Does not mutate JSON track data — callers pass polylines and draw the result.
 */
@Injectable({ providedIn: 'root' })
export class TrackVolumeClipService {
  /**
   * L3 free-bore apothem (cm): regular octagon with axis-aligned flats,
   * measured from `L3.glb` liner inner face (Mesh_0).
   */
  static readonly L3_BORE_APOTHEM_CM = 558.93;

  /**
   * L3 free-bore half-length along the beam (cm), from `L3.glb` end-caps.
   * Trajectory / Three.js frame: beam = z.
   */
  static readonly L3_BORE_Z_CM = 587.49;

  private static readonly INV_SQRT2 = 1 / Math.SQRT2;

  /**
   * Regular-octagon transverse norm (axis-aligned flats):
   * max(|x|, |y|, (|x|+|y|)/√2). Inside when this is &lt; apothem.
   */
  static octagonNorm(x: number, y: number): number {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    return Math.max(ax, ay, (ax + ay) * TrackVolumeClipService.INV_SQRT2);
  }

  /** True when (x,y,z) lies inside the L3 free-bore octagonal prism. */
  static isInsideL3Bore(p: number[]): boolean {
    return TrackVolumeClipService.isInsideOctagonalPrism(
      p,
      TrackVolumeClipService.L3_BORE_APOTHEM_CM,
      TrackVolumeClipService.L3_BORE_Z_CM
    );
  }

  static isInsideOctagonalPrism(p: number[], apothem: number, zMax: number): boolean {
    if (!p || !(apothem > 0) || !(zMax > 0)) {
      return false;
    }
    return (
      Math.abs(p[2]) < zMax &&
      TrackVolumeClipService.octagonNorm(p[0], p[1]) < apothem
    );
  }

  /**
   * Fraction in [0, 1] where segment a→b first exits the octagonal prism
   * (8 transverse half-planes + ±z caps). Returns 1 if the segment stays inside.
   */
  static octagonalPrismExitFraction(
    a: number[],
    b: number[],
    apothem: number,
    zMax: number
  ): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const dz = b[2] - a[2];
    let best = 1;

    // ±z end-caps (outward only).
    if (dz > 0) {
      const t = (zMax - a[2]) / dz;
      if (t >= 0 && t <= 1) {
        best = Math.min(best, t);
      }
    } else if (dz < 0) {
      const t = (-zMax - a[2]) / dz;
      if (t >= 0 && t <= 1) {
        best = Math.min(best, t);
      }
    }

    // Flat outward normals at 0°, 45°, 90°, 135° → n·p = apothem.
    const planes: Array<[number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [TrackVolumeClipService.INV_SQRT2, TrackVolumeClipService.INV_SQRT2],
      [-TrackVolumeClipService.INV_SQRT2, -TrackVolumeClipService.INV_SQRT2],
      [TrackVolumeClipService.INV_SQRT2, -TrackVolumeClipService.INV_SQRT2],
      [-TrackVolumeClipService.INV_SQRT2, TrackVolumeClipService.INV_SQRT2],
    ];

    for (const [nx, ny] of planes) {
      const da = nx * dx + ny * dy;
      if (da <= 1e-15) {
        continue;
      }
      const t = (apothem - (nx * a[0] + ny * a[1])) / da;
      if (t >= 0 && t <= 1) {
        best = Math.min(best, t);
      }
    }

    return best;
  }

  /**
   * Keeps points inside the regular octagonal prism; interpolates the first exit.
   * Same polyline convention as EventDisplay cylinder clip (cm, beam = z).
   */
  static clipTrajectoryToOctagonalPrism(
    trajectory: number[][],
    apothem: number,
    zMax: number
  ): number[][] {
    if (!trajectory?.length || !(apothem > 0) || !(zMax > 0)) {
      return [];
    }
    const inside = (p: number[]) =>
      TrackVolumeClipService.isInsideOctagonalPrism(p, apothem, zMax);

    const out: number[][] = [];
    for (let i = 0; i < trajectory.length; i++) {
      const p = trajectory[i];
      if (inside(p)) {
        out.push([p[0], p[1], p[2]]);
        continue;
      }
      if (i === 0) {
        return [];
      }
      const prev = trajectory[i - 1];
      if (!inside(prev)) {
        break;
      }
      const t = TrackVolumeClipService.octagonalPrismExitFraction(
        prev,
        p,
        apothem,
        zMax
      );
      out.push([
        prev[0] + t * (p[0] - prev[0]),
        prev[1] + t * (p[1] - prev[1]),
        prev[2] + t * (p[2] - prev[2]),
      ]);
      break;
    }
    return out;
  }

  /** Clip to the L3 magnet free bore (visual envelope for VA tracks). */
  clipTrajectoryToL3Bore(trajectory: number[][]): number[][] {
    return TrackVolumeClipService.clipTrajectoryToOctagonalPrism(
      trajectory,
      TrackVolumeClipService.L3_BORE_APOTHEM_CM,
      TrackVolumeClipService.L3_BORE_Z_CM
    );
  }
}
