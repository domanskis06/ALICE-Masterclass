/**
 * Pure (no Angular, no DOM) RK4 integrator for a charged particle's trajectory
 * in a (generally non-uniform) magnetic field.
 *
 * Equation of motion, parametrized by arc length `s` (cm) instead of time —
 * this avoids ever dividing by a velocity and stays valid down to `beta -> 0`:
 *
 *   dr/ds = u
 *   du/ds = k * (u x B(r)),   k = charge * B2C / |p|
 *
 * where `r` is the position (cm), `u` is the unit tangent vector (`u = p/|p|`
 * initially, then renormalized every step to counter RK4 drift), `B(r)` is the
 * magnetic field in Tesla, `charge` is in units of |e|, `|p|` is the momentum
 * magnitude in GeV/c, and `B2C = 0.299792458e-2` is the standard AliRoot
 * conversion constant (same one used for the helix curvature
 * `kappa = B2C * B * charge / pt`). Since the magnetic force does no work,
 * `|p|` (and therefore `k` and `beta`) stay exactly constant along the whole
 * trajectory, which is what makes the arc-length parametrization convenient.
 *
 * Time-of-flight at arc length `s`: `t(s) = s / (beta * c)`, with
 * `beta = |p| / E` and `c` in cm/ns — stored in ns for the UI timeline.
 *
 * This module has zero Angular/DOM dependencies so the exact same code runs
 * inside `propagation-physics.worker.ts` (off the main thread) and inside
 * `rk4-propagator.service.ts`'s no-Worker fallback.
 */

import {
  B2C,
  RK4_STEP_CM,
  MAX_RK4_STEPS,
  MAX_DETECTOR_R_CM,
  SPEED_OF_LIGHT_CM_PER_NS,
} from './constants';
import { BufferedTrack, PropagationParticle, Vec3 } from './propagation-types';

export type FieldFn = (pos: Vec3) => Vec3;

export interface RK4Options {
  /** Arc-length step, cm. Defaults to `RK4_STEP_CM`. */
  stepCm?: number;
  /** Hard cap on the number of RK4 steps. Defaults to `MAX_RK4_STEPS`. */
  maxSteps?: number;
  /** Stop once `|r|` exceeds this radius, cm. Defaults to `MAX_DETECTOR_R_CM`. */
  maxRadiusCm?: number;
}

interface State {
  r: Vec3;
  u: Vec3;
}

function add(a: Vec3, b: Vec3, scaleFactor = 1): Vec3 {
  return { x: a.x + b.x * scaleFactor, y: a.y + b.y * scaleFactor, z: a.z + b.z * scaleFactor };
}

