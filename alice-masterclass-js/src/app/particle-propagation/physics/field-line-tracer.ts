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
 * Seeds sit on a disc / rings at `z = 0` (TPC bore + sparse L3 / TRD–L3 rings).
 * Tracing both ways along B̂ sweeps the solenoid; when
 * {@link FieldLineTracerOptions.includeDipoleTransition} is on, the same
 * streamlines continue past the solenoid exit into the dipole LUT (variant 1 —
 * looser dipole bounds + lower |B| floor) and non-bending dipole tails are
 * clipped (variant 2).
 *
 * Optionally {@link FieldLineTracerOptions.includeDipoleArcs} adds:
 * - paper-style seeds at the forward solenoid exit (continuous sol→dip arcs), and
 * - a **transverse** seed layer on \(x \approx 0\) inside the dipole (lines along
 *   \(B_x\), the “vertical” brush on Fig. 19). Neither densifies the z = 0 disc.
 *
 * Each polyline vertex also stores `|B|` (Tesla) for downstream colour-mapping.
 *
 * Note: the Chebyshev solenoid map ends at R ≈ 500 cm. Seeds and walk bounds
 * stay slightly inside that edge so a tiny Br does not step into B = 0.
 */

import { MAX_DETECTOR_Z_CM, SOL_MIN_Z } from './constants';
import { Vec3 } from './propagation-types';

export type FieldSampler = (posCm: Vec3) => Vec3;

/** Two UI levels: sparse, and dense (former medium — the old denser preset is gone). */
export type FieldLineDensity = 'sparse' | 'dense';

export interface FieldLineTracerOptions {
  /** Seed-grid spacing preset. Defaults to `'dense'` (former medium). */
  density?: FieldLineDensity;
  /**
   * When true, extend barrel streamlines into the solenoid→dipole hand-off
   * (deeper negative z) so dipole bend is a continuation of the same lines.
   */
  includeDipoleTransition?: boolean;
  /**
   * When true, also trace paper-style forward arcs plus the transverse dipole
   * brush (\(B_x\) lines). Does not densify the z = 0 solenoid disc.
   * Defaults to {@link includeDipoleTransition}.
   */
  includeDipoleArcs?: boolean;
}

/** A single traced field line, ready to feed into `LineSegments` positions. */
export interface FieldLinePolyline {
  /** Flat `[x0,y0,z0, x1,y1,z1, ...]` positions, in cm. */
  positions: Float32Array;
  /** `|B|` in Tesla at each vertex; `length === pointCount`. */
  magnitudes: Float32Array;
  pointCount: number;
}

export interface FieldLineTraceResult {
  lines: FieldLinePolyline[];
}

interface FieldSample {
  tangent: Vec3;
  magnitude: number;
}

interface WalkedPoint {
  pos: Vec3;
  magnitude: number;
}

interface WalkBounds {
  /** Stop once sqrt(x²+y²) exceeds this in the solenoid (cm). */
  maxRadiusCm: number;
  /**
   * Optional half-extent of the dipole LUT box once z < {@link SOL_MIN_Z}
   * (Chebyshev dipole params span roughly |x|,|y| ≤ 330 cm).
   */
  dipoleHalfExtentCm?: number;
  /** Stop once z exceeds this positive limit (cm). */
  maxZPosCm: number;
  /** Stop once z is below −this value (cm). */
  maxZNegCm: number;
  /** |B| floor (Tesla) in the solenoid / default region. */
  minFieldT: number;
  /** Optional lower |B| floor inside the dipole region. */
  minFieldDipoleT?: number;
  /** When true, always apply {@link dipoleHalfExtentCm} (dipole-only layer). */
  forceDipoleBox?: boolean;
}

/**
 * Dense seed disc (TPC / inner barrel). Outer L3 volume uses a separate sparse
 * ring set so the yoke is not flooded with streamlines.
 */
const INNER_SEED_RADIUS_CM = 220;

/**
 * Outer seed radius (cm). Kept ~10 cm inside the Chebyshev solenoid map edge
 * (R ≤ 500 cm) so the first RK4 step does not walk into B = 0.
 */
const L3_SEED_RADIUS_CM = 490;

/**
 * Inner disc seed-grid spacing per density preset, in cm.
 * sparse ≈ 50 lines, dense ≈ 120 (former medium; old dense/16 cm removed).
 */
