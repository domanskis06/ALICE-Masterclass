import { TrackVolumeClipService } from './track-volume-clip.service';

describe('TrackVolumeClipService', () => {
  const A = TrackVolumeClipService.L3_BORE_APOTHEM_CM;
  const Z = TrackVolumeClipService.L3_BORE_Z_CM;

  it('accepts points inside the L3 free bore and rejects magnet wall / end-cap', () => {
    expect(TrackVolumeClipService.isInsideL3Bore([0, 0, 0])).toBe(true);
    expect(TrackVolumeClipService.isInsideL3Bore([A - 1, 0, 0])).toBe(true);
    // Flat wall
    expect(TrackVolumeClipService.isInsideL3Bore([A + 1, 0, 0])).toBe(false);
    // Corner beyond the diagonal flat (cylinder of r=A would still include this)
    const corner = A * 0.95;
    expect(TrackVolumeClipService.isInsideL3Bore([corner, corner, 0])).toBe(false);
    expect(TrackVolumeClipService.isInsideL3Bore([0, 0, Z + 1])).toBe(false);
  });

  it('clips a radial track on an axis-aligned octagon flat', () => {
    const clipped = TrackVolumeClipService.clipTrajectoryToOctagonalPrism(
      [
        [0, 0, 0],
        [A + 200, 0, 0],
      ],
      A,
      Z
    );
    expect(clipped.length).toBe(2);
    expect(clipped[0]).toEqual([0, 0, 0]);
    expect(clipped[1][0]).toBeCloseTo(A);
    expect(clipped[1][1]).toBeCloseTo(0);
    expect(clipped[1][2]).toBeCloseTo(0);
  });

  it('clips on a diagonal flat before a cylinder of the same apothem would', () => {
    // Direction 45°: hits diagonal face at oct-norm = A → |x|=|y|=A/√2
    const clipped = TrackVolumeClipService.clipTrajectoryToOctagonalPrism(
      [
        [0, 0, 0],
        [A + 200, A + 200, 0],
      ],
      A,
      Z
    );
    expect(clipped.length).toBe(2);
    const hit = clipped[1];
    expect(TrackVolumeClipService.octagonNorm(hit[0], hit[1])).toBeCloseTo(A, 5);
    expect(Math.abs(hit[0])).toBeCloseTo(Math.abs(hit[1]), 5);
    // On a diagonal flat, Rxy equals the apothem — well inside the vertex circle.
    expect(Math.hypot(hit[0], hit[1])).toBeCloseTo(A, 5);
    expect(Math.hypot(hit[0], hit[1])).toBeLessThan(A / Math.cos(Math.PI / 8));
  });

  it('clips a forward track at the L3 end-cap', () => {
    const clipped = TrackVolumeClipService.clipTrajectoryToOctagonalPrism(
      [
        [0, 0, 0],
        [10, 0, Z + 200],
      ],
      A,
      Z
    );
    expect(clipped.length).toBe(2);
    expect(Math.abs(clipped[1][2])).toBeCloseTo(Z);
    expect(TrackVolumeClipService.octagonNorm(clipped[1][0], clipped[1][1])).toBeLessThan(A);
  });

  it('returns empty when the first sample is already outside', () => {
    expect(
      TrackVolumeClipService.clipTrajectoryToOctagonalPrism(
        [
          [A + 50, 0, 0],
          [A + 100, 0, 0],
        ],
        A,
        Z
      )
    ).toEqual([]);
  });

  it('clipTrajectoryToL3Bore uses the measured L3 liner dimensions', () => {
    const svc = new TrackVolumeClipService();
    const clipped = svc.clipTrajectoryToL3Bore([
      [0, 0, 0],
      [2000, 0, 0],
    ]);
    expect(clipped.length).toBe(2);
    expect(clipped[1][0]).toBeCloseTo(TrackVolumeClipService.L3_BORE_APOTHEM_CM);
  });
});
