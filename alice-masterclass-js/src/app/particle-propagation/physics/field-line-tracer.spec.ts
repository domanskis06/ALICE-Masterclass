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

  it('dense density produces more seeds (and therefore lines) than sparse', () => {
    const sparse = traceFieldLines(uniformZField, { density: 'sparse' });
    const dense = traceFieldLines(uniformZField, { density: 'dense' });
    expect(dense.lines.length).toBeGreaterThan(sparse.lines.length);
  });

  it('stops a line once it wanders out of the sampled radius', () => {
    // A constant-magnitude, purely radial field never drops below MIN_FIELD_T,
    // so the only thing that can end a line is the transverse-radius cutoff.
    const radialField = (pos: Vec3): Vec3 => {
      const r = Math.hypot(pos.x, pos.y);
      if (r === 0) return { x: 0, y: 0, z: 0 };
      return { x: (pos.x / r) * 0.5, y: (pos.y / r) * 0.5, z: 0 };
    };
    const { lines } = traceFieldLines(radialField, { density: 'dense' });
    expect(lines.length).toBeGreaterThan(0);
    const maxR = __testing__.BARREL_BOUNDS.maxRadiusCm;
    for (const line of lines) {
      for (let i = 0; i < line.pointCount; i++) {
        const radius = Math.hypot(line.positions[i * 3], line.positions[i * 3 + 1]);
        expect(radius).toBeLessThanOrEqual(maxR + 1);
      }
    }
  });

  it('inner seed disc stays within the TPC-scale radius', () => {
    const seeds = __testing__.buildInnerBarrelSeeds(70);
    expect(seeds.length).toBeGreaterThan(0);
    for (const seed of seeds) {
      expect(Math.hypot(seed.x, seed.y)).toBeLessThanOrEqual(__testing__.INNER_SEED_RADIUS_CM + 1e-6);
      expect(seed.z).toBe(0);
    }
  });

  it('L3 ring seeds fill the TRD–L3 gap with room to flare inside the LUT', () => {
    const rings = __testing__.buildL3RingSeeds('sparse');
    // mid (2×6) + TRD–L3 gap (4×24) = 108 at sparse
    expect(rings.length).toBe(108);

    const trdL3Radii = new Set([322, 378, 434, 490]);
    const trdL3 = rings.filter((s) => trdL3Radii.has(Math.round(Math.hypot(s.x, s.y))));
    expect(trdL3.length).toBe(96);

    const radii = [...new Set(trdL3.map((s) => Math.round(Math.hypot(s.x, s.y))))].sort(
      (a, b) => a - b
    );
    expect(radii).toEqual([322, 378, 434, 490]);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i] - radii[i - 1]).toBe(56);
    }
    expect(Math.max(...radii)).toBe(__testing__.L3_SEED_RADIUS_CM);
    expect(Math.max(...radii)).toBeLessThanOrEqual(490);

    const angles = new Set<number>();
    for (const seed of trdL3) {
      const deg = ((Math.atan2(seed.y, seed.x) * 180) / Math.PI + 360) % 360;
      const nearest15 = Math.round(deg / 15) * 15;
      angles.add(nearest15 === 360 ? 0 : nearest15);
    }
    expect(angles.size).toBe(24);
    expect([...angles].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 24 }, (_, i) => i * 15)
    );
  });

  it('barrel seeds include both the inner disc and TRD–L3 rings', () => {
    const barrel = __testing__.buildBarrelSeeds(__testing__.SEED_GRID_STEP_CM.sparse, 'sparse');
    const inner = __testing__.buildInnerBarrelSeeds(__testing__.SEED_GRID_STEP_CM.sparse);
    const rings = __testing__.buildL3RingSeeds('sparse');
    expect(barrel.length).toBe(inner.length + rings.length);
    const trdL3Radii = new Set([322, 378, 434, 490]);
    const inGap = barrel.filter((s) => trdL3Radii.has(Math.round(Math.hypot(s.x, s.y))));
    expect(inGap.length).toBe(96);
  });

  it('field-line walk radius allows end-cap flaring past the Chebyshev bore edge', () => {
    expect(__testing__.BARREL_BOUNDS.maxRadiusCm).toBe(__testing__.FIELD_LINE_MAX_RADIUS_CM);
    expect(__testing__.BARREL_WITH_DIPOLE_BOUNDS.maxRadiusCm).toBe(
      __testing__.FIELD_LINE_MAX_RADIUS_CM
    );
    expect(__testing__.FIELD_LINE_MAX_RADIUS_CM).toBeGreaterThan(500);
  });

  it('end-cap fringing can carry a streamline past r = 498 cm', () => {
    // Strong Br that grows with |z| so an outer-disc seed flares past the old
    // hard cap (498 cm) — only possible with FIELD_LINE_MAX_RADIUS_CM.
    const flaringField = (pos: Vec3): Vec3 => {
      const r = Math.hypot(pos.x, pos.y);
      const br = 0.55 * Math.min(1, Math.abs(pos.z) / 350);
      const bx = r > 1e-6 ? (br * pos.x) / r : 0;
      const by = r > 1e-6 ? (br * pos.y) / r : 0;
      return { x: bx, y: by, z: 0.35 };
    };
    const { lines } = traceFieldLines(flaringField, { density: 'sparse' });
    expect(lines.length).toBeGreaterThan(0);
    let maxR = 0;
    for (const line of lines) {
      for (let i = 0; i < line.pointCount; i++) {
        maxR = Math.max(maxR, Math.hypot(line.positions[i * 3], line.positions[i * 3 + 1]));
      }
    }
    expect(maxR).toBeGreaterThan(498);
    expect(maxR).toBeLessThanOrEqual(__testing__.FIELD_LINE_MAX_RADIUS_CM + 1);
  });

  it('stores continuous |B| magnitudes along each streamline for the heatmap', () => {
    // Plateau 0.5 T with a smooth axial fall-off — colours must track the same
    // sampled |B| on every vertex (no separate outer-seed magnitude path).
    const taperedBz = (pos: Vec3): Vec3 => {
      const fall = Math.max(0.2, 1 - Math.abs(pos.z) / 1200);
      return { x: 0, y: 0, z: 0.5 * fall };
    };
    const { lines } = traceFieldLines(taperedBz, { density: 'sparse' });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.magnitudes.length).toBe(line.pointCount);
      for (let i = 0; i < line.pointCount; i++) {
        const z = line.positions[i * 3 + 2];
        const expected = 0.5 * Math.max(0.2, 1 - Math.abs(z) / 1200);
        expect(line.magnitudes[i]).toBeCloseTo(expected, 5);
      }
    }
  });
  it('barrel lines reach near the L3 magnet ends in a uniform Bz field', () => {
    const { lines } = traceFieldLines(uniformZField, { density: 'sparse' });
    let maxAbsZ = 0;
    for (const line of lines) {
      for (let i = 0; i < line.pointCount; i++) {
        maxAbsZ = Math.max(maxAbsZ, Math.abs(line.positions[i * 3 + 2]));
      }
    }
    expect(maxAbsZ).toBeGreaterThan(500);
    expect(maxAbsZ).toBeLessThanOrEqual(__testing__.BARREL_BOUNDS.maxZPosCm + 1);
  });

  it('includeDipoleTransition extends bending lines deeper in −z (same seed count)', () => {
    const mockSolDip = (pos: Vec3): Vec3 => {
      if (pos.z > -550) return { x: 0, y: 0, z: 0.5 };
      const t = Math.min(1, Math.max(0, (-pos.z - 550) / 350));
      const bx = 0.55 * t;
      const bz = 0.5 * (1 - t);
      const mag = Math.hypot(bx, bz);
      if (mag < 0.002) return { x: 0, y: 0, z: 0 };
      return { x: bx, y: 0, z: bz };
    };

    const barrelOnly = traceFieldLines(mockSolDip, { density: 'sparse' });
    const withDipole = traceFieldLines(mockSolDip, {
      density: 'sparse',
      includeDipoleTransition: true,
      // Isolate continuous barrel→dipole extension (arcs default on with transition).
      includeDipoleArcs: false,
    });
    // Same seeds; variant 2 may drop a stub, but bent arcs remain.
    expect(withDipole.lines.length).toBeGreaterThan(0);
    expect(withDipole.lines.length).toBeLessThanOrEqual(barrelOnly.lines.length);

    let maxNegZBarrel = 0;
    let maxNegZDipole = 0;
    for (const line of barrelOnly.lines) {
      for (let i = 0; i < line.pointCount; i++) {
        maxNegZBarrel = Math.max(maxNegZBarrel, -line.positions[i * 3 + 2]);
      }
    }
    for (const line of withDipole.lines) {
      for (let i = 0; i < line.pointCount; i++) {
        maxNegZDipole = Math.max(maxNegZDipole, -line.positions[i * 3 + 2]);
      }
    }
    expect(maxNegZDipole).toBeGreaterThan(maxNegZBarrel);
    expect(maxNegZDipole).toBeGreaterThan(700);
  });

  it('stores |B| per vertex matching pointCount (uniform 0.5 T → all ≈ 0.5)', () => {
    const { lines } = traceFieldLines(uniformZField, { density: 'sparse' });
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.magnitudes.length).toBe(line.pointCount);
      for (let i = 0; i < line.pointCount; i++) {
        expect(line.magnitudes[i]).toBeCloseTo(0.5, 6);
      }
    }
  });

  it('continuous solenoid→dipole lines bend out of pure z (variant 1)', () => {
    const mockSolDip = (pos: Vec3): Vec3 => {
      if (pos.z > -550) return { x: 0, y: 0, z: 0.5 };
      const t = Math.min(1, Math.max(0, (-pos.z - 550) / 350));
      const bx = 0.55 * t;
      const bz = 0.5 * (1 - t);
      const mag = Math.hypot(bx, bz);
      if (mag < 0.002) return { x: 0, y: 0, z: 0 };
      return { x: bx, y: 0, z: bz };
    };

    const { lines } = traceFieldLines(mockSolDip, {
      density: 'sparse',
      includeDipoleTransition: true,
    });
    expect(lines.length).toBeGreaterThan(0);

    const bent = lines.find((line) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      for (let i = 0; i < line.pointCount; i++) {
        const x = line.positions[i * 3];
        const z = line.positions[i * 3 + 2];
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z);
      }
      return maxX - minX > 8 && minZ < -600;
    });
    expect(bent).toBeDefined();
  });

  it('variant 2 clips non-bending dipole tails but keeps bent arcs', () => {
    // minZ must stay above DIPOLE_KEEP_DEEP_Z_CM (−720) or the deep-tail keep wins.
    const straight = {
      pointCount: 4,
      positions: new Float32Array([0, 0, -400, 0, 0, -500, 0, 0, -580, 0, 0, -650]),
      magnitudes: new Float32Array([0.5, 0.45, 0.4, 0.3]),
    };
    expect(__testing__.bendsInDipole(straight)).toBe(false);
    const clipped = __testing__.clipNonBendingDipoleTail(straight);
    expect(clipped).not.toBeNull();
    expect(clipped!.pointCount).toBe(2); // z=-400 and z=-500
    for (let i = 0; i < clipped!.pointCount; i++) {
      expect(clipped!.positions[i * 3 + 2]).toBeGreaterThanOrEqual(__testing__.DIPOLE_CLIP_Z_CM);
    }

    const bent = {
      pointCount: 3,
      positions: new Float32Array([0, 0, -400, 20, 0, -700, 40, 0, -1000]),
      magnitudes: new Float32Array([0.5, 0.4, 0.3]),
    };
    expect(__testing__.bendsInDipole(bent)).toBe(true);
    expect(__testing__.clipNonBendingDipoleTail(bent)).toBe(bent);
  });

  it('dipole mode uses a LUT box stop and a lower |B| floor', () => {
    expect(__testing__.BARREL_WITH_DIPOLE_BOUNDS.dipoleHalfExtentCm).toBeDefined();
    expect(__testing__.BARREL_WITH_DIPOLE_BOUNDS.dipoleHalfExtentCm!).toBeGreaterThan(300);
    expect(__testing__.BARREL_WITH_DIPOLE_BOUNDS.minFieldDipoleT).toBeLessThan(
      __testing__.BARREL_WITH_DIPOLE_BOUNDS.minFieldT
    );
    expect(__testing__.BARREL_WITH_DIPOLE_BOUNDS.maxZNegCm).toBeGreaterThan(
      __testing__.BARREL_BOUNDS.maxZNegCm
    );
  });

  it('dipole paper seeds sit on the forward solenoid exit (no z=0 densification)', () => {
    const seeds = __testing__.buildDipoleArcSeeds();
    // 9 radii × 20 angles
    expect(seeds.length).toBe(180);
    expect(new Set(seeds.map((s) => s.z))).toEqual(new Set([__testing__.DIPOLE_PAPER_SEED_Z_CM]));
    for (const seed of seeds) {
      expect(seed.z).toBe(__testing__.DIPOLE_PAPER_SEED_Z_CM);
      expect(Math.hypot(seed.x, seed.y)).toBeLessThanOrEqual(92);
    }
  });

  it('dipole transverse seeds lie on constant-x planes inside the dipole', () => {
    const seeds = __testing__.buildDipoleTransverseSeeds();
    expect(seeds.length).toBeGreaterThan(80);
    const xs = new Set(seeds.map((s) => s.x));
    expect(xs.has(0)).toBe(true);
    for (const seed of seeds) {
      expect(seed.z).toBeLessThan(-560);
      expect(seed.z).toBeGreaterThan(-1400);
      expect(Math.abs(seed.y)).toBeLessThan(120);
    }
  });

  it('includeDipoleArcs adds forward arcs + transverse brush without densifying z=0', () => {
    const mockDipole = (pos: Vec3): Vec3 => {
      if (pos.z > -540) return { x: 0, y: 0, z: 0.5 };
      return { x: 0.6, y: 0, z: 0.1 };
    };

    const barrelSeeds = __testing__.buildBarrelSeeds(
      __testing__.SEED_GRID_STEP_CM.sparse,
      'sparse'
    ).length;
    const dipoleLayerSeeds =
      __testing__.buildDipoleArcSeeds().length + __testing__.buildDipoleTransverseSeeds().length;

    const barrelOnly = traceFieldLines(mockDipole, {
      density: 'sparse',
      includeDipoleTransition: false,
      includeDipoleArcs: false,
    });
    const withArcs = traceFieldLines(mockDipole, {
      density: 'sparse',
      includeDipoleTransition: false,
      includeDipoleArcs: true,
    });
    expect(barrelSeeds).toBeGreaterThan(0);
    expect(withArcs.lines.length).toBeGreaterThan(barrelOnly.lines.length);
    // Extra lines come from the dipole layers, not from a denser barrel grid.
    expect(withArcs.lines.length - barrelOnly.lines.length).toBeLessThanOrEqual(dipoleLayerSeeds);

    // Transverse filter: long Δx kept, tiny Δx dropped.
    const longX = {
      pointCount: 12,
      positions: new Float32Array(12 * 3),
      magnitudes: new Float32Array(12).fill(0.5),
    };
    for (let i = 0; i < 12; i++) {
      longX.positions[i * 3] = -40 + i * 10;
      longX.positions[i * 3 + 2] = -900;
    }
    expect(__testing__.keepTransverseLine(longX)).not.toBeNull();
    const shortX = {
      pointCount: 12,
      positions: new Float32Array(12 * 3),
      magnitudes: new Float32Array(12).fill(0.5),
    };
    for (let i = 0; i < 12; i++) {
      shortX.positions[i * 3] = i * 2;
      shortX.positions[i * 3 + 2] = -900;
    }
    expect(__testing__.keepTransverseLine(shortX)).toBeNull();

    // Need ≥16 kept vertices, Δz ≥ 220 cm, and minZ into the dipole LUT.
    const zs = [
      0,
      -50,
      ...Array.from({ length: 18 }, (_, i) => -150 - i * 50),
    ];
    const positions = new Float32Array(zs.length * 3);
    const magnitudes = new Float32Array(zs.length);
    for (let i = 0; i < zs.length; i++) {
      positions[i * 3] = i;
      positions[i * 3 + 2] = zs[i];
      magnitudes[i] = 0.5;
    }
    const clipped = __testing__.clipToDipoleVolume({
      pointCount: zs.length,
      positions,
      magnitudes,
    });
    expect(clipped).not.toBeNull();
    expect(clipped!.pointCount).toBe(18); // drops z=0 and z=-50
    for (let i = 0; i < clipped!.pointCount; i++) {
      expect(clipped!.positions[i * 3 + 2]).toBeLessThanOrEqual(__testing__.PAPER_CLIP_MAX_Z_CM);
    }

    // Short pure-Bx stub (tiny Δz) is rejected even if it has enough points.
    const stubZs = Array.from({ length: 20 }, (_, i) => -900 - i * 2);
    const stubPos = new Float32Array(stubZs.length * 3);
    const stubMag = new Float32Array(stubZs.length);
    for (let i = 0; i < stubZs.length; i++) {
      stubPos[i * 3] = i * 5;
      stubPos[i * 3 + 2] = stubZs[i];
      stubMag[i] = 0.5;
    }
    expect(
      __testing__.clipToDipoleVolume({
        pointCount: stubZs.length,
        positions: stubPos,
        magnitudes: stubMag,
      })
    ).toBeNull();
  });
});