const SEED_GRID_STEP_CM: Record<FieldLineDensity, number> = {
  sparse: 50,
  dense: 28,
};

/**
 * Sparse rings just outside the TPC (cm). Kept lean so the TRD–L3 gap can
 * carry most of the outer-line budget.
 */
const MID_RING_RADII_CM = [280, 340] as const;

/**
 * Rings filling the TRD → L3 free-bore gap (cm). Radial step 56 cm
 * (= previous ~40 cm × 1.4); outermost at {@link L3_SEED_RADIUS_CM}.
 */
const TRD_L3_RING_RADII_CM = [322, 378, 434, 490] as const;

/** Azimuthal samples on mid rings (TPC→TRD). */
const MID_RING_ANGLE_COUNT: Record<FieldLineDensity, number> = {
  sparse: 6,
  dense: 8,
};

/**
 * Azimuthal samples on TRD–L3 rings: 24 × 15° (full clock). Combined with
 * 4 radii this doubles the previous sparse TRD–L3 budget (4×12 → 4×24).
 */
const TRD_L3_RING_ANGLE_COUNT: Record<FieldLineDensity, number> = {
  sparse: 24,
  dense: 24,
};

/** Base azimuth for TRD–L3 rings (rad). 0 → seeds at 0°, 15°, 30°, … */
const TRD_L3_AZIMUTH_OFFSET_RAD = 0;

/** Mid-ring base azimuth — keep 6-fold bundles at the previously filled sectors. */
const MID_RING_AZIMUTH_OFFSET_RAD = Math.PI / 4;

/** Arc-length step used to walk each line, in cm. */
const STEP_CM = 4;

/** Hard cap on steps per direction for barrel-only tracing. */
const MAX_STEPS_PER_DIRECTION = 180;

/** Extra steps when streamlines continue into the dipole region. */
const MAX_STEPS_WITH_DIPOLE = 550;

/** z below which a line is considered inside the dipole LUT hand-off. */
const DIPOLE_REGION_Z_CM = SOL_MIN_Z;

/** z below which bend span is measured for variant-2 filtering. */
const DIPOLE_BEND_ZONE_Z_CM = -600;

/**
 * Minimum transverse span (cm) in the bend zone for a line to keep its dipole
 * tail (variant 2). Smaller → more lines kept; larger → only clear arcs.
 */
const DIPOLE_BEND_MIN_SPAN_CM = 8;

/** Non-bending lines are clipped to z ≥ this (cm) when dipole mode is on. */
const DIPOLE_CLIP_Z_CM = -560;

/**
 * Barrel lines that already reached this deep into the dipole keep their tail
 * even with a mild bend (avoids chopping continuous paper-style streamlines).
 */
const DIPOLE_KEEP_DEEP_Z_CM = -720;

/**
 * Barrel / L3 walk bounds (dipole toggle off). z ≈ ±{@link MAX_DETECTOR_Z_CM}
 * ≈ L3 magnet ends (same cap as RK4 track rendering);
 * r stays inside the Chebyshev map (R ≤ 500 cm).
 */
const BARREL_BOUNDS: WalkBounds = {
  maxRadiusCm: 498,
  maxZPosCm: MAX_DETECTOR_Z_CM,
  maxZNegCm: MAX_DETECTOR_Z_CM,
  minFieldT: 0.01,
};

/**
 * Variant 1: same seeds, deeper −z, lower |B| floor, and a dipole-box stop
 * matched to the LUT (~±330 cm) so arcs can flare inside the mapped volume.
 */
const BARREL_WITH_DIPOLE_BOUNDS: WalkBounds = {
  maxRadiusCm: 498,
  dipoleHalfExtentCm: 325,
  maxZPosCm: MAX_DETECTOR_Z_CM,
  maxZNegCm: 1700,
  minFieldT: 0.01,
  minFieldDipoleT: 0.001,
};

/**
 * Paper-style dipole layer: same walk rules as barrel→dipole (continuous
 * streamlines), seeded at the forward solenoid exit so arcs bend into the
 * dipole without densifying the z = 0 barrel disc.
 */
const DIPOLE_PAPER_BOUNDS: WalkBounds = {
  maxRadiusCm: 498,
  dipoleHalfExtentCm: 325,
  maxZPosCm: MAX_DETECTOR_Z_CM,
  maxZNegCm: 1700,
  minFieldT: 0.008,
  minFieldDipoleT: 0.001,
};

