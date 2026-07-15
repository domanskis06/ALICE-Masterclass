/**
 * Curate Particle Propagation demo events from Strangeness Visual Analysis part1.
 *
 * Reads local `src/assets/exercises/strangeness/part1/event_*.json` and writes
 * 10 compact events under `src/assets/exercises/particle-propagation/`:
 *
 *   - primary tracks (VA `tracks[]`) → origin "primary", vertex at IP (0,0,0),
 *     charge inferred from the stored helix `trajectory` (part1 exports sign=0)
 *   - first V0 decay pair (VA `decays[]`, type===1) → origin "v0",
 *     charge = sign, vertex = secondary from trajectory[0]
 *
 * Cascades (type 2/3) are skipped. Output schema (RK4 input only):
 *
 *   { tracks: Array<{ charge, origin, X, Y, Z, px, py, pz, E, mass }> }
 *
 * Run from `alice-masterclass-js`:
 *   node scripts/curate-propagation-events.mjs
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PART1_DIR = resolve(ROOT, 'src/assets/exercises/strangeness/part1');
const OUT_DIR = resolve(ROOT, 'src/assets/exercises/particle-propagation');

const EVENT_COUNT = 10;
const MIN_PRIMARY = 8;
const MAX_PRIMARY = 38; // leave room for 2 V0 daughters under MAX_TRACKED_PARTICLES=40
const TRACK_TYPE_V0 = 1;

/** AliRoot B2C — same as physics/constants.ts (p[GeV/c] = B2C * B[T] * R[cm] * |q|). */
const B2C = 0.299792458e-2;
/** Nominal solenoid |B| used by TEveTrackPropagator in convert_events.C. */
const VA_BZ_MAG_T = 0.5;
/**
 * Signed Bz for charge inference: TEve's helix bends opposite to our RK4
 * Lorentz convention at +Bz (same family of sign issues as FIELD_SCALE).
 * Matching stored VA trajectories requires −Bz here.
 */
const VA_BZ_T = -VA_BZ_MAG_T;

function pMag(t) {
  return Math.hypot(t.px, t.py, t.pz);
}

function normalize(v) {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 0 };
}

function add(a, b, s = 1) {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * One RK4-ish Euler step of du/ds = k (u × B) with uniform B = (0,0,Bz),
 * matching the Lorentz-force sign convention of our RK4 integrator.
 */
function stepHelix(r, u, p, charge, ds, bz) {
  const k = p > 0 ? (charge * B2C) / p : 0;
  const B = { x: 0, y: 0, z: bz };
  const uxB = cross(u, B);
  const newU = normalize(add(u, uxB, k * ds));
  const newR = add(r, u, ds);
  return { r: newR, u: newU };
}

/**
 * Infer electric charge (±1) by walking a short helix with q = ±1 under VA's
 * nominal Bz and picking the sign whose path stays closest to `trajectory`.
 */
function inferChargeFromTrajectory(track) {
  const traj = track.trajectory;
  if (!Array.isArray(traj) || traj.length < 3) return null;

  const p = pMag(track);
  if (!(p > 0)) return null;

  const start = { x: traj[0][0], y: traj[0][1], z: traj[0][2] };
  const u0 = normalize({ x: track.px, y: track.py, z: track.pz });

  // Compare over a short arc (~first few cm of the polyline).
  const maxCompare = Math.min(traj.length, 12);
  let pathLen = 0;
  for (let i = 1; i < maxCompare; i++) {
    pathLen += Math.hypot(
      traj[i][0] - traj[i - 1][0],
      traj[i][1] - traj[i - 1][1],
      traj[i][2] - traj[i - 1][2]
    );
  }
  if (!(pathLen > 0.5)) return null;

  const ds = 0.5; // cm
  const nSteps = Math.max(2, Math.ceil(pathLen / ds));

  function score(charge) {
    let r = { ...start };
    let u = { ...u0 };
    for (let s = 0; s < nSteps; s++) {
      ({ r, u } = stepHelix(r, u, p, charge, ds, VA_BZ_T));
    }
    // Distance to the trajectory point at roughly the same arc length.
    let acc = 0;
    let idx = 0;
    for (let i = 1; i < maxCompare; i++) {
      acc += Math.hypot(
        traj[i][0] - traj[i - 1][0],
        traj[i][1] - traj[i - 1][1],
        traj[i][2] - traj[i - 1][2]
      );
      if (acc >= pathLen * 0.9) {
        idx = i;
        break;
      }
      idx = i;
    }
    const target = traj[idx];
    return Math.hypot(r.x - target[0], r.y - target[1], r.z - target[2]);
  }

  const errPos = score(1);
  const errNeg = score(-1);
  if (!Number.isFinite(errPos) || !Number.isFinite(errNeg)) return null;
  // Near-straight tracks: either sign fits; prefer the geometrically clearer one,
  // and if essentially tied, fall back to the signed transverse curvature.
  if (Math.abs(errPos - errNeg) < 1e-3) {
    const d1 = {
      x: traj[1][0] - traj[0][0],
      y: traj[1][1] - traj[0][1],
      z: traj[1][2] - traj[0][2],
    };
    const d2 = {
      x: traj[2][0] - traj[1][0],
      y: traj[2][1] - traj[1][1],
      z: traj[2][2] - traj[1][2],
    };
    const cz = d1.x * d2.y - d1.y * d2.x;
    // With VA_BZ_T < 0 in the matcher, q > 0 tracks have cz > 0 on stored paths.
    if (Math.abs(cz) < 1e-12) return null;
    return cz > 0 ? 1 : -1;
  }
  return errPos < errNeg ? 1 : -1;
}

function findFirstV0(decays) {
  if (!Array.isArray(decays)) return null;
  for (const group of decays) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const a = group[0];
    const b = group[1];
    if (a?.type !== TRACK_TYPE_V0 || b?.type !== TRACK_TYPE_V0) continue;
    if (a.sign !== 1 && a.sign !== -1) continue;
    if (b.sign !== 1 && b.sign !== -1) continue;
    if (a.sign === b.sign) continue;
    if (!a.trajectory?.[0] || !b.trajectory?.[0]) continue;
    return [a, b];
  }
  return null;
}

