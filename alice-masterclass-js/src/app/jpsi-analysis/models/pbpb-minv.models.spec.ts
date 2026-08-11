import * as d3 from 'd3';

import {
  createPbPbCentralityState,
  defaultFitRange,
  emptyFitSnapshot,
  isPbPbCentralityId,
  PublishedMinvHistogram,
  rawResidual,
  residualToLsaData,
} from './pbpb-minv.models';

/** Small, hand-checkable stand-in for a digitized pbPb_*.json file. */
function makeHistogram(overrides: Partial<PublishedMinvHistogram> = {}): PublishedMinvHistogram {
  return {
    schemaVersion: 1,
    datasetId: 'pbPb',
    centrality: '50_70',
    centralityLabel: '50-70%',
    source: {
      note: 'test fixture',
      figure: 15,
      localPdf: 'x.pdf',
      url: 'https://example.com',
      digitizedWith: 'test',
      renderDpi: 300,
      binWidthGeV: 1,
      nEvents: 1000,
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
      nJpsi: 100,
      nJpsiErr: 10,
      sOverB: 1.6,
      significance: 10,
      significanceNote: 'test',
    },
    fitHint: {
      signalWindow: [2, 3],
      peakMean: 2.5,
      peakSigma: 0.5,
      aGaussHint: [100, 2.5, 0.5],
    },
    ...overrides,
  };
}

describe('isPbPbCentralityId', () => {
  it('recognises the two published centralities and rejects track-based dataset ids', () => {
    expect(isPbPbCentralityId('pbPb_50_70')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_70_90')).toBeTrue();
    expect(isPbPbCentralityId('pp')).toBeFalse();
    expect(isPbPbCentralityId('pPb')).toBeFalse();
  });
});

describe('rawResidual', () => {
  it('computes unlike - like per bin, unclamped', () => {
    const histogram = makeHistogram({ unlike: [10, 20, 100, 20, 10], like: [10, 15, 10, 15, 10] });
    expect(Array.from(rawResidual(histogram))).toEqual([0, 5, 90, 5, 0]);
  });

  it('can go negative when like-sign exceeds unlike-sign in a bin', () => {
    const histogram = makeHistogram({ unlike: [5], like: [8], binCenters: [0.5], bins: 1 });
    expect(Array.from(rawResidual(histogram))).toEqual([-3]);
  });
});

describe('residualToLsaData', () => {
  it('repeats each bin center round(residual) times', () => {
    const histogram = makeHistogram({ unlike: [10, 20, 100, 20, 10], like: [10, 15, 10, 15, 10] });
    const lsa = residualToLsaData(histogram);

    expect(lsa.xmin).toBe(histogram.xmin);
    expect(lsa.xmax).toBe(histogram.xmax);
    expect(lsa.bins).toBe(histogram.bins);
    expect(lsa.data.length).toBe(0 + 5 + 90 + 5 + 0);
    expect(lsa.data.filter((v) => v === 2.5).length).toBe(90);
    expect(lsa.data.filter((v) => v === 1.5).length).toBe(5);
    expect(lsa.data.filter((v) => v === 0.5).length).toBe(0);
  });

  it('clamps negative residual bins to zero instead of emitting negative counts', () => {
    const histogram = makeHistogram({ unlike: [5], like: [8], binCenters: [0.5], bins: 1 });
    const lsa = residualToLsaData(histogram);
    expect(lsa.data).toEqual([]);
  });

  it('rounds fractional residuals to the nearest integer count', () => {
    const histogram = makeHistogram({ unlike: [10.6], like: [8], binCenters: [1], bins: 1 });
    const lsa = residualToLsaData(histogram);
    // 10.6 - 8 = 2.6 -> rounds to 3
    expect(lsa.data.length).toBe(3);
    expect(lsa.data.every((v) => v === 1)).toBeTrue();
  });

  it('re-binning the pseudo-unbinned data with d3.bin reproduces the original per-bin counts', () => {
    // This is the guarantee residualToLsaData relies on instead of its own consistency test:
    // xmin/xmax/bins are carried over unchanged, so FitService's own d3.bin call, using
    // the same domain and threshold count, must recover the same counts per bin.
    const histogram = makeHistogram({
      xmin: 0,
      xmax: 5,
      bins: 5,
      binCenters: [0.5, 1.5, 2.5, 3.5, 4.5],
      unlike: [10, 20, 100, 20, 10],
      like: [10, 15, 10, 15, 10],
    });
    const lsa = residualToLsaData(histogram);

    const binGenerator = d3.bin<number, number>().domain([lsa.xmin, lsa.xmax]).thresholds(lsa.bins);
    const bins = binGenerator(lsa.data);
    const counts = bins.map((b) => b.length);

    expect(counts).toEqual([0, 5, 90, 5, 0]);
  });
});

describe('defaultFitRange', () => {
  it('spans the full histogram, same starting point as LSA', () => {
    const histogram = makeHistogram({ xmin: 2.0, xmax: 3.72 });
    expect(defaultFitRange(histogram)).toEqual([2.0, 3.72]);
  });
});

describe('emptyFitSnapshot / createPbPbCentralityState', () => {
  it('starts with a null result and explore mode, ready for the first subtract', () => {
    const snapshot = emptyFitSnapshot();
    expect(snapshot.result).toBeNull();
    expect(snapshot.signalFunction(1)).toBe(0);
    expect(snapshot.backgroundFunction(1)).toBe(0);

    const state = createPbPbCentralityState('pbPb_50_70');
    expect(state.centralityId).toBe('pbPb_50_70');
    expect(state.histogram).toBeNull();
    expect(state.loading).toBeFalse();
    expect(state.panelMode).toBe('explore');
    expect(state.tableRow).toBeNull();
    expect(state.fitSnapshot.data).toEqual(snapshot.data);
    expect(state.fitSnapshot.signalFitRange).toEqual(snapshot.signalFitRange);
    expect(state.fitSnapshot.backgroundFitRange).toEqual(snapshot.backgroundFitRange);
    expect(state.fitSnapshot.result).toBeNull();
  });
});