function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(a: Vec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

function normalize(a: Vec3): Vec3 {
  const len = length(a);
  return len > 0 ? scale(a, 1 / len) : a;
}

function addState(a: State, b: State, scaleFactor: number): State {
  return { r: add(a.r, b.r, scaleFactor), u: add(a.u, b.u, scaleFactor) };
}

function scaleState(a: State, s: number): State {
  return { r: scale(a.r, s), u: scale(a.u, s) };
}

function sumStates(a: State, b: State, c: State, d: State): State {
  return {
    r: { x: a.r.x + b.r.x + c.r.x + d.r.x, y: a.r.y + b.r.y + c.r.y + d.r.y, z: a.r.z + b.r.z + c.r.z + d.r.z },
    u: { x: a.u.x + b.u.x + c.u.x + d.u.x, y: a.u.y + b.u.y + c.u.y + d.u.y, z: a.u.z + b.u.z + c.u.z + d.u.z },
  };
}

function derivative(state: State, field: FieldFn, k: number): State {
  const b = field(state.r);
  return { r: state.u, u: scale(cross(state.u, b), k) };
}

/**
 * Finds `f` in `[0, 1]` such that `|prevR + f * (nextR - prevR)| == radius`,
 * i.e. the linear-interpolation parameter at which the segment crosses the
 * detector's outer boundary sphere. Assumes `|prevR| <= radius <= |nextR|`.
 */
function sphereCrossingFraction(prevR: Vec3, nextR: Vec3, radius: number): number {
  const d = add(nextR, prevR, -1);
  const a = dot(d, d);
  if (a === 0) return 0;
  const b = 2 * dot(prevR, d);
  const c = dot(prevR, prevR) - radius * radius;
  const discriminant = Math.max(0, b * b - 4 * a * c);
  const sqrtDisc = Math.sqrt(discriminant);
  const f1 = (-b + sqrtDisc) / (2 * a);
  const f2 = (-b - sqrtDisc) / (2 * a);
  const candidates = [f1, f2].filter((f) => f >= 0 && f <= 1);
  return candidates.length > 0 ? Math.min(...candidates) : 1;
}

/**
 * Pre-computes the full trajectory of a single particle via fixed-step RK4,
 * writing every vertex into pre-allocated, fixed-capacity typed-array buffers
 * (see `BufferedTrack`) so the renderer can later scrub through it with
 * `BufferGeometry.setDrawRange()` without touching physics ever again.
 */
export function computeTrajectory(
  particle: PropagationParticle,
  field: FieldFn,
  options: RK4Options = {}
): BufferedTrack {
  const h = options.stepCm ?? RK4_STEP_CM;
  const maxSteps = options.maxSteps ?? MAX_RK4_STEPS;
  const maxRadius = options.maxRadiusCm ?? MAX_DETECTOR_R_CM;

  const pMag = length(particle.momentum);
  const beta = pMag > 0 && particle.energy > 0 ? Math.min(pMag / particle.energy, 1) : 0;
  const invBetaC = beta > 0 ? 1 / (beta * SPEED_OF_LIGHT_CM_PER_NS) : 0;
  const k = pMag > 0 ? (particle.charge * B2C) / pMag : 0;

  const capacity = maxSteps + 2;
  const positions = new Float32Array(capacity * 3);
  const times = new Float32Array(capacity);
  let pointCount = 0;

  const writePoint = (r: Vec3, s: number) => {
    const base = pointCount * 3;
    positions[base] = r.x;
    positions[base + 1] = r.y;
    positions[base + 2] = r.z;
    times[pointCount] = s * invBetaC;
    pointCount++;
  };

  let state: State = { r: { ...particle.vertex }, u: normalize(particle.momentum) };
  writePoint(state.r, 0);

  if (length(state.r) >= maxRadius) {
    return { particleId: particle.id, positions, times, pointCount, charge: particle.charge };
  }

  let s = 0;
  for (let step = 0; step < maxSteps; step++) {
    const k1 = derivative(state, field, k);
    const k2 = derivative(addState(state, k1, h / 2), field, k);
    const k3 = derivative(addState(state, k2, h / 2), field, k);
    const k4 = derivative(addState(state, k3, h), field, k);

    const weightedSum = sumStates(k1, scaleState(k2, 2), scaleState(k3, 2), k4);
    const next: State = addState(state, weightedSum, h / 6);
    next.u = normalize(next.u);

    const prevR = state.r;
    const prevS = s;
    state = next;
    s += h;

    const radius = length(state.r);
    if (radius > maxRadius) {
      const f = sphereCrossingFraction(prevR, state.r, maxRadius);
      const boundaryR = add(prevR, add(state.r, prevR, -1), f);
      writePoint(boundaryR, prevS + f * h);
      break;
    }

    writePoint(state.r, s);
  }

  return { particleId: particle.id, positions, times, pointCount, charge: particle.charge };
}

/**
 * Computes trajectories for a batch of particles, invoking `onChunk` after
 * every `chunkSize` particles (used by both the worker, to report progress,
 * and the main-thread fallback, to yield back to the event loop between chunks).
 */
export function computeTrajectoriesInChunks(
  particles: PropagationParticle[],
  field: FieldFn,
  options: RK4Options,
  chunkSize: number,
  onChunk: (tracks: BufferedTrack[], done: number, total: number) => void
): void {
  const total = particles.length;
  for (let offset = 0; offset < total; offset += chunkSize) {
    const batch = particles.slice(offset, offset + chunkSize);
    const tracks = batch.map((particle) => computeTrajectory(particle, field, options));
    onChunk(tracks, Math.min(offset + chunkSize, total), total);
  }
}