const MAX_STEPS_DIPOLE_PAPER = 550;

/** Minimum vertices after clipping a paper dipole polyline. */
const MIN_DIPOLE_PAPER_POINTS = 16;

/** Require a real forward span (cm) so short stubs are dropped. */
const MIN_DIPOLE_PAPER_Z_SPAN_CM = 220;

/**
 * Drop the mid-barrel part of paper seeds (z ≳ this) so we do not add a second
 * dense solenoid brush — keep only the forward end + continuous dipole arc.
 */
const PAPER_CLIP_MAX_Z_CM = -120;

/**
 * Dense polar rings at the forward solenoid exit (still inside the sol LUT).
 * Independent of barrel density; does not add seeds on the z = 0 disc.
 */
const DIPOLE_PAPER_SEED_Z_CM = -480;
const DIPOLE_PAPER_RADII_CM = [8, 16, 24, 32, 42, 52, 64, 78, 92] as const;
const DIPOLE_PAPER_N_PHI = 20;

/**
 * Transverse dipole layer: seeds on mid-planes of constant x inside the dipole
 * LUT. With \(B \approx B_x\), streamlines run along \(\pm x\) — the paper’s
 * “vertical” field-line brush when the beam axis is horizontal on screen.
 */
const DIPOLE_TRANSVERSE_BOUNDS: WalkBounds = {
  maxRadiusCm: 320,
  dipoleHalfExtentCm: 320,
  forceDipoleBox: true,
  maxZPosCm: -560,
  maxZNegCm: 1700,
  minFieldT: 0.001,
  minFieldDipoleT: 0.001,
};

const MAX_STEPS_DIPOLE_TRANSVERSE = 120;

/** Keep only lines with a clear span along x (cm). */
const MIN_TRANSVERSE_X_SPAN_CM = 55;

const MIN_TRANSVERSE_POINTS = 10;

/** Seed planes x = const (cm). Centre plane is densest; ±offsets thicken the brush. */
const DIPOLE_TRANSVERSE_X_PLANES_CM = [0, 45, -45] as const;

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

function inDipoleRegion(z: number): boolean {
  return z < DIPOLE_REGION_Z_CM;
}

function minFieldFor(z: number, bounds: WalkBounds): number {
  if (bounds.minFieldDipoleT != null && inDipoleRegion(z)) {
    return bounds.minFieldDipoleT;
  }
  return bounds.minFieldT;
}

function outOfBounds(r: Vec3, bounds: WalkBounds): boolean {
  if (r.z > bounds.maxZPosCm || r.z < -bounds.maxZNegCm) return true;
  if (
    bounds.dipoleHalfExtentCm != null &&
    (bounds.forceDipoleBox || inDipoleRegion(r.z))
  ) {
    const half = bounds.dipoleHalfExtentCm;
    return Math.abs(r.x) > half || Math.abs(r.y) > half;
  }
  return transverseRadius(r) > bounds.maxRadiusCm;
}

/**
 * Unit tangent `B(r)/|B(r)|` plus `|B|`, or `null` once the field is too weak
 * to trace further.
 */
function sampleTangent(sample: FieldSampler, r: Vec3, bounds: WalkBounds): FieldSample | null {
  let b: Vec3;
  try {
    b = sample(r);
  } catch {
    return null;
  }
  const magnitude = length(b);
  if (!Number.isFinite(magnitude) || magnitude < minFieldFor(r.z, bounds)) return null;
  return { tangent: normalize(b), magnitude };
}

/**
 * Walks a single field line starting at `seed`, one arc-length step at a time,
 * via a 4-stage RK4 on `dr/ds = direction * B(r)/|B(r)|`. Returns the points
 * walked (seed excluded), in order away from the seed, each with `|B|` at that
 * vertex.
 */
