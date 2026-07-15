/**
 * Pure (no Angular, no DOM, no Three.js) tracer for magnetic **field lines**
 * (as opposed to charged-particle trajectories, see `rk4-integrator.ts`).
 *
 * A field line through a seed point `r0` is found by integrating the unit
 * tangent field direction in both directions along arc length `s`:
 *
 *   dr/ds = +-B(r)/|B(r)|
 *
 * This is a *different* ODE from the RK4 particle propagator (no charge, no
 * momentum, no curvature term) — hence its own small RK4 stepper here rather
 * than reusing `rk4-integrator.ts`.
 *
 * Seeds are placed once on a sparse disc in the transverse (xy) plane at
 * `z = 0`; since B is strong and near-uniform along z inside the solenoid,
 * tracing each seed both ways already sweeps the whole longitudinal extent
 * of the sampled volume, so a single seed layer is enough.
 */

import { Vec3 } from './propagation-types';

export type FieldSampler = (posCm: Vec3) => Vec3;

export type FieldLineDensity = 'sparse' | 'medium' | 'dense';

export interface FieldLineTracerOptions {
  /** Seed-grid spacing preset. Defaults to `'medium'`. */
  density?: FieldLineDensity;
}

/** A single traced field line, ready to feed into `LineSegments` positions. */
export interface FieldLinePolyline {
  /** Flat `[x0,y0,z0, x1,y1,z1, ...]` positions, in cm. */
  positions: Float32Array;
  pointCount: number;
}

export interface FieldLineTraceResult {
  lines: FieldLinePolyline[];
}

/** Transverse (xy) radius within which seeds are placed, in cm. */
const SEED_RADIUS_CM = 220;

/**
 * Seed-grid spacing per density preset, in cm.
 * sparse ≈ 50 lines, medium ≈ 120, dense ≈ 250.
 */
const SEED_GRID_STEP_CM: Record<FieldLineDensity, number> = {
  sparse: 50,
  medium: 28,
  dense: 16,
};

/** Arc-length step used to walk each line, in cm. */
const STEP_CM = 4;

/** Hard cap on steps per direction (safety bound, avoids runaway loops). */
const MAX_STEPS_PER_DIRECTION = 150;

/** |B| (Tesla) below this stops the line (field considered negligible). */
const MIN_FIELD_T = 0.01;

/** Stop a line once its transverse radius exceeds this, in cm. */
const MAX_SAMPLE_RADIUS_CM = 260;

/** Stop a line once |z| exceeds this, in cm. */
const MAX_SAMPLE_Z_CM = 320;

function add(a: Vec3, b: Vec3, scaleFactor = 1): Vec3 {
  return { x: a.x + b.x * scaleFactor, y: a.y + b.y * scaleFactor, z: a.z + b.z * scaleFactor };
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 0 ? { x: a.x / len, y: a.y / len, z: a.z / len } : a;
}

function transverseRadius(r: Vec3): number {
  return Math.hypot(r.x, r.y);
}

function outOfBounds(r: Vec3): boolean {
  return transverseRadius(r) > MAX_SAMPLE_RADIUS_CM || Math.abs(r.z) > MAX_SAMPLE_Z_CM;
}

/** Unit tangent `B(r)/|B(r)|`, or `null` once the field is too weak to trace further. */
function unitTangent(sample: FieldSampler, r: Vec3): Vec3 | null {
  let b: Vec3;
  try {
    b = sample(r);
  } catch {
    return null;
  }
  const magnitude = length(b);
  if (!Number.isFinite(magnitude) || magnitude < MIN_FIELD_T) return null;
  return normalize(b);
}

/**
 * Walks a single field line starting at `seed`, one arc-length step at a time,
 * via a 4-stage RK4 on `dr/ds = direction * B(r)/|B(r)|`. Returns the points
 * walked (seed excluded), in order away from the seed.
 */
function walkDirection(sample: FieldSampler, seed: Vec3, direction: 1 | -1): Vec3[] {
  const points: Vec3[] = [];
  let r = seed;
  const h = STEP_CM * direction;

  for (let step = 0; step < MAX_STEPS_PER_DIRECTION; step++) {
    const k1 = unitTangent(sample, r);
    if (!k1) break;
    const k2 = unitTangent(sample, add(r, k1, h / 2));
    if (!k2) break;
    const k3 = unitTangent(sample, add(r, k2, h / 2));
    if (!k3) break;
    const k4 = unitTangent(sample, add(r, k3, h));
    if (!k4) break;

    const next = add(
      r,
      {
        x: k1.x + 2 * k2.x + 2 * k3.x + k4.x,
        y: k1.y + 2 * k2.y + 2 * k3.y + k4.y,
        z: k1.z + 2 * k2.z + 2 * k3.z + k4.z,
      },
      h / 6
    );

    if (outOfBounds(next)) break;

    r = next;
    points.push(r);
  }

  return points;
}

function buildSeedsForStep(stepCm: number): Vec3[] {
  const seeds: Vec3[] = [];
  const r2 = SEED_RADIUS_CM * SEED_RADIUS_CM;
  for (let x = -SEED_RADIUS_CM; x <= SEED_RADIUS_CM + 1e-6; x += stepCm) {
    for (let y = -SEED_RADIUS_CM; y <= SEED_RADIUS_CM + 1e-6; y += stepCm) {
      if (x * x + y * y > r2) continue;
      seeds.push({ x, y, z: 0 });
    }
  }
  return seeds;
}

/**
 * Traces one field line per seed (disc grid at `z = 0`, see module docstring)
 * and returns every polyline that ended up with at least 2 points.
 *
 * Polyline vertex order runs from the −B̂ end to the +B̂ end, so the tangent
 * along increasing index always points in the local field direction.
 */
export function traceFieldLines(
  sample: FieldSampler,
  options: FieldLineTracerOptions = {}
): FieldLineTraceResult {
  const { density = 'medium' } = options;
  const seeds = buildSeedsForStep(SEED_GRID_STEP_CM[density]);

  const lines: FieldLinePolyline[] = [];

  for (const seed of seeds) {
    const forward = walkDirection(sample, seed, 1);
    const backward = walkDirection(sample, seed, -1);

    const pointCount = backward.length + 1 + forward.length;
    if (pointCount < 2) continue;

    const positions = new Float32Array(pointCount * 3);
    let i = 0;
    for (let j = backward.length - 1; j >= 0; j--) {
      const p = backward[j];
      positions[i++] = p.x;
      positions[i++] = p.y;
      positions[i++] = p.z;
    }
    positions[i++] = seed.x;
    positions[i++] = seed.y;
    positions[i++] = seed.z;
    for (const p of forward) {
      positions[i++] = p.x;
      positions[i++] = p.y;
      positions[i++] = p.z;
    }

    lines.push({ positions, pointCount });
  }

  return { lines };
}

// Exported for tests only (kept private to the module otherwise).
export const __testing__ = { buildSeedsForStep, SEED_GRID_STEP_CM };
