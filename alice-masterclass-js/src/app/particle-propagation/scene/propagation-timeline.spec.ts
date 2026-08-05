import * as THREE from 'three';
import { PropagationTimeline } from './propagation-timeline';
import { CollisionIntro } from './collision-intro';
import { createTrackLines } from './track-renderer';
import { BufferedTrack } from '../physics/propagation-types';
import { INTRO_DURATION_MS } from './timeline-constants';

function makeTrack(id: string, times: number[]): BufferedTrack {
  const pointCount = times.length;
  const positions = new Float32Array(pointCount * 3);
  const timesArr = new Float32Array(pointCount);
  timesArr.set(times);
  return { particleId: id, positions, times: timesArr, pointCount, charge: 1, origin: 'primary' };
}

describe('PropagationTimeline', () => {
  let intro: CollisionIntro;
  let tracksGroup: THREE.Group;
  let tracks: BufferedTrack[];
  let lines: ReturnType<typeof createTrackLines>;
  let timeline: PropagationTimeline;

  beforeEach(async () => {
    intro = await CollisionIntro.create('pb-nucleus');
    tracksGroup = new THREE.Group();
    tracks = [makeTrack('a', [0, 10, 20, 30]), makeTrack('b', [0, 5, 15])];
    lines = createTrackLines(tracks, 1);
    tracksGroup.add(...lines);
    timeline = new PropagationTimeline(intro, tracksGroup, tracks, lines, 30);
  });

  afterEach(() => {
    intro.dispose();
  });

  it('exposes minTimeMs/maxTimeMs derived from INTRO_DURATION_MS and the pre-computed maxTimeNs', () => {
    expect(timeline.minTimeMs).toBe(-INTRO_DURATION_MS);
    expect(timeline.maxTimeMs).toBe(30);
  });

  it('t < 0: hides the tracks group and animates the intro nuclei', () => {
    timeline.applyTime(-INTRO_DURATION_MS / 2);
    expect(tracksGroup.visible).toBe(false);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.visible).toBe(true);
    expect(plusZ.position.z).toBeGreaterThan(0);
    expect(minusZ.position.z).toBeLessThan(0);
  });

  it('t > 0: shows the tracks group, hides the intro nuclei, and reveals vertices up to t', () => {
    timeline.applyTime(12);
    expect(tracksGroup.visible).toBe(true);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.visible).toBe(false);
    expect(minusZ.visible).toBe(false);
    // track 'a' times = [0,10,20,30] -> at t=12, vertices 0,1 → 1 fat-line segment.
    expect(lines[0].geometry.instanceCount).toBe(1);
    // track 'b' times = [0,5,15] -> at t=12, vertices 0,1 → 1 segment.
    expect(lines[1].geometry.instanceCount).toBe(1);
  });

  it('fires onCollisionMoment exactly once when crossing from t < 0 to t >= 0', () => {
    const onCollisionMoment = jasmine.createSpy('onCollisionMoment');
    const tl = new PropagationTimeline(intro, tracksGroup, tracks, lines, 30, { onCollisionMoment });

    tl.applyTime(-100);
    expect(onCollisionMoment).not.toHaveBeenCalled();
    tl.applyTime(0);
    expect(onCollisionMoment).toHaveBeenCalledTimes(1);
    tl.applyTime(10);
    expect(onCollisionMoment).toHaveBeenCalledTimes(1);
    tl.applyTime(-50);
    tl.applyTime(5);
    expect(onCollisionMoment).toHaveBeenCalledTimes(2);
  });

  it('reset() rewinds to minTimeMs and does not fire onCollisionMoment', () => {
    const onCollisionMoment = jasmine.createSpy('onCollisionMoment');
    const tl = new PropagationTimeline(intro, tracksGroup, tracks, lines, 30, { onCollisionMoment });
    tl.applyTime(15);
    tl.reset();
    expect(tracksGroup.visible).toBe(false);
    expect(onCollisionMoment).not.toHaveBeenCalled();
  });

  it('is scrub-safe: applying times out of chronological order still yields correct instanceCounts', () => {
    timeline.applyTime(25);
    expect(lines[0].geometry.instanceCount).toBe(2); // times<=25: 0,10,20 → 2 segments
    timeline.applyTime(2);
    expect(lines[0].geometry.instanceCount).toBe(0); // times<=2: only vertex 0 → no segments
    timeline.applyTime(-INTRO_DURATION_MS);
    expect(tracksGroup.visible).toBe(false);
  });

  it('nsPerMs option scales propagationDurationMs and the time fed into updateDrawRange', () => {
    const tl = new PropagationTimeline(intro, tracksGroup, tracks, lines, 30, { nsPerMs: 2 });
    expect(tl.maxTimeMs).toBe(15); // 30ns / 2ns-per-ms
    tl.applyTime(6); // 6ms * 2ns/ms = 12ns
    expect(lines[0].geometry.instanceCount).toBe(1); // times<=12: 0,10 → 1 segment
  });
});
