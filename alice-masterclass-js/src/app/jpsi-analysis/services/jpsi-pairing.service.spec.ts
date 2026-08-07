import { TestBed } from '@angular/core/testing';

import {
  CompactEvent,
  createMassHistograms,
  DEFAULT_PID_CUT,
  MASS_BIN_WIDTH,
  MassHistograms,
  PidCut,
} from '../models/jpsi.models';
import { JpsiPairingService } from './jpsi-pairing.service';

interface TrackSpec {
  px: number;
  py: number;
  pz: number;
  dedx: number;
  sign: number;
}

/** Builds one event; |p| is derived so the cut and the kinematics stay consistent. */
function makeEvent(tracks: TrackSpec[]): CompactEvent {
  return {
    px: Float32Array.from(tracks.map((t) => t.px)),
    py: Float32Array.from(tracks.map((t) => t.py)),
    pz: Float32Array.from(tracks.map((t) => t.pz)),
    p: Float32Array.from(
      tracks.map((t) => Math.sqrt(t.px * t.px + t.py * t.py + t.pz * t.pz))
    ),
    dedx: Float32Array.from(tracks.map((t) => t.dedx)),
    sign: Int8Array.from(tracks.map((t) => t.sign)),
  };
}

function track(sign: number, px: number, dedx = 80): TrackSpec {
  return { px, py: 0, pz: 0, dedx, sign };
}

function total(histogram: Float64Array): number {
  return histogram.reduce((sum, value) => sum + value, 0);
}

describe('JpsiPairingService', () => {
  let service: JpsiPairingService;
  let mass: MassHistograms;
  const cut: PidCut = { ...DEFAULT_PID_CUT };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [JpsiPairingService] });
    service = TestBed.inject(JpsiPairingService);
    mass = createMassHistograms();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('produces the expected number of pairs per combination', () => {
    // 3 positive and 2 negative tracks: 6 unlike, 3 pos-pos, 1 neg-neg.
    const event = makeEvent([
      track(1, 1),
      track(1, 2),
      track(1, 3),
      track(-1, -1),
      track(-1, -2),
    ]);

    service.fillMassHistograms([event], cut, mass);

    expect(total(mass.unlike)).toBe(6);
    expect(total(mass.posPos)).toBe(3);
    expect(total(mass.negNeg)).toBe(1);
  });

  it('never pairs tracks across event boundaries', () => {
    // One positron in one event, one electron in another: no pair may be formed.
    const events = [makeEvent([track(1, 1)]), makeEvent([track(-1, -1)])];

    service.fillMassHistograms(events, cut, mass);

    expect(total(mass.unlike)).toBe(0);
    expect(total(mass.posPos)).toBe(0);
    expect(total(mass.negNeg)).toBe(0);
  });

  it('computes the invariant mass under the electron hypothesis', () => {
    // Two back-to-back tracks of |p| = 1.5 give a pair mass of very nearly 2 * 1.5.
    const event = makeEvent([track(1, 1.5), track(-1, -1.5)]);

    service.fillMassHistograms([event], cut, mass);

    const expectedBin = Math.floor(3.0 / MASS_BIN_WIDTH);
    expect(mass.unlike[expectedBin]).toBe(1);
    expect(total(mass.unlike)).toBe(1);
  });

  it('ignores tracks outside the cut', () => {
    const event = makeEvent([
      track(1, 1, 80),
      track(-1, -1, 80),
      // Same kinematics but a dE/dx the student excluded.
      track(-1, -2, 200),
    ]);

    service.fillMassHistograms([event], { ...cut, dedxMin: 70, dedxMax: 90 }, mass);

    expect(total(mass.unlike)).toBe(1);
  });

  it('counts candidate pairs without building the histograms', () => {
    const events = [
      makeEvent([track(1, 1), track(1, 2), track(-1, -1)]),
      makeEvent([track(-1, -1), track(-1, -2)]),
    ];

    // Event one: 2 unlike + 1 pos-pos. Event two: 1 neg-neg.
    expect(service.countPairs(events, cut)).toBe(4);
  });

  it('flags a selection that would produce too many pairs', () => {
    const wide = makeEvent([
      ...Array.from({ length: 1400 }, (_, i) => track(1, 1 + i * 0.001)),
      ...Array.from({ length: 1400 }, (_, i) => track(-1, -1 - i * 0.001)),
    ]);

    expect(service.isSelectionTooWide([wide], cut)).toBeTrue();
    expect(service.isSelectionTooWide([makeEvent([track(1, 1), track(-1, -1)])], cut))
      .toBeFalse();
  });
});