function walkDirection(
  sample: FieldSampler,
  seed: Vec3,
  direction: 1 | -1,
  bounds: WalkBounds,
  maxSteps: number
): WalkedPoint[] {
  const points: WalkedPoint[] = [];
  let r = seed;
  const h = STEP_CM * direction;

  for (let step = 0; step < maxSteps; step++) {
    const k1 = sampleTangent(sample, r, bounds);
    if (!k1) break;
    const k2 = sampleTangent(sample, add(r, k1.tangent, h / 2), bounds);
    if (!k2) break;
    const k3 = sampleTangent(sample, add(r, k2.tangent, h / 2), bounds);
    if (!k3) break;
    const k4 = sampleTangent(sample, add(r, k3.tangent, h), bounds);
    if (!k4) break;

    const next = add(
      r,
      {
        x: k1.tangent.x + 2 * k2.tangent.x + 2 * k3.tangent.x + k4.tangent.x,
        y: k1.tangent.y + 2 * k2.tangent.y + 2 * k3.tangent.y + k4.tangent.y,
        z: k1.tangent.z + 2 * k2.tangent.z + 2 * k3.tangent.z + k4.tangent.z,
      },
      h / 6
    );

    if (outOfBounds(next, bounds)) break;

    const atNext = sampleTangent(sample, next, bounds);
    if (!atNext) break;

    r = next;
    points.push({ pos: r, magnitude: atNext.magnitude });
  }

  return points;
}

/** Dense TPC-scale disc at z = 0. */
function buildInnerBarrelSeeds(stepCm: number): Vec3[] {
  const seeds: Vec3[] = [];
  const r2 = INNER_SEED_RADIUS_CM * INNER_SEED_RADIUS_CM;
  for (let x = -INNER_SEED_RADIUS_CM; x <= INNER_SEED_RADIUS_CM + 1e-6; x += stepCm) {
    for (let y = -INNER_SEED_RADIUS_CM; y <= INNER_SEED_RADIUS_CM + 1e-6; y += stepCm) {
      if (x * x + y * y > r2) continue;
      seeds.push({ x, y, z: 0 });
    }
  }
  return seeds;
}

function pushRingSeeds(
  seeds: Vec3[],
  radii: readonly number[],
  nAngles: number,
  azimuthOffsetRad: number
): void {
  for (const radius of radii) {
    if (radius > L3_SEED_RADIUS_CM) continue;
    for (let i = 0; i < nAngles; i++) {
      const phi = azimuthOffsetRad + (2 * Math.PI * i) / nAngles;
      seeds.push({
        x: radius * Math.cos(phi),
        y: radius * Math.sin(phi),
        z: 0,
      });
    }
  }
}

/**
 * Sparse rings filling the L3 free volume outside the TPC disc. TRD–L3 rings
 * sample 24 azimuths every 15° with ~56 cm radial spacing.
 */
function buildL3RingSeeds(density: FieldLineDensity): Vec3[] {
  const seeds: Vec3[] = [];
  pushRingSeeds(seeds, MID_RING_RADII_CM, MID_RING_ANGLE_COUNT[density], MID_RING_AZIMUTH_OFFSET_RAD);
  pushRingSeeds(
    seeds,
    TRD_L3_RING_RADII_CM,
    TRD_L3_RING_ANGLE_COUNT[density],
    TRD_L3_AZIMUTH_OFFSET_RAD
  );
  return seeds;
}

function buildBarrelSeeds(stepCm: number, density: FieldLineDensity = 'dense'): Vec3[] {
  return [...buildInnerBarrelSeeds(stepCm), ...buildL3RingSeeds(density)];
}

/**
 * Paper-style seeds at the forward solenoid exit. Does not touch the z = 0
 * barrel disc — only densifies the forward hand-off into the dipole.
 */
function buildDipoleArcSeeds(): Vec3[] {
  const seeds: Vec3[] = [];
  for (const radius of DIPOLE_PAPER_RADII_CM) {
    for (let i = 0; i < DIPOLE_PAPER_N_PHI; i++) {
      const phi = (2 * Math.PI * i) / DIPOLE_PAPER_N_PHI;
      seeds.push({
        x: radius * Math.cos(phi),
        y: radius * Math.sin(phi),
        z: DIPOLE_PAPER_SEED_Z_CM,
      });
    }
  }
  return seeds;
}

/**
 * Seeds on constant-x planes inside the dipole aperture (y–z grid).
 * Aperture half-width grows with |z| to match the Chebyshev dipole coverage.
 */
function buildDipoleTransverseSeeds(): Vec3[] {
  const seeds: Vec3[] = [];
  for (const x of DIPOLE_TRANSVERSE_X_PLANES_CM) {
    // Centre plane denser in z; offset planes slightly coarser.
    const zStep = x === 0 ? 40 : 55;
    for (let z = -660; z >= -1280; z -= zStep) {
      const halfY = Math.min(95, 30 + (-z - 550) * 0.09);
      const yStep = x === 0 ? 20 : 28;
      for (let y = -halfY; y <= halfY + 1e-6; y += yStep) {
        seeds.push({ x, y, z });
      }
    }
  }
  return seeds;
}

