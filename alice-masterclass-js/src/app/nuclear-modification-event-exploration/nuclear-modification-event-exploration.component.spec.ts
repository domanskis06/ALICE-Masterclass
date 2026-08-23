import {
  NuclearModificationEventExplorationComponent,
  summarizeEvent,
} from './nuclear-modification-event-exploration.component';
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

describe('NuclearModificationEventExplorationComponent filter gate', () => {
  // Komponent ciągnie za sobą całą scenę Three.js, więc zamiast TestBed wołamy
  // samą metodę na atrapie stanu — sprawdzany niezmiennik jest czysto logiczny.
  const close = (self: unknown) =>
    NuclearModificationEventExplorationComponent.prototype.onFilterBuilderClosed.call(self);

  it('refuses to close the builder before a filter is accepted', () => {
    const self = { filterReady: false, filterBuilderOpen: true };
    close(self);
    expect(self.filterBuilderOpen).toBe(true);
  });

  it('closes once the filter has been accepted', () => {
    const self = { filterReady: true, filterBuilderOpen: true };
    close(self);
    expect(self.filterBuilderOpen).toBe(false);
  });
});

describe('NuclearModificationEventExplorationComponent demonstration event', () => {
  // Same trick as above: the invariant is pure logic, so call the getter
  // against a stand-in state instead of booting the Three.js scene.
  const allAnalyzed = (self: unknown) =>
    Object.getOwnPropertyDescriptor(
      NuclearModificationEventExplorationComponent.prototype,
      'allEventsAnalyzed',
    )!.get!.call(self);

  function state(analyzed: number[], empty: Array<[number, boolean]> = []) {
    return {
      maxEvents: 4,
      analyzedByIndex: new Set(analyzed),
      emptyByIndex: new Map(empty),
      eventHasTracks(index: number) {
        const e = (this.emptyByIndex as Map<number, boolean>).get(index);
        return e === undefined ? undefined : !e;
      },
    };
  }

  it('does not require the magnet-off demonstration event to be analysed', () => {
    // Index 0 is never analysed; every real event is.
    expect(allAnalyzed(state([1, 2, 3]))).toBeTrue();
  });

  it('still requires the real events', () => {
    expect(allAnalyzed(state([1, 2]))).toBeFalse();
  });

  it('does not block on an event that has no tracks to select', () => {
    // Index 3 is known empty, so it can never be marked analysed.
    expect(allAnalyzed(state([1, 2], [[3, true]]))).toBeTrue();
  });
});
