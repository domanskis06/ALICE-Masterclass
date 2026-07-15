import { computeTrajectory } from './rk4-integrator';
import { B2C } from './constants';
import { PropagationParticle, Vec3 } from './propagation-types';

function readPoint(positions: Float32Array, i: number): Vec3 {
  return { x: positions[i * 3], y: positions[i * 3 + 1], z: positions[i * 3 + 2] };
}

/** Circumradius of the circle through 3 (assumed coplanar, z~0) points. */
function circumradius(a: Vec3, b: Vec3, c: Vec3): number {
  const ab = Math.hypot(b.x - a.x, b.y - a.y);
  const bc = Math.hypot(c.x - b.x, c.y - b.y);
  const ca = Math.hypot(a.x - c.x, a.y - c.y);
  const area = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  return (ab * bc * ca) / (4 * area);
}

describe('rk4-integrator', () => {
  describe('computeTrajectory', () => {
    it('propagates a neutral particle in a straight line, regardless of the field', () => {
      const particle: PropagationParticle = {
        id: 'neutral-1',
        vertex: { x: 0, y: 0, z: 0 },
        momentum: { x: 1, y: 0, z: 0 },
        charge: 0,
        mass: 0.497,
        energy: 1.1,
      };
      // A deliberately non-trivial, non-uniform field: if charge=0 leaked into the
      // curvature term, this would immediately bend the track away from a line.
      const swirlingField = (pos: Vec3): Vec3 => ({ x: pos.y, y: -pos.x, z: 1 });

      const track = computeTrajectory(particle, swirlingField, { stepCm: 2, maxSteps: 50 });

      expect(track.pointCount).toBe(51);
      for (let i = 0; i < track.pointCount; i++) {
        const p = readPoint(track.positions, i);
        expect(p.y).toBeCloseTo(0, 4);
        expect(p.z).toBeCloseTo(0, 4);
        expect(p.x).toBeCloseTo(i * 2, 3);
      }
    });

    it('curves a charged particle in a uniform B field with the expected radius R = pt / (B2C * |B| * |q|)', () => {
      const bz = 0.5; // Tesla, matches the real ALICE solenoid nominal field
      const charge = 1;
      const pt = 1; // GeV/c, fully transverse momentum (pz = 0)
      const expectedRadiusCm = pt / (B2C * Math.abs(bz) * Math.abs(charge));

      const particle: PropagationParticle = {
        id: 'charged-1',
        vertex: { x: 0, y: 0, z: 0 },
        momentum: { x: pt, y: 0, z: 0 },
        charge,
        mass: 0.1396,
        energy: 1.0098,
      };
      const uniformField = (): Vec3 => ({ x: 0, y: 0, z: bz });

      // Small step, short arc (well under the ~667cm radius) so 3-point circumradius fits are numerically clean.
      const track = computeTrajectory(particle, uniformField, {
        stepCm: 1,
        maxSteps: 150,
        maxRadiusCm: 100000,
      });

      expect(track.pointCount).toBe(151);

      // The motion is purely transverse (Bz field, p entirely in x/y) so it must stay in the z=0 plane.
      for (let i = 0; i < track.pointCount; i += 10) {
        expect(readPoint(track.positions, i).z).toBeCloseTo(0, 3);
      }

      // Fit the circumradius from several well-separated triplets and check against the analytic radius.
      const triplets: [number, number, number][] = [
        [0, 50, 100],
        [0, 75, 150],
        [20, 85, 150],
      ];
      for (const [i, j, kIdx] of triplets) {
        const r = circumradius(
          readPoint(track.positions, i),
          readPoint(track.positions, j),
          readPoint(track.positions, kIdx)
        );
        expect(r).toBeCloseTo(expectedRadiusCm, 0); // within ~1cm out of ~667cm (RK4 local error is negligible here)
      }
    });

    it('stops and interpolates to the exact detector boundary sphere', () => {
      const particle: PropagationParticle = {
        id: 'radial-1',
        vertex: { x: 0, y: 0, z: 0 },
        momentum: { x: 1, y: 0, z: 0 },
        charge: 0,
        mass: 0,
        energy: 1,
      };
      const zeroField = (): Vec3 => ({ x: 0, y: 0, z: 0 });

      const track = computeTrajectory(particle, zeroField, { stepCm: 10, maxSteps: 1000, maxRadiusCm: 55 });
      const last = readPoint(track.positions, track.pointCount - 1);
      const radius = Math.hypot(last.x, last.y, last.z);

      expect(radius).toBeCloseTo(55, 5);
    });
  });
});