/** Drop stubs that never travel along the transverse (Bx) direction. */
function keepTransverseLine(line: FieldLinePolyline): FieldLinePolyline | null {
  if (line.pointCount < MIN_TRANSVERSE_POINTS) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < line.pointCount; i++) {
    const x = line.positions[i * 3];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
  }
  if (maxX - minX < MIN_TRANSVERSE_X_SPAN_CM) return null;
  return line;
}

/**
 * Keep the forward solenoid end + continuous dipole arc (paper look). Drop the
 * mid-barrel segment so these seeds do not double the solenoid brush.
 */
function clipToDipoleVolume(line: FieldLinePolyline): FieldLinePolyline | null {
  let keepCount = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < line.pointCount; i++) {
    const z = line.positions[i * 3 + 2];
    if (z > PAPER_CLIP_MAX_Z_CM) continue;
    keepCount++;
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (keepCount < MIN_DIPOLE_PAPER_POINTS) return null;
  if (maxZ - minZ < MIN_DIPOLE_PAPER_Z_SPAN_CM) return null;
  // Must actually enter the dipole LUT region.
  if (minZ > DIPOLE_REGION_Z_CM) return null;

  const positions = new Float32Array(keepCount * 3);
  const magnitudes = new Float32Array(keepCount);
  let w = 0;
  let m = 0;
  for (let i = 0; i < line.pointCount; i++) {
    if (line.positions[i * 3 + 2] > PAPER_CLIP_MAX_Z_CM) continue;
    positions[w++] = line.positions[i * 3];
    positions[w++] = line.positions[i * 3 + 1];
    positions[w++] = line.positions[i * 3 + 2];
    magnitudes[m++] = line.magnitudes[i];
  }
  return { positions, magnitudes, pointCount: keepCount };
}

function traceSeed(
  sample: FieldSampler,
  seed: Vec3,
  bounds: WalkBounds,
  maxSteps: number
): FieldLinePolyline | null {
  const seedSample = sampleTangent(sample, seed, bounds);
  if (!seedSample) return null;

  const forward = walkDirection(sample, seed, 1, bounds, maxSteps);
  const backward = walkDirection(sample, seed, -1, bounds, maxSteps);

  const pointCount = backward.length + 1 + forward.length;
  if (pointCount < 2) return null;

  const positions = new Float32Array(pointCount * 3);
  const magnitudes = new Float32Array(pointCount);
  let i = 0;
  let m = 0;
  for (let j = backward.length - 1; j >= 0; j--) {
    const p = backward[j];
    positions[i++] = p.pos.x;
    positions[i++] = p.pos.y;
    positions[i++] = p.pos.z;
    magnitudes[m++] = p.magnitude;
  }
  positions[i++] = seed.x;
  positions[i++] = seed.y;
  positions[i++] = seed.z;
  magnitudes[m++] = seedSample.magnitude;
  for (const p of forward) {
    positions[i++] = p.pos.x;
    positions[i++] = p.pos.y;
    positions[i++] = p.pos.z;
    magnitudes[m++] = p.magnitude;
  }

  return { positions, magnitudes, pointCount };
}

/** True when the dipole segment (z < bend zone) shows clear transverse motion. */
function bendsInDipole(line: FieldLinePolyline): boolean {
  let minX = Infinity;
  let maxX = -Infinity;
  let minR = Infinity;
  let maxR = -Infinity;
  let count = 0;
  for (let i = 0; i < line.pointCount; i++) {
    const z = line.positions[i * 3 + 2];
    if (z >= DIPOLE_BEND_ZONE_Z_CM) continue;
    const x = line.positions[i * 3];
    const y = line.positions[i * 3 + 1];
    const r = Math.hypot(x, y);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minR = Math.min(minR, r);
    maxR = Math.max(maxR, r);
    count++;
  }
  if (count < 2) return false;
  return maxX - minX >= DIPOLE_BEND_MIN_SPAN_CM || maxR - minR >= DIPOLE_BEND_MIN_SPAN_CM;
}

/**
 * Variant 2: keep the full polyline when it bends in the dipole; otherwise drop
 * the nearly-straight dipole tail so only didactic arcs remain beyond the
 * solenoid hand-off.
 */
