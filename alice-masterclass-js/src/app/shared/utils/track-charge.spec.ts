import { Track, TrackType } from '../models';
import { inferChargeFromTrajectory, resolveTrackSign, withResolvedTrackSigns } from './track-charge';

const B2C = 0.299792458e-2;
const VA_BZ_T = -0.5;

/** Synthetic helix matching the inference stepper (same Bz / B2C convention). */
function syntheticHelix(charge: 1 | -1): Track {
  const p = 0.6;
  const px = 0.6;
  const py = 0;
  const pz = 0.05;
  let r = { x: 0, y: 0, z: 0 };
  let u = { x: 1, y: 0, z: pz / p };
  const uLen = Math.hypot(u.x, u.y, u.z);
  u = { x: u.x / uLen, y: u.y / uLen, z: u.z / uLen };
  const traj: number[][] = [[r.x, r.y, r.z]];
  const ds = 0.5;
  for (let i = 0; i < 20; i++) {
    const k = (charge * B2C) / p;
    const uxB = {
      x: u.y * VA_BZ_T,
      y: -u.x * VA_BZ_T,
      z: 0,
    };
    const nu = {
      x: u.x + uxB.x * k * ds,
      y: u.y + uxB.y * k * ds,
      z: u.z + uxB.z * k * ds,
    };
    const nLen = Math.hypot(nu.x, nu.y, nu.z);
    u = { x: nu.x / nLen, y: nu.y / nLen, z: nu.z / nLen };
    r = { x: r.x + u.x * ds, y: r.y + u.y * ds, z: r.z + u.z * ds };
    traj.push([r.x, r.y, r.z]);
  }
  return {
    E: p,
    mass: 0.14,
    particleId: 0,
    comboId: 0,
    sign: 0,
    type: TrackType.STANDARD,
    px,
    py,
    pz,
    trajectory: traj,
    isPrimary: true,
  };
}

describe('track-charge', () => {
  it('keeps an explicit ±1 sign', () => {
    const t = syntheticHelix(1);
    t.sign = -1;
    expect(resolveTrackSign(t)).toBe(-1);
  });

  it('infers charge from a helix when JSON sign is 0', () => {
    expect(inferChargeFromTrajectory(syntheticHelix(1))).toBe(1);
    expect(inferChargeFromTrajectory(syntheticHelix(-1))).toBe(-1);
    expect(resolveTrackSign(syntheticHelix(1))).toBe(1);
  });

  it('withResolvedTrackSigns fills missing signs without rewriting ±1', () => {
    const missing = syntheticHelix(-1);
    const kept: Track = { ...syntheticHelix(1), sign: 1 };
    const ev = withResolvedTrackSigns({ tracks: [missing, kept], clusters: [], decays: [] });
    expect(ev.tracks[0].sign).toBe(-1);
    expect(ev.tracks[1].sign).toBe(1);
  });
});
