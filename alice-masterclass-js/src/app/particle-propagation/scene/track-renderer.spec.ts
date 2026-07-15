import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import {
  createTrackLines,
  updateDrawRange,
  DEFAULT_TRACK_LINEWIDTH,
  PRIMARY_TRACK_COLOR,
  POSITIVE_TRACK_COLOR,
  NEGATIVE_TRACK_COLOR,
  NEUTRAL_TRACK_COLOR,
} from './track-renderer';
import { BufferedTrack, ParticleOrigin } from '../physics/propagation-types';

function makeTrack(
  charge: number,
  times: number[],
  origin: ParticleOrigin = 'v0'
): BufferedTrack {
  const pointCount = times.length;
  const positions = new Float32Array(pointCount * 3);
  for (let i = 0; i < pointCount; i++) {
    positions[i * 3] = i;
    positions[i * 3 + 1] = i * 2;
    positions[i * 3 + 2] = i * 3;
  }
  const timesArr = new Float32Array(pointCount);
  timesArr.set(times);
  return { particleId: `p-${charge}`, positions, times: timesArr, pointCount, charge, origin };
}

describe('createTrackLines', () => {
  it('creates one Line2 per track, scaled to world units, hidden via instanceCount=0', () => {
    const track = makeTrack(1, [0, 1, 2, 3]);
    const [line] = createTrackLines([track], 1e-2);

    expect(line).toBeInstanceOf(Line2);
    expect(line.geometry.instanceCount).toBe(0);
    // Second point (index 1) is the end of the first instanced segment.
    const instanceEnd = line.geometry.getAttribute('instanceEnd') as THREE.InterleavedBufferAttribute;
    expect(instanceEnd.getX(0)).toBeCloseTo(track.positions[3] * 1e-2, 6);
    expect((line.material as LineMaterial).linewidth).toBe(DEFAULT_TRACK_LINEWIDTH);
  });

  it('does not mutate the original BufferedTrack.positions (cm) while rescaling', () => {
    const track = makeTrack(-1, [0, 1]);
    const originalX1 = track.positions[3];
    createTrackLines([track], 1e-2);
    expect(track.positions[3]).toBe(originalX1);
  });

  it('colors primary tracks blue and V0 tracks by charge (red + / green −)', () => {
    const [primaryLine] = createTrackLines([makeTrack(1, [0], 'primary')], 1);
    const [posLine] = createTrackLines([makeTrack(1, [0], 'v0')], 1);
    const [negLine] = createTrackLines([makeTrack(-1, [0], 'v0')], 1);
    const [neutralLine] = createTrackLines([makeTrack(0, [0], 'v0')], 1);

    expect((primaryLine.material as LineMaterial).color.getHexString()).toBe(
      new THREE.Color(PRIMARY_TRACK_COLOR).getHexString()
    );
    expect((posLine.material as LineMaterial).color.getHexString()).toBe(
      new THREE.Color(POSITIVE_TRACK_COLOR).getHexString()
    );
    expect((negLine.material as LineMaterial).color.getHexString()).toBe(
      new THREE.Color(NEGATIVE_TRACK_COLOR).getHexString()
    );
    expect((neutralLine.material as LineMaterial).color.getHexString()).toBe(
      new THREE.Color(NEUTRAL_TRACK_COLOR).getHexString()
    );
  });
});

describe('updateDrawRange', () => {
  it('shows nothing before the track\'s first recorded time', () => {
    const track = makeTrack(1, [1, 2, 3]);
    const [line] = createTrackLines([track], 1);
    updateDrawRange(line, track, 0.5);
    expect(line.geometry.instanceCount).toBe(0);
  });

  it('reveals exactly the segments reached so far (binary search over times)', () => {
    const track = makeTrack(1, [0, 5, 10, 15, 20]);
    const [line] = createTrackLines([track], 1);

    updateDrawRange(line, track, 0);
    expect(line.geometry.instanceCount).toBe(0); // one vertex → no segments yet

    updateDrawRange(line, track, 12);
    expect(line.geometry.instanceCount).toBe(2); // vertices 0..2 → 2 segments

    updateDrawRange(line, track, 19.999);
    expect(line.geometry.instanceCount).toBe(3);
  });

  it('caps at pointCount-1 segments once t reaches or exceeds the final recorded time', () => {
    const track = makeTrack(1, [0, 5, 10]);
    const [line] = createTrackLines([track], 1);
    updateDrawRange(line, track, 999);
    expect(line.geometry.instanceCount).toBe(2);
  });

  it('is a pure lookup: calling it repeatedly with the same t is idempotent and touches no physics buffers', () => {
    const track = makeTrack(1, [0, 5, 10]);
    const [line] = createTrackLines([track], 1);
    const timesBefore = Array.from(track.times);
    updateDrawRange(line, track, 7);
    updateDrawRange(line, track, 7);
    expect(line.geometry.instanceCount).toBe(1);
    expect(Array.from(track.times)).toEqual(timesBefore);
  });
});
