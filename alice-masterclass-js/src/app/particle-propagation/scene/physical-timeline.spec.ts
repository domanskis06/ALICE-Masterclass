import { SPEED_OF_LIGHT_CM_PER_NS } from '../physics/constants';
import { PropagationScene } from './propagation-scene';
import {
  INTRO_APPROACH_DURATION_NS,
  physicalNsToPresentationMs,
  presentationMsToPhysicalNs,
} from './physical-timeline';
import {
  DEFAULT_NS_PER_MS,
  INTRO_DURATION_MS,
  PROTON_HALF_SEPARATION_START,
} from './timeline-constants';

describe('physical-timeline', () => {
  it('defines INTRO_APPROACH_DURATION_NS as light-travel time over the proton half-separation', () => {
    const expected =
      (PROTON_HALF_SEPARATION_START / PropagationScene.objectScale) / SPEED_OF_LIGHT_CM_PER_NS;
    expect(INTRO_APPROACH_DURATION_NS).toBeCloseTo(expected, 10);
    expect(INTRO_APPROACH_DURATION_NS).toBeGreaterThan(18);
    expect(INTRO_APPROACH_DURATION_NS).toBeLessThan(20);
  });

  it('maps intro endpoints: -INTRO_DURATION_MS → -INTRO_APPROACH_DURATION_NS, 0 → 0', () => {
    expect(presentationMsToPhysicalNs(-INTRO_DURATION_MS)).toBeCloseTo(-INTRO_APPROACH_DURATION_NS, 10);
    expect(presentationMsToPhysicalNs(0)).toBe(0);
  });

  it('maps intro midpoints linearly (option A)', () => {
    const midMs = -INTRO_DURATION_MS / 2;
    expect(presentationMsToPhysicalNs(midMs)).toBeCloseTo(-INTRO_APPROACH_DURATION_NS / 2, 10);
  });

  it('maps propagation with nsPerMs', () => {
    expect(presentationMsToPhysicalNs(1000)).toBeCloseTo(1000 * DEFAULT_NS_PER_MS, 10);
    expect(presentationMsToPhysicalNs(200, { nsPerMs: 0.01 })).toBeCloseTo(2, 10);
  });

  it('inverts presentationMsToPhysicalNs for both phases', () => {
    const samples = [-INTRO_DURATION_MS, -450, -1, 0, 100, 3000];
    for (const ms of samples) {
      const ns = presentationMsToPhysicalNs(ms);
      expect(physicalNsToPresentationMs(ns)).toBeCloseTo(ms, 8);
    }
  });

  it('respects custom intro durations in both directions', () => {
    const scale = { introDurationMs: 500, introDurationNs: 10, nsPerMs: 0.01 };
    expect(presentationMsToPhysicalNs(-250, scale)).toBeCloseTo(-5, 10);
    expect(physicalNsToPresentationMs(-5, scale)).toBeCloseTo(-250, 10);
    expect(physicalNsToPresentationMs(2, scale)).toBeCloseTo(200, 10);
  });
});
