import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';

import { FitResult, FitService } from '../../shared/services/fit.service';
import { PbPbCentralityId, PublishedMinvHistogram } from '../models/pbpb-minv.models';
import { JpsiMinvDataService } from './jpsi-minv-data.service';
import { PbPbMinvStateService } from './pbpb-minv-state.service';

function makeHistogram(centralityId: PbPbCentralityId, nJpsi: number): PublishedMinvHistogram {
  return {
    schemaVersion: 1,
    datasetId: 'pbPb',
    centrality: centralityId === 'pbPb_50_70' ? '50_70' : '70_90',
    centralityLabel: centralityId === 'pbPb_50_70' ? '50-70%' : '70-90%',
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
  const histogram5070 = makeHistogram('pbPb_50_70', 100);
  const histogram7090 = makeHistogram('pbPb_70_90', 40);

  beforeEach(() => {
    const dataStub: Partial<JpsiMinvDataService> = {
      getHistogram: (id: PbPbCentralityId) => of(id === 'pbPb_50_70' ? histogram5070 : histogram7090),
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

  it('preloads both centralities eagerly, before any dropdown interaction', () => {
    expect(service.stateOf('pbPb_50_70').histogram?.centralityLabel).toBe('50-70%');
    expect(service.stateOf('pbPb_70_90').histogram?.centralityLabel).toBe('70-90%');
  });

  it('defaults to the 50-70% centrality, in explore mode with no accepted row', () => {
    expect(service.activeCentrality).toBe('pbPb_50_70');
    expect(service.state.panelMode).toBe('explore');
    expect(service.state.tableRow).toBeNull();
  });

  it('selectCentrality is a no-op when the id is already active', () => {
    service.subtractBackground();
    fitService.result = fakeFitResult(50);
    service.selectCentrality('pbPb_50_70');

    expect(service.state.panelMode).toBe('subtracted');
    expect(fitService.result).toEqual(fakeFitResult(50));
  });

  describe('subtractBackground', () => {
    it('builds the pseudo-unbinned residual with blank fit ranges (student starts from full range)', () => {
      service.subtractBackground();

      expect(service.state.panelMode).toBe('subtracted');
      expect(fitService.data.xmin).toBe(histogram5070.xmin);
      expect(fitService.data.xmax).toBe(histogram5070.xmax);
      expect(fitService.data.bins).toBe(histogram5070.bins);
      expect(fitService.data.data.length).toBe(100); // 0 + 5 + 90 + 5 + 0
      expect(fitService.signalFitRange).toEqual([histogram5070.xmin, histogram5070.xmax]);
      expect(fitService.backgroundFitRange).toEqual([histogram5070.xmin, histogram5070.xmax]);
      // Not a slider default — the Nelder-Mead seed for the Gaussian, same role as LSA's
      // hardcoded per-particle guess. Without it mu=0 never converges to the real peak.
      expect(fitService.aGaussHint).toEqual(histogram5070.fitHint.aGaussHint);
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
      expect(row?.centralityId).toBe('pbPb_50_70');
      expect(row?.centralityLabel).toBe('50-70%');
      expect(row?.fit).toEqual(fakeFitResult(88));
      expect(row?.published).toEqual(histogram5070.published);
      expect(service.rows.length).toBe(1);
    });

    it('removeResult clears only the targeted centrality', () => {
      service.subtractBackground();
      fitService.result = fakeFitResult(88);
      service.acceptResult();

      service.selectCentrality('pbPb_70_90');
      service.subtractBackground();
      fitService.result = fakeFitResult(33);
      service.acceptResult();

      expect(service.rows.length).toBe(2);

      service.removeResult('pbPb_50_70');

      expect(service.stateOf('pbPb_50_70').tableRow).toBeNull();
      expect(service.stateOf('pbPb_70_90').tableRow).not.toBeNull();
      expect(service.rows.length).toBe(1);
    });
  });

  describe('selectCentrality snapshot/restore', () => {
    it('keeps each centrality analysis independent across switches, mirroring the pp/p-Pb behaviour', () => {
      service.subtractBackground();
      fitService.signalFitRange = [2, 3];
      fitService.result = fakeFitResult(70);
      const dataAt5070 = fitService.data;

      service.selectCentrality('pbPb_70_90');

      // Switching restores a fresh (blank) snapshot for the other centrality: still unsubtracted.
      expect(service.activeCentrality).toBe('pbPb_70_90');
      expect(service.state.panelMode).toBe('explore');
      expect(fitService.result).toBeNull();

      service.subtractBackground();
      fitService.signalFitRange = [1, 4];
      fitService.result = fakeFitResult(20);

      service.selectCentrality('pbPb_50_70');

      // Back on 50-70%: the earlier fit progress must be exactly as left.
      expect(service.activeCentrality).toBe('pbPb_50_70');
      expect(service.state.panelMode).toBe('subtracted');
      expect(fitService.signalFitRange).toEqual([2, 3]);
      expect(fitService.result).toEqual(fakeFitResult(70));
      expect(fitService.data).toBe(dataAt5070);

      service.selectCentrality('pbPb_70_90');

      // And 70-90% progress must also have survived the round trip.
      expect(service.state.panelMode).toBe('subtracted');
      expect(fitService.signalFitRange).toEqual([1, 4]);
      expect(fitService.result).toEqual(fakeFitResult(20));
    });
  });
});
