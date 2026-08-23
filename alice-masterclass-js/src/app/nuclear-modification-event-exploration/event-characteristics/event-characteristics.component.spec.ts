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
    // Domena szeroka na dokładnie dwie kategorie — słupki -1 i +1 stykają się w zerze.
    expect(byKey['charge'].xDomain).toEqual([-2, 2]);
    // Średnia znaku ładunku nic nie znaczy, więc ten jeden wykres jej nie rysuje.
    expect(byKey['charge'].showMean).toBe(false);
    expect(byKey['pt'].showMean).toBeUndefined();
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

  it('keeps pp and Pb-Pb in separate series behind one switch', () => {
    const pp: Event = {
      tracks: [track({ px: 0.5, py: 0, sign: 1, isPrimary: true })],
      clusters: [],
      decays: [],
    };
    const pbPb: Event = {
      tracks: [
        track({ px: 0.5, py: 0, sign: 1, isPrimary: true }),
        track({ px: 2.0, py: 0, sign: -1, isPrimary: true }),
        track({ px: 0.2, py: 0, sign: 1, isPrimary: false, type: TrackType.V0 }),
      ],
      clusters: [],
      decays: [],
    };

    component.recordAnalyzedEvent(pp, pp.tracks, 'pp276TeV');
    component.recordAnalyzedEvent(pbPb, pbPb.tracks.filter((t) => t.isPrimary), 'pbPbCentral');

    // Panel stoi na pp: widać wyłącznie zderzenie pp.
    let byKey = Object.fromEntries(component.histograms.map((h) => [h.key, h]));
    expect(byKey['multiplicity'].data).toEqual([1]);
    expect(byKey['pt'].data.length).toBe(1);

    component.system = 'pbPb';

    // Pb-Pb holds one event per class, so multiplicity / multiplicity above
    // 1 GeV/c / secondaries are readouts rather than histograms; only the
    // per-track distributions stay as plots.
    byKey = Object.fromEntries(component.histograms.map((h) => [h.key, h]));
    expect(Object.keys(byKey).sort()).toEqual(['charge', 'phi', 'pt']);
    expect(byKey['pt'].data.length).toBe(2);

    const central = component.classReadouts.find((c) => c.key === 'pbPbCentral')!;
    expect(central.present).toBeTrue();
    expect(central.multiplicity).toBe(2);
    expect(central.multiplicityMinPt).toBe(1);
    expect(central.secondaries).toBe(1);
  });

  it('scales the pp multiplicity axis to that system', () => {
    component.system = 'pp';
    const byKey = Object.fromEntries(component.histograms.map((h) => [h.key, h]));
    expect(byKey['multiplicity'].xDomain).toEqual([0, 30]);
  });

  it('only offers a class checkbox once that class has been analysed', () => {
    const event: Event = {
      tracks: [track({ px: 0.5, py: 0, sign: 1, isPrimary: true })],
      clusters: [],
      decays: [],
    };
    component.system = 'pbPb';
    expect(component.selectableClasses).toEqual([]);

    component.recordAnalyzedEvent(event, event.tracks, 'pbPbCentral');
    expect(component.selectableClasses.map((c) => c.key)).toEqual(['pbPbCentral']);
  });

  it('unticking a class takes it out of the per-track plots', () => {
    const event: Event = {
      tracks: [track({ px: 0.5, py: 0, sign: 1, isPrimary: true })],
      clusters: [],
      decays: [],
    };
    component.recordAnalyzedEvent(event, event.tracks, 'pbPbCentral');
    component.system = 'pbPb';

    const ptData = () =>
      component.histograms.find((h) => h.key === 'pt')!.data.length;
    expect(ptData()).toBe(1);

    component.toggleClass('pbPbCentral');
    expect(ptData()).toBe(0);
  });

  it('reports which systems already have something to show', () => {
    const event: Event = {
      tracks: [track({ px: 0.5, py: 0, sign: 1, isPrimary: true })],
      clusters: [],
      decays: [],
    };
    expect(component.hasData('pp')).toBeFalse();
    expect(component.hasData('pbPb')).toBeFalse();

    component.recordAnalyzedEvent(event, event.tracks, 'pbPbPeripheral');

    expect(component.hasData('pp')).toBeFalse();
    expect(component.hasData('pbPb')).toBeTrue();
  });
});
