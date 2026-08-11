import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { FitResult, FitService } from '../../shared/services/fit.service';
import { PbPbCentralityId, PublishedMinvHistogram } from '../models/pbpb-minv.models';
import { JpsiMinvDataService } from './jpsi-minv-data.service';
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

function fakeFitResult(signal: number): FitResult {
  return {
    total: 100,
    signal,
    signalError: 5,
    background: 100 - signal,
    p1Gauss: [signal, 2.5, 0.3],
    p1Polynomial: [1, 0, 0],
  };
}

describe('PbPbMinvStateService', () => {
  let service: PbPbMinvStateService;
  let fitService: FitService;
  const histogram0_5 = makeHistogram('pbPb_0_5', 100);
  const histogram5_10 = makeHistogram('pbPb_5_10', 40);

  beforeEach(() => {
    const dataStub: Partial<JpsiMinvDataService> = {
      getHistogram: (id: PbPbCentralityId) => of(makeHistogram(id, id === 'pbPb_0_5' ? 100 : 40)),
    };

    TestBed.configureTestingModule({
      providers: [
        PbPbMinvStateService,
        FitService,
        { provide: JpsiMinvDataService, useValue: dataStub },
      ],
    });
    service = TestBed.inject(PbPbMinvStateService);
    fitService = TestBed.inject(FitService);
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
    fitService.result = fakeFitResult(50);
    service.selectCentrality('pbPb_0_5');

    expect(service.state.panelMode).toBe('subtracted');
    expect(fitService.result).toEqual(fakeFitResult(50));
  });

  describe('subtractBackground', () => {
    it('builds the pseudo-unbinned residual with blank fit ranges (student starts from full range)', () => {
      service.subtractBackground();

      expect(service.state.panelMode).toBe('subtracted');
      expect(fitService.data.xmin).toBe(histogram0_5.xmin);
      expect(fitService.data.xmax).toBe(histogram0_5.xmax);
      expect(fitService.data.bins).toBe(histogram0_5.bins);
      expect(fitService.data.data.length).toBe(100); // 0 + 5 + 90 + 5 + 0
      expect(fitService.signalFitRange).toEqual([histogram0_5.xmin, histogram0_5.xmax]);
      expect(fitService.backgroundFitRange).toEqual([histogram0_5.xmin, histogram0_5.xmax]);
      // Not a slider default — the Nelder-Mead seed for the Gaussian, same role as LSA's
      // hardcoded per-particle guess. Without it mu=0 never converges to the real peak.
      expect(fitService.aGaussHint).toEqual(histogram0_5.fitHint.aGaussHint);
      expect(fitService.aPolyHint).toEqual([0, 0, 0]);
    });

    it('is guarded by canSubtract and does nothing once already in subtracted mode', () => {
      service.subtractBackground();
      const dataBefore = fitService.data;

      service.subtractBackground();

      expect(fitService.data).toBe(dataBefore);
      expect(service.state.panelMode).toBe('subtracted');
    });
  });

  describe('showComponents', () => {
    it('returns to explore mode without touching the fit result', () => {
      service.subtractBackground();
      fitService.result = fakeFitResult(42);

      service.showComponents();

      expect(service.state.panelMode).toBe('explore');
      expect(fitService.result).toEqual(fakeFitResult(42));
    });
  });

  describe('canAccept / acceptResult / removeResult', () => {
    it('only allows accepting once subtracted and fit', () => {
      expect(service.canAccept).toBeFalse();

      service.subtractBackground();
      expect(service.canAccept).toBeFalse();

      fitService.result = fakeFitResult(88);
      expect(service.canAccept).toBeTrue();
    });

    it('freezes the fit result and published metadata into the table row', () => {
      service.subtractBackground();
      fitService.result = fakeFitResult(88);

      service.acceptResult();

      const row = service.state.tableRow;
      expect(row).not.toBeNull();
      expect(row?.centralityId).toBe('pbPb_0_5');
      expect(row?.centralityLabel).toBe('0-5%');
      expect(row?.fit).toEqual(fakeFitResult(88));
      expect(row?.published).toEqual(histogram0_5.published);
      expect(service.rows.length).toBe(1);
    });

    it('removeResult clears only the targeted centrality', () => {
      service.subtractBackground();
      fitService.result = fakeFitResult(88);
      service.acceptResult();

      service.selectCentrality('pbPb_5_10');
      service.subtractBackground();
      fitService.result = fakeFitResult(33);
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
      fitService.signalFitRange = [2, 3];
      fitService.result = fakeFitResult(70);

      service.selectCentrality('pbPb_5_10');

      // The new centrality starts fresh, unsubtracted.
      expect(service.activeCentrality).toBe('pbPb_5_10');
      expect(service.state.panelMode).toBe('explore');
      expect(fitService.result).toBeNull();

      // And the one just left was wiped too — it was never accepted.
      expect(service.stateOf('pbPb_0_5').panelMode).toBe('explore');
      expect(service.stateOf('pbPb_0_5').fitSnapshot.result).toBeNull();

      service.selectCentrality('pbPb_0_5');

      // Coming back finds a blank slate, not the earlier in-progress fit.
      expect(service.state.panelMode).toBe('explore');
      expect(fitService.result).toBeNull();
    });

    it('keeps an accepted centrality exactly as it was, even across other dataset switches', () => {
      service.subtractBackground();
      fitService.signalFitRange = [2, 3];
      fitService.result = fakeFitResult(70);
      service.acceptResult();

      service.selectCentrality('pbPb_5_10');
      service.selectCentrality('pbPb_10_20');
      service.selectCentrality('pbPb_0_5');

      // Accepted centrality's fit view survives round trips through other datasets.
      expect(service.state.panelMode).toBe('subtracted');
      expect(fitService.signalFitRange).toEqual([2, 3]);
      expect(fitService.result).toEqual(fakeFitResult(70));
      expect(service.state.tableRow).not.toBeNull();
    });

    it('still snapshots further edits made to an accepted centrality before leaving it', () => {
      service.subtractBackground();
      fitService.result = fakeFitResult(70);
      service.acceptResult();

      // Student keeps tweaking the fit after accepting, without re-accepting.
      fitService.signalFitRange = [1, 4];
      fitService.result = fakeFitResult(80);

      service.selectCentrality('pbPb_5_10');
      service.selectCentrality('pbPb_0_5');

      expect(fitService.signalFitRange).toEqual([1, 4]);
      expect(fitService.result).toEqual(fakeFitResult(80));
    });

    it('leavePublishedView resets the active centrality just like switching to another one, unless accepted', () => {
      service.subtractBackground();
      fitService.result = fakeFitResult(55);

      service.leavePublishedView();

      expect(service.stateOf('pbPb_0_5').panelMode).toBe('explore');
      expect(service.stateOf('pbPb_0_5').fitSnapshot.result).toBeNull();
      expect(fitService.result).toBeNull();
    });

    it('leavePublishedView does not touch an accepted centrality', () => {
      service.subtractBackground();
      fitService.result = fakeFitResult(55);
      service.acceptResult();

      service.leavePublishedView();

      expect(service.stateOf('pbPb_0_5').panelMode).toBe('subtracted');
      expect(fitService.result).toEqual(fakeFitResult(55));
    });
  });
});
