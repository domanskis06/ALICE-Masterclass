import { NmfEventCharacteristicsComponent } from './event-characteristics.component';
import { Event, Track, TrackType } from '../../shared/models';

function track(partial: Partial<Track> & Pick<Track, 'px' | 'py' | 'sign'>): Track {
  return {
    E: 1,
    mass: 0.14,
    particleId: 0,
    comboId: 0,
    type: TrackType.STANDARD,
    pz: 0,
    trajectory: [],
    isPrimary: true,
    ...partial,
  };
}

describe('NmfEventCharacteristicsComponent', () => {
  let component: NmfEventCharacteristicsComponent;

  beforeEach(() => {
    component = new NmfEventCharacteristicsComponent({ open: () => ({}) } as any);
  });

  it('accumulates all six histogram series from accepted charged primaries', () => {
    const fullEvent: Event = {
      tracks: [
        track({ px: 0.5, py: 0, sign: 1, isPrimary: true }),
        track({ px: 1.2, py: 0, sign: -1, isPrimary: true }),
        track({
          px: 0.3,
          py: 0,
          sign: 1,
          isPrimary: false,
          type: TrackType.SECONDARY,
        }),
      ],
      clusters: [],
      decays: [],
    };
    const accepted = fullEvent.tracks.filter((t) => t.isPrimary && t.sign !== 0);

    component.recordAnalyzedEvent(fullEvent, accepted);

    const byKey = Object.fromEntries(component.histograms.map((h) => [h.key, h]));
    expect(byKey['multiplicity'].data).toEqual([2]);
    expect(byKey['multiplicityMinPt'].data).toEqual([1]);
    expect(byKey['secondaries'].data).toEqual([1]);
    expect(byKey['pt'].data.length).toBe(2);
    expect(byKey['pt'].data[0]).toBeCloseTo(0.5, 5);
    expect(byKey['pt'].data[1]).toBeCloseTo(1.2, 5);
    expect(byKey['charge'].data).toEqual([1, -1]);
    expect(byKey['charge'].discreteValues).toEqual([-1, 1]);
    expect(byKey['phi'].data.length).toBe(2);

    // Second analysed event appends (does not replace).
    component.recordAnalyzedEvent(fullEvent, [accepted[0]]);
    expect(byKey['multiplicity'].data).toEqual([2]); // stale ref — rebuild
    const after = Object.fromEntries(component.histograms.map((h) => [h.key, h]));
    expect(after['multiplicity'].data).toEqual([2, 1]);
    expect(after['pt'].data.length).toBe(3);
    expect(after['charge'].data).toEqual([1, -1, 1]);
    expect(after['secondaries'].data).toEqual([1, 1]);
  });

  it('ignores neutral (sign 0) tracks in the accepted list', () => {
    const fullEvent: Event = {
      tracks: [track({ px: 0.5, py: 0, sign: 0, isPrimary: true })],
      clusters: [],
      decays: [],
    };
    component.recordAnalyzedEvent(fullEvent, fullEvent.tracks);
    const byKey = Object.fromEntries(component.histograms.map((h) => [h.key, h]));
    expect(byKey['multiplicity'].data).toEqual([0]);
    expect(byKey['pt'].data).toEqual([]);
    expect(byKey['charge'].data).toEqual([]);
  });
});
