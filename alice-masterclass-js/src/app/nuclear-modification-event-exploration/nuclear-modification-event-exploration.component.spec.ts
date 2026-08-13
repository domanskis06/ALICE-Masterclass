import { summarizeEvent } from './nuclear-modification-event-exploration.component';
import { Event, TrackType } from '../shared/models';

describe('summarizeEvent', () => {
  it('counts multiplicity and high-pT tracks', () => {
    const event: Event = {
      tracks: [
        {
          E: 1,
          mass: 0.1,
          particleId: 1,
          comboId: 0,
          sign: 1,
          type: TrackType.STANDARD,
          px: 0.5,
          py: 0,
          pz: 0,
          trajectory: [],
        },
        {
          E: 2,
          mass: 0.1,
          particleId: 2,
          comboId: 0,
          sign: -1,
          type: TrackType.STANDARD,
          px: 1.2,
          py: 0,
          pz: 0,
          trajectory: [],
        },
      ],
      clusters: [],
      decays: [],
    };

    const summary = summarizeEvent(event);
    expect(summary.multiplicity).toBe(2);
    expect(summary.highPtCount).toBe(1);
    expect(summary.meanPt).toBeCloseTo(0.85, 5);
  });
});
