import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { PbPbCentralityId, PublishedMinvHistogram } from '../models/pbpb-minv.models';
import { JpsiMinvDataService } from './jpsi-minv-data.service';
import { JpsiResidualFitService } from './jpsi-residual-fit.service';
import { PbPbMinvStateService } from './pbpb-minv-state.service';

const LABELS: Record<PbPbCentralityId, string> = {
  pbPb_0_5: '0-5%',
  pbPb_5_10: '5-10%',
  pbPb_10_20: '10-20%',
  pbPb_20_30: '20-30%',
  pbPb_30_40: '30-40%',
  pbPb_40_50: '40-50%',
  pbPb_50_70: '50-70%',
  pbPb_70_90: '70-90%',
};

function makeHistogram(centralityId: PbPbCentralityId, nJpsi: number): PublishedMinvHistogram {
  return {
    schemaVersion: 1,
    datasetId: 'pbPb',
    centrality: centralityId.replace('pbPb_', ''),
    centralityLabel: LABELS[centralityId],
    source: {
      note: 'test',
      figure: 15,
      localPdf: 'x.pdf',
      url: 'https://example.com',
      digitizedWith: 'test',
      renderDpi: 300,
      binWidthGeV: 1,
      nEvents: 1,
    },
    xmin: 0,
    xmax: 5,
    bins: 5,
    binCenters: [0.5, 1.5, 2.5, 3.5, 4.5],
    unlike: [10, 20, 100, 20, 10],
    like: [10, 15, 10, 15, 10],
    unlikeErr: [3, 4, 10, 4, 3],
    likeErr: [3, 4, 3, 4, 3],
    published: {
      nTotal: 160,
      nTotalErr: 12,
      nBkg: 60,
      nBkgErr: 8,
      nJpsi,
      nJpsiErr: 10,
      sOverB: 1.6,
      significance: 10,
      significanceNote: 'test',
    },
    fitHint: { signalWindow: [2, 3], peakMean: 2.5, peakSigma: 0.5, aGaussHint: [100, 2.5, 0.5] },
  };
}

