import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';

import { JpsiMinvDataService } from './jpsi-minv-data.service';
import { PbPbManifest, PublishedMinvHistogram } from '../models/pbpb-minv.models';

const MANIFEST: PbPbManifest = {
  histograms: [
    { id: 'pbPb_50_70', file: 'pbPb_50_70.json', centrality: '50_70' },
    { id: 'pbPb_70_90', file: 'pbPb_70_90.json', centrality: '70_90' },
  ],
};

function makeHistogram(centralityLabel: string): PublishedMinvHistogram {
  return {
    schemaVersion: 1,
    datasetId: 'pbPb',
    centrality: '50_70',
    centralityLabel,
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
    xmax: 1,
    bins: 1,
    binCenters: [0.5],
    unlike: [1],
    like: [1],
    unlikeErr: [1],
    likeErr: [1],
    published: {
      nTotal: 1,
      nTotalErr: 1,
      nBkg: 1,
      nBkgErr: 1,
      nJpsi: 1,
      nJpsiErr: 1,
      sOverB: 1,
      significance: 1,
      significanceNote: 'test',
    },
    fitHint: { signalWindow: [0, 1], peakMean: 0.5, peakSigma: 0.1, aGaussHint: [1, 0.5, 0.1] },
  };
}

describe('JpsiMinvDataService', () => {
  let service: JpsiMinvDataService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [JpsiMinvDataService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(JpsiMinvDataService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('fetches the manifest only once even when requested from two different histograms', async () => {
    const promise50 = firstValueFrom(service.getHistogram('pbPb_50_70'));
    const promise70 = firstValueFrom(service.getHistogram('pbPb_70_90'));

    httpMock.expectOne('assets/exercises/jpsi/minv/manifest.json').flush(MANIFEST);

    httpMock.expectOne('assets/exercises/jpsi/minv/pbPb_50_70.json').flush(makeHistogram('50-70%'));
    httpMock.expectOne('assets/exercises/jpsi/minv/pbPb_70_90.json').flush(makeHistogram('70-90%'));

    const [h50, h70] = await Promise.all([promise50, promise70]);
    expect(h50.centralityLabel).toBe('50-70%');
    expect(h70.centralityLabel).toBe('70-90%');
  });

  it('caches a histogram after the first load, issuing no further HTTP requests', async () => {
    const first = firstValueFrom(service.getHistogram('pbPb_50_70'));
    httpMock.expectOne('assets/exercises/jpsi/minv/manifest.json').flush(MANIFEST);
    httpMock.expectOne('assets/exercises/jpsi/minv/pbPb_50_70.json').flush(makeHistogram('50-70%'));
    await first;

    const second = await firstValueFrom(service.getHistogram('pbPb_50_70'));
    expect(second.centralityLabel).toBe('50-70%');
    // httpMock.verify() in afterEach would fail here if a second request had been made.
  });

  it('reuses the cached manifest for a second histogram requested later', async () => {
    const first = firstValueFrom(service.getHistogram('pbPb_50_70'));
    httpMock.expectOne('assets/exercises/jpsi/minv/manifest.json').flush(MANIFEST);
    httpMock.expectOne('assets/exercises/jpsi/minv/pbPb_50_70.json').flush(makeHistogram('50-70%'));
    await first;

    const second = firstValueFrom(service.getHistogram('pbPb_70_90'));
    httpMock.expectOne('assets/exercises/jpsi/minv/pbPb_70_90.json').flush(makeHistogram('70-90%'));
    await second;
  });

  it('errors clearly when the manifest does not list the requested centrality', async () => {
    const promise = firstValueFrom(service.getHistogram('pbPb_50_70'));
    httpMock.expectOne('assets/exercises/jpsi/minv/manifest.json').flush({ histograms: [] });

    await expectAsync(promise).toBeRejectedWithError(/Unknown Pb-Pb Minv histogram id: pbPb_50_70/);
  });
});
