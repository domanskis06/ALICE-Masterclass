import { TestBed } from '@angular/core/testing';

import { CompactEvent, DEFAULT_PID_CUT } from '../models/jpsi.models';
import { JpsiAnalysisStateService } from './jpsi-analysis-state.service';
import { JpsiPairingService } from './jpsi-pairing.service';
import { JpsiResidualFitService } from './jpsi-residual-fit.service';
import { JpsiSignalService } from './jpsi-signal.service';

/** One positron and one electron, back to back, giving a pair mass close to 3.0. */
function makePairEvent(): CompactEvent {
  return {
    px: Float32Array.from([1.5, -1.5]),
    py: Float32Array.from([0, 0]),
    pz: Float32Array.from([0, 0]),
    p: Float32Array.from([1.5, 1.5]),
    dedx: Float32Array.from([80, 80]),
    sign: Int8Array.from([1, -1]),
  };
}

describe('JpsiAnalysisStateService', () => {
  let service: JpsiAnalysisStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        JpsiAnalysisStateService,
        JpsiPairingService,
        JpsiSignalService,
        JpsiResidualFitService,
      ],
    });
    service = TestBed.inject(JpsiAnalysisStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('advances the cursor as events are appended', () => {
    service.appendEvents([makePairEvent(), makePairEvent()]);
    expect(service.state.processedCount).toBe(2);
    expect(service.state.nextEventIndex).toBe(2);

    service.appendEvents([makePairEvent()]);
    expect(service.state.processedCount).toBe(3);
    expect(service.state.nextEventIndex).toBe(3);
  });

  it('fills the heatmap while appending but waits for Accept selected range before mass', () => {
    service.appendEvents([makePairEvent()]);

    expect(service.state.pidMax).toBeGreaterThan(0);
    expect(service.state.mass.unlike.reduce((sum, v) => sum + v, 0)).toBe(0);

    service.acceptSelectedRange({ ...DEFAULT_PID_CUT, dedxMin: 70, dedxMax: 90 });

    const totalUnlike = service.state.mass.unlike.reduce((sum, v) => sum + v, 0);
    expect(totalUnlike).toBe(1);
    expect(service.state.appliedCut?.dedxMin).toBe(70);
  });

  it('returns to explore mode after every operation that changes the histograms', () => {
    service.appendEvents([makePairEvent()]);
    service.acceptSelectedRange(DEFAULT_PID_CUT);
    service.subtractBackground();
    expect(service.state.panelMode).toBe('subtracted');

    service.appendEvents([makePairEvent()]);
    expect(service.state.panelMode).toBe('explore');
    expect(service.state.fitResult).toBeNull();

    service.subtractBackground();
    service.acceptSelectedRange({ ...DEFAULT_PID_CUT, dedxMin: 70, dedxMax: 90 });
    expect(service.state.panelMode).toBe('explore');

    service.subtractBackground();
    service.resetCuts();
    expect(service.state.panelMode).toBe('explore');
    expect(service.state.appliedCut).toBeNull();
  });

  it('keeps the accepted table row when the histograms are reset', () => {
    service.appendEvents([makePairEvent()]);
    service.acceptSelectedRange(DEFAULT_PID_CUT);
    service.subtractBackground();
    service.setMassWindow([2.9, 3.1]);
    service.runFit();
    service.acceptResult();

    expect(service.state.tableRow).not.toBeNull();
    const acceptedEvents = service.state.tableRow!.nEvents;

    service.resetHistograms();

    expect(service.state.processedCount).toBe(0);
    expect(service.state.nextEventIndex).toBe(0);
    expect(service.state.pidMax).toBe(0);
    expect(service.state.panelMode).toBe('explore');
    expect(service.state.appliedCut).toBeNull();
    // The row is a frozen measurement, so it outlives the data it came from.
    expect(service.state.tableRow?.nEvents).toBe(acceptedEvents);
  });

  it('only allows accepting a subtracted result with a non-zero signal', () => {
    expect(service.canAccept).toBeFalse();

    service.appendEvents([makePairEvent()]);
    expect(service.canAccept).toBeFalse();

    service.acceptSelectedRange(DEFAULT_PID_CUT);
    service.subtractBackground();
    service.setMassWindow([2.9, 3.1]);
    service.runFit();
    expect(service.canAccept).toBeTrue();

    // A window away from the pair contains no signal at all.
    service.setMassWindow([4.5, 5.0]);
    service.runFit();
    expect(service.canAccept).toBeFalse();
  });

  it('clears any earlier fit result whenever a range changes, requiring a fresh Fit', () => {
    service.appendEvents([makePairEvent()]);
    service.acceptSelectedRange(DEFAULT_PID_CUT);
    service.subtractBackground();
    service.setMassWindow([2.9, 3.1]);
    service.runFit();
    expect(service.state.fitResult).not.toBeNull();

    service.setBackgroundFitRange([1.5, 4.5]);
    expect(service.state.fitResult).toBeNull();
  });

  it('keeps the two datasets independent', () => {
    service.appendEvents([makePairEvent(), makePairEvent()]);
    service.acceptSelectedRange({ ...DEFAULT_PID_CUT, dedxMin: 70, dedxMax: 90 });

    service.selectDataset('pPb');
    expect(service.state.processedCount).toBe(0);
    expect(service.state.cut.dedxMin).toBe(DEFAULT_PID_CUT.dedxMin);
    expect(service.state.appliedCut).toBeNull();

    service.appendEvents([makePairEvent()]);
    expect(service.state.processedCount).toBe(1);

    service.selectDataset('pp');
    expect(service.state.processedCount).toBe(2);
    expect(service.state.cut.dedxMin).toBe(70);
    expect(service.state.appliedCut?.dedxMin).toBe(70);
  });

  it('does not subtract while the selection is too wide', () => {
    const nTracks = 4000;
    const crowded: CompactEvent = {
      px: Float32Array.from(Array.from({ length: nTracks }, (_, i) => 1 + i * 0.001)),
      py: new Float32Array(nTracks),
      pz: new Float32Array(nTracks),
      p: Float32Array.from(Array.from({ length: nTracks }, (_, i) => 1 + i * 0.001)),
      dedx: Float32Array.from(new Array(nTracks).fill(80)),
      sign: Int8Array.from(Array.from({ length: nTracks }, (_, i) => (i % 2 === 0 ? 1 : -1))),
    };

    service.appendEvents([crowded]);
    service.acceptSelectedRange(DEFAULT_PID_CUT);

    expect(service.state.tooWideSelection).toBeTrue();
    expect(service.canSubtract).toBeFalse();
  });

  it('rebuilds mass when Accept selected range is pressed again', () => {
    service.appendEvents([makePairEvent()]);
    service.acceptSelectedRange(DEFAULT_PID_CUT);
    expect(service.state.mass.unlike.reduce((sum, v) => sum + v, 0)).toBe(1);

    // A cut that excludes the tracks leaves the mass empty.
    service.acceptSelectedRange({ ...DEFAULT_PID_CUT, dedxMin: 120, dedxMax: 140 });
    expect(service.state.mass.unlike.reduce((sum, v) => sum + v, 0)).toBe(0);
  });
});