describe('PbPbMinvStateService', () => {
  let service: PbPbMinvStateService;

  beforeEach(() => {
    const dataStub: Partial<JpsiMinvDataService> = {
      getHistogram: (id: PbPbCentralityId) => of(makeHistogram(id, id === 'pbPb_0_5' ? 100 : 40)),
    };

    TestBed.configureTestingModule({
      providers: [
        PbPbMinvStateService,
        JpsiResidualFitService,
        { provide: JpsiMinvDataService, useValue: dataStub },
      ],
    });
    service = TestBed.inject(PbPbMinvStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('preloads all eight centralities eagerly, before any dropdown interaction', () => {
    expect(service.stateOf('pbPb_0_5').histogram?.centralityLabel).toBe('0-5%');
    expect(service.stateOf('pbPb_70_90').histogram?.centralityLabel).toBe('70-90%');
  });

  it('defaults to the first (lowest) centrality, in explore mode with no accepted row', () => {
    expect(service.activeCentrality).toBe('pbPb_0_5');
    expect(service.state.panelMode).toBe('explore');
    expect(service.state.tableRow).toBeNull();
  });

  it('selectCentrality is a no-op when the id is already active', () => {
    service.subtractBackground();
    service.runFit();
    const before = service.state.fitSnapshot.fitResult;
    service.selectCentrality('pbPb_0_5');

    expect(service.state.panelMode).toBe('subtracted');
    expect(service.state.fitSnapshot.fitResult).toEqual(before);
  });

  describe('subtractBackground', () => {
    it('starts both sliders on the full histogram axis (student starts from full range)', () => {
      service.subtractBackground();

      expect(service.state.panelMode).toBe('subtracted');
      expect(service.state.fitSnapshot.massWindow).toEqual([0, 5]);
      expect(service.state.fitSnapshot.backgroundFitRange).toEqual([0, 5]);
      expect(service.state.fitSnapshot.fitResult).toBeNull();
    });

    it('is guarded by canSubtract and does nothing once already in subtracted mode', () => {
      service.subtractBackground();
      service.setBackgroundFitRange([1, 4]);

      service.subtractBackground();

      expect(service.state.fitSnapshot.backgroundFitRange).toEqual([1, 4]);
      expect(service.state.panelMode).toBe('subtracted');
    });
  });

  describe('runFit', () => {
    it('fits the Pol1 residual background and reports a signal in the window', () => {
      service.subtractBackground();
      service.setMassWindow([2, 3]);

      service.runFit();

      const result = service.state.fitSnapshot.fitResult;
      expect(result).not.toBeNull();
      expect(result!.signal).toBeGreaterThan(0);
    });

    it('does nothing while still in explore mode', () => {
      service.runFit();
      expect(service.state.fitSnapshot.fitResult).toBeNull();
    });
  });

  describe('showComponents', () => {
    it('returns to explore mode without touching the fit result', () => {
      service.subtractBackground();
      service.runFit();
      const result = service.state.fitSnapshot.fitResult;

      service.showComponents();

      expect(service.state.panelMode).toBe('explore');
      expect(service.state.fitSnapshot.fitResult).toEqual(result);
    });
  });

  describe('canAccept / acceptResult / removeResult', () => {
    it('only allows accepting once subtracted and fit with a positive signal', () => {
      expect(service.canAccept).toBeFalse();

      service.subtractBackground();
      expect(service.canAccept).toBeFalse();

      service.setMassWindow([2, 3]);
      service.runFit();
      expect(service.canAccept).toBeTrue();
    });

    it('freezes the fit result and published metadata into the table row', () => {
      service.subtractBackground();
      service.setMassWindow([2, 3]);
      service.runFit();

      service.acceptResult();

      const row = service.state.tableRow;
      expect(row).not.toBeNull();
      expect(row?.centralityId).toBe('pbPb_0_5');
      expect(row?.centralityLabel).toBe('0-5%');
      expect(row?.fit).toEqual(service.state.fitSnapshot.fitResult!);
      expect(row?.published.nJpsi).toBe(100);
      expect(service.rows.length).toBe(1);
    });

    it('removeResult clears only the targeted centrality', () => {
      service.subtractBackground();
      service.setMassWindow([2, 3]);
      service.runFit();
      service.acceptResult();

      service.selectCentrality('pbPb_5_10');
      service.subtractBackground();
      service.setMassWindow([2, 3]);
      service.runFit();
      service.acceptResult();

      expect(service.rows.length).toBe(2);

      service.removeResult('pbPb_0_5');

      expect(service.stateOf('pbPb_0_5').tableRow).toBeNull();
      expect(service.stateOf('pbPb_5_10').tableRow).not.toBeNull();
      expect(service.rows.length).toBe(1);
    });
  });

  describe('selectCentrality reset semantics', () => {
    it('resets an unaccepted centrality back to explore/blank as soon as the student leaves it', () => {
      service.subtractBackground();
      service.setBackgroundFitRange([2, 3]);
      service.runFit();

      service.selectCentrality('pbPb_5_10');

      // The new centrality starts fresh, unsubtracted.
      expect(service.activeCentrality).toBe('pbPb_5_10');
      expect(service.state.panelMode).toBe('explore');
      expect(service.state.fitSnapshot.fitResult).toBeNull();

      // And the one just left was wiped too — it was never accepted.
      expect(service.stateOf('pbPb_0_5').panelMode).toBe('explore');
      expect(service.stateOf('pbPb_0_5').fitSnapshot.fitResult).toBeNull();

      service.selectCentrality('pbPb_0_5');

      // Coming back finds a blank slate, not the earlier in-progress fit.
      expect(service.state.panelMode).toBe('explore');
      expect(service.state.fitSnapshot.fitResult).toBeNull();
    });

    it('keeps an accepted centrality exactly as it was, even across other dataset switches', () => {
      service.subtractBackground();
      service.setMassWindow([2, 3]);
      service.runFit();
      service.acceptResult();
      const acceptedResult = service.state.fitSnapshot.fitResult;

      service.selectCentrality('pbPb_5_10');
      service.selectCentrality('pbPb_10_20');
      service.selectCentrality('pbPb_0_5');

      // Accepted centrality's fit view survives round trips through other centralities.
      expect(service.state.panelMode).toBe('subtracted');
      expect(service.state.fitSnapshot.massWindow).toEqual([2, 3]);
      expect(service.state.fitSnapshot.fitResult).toEqual(acceptedResult);
      expect(service.state.tableRow).not.toBeNull();
    });

    it('still keeps further edits made to an accepted centrality before leaving it', () => {
      service.subtractBackground();
      service.setMassWindow([2, 3]);
      service.runFit();
      service.acceptResult();

      // Student keeps tweaking the fit after accepting, without re-accepting.
      service.setMassWindow([1, 4]);
      service.runFit();
      const editedResult = service.state.fitSnapshot.fitResult;

      service.selectCentrality('pbPb_5_10');
      service.selectCentrality('pbPb_0_5');

      expect(service.state.fitSnapshot.massWindow).toEqual([1, 4]);
      expect(service.state.fitSnapshot.fitResult).toEqual(editedResult);
    });

    it('leavePublishedView resets the active centrality just like switching to another one, unless accepted', () => {
      service.subtractBackground();
      service.setMassWindow([2, 3]);
      service.runFit();

      service.leavePublishedView();

      expect(service.stateOf('pbPb_0_5').panelMode).toBe('explore');
      expect(service.stateOf('pbPb_0_5').fitSnapshot.fitResult).toBeNull();
    });

    it('leavePublishedView does not touch an accepted centrality', () => {
      service.subtractBackground();
      service.setMassWindow([2, 3]);
      service.runFit();
      service.acceptResult();
      const acceptedResult = service.state.fitSnapshot.fitResult;

      service.leavePublishedView();

      expect(service.stateOf('pbPb_0_5').panelMode).toBe('subtracted');
      expect(service.stateOf('pbPb_0_5').fitSnapshot.fitResult).toEqual(acceptedResult);
    });
  });
});