function secondaryVertex(a, b) {
  const ta = a.trajectory[0];
  const tb = b.trajectory[0];
  return {
    X: (ta[0] + tb[0]) / 2,
    Y: (ta[1] + tb[1]) / 2,
    Z: (ta[2] + tb[2]) / 2,
  };
}

function toPrimaryTrack(raw) {
  const charge = inferChargeFromTrajectory(raw);
  if (charge !== 1 && charge !== -1) return null;
  const mass = Number(raw.mass) || 0.13957;
  const px = raw.px;
  const py = raw.py;
  const pz = raw.pz;
  const E = Number(raw.E) > 0 ? raw.E : Math.hypot(mass, pMag(raw));
  return {
    charge,
    origin: 'primary',
    X: 0,
    Y: 0,
    Z: 0,
    px,
    py,
    pz,
    E,
    mass,
  };
}

function toV0Track(raw, vertex) {
  const charge = raw.sign;
  if (charge !== 1 && charge !== -1) return null;
  const mass = Number(raw.mass) || 0.13957;
  const E = Number(raw.E) > 0 ? raw.E : Math.hypot(mass, pMag(raw));
  return {
    charge,
    origin: 'v0',
    X: vertex.X,
    Y: vertex.Y,
    Z: vertex.Z,
    px: raw.px,
    py: raw.py,
    pz: raw.pz,
    E,
    mass,
  };
}

function curateEvent(rawEvent) {
  const v0Pair = findFirstV0(rawEvent.decays);
  if (!v0Pair) return null;

  const vertex = secondaryVertex(v0Pair[0], v0Pair[1]);
  const rxy = Math.hypot(vertex.X, vertex.Y);
  if (!(rxy > 0.3)) return null; // must be visibly off-IP

  const v0Tracks = v0Pair.map((t) => toV0Track(t, vertex)).filter(Boolean);
  if (v0Tracks.length !== 2) return null;

  const primaries = [];
  for (const t of rawEvent.tracks ?? []) {
    const mapped = toPrimaryTrack(t);
    if (mapped) primaries.push(mapped);
  }
  if (primaries.length < MIN_PRIMARY) return null;

  primaries.sort((a, b) => pMag(b) - pMag(a));
  const keptPrimary = primaries.slice(0, MAX_PRIMARY);

  return { tracks: [...keptPrimary, ...v0Tracks] };
}

async function main() {
  const names = (await readdir(PART1_DIR))
    .filter((n) => /^event_\d+_\d+\.json$/.test(n))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (names.length === 0) {
    throw new Error(`No part1 events found in ${PART1_DIR}`);
  }

  process.stdout.write(`Scanning ${names.length} part1 events in ${PART1_DIR}\n`);
  await mkdir(OUT_DIR, { recursive: true });

  let written = 0;
  for (const name of names) {
    if (written >= EVENT_COUNT) break;
    const raw = JSON.parse(await readFile(resolve(PART1_DIR, name), 'utf8'));
    const curated = curateEvent(raw);
    if (!curated) continue;

    const path = resolve(OUT_DIR, `event_${written}.json`);
    await writeFile(path, JSON.stringify(curated));

    const prim = curated.tracks.filter((t) => t.origin === 'primary');
    const v0 = curated.tracks.filter((t) => t.origin === 'v0');
    const plus = curated.tracks.filter((t) => t.charge > 0).length;
    const minus = curated.tracks.length - plus;
    const v0R = Math.hypot(v0[0].X, v0[0].Y);
    process.stdout.write(
      `event_${written}.json ← ${name}: ${curated.tracks.length} tracks ` +
        `(primary ${prim.length}, V0 ${v0.length}, +${plus}/-${minus}, V0 rxy=${v0R.toFixed(1)} cm)\n`
    );
    written += 1;
  }

  if (written < EVENT_COUNT) {
    throw new Error(`Only produced ${written}/${EVENT_COUNT} events with primary+V0.`);
  }
  process.stdout.write(`Done: wrote ${written} events to ${OUT_DIR}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err?.stack ?? err}\n`);
  process.exit(1);
});
