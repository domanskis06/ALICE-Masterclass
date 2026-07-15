import { traceFieldLines, __testing__ } from './field-line-tracer';
import { Vec3 } from './propagation-types';

/** Uniform 0.5 T field along +z, like the ALICE solenoid interior. */
const uniformZField = (): Vec3 => ({ x: 0, y: 0, z: 0.5 });

describe('traceFieldLines', () => {
  it('traces lines that run along +/-z in a uniform Bz field', () => {
    const { lines } = traceFieldLines(uniformZField, { density: 'sparse' });
    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      expect(line.pointCount).toBeGreaterThanOrEqual(2);
      const first = { x: line.positions[0], y: line.positions[1], z: line.positions[2] };
      const lastBase = (line.pointCount - 1) * 3;
      const last = {
        x: line.positions[lastBase],
        y: line.positions[lastBase + 1],
        z: line.positions[lastBase + 2],
      };
      // Uniform Bz field: x/y stay put, the line only ever moves along z.
      expect(last.x).toBeCloseTo(first.x, 3);
      expect(last.y).toBeCloseTo(first.y, 3);
      expect(Math.abs(last.z - first.z)).toBeGreaterThan(0);
    }
  });

  it('returns no lines when the field is everywhere negligible', () => {
    const { lines } = traceFieldLines(() => ({ x: 0, y: 0, z: 0 }), { density: 'sparse' });
    expect(lines.length).toBe(0);
  });

  it('medium density produces more seeds (and therefore lines) than sparse', () => {
    const sparse = traceFieldLines(uniformZField, { density: 'sparse' });
    const medium = traceFieldLines(uniformZField, { density: 'medium' });
    expect(medium.lines.length).toBeGreaterThan(sparse.lines.length);
  });

  it('dense density produces more seeds than medium', () => {
    const medium = traceFieldLines(uniformZField, { density: 'medium' });
    const dense = traceFieldLines(uniformZField, { density: 'dense' });
    expect(dense.lines.length).toBeGreaterThan(medium.lines.length);
  });

  it('stops a line once it wanders out of the sampled radius', () => {
    // A constant-magnitude, purely radial field never drops below MIN_FIELD_T,
    // so the only thing that can end a line is the transverse-radius cutoff.
    const radialField = (pos: Vec3): Vec3 => {
      const r = Math.hypot(pos.x, pos.y);
      if (r === 0) return { x: 0, y: 0, z: 0 };
      return { x: (pos.x / r) * 0.5, y: (pos.y / r) * 0.5, z: 0 };
    };
    const { lines } = traceFieldLines(radialField, { density: 'medium' });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (let i = 0; i < line.pointCount; i++) {
        const radius = Math.hypot(line.positions[i * 3], line.positions[i * 3 + 1]);
        expect(radius).toBeLessThanOrEqual(261);
      }
    }
  });

  it('seed grid stays within the configured transverse radius', () => {
    const seeds = __testing__.buildSeedsForStep(70);
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(Math.hypot(seed.x, seed.y)).toBeLessThanOrEqual(220 + 1e-6);
      expect(seed.z).toBe(0);
    }
  });
});