function clipNonBendingDipoleTail(line: FieldLinePolyline): FieldLinePolyline | null {
  if (bendsInDipole(line)) return line;

  let minZ = Infinity;
  for (let i = 0; i < line.pointCount; i++) {
    minZ = Math.min(minZ, line.positions[i * 3 + 2]);
  }
  // Deep continuous streamlines: keep even if the bend metric is mild.
  if (minZ <= DIPOLE_KEEP_DEEP_Z_CM) return line;

  let keepCount = 0;
  for (let i = 0; i < line.pointCount; i++) {
    if (line.positions[i * 3 + 2] >= DIPOLE_CLIP_Z_CM) keepCount++;
  }
  if (keepCount < 2) return null;

  const positions = new Float32Array(keepCount * 3);
  const magnitudes = new Float32Array(keepCount);
  let w = 0;
  let m = 0;
  for (let i = 0; i < line.pointCount; i++) {
    if (line.positions[i * 3 + 2] < DIPOLE_CLIP_Z_CM) continue;
    positions[w++] = line.positions[i * 3];
    positions[w++] = line.positions[i * 3 + 1];
    positions[w++] = line.positions[i * 3 + 2];
    magnitudes[m++] = line.magnitudes[i];
  }
  return { positions, magnitudes, pointCount: keepCount };
}

/**
 * Traces one field line per seed and returns every polyline that ended up with
 * at least 2 points.
 *
 * Polyline vertex order runs from the −B̂ end to the +B̂ end, so the tangent
 * along increasing index always points in the local field direction.
 */
export function traceFieldLines(
  sample: FieldSampler,
  options: FieldLineTracerOptions = {}
): FieldLineTraceResult {
  const { density = 'dense', includeDipoleTransition = false } = options;
  const includeDipoleArcs = options.includeDipoleArcs ?? includeDipoleTransition;
  const bounds = includeDipoleTransition ? BARREL_WITH_DIPOLE_BOUNDS : BARREL_BOUNDS;
  const maxSteps = includeDipoleTransition ? MAX_STEPS_WITH_DIPOLE : MAX_STEPS_PER_DIRECTION;
  const lines: FieldLinePolyline[] = [];

  for (const seed of buildBarrelSeeds(SEED_GRID_STEP_CM[density], density)) {
    const traced = traceSeed(sample, seed, bounds, maxSteps);
    if (!traced) continue;
    const line = includeDipoleTransition ? clipNonBendingDipoleTail(traced) : traced;
    if (line) lines.push(line);
  }

  if (includeDipoleArcs) {
    for (const seed of buildDipoleArcSeeds()) {
      const traced = traceSeed(sample, seed, DIPOLE_PAPER_BOUNDS, MAX_STEPS_DIPOLE_PAPER);
      if (!traced) continue;
      const arc = clipToDipoleVolume(traced);
      if (arc) lines.push(arc);
    }
    for (const seed of buildDipoleTransverseSeeds()) {
      const traced = traceSeed(
        sample,
        seed,
        DIPOLE_TRANSVERSE_BOUNDS,
        MAX_STEPS_DIPOLE_TRANSVERSE
      );
      if (!traced) continue;
      const transverse = keepTransverseLine(traced);
      if (transverse) lines.push(transverse);
    }
  }

  return { lines };
}

// Exported for tests only (kept private to the module otherwise).
export const __testing__ = {
  buildBarrelSeeds,
  buildInnerBarrelSeeds,
  buildL3RingSeeds,
  buildDipoleArcSeeds,
  buildDipoleTransverseSeeds,
  keepTransverseLine,
  bendsInDipole,
  clipNonBendingDipoleTail,
  clipToDipoleVolume,
  SEED_GRID_STEP_CM,
  INNER_SEED_RADIUS_CM,
  L3_SEED_RADIUS_CM,
  TRD_L3_AZIMUTH_OFFSET_RAD,
  DIPOLE_BEND_MIN_SPAN_CM,
  DIPOLE_CLIP_Z_CM,
  DIPOLE_PAPER_SEED_Z_CM,
  PAPER_CLIP_MAX_Z_CM,
  MIN_TRANSVERSE_X_SPAN_CM,
  DIPOLE_PAPER_BOUNDS,
  DIPOLE_TRANSVERSE_BOUNDS,
  BARREL_BOUNDS,
  BARREL_WITH_DIPOLE_BOUNDS,
};
