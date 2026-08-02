import { Event, Track } from '../models';

/** AliRoot B2C — p[GeV/c] = B2C * B[T] * R[cm] * |q|. */
const B2C = 0.299792458e-2;
/** Nominal solenoid |B| used by TEveTrackPropagator in convert_events.C. */
const VA_BZ_MAG_T = 0.5;
/**
 * Signed Bz for charge inference: TEve's helix bends opposite to the RK4
 * Lorentz convention at +Bz. Matching stored VSD/TEve trajectories needs −Bz.
 */
const VA_BZ_T = -VA_BZ_MAG_T;

type Vec3 = { x: number; y: number; z: number };

function pMag(track: Track): number {
  return Math.hypot(track.px, track.py, track.pz);
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len > 0 ? { x: v.x / len, y: v.y / len, z: v.z / len } : { x: 0, y: 0, z: 0 };
}

function add(a: Vec3, b: Vec3, s = 1): Vec3 {
  return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function stepHelix(r: Vec3, u: Vec3, p: number, charge: number, ds: number, bz: number): {
  r: Vec3;
  u: Vec3;
} {
  const k = p > 0 ? (charge * B2C) / p : 0;
  const B = { x: 0, y: 0, z: bz };
  const uxB = cross(u, B);
  return { r: add(r, u, ds), u: normalize(add(u, uxB, k * ds)) };
}

/**
 * Infer electric charge (±1) by walking a short helix with q = ±1 under the
 * nominal TEve Bz and picking the sign whose path stays closest to `trajectory`.
 *
 * RAA (and many Strangeness background) VSD exports leave `sign` as 0 even
 * though every reconstructed TPC track is charged.
 */
export function inferChargeFromTrajectory(track: Track): 1 | -1 | null {
  const traj = track.trajectory;
  if (!Array.isArray(traj) || traj.length < 3) {
    return null;
  }

  const p = pMag(track);
  if (!(p > 0)) {
    return null;
  }

  const start: Vec3 = { x: traj[0][0], y: traj[0][1], z: traj[0][2] };
  const u0 = normalize({ x: track.px, y: track.py, z: track.pz });

  const maxCompare = Math.min(traj.length, 12);
  let pathLen = 0;
  for (let i = 1; i < maxCompare; i++) {
    pathLen += Math.hypot(
      traj[i][0] - traj[i - 1][0],
      traj[i][1] - traj[i - 1][1],
      traj[i][2] - traj[i - 1][2]
    );
  }
  if (!(pathLen > 0.5)) {
    return null;
  }

  const ds = 0.5; // cm
  const nSteps = Math.max(2, Math.ceil(pathLen / ds));

  const score = (charge: number): number => {
    let r = { ...start };
    let u = { ...u0 };
    for (let s = 0; s < nSteps; s++) {
      ({ r, u } = stepHelix(r, u, p, charge, ds, VA_BZ_T));
    }
    let acc = 0;
    let idx = 0;
    for (let i = 1; i < maxCompare; i++) {
      acc += Math.hypot(
        traj[i][0] - traj[i - 1][0],
        traj[i][1] - traj[i - 1][1],
        traj[i][2] - traj[i - 1][2]
      );
      idx = i;
      if (acc >= pathLen * 0.9) {
        break;
      }
    }
    const target = traj[idx];
    return Math.hypot(r.x - target[0], r.y - target[1], r.z - target[2]);
  };

  const errPos = score(1);
  const errNeg = score(-1);
  if (!Number.isFinite(errPos) || !Number.isFinite(errNeg)) {
    return null;
  }
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
    if (Math.abs(cz) < 1e-12) {
      return null;
    }
    // With VA_BZ_T < 0, q > 0 tracks have cz > 0 on stored paths.
    return cz > 0 ? 1 : -1;
  }
  return errPos < errNeg ? 1 : -1;
}

/** Prefer JSON `sign` when ±1; otherwise infer from the stored helix. */
export function resolveTrackSign(track: Track): number {
  if (track.sign === 1 || track.sign === -1) {
    return track.sign;
  }
  return inferChargeFromTrajectory(track) ?? 0;
}

/** Copy of `event` whose tracks have `sign` filled when it was missing (0). */
export function withResolvedTrackSigns(event: Event): Event {
  const tracks = event.tracks ?? [];
  let changed = false;
  const resolved = tracks.map((t) => {
    const sign = resolveTrackSign(t);
    if (sign === t.sign) {
      return t;
    }
    changed = true;
    return { ...t, sign };
  });
  return changed ? { ...event, tracks: resolved } : event;
}
