import {
  clampedResidual,
  createPbPbCentralityState,
  defaultPbPbSignalWindow,
  emptyFitSnapshot,
  isPbPbCentralityId,
  PBPB_CENTRALITY_DESCRIPTORS,
  PBPB_CENTRALITY_IDS,
  PBPB_SIGNAL_WINDOW_WIDTH,
  PublishedMinvHistogram,
  rawResidual,
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
  it('recognises all eight published centralities and rejects track-based dataset ids', () => {
    expect(isPbPbCentralityId('pbPb_0_5')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_5_10')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_10_20')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_20_30')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_30_40')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_40_50')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_50_70')).toBeTrue();
    expect(isPbPbCentralityId('pbPb_70_90')).toBeTrue();
    expect(isPbPbCentralityId('pp')).toBeFalse();
    expect(isPbPbCentralityId('pPb')).toBeFalse();
  });
});

describe('PBPB_CENTRALITY_DESCRIPTORS', () => {
  it('lists all eight centralities in ascending order, one per dropdown entry', () => {
    expect(PBPB_CENTRALITY_IDS).toEqual([
      'pbPb_0_5',
      'pbPb_5_10',
      'pbPb_10_20',
      'pbPb_20_30',
      'pbPb_30_40',
      'pbPb_40_50',
      'pbPb_50_70',
      'pbPb_70_90',
    ]);
    expect(PBPB_CENTRALITY_DESCRIPTORS.map((d) => d.id)).toEqual(PBPB_CENTRALITY_IDS);
  });

  it('derives each shortLabelKey from its id', () => {
    expect(PBPB_CENTRALITY_DESCRIPTORS.find((d) => d.id === 'pbPb_0_5')?.shortLabelKey).toBe(
      'JPSI.DATASET.PBPB_0_5_SHORT'
    );
    expect(PBPB_CENTRALITY_DESCRIPTORS.find((d) => d.id === 'pbPb_70_90')?.shortLabelKey).toBe(
      'JPSI.DATASET.PBPB_70_90_SHORT'
    );
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

describe('clampedResidual', () => {
  it('matches rawResidual wherever it is non-negative', () => {
    const histogram = makeHistogram({ unlike: [10, 20, 100, 20, 10], like: [10, 15, 10, 15, 10] });
    expect(Array.from(clampedResidual(histogram))).toEqual([0, 5, 90, 5, 0]);
  });

  it('clamps a negative residual bin to zero without touching rawResidual', () => {
    const histogram = makeHistogram({ unlike: [5], like: [8], binCenters: [0.5], bins: 1 });
    expect(Array.from(clampedResidual(histogram))).toEqual([0]);
    expect(Array.from(rawResidual(histogram))).toEqual([-3]);
  });
});

describe('emptyFitSnapshot / createPbPbCentralityState', () => {
  it('starts with a null fit result, ready for the first subtract', () => {
    const snapshot = emptyFitSnapshot();
    expect(snapshot.fitResult).toBeNull();
    expect(snapshot.massWindow).toEqual([0, 1]);
    expect(snapshot.backgroundFitRange).toEqual([0, 1]);

    const state = createPbPbCentralityState('pbPb_50_70');
    expect(state.centralityId).toBe('pbPb_50_70');
    expect(state.histogram).toBeNull();
    expect(state.loading).toBeFalse();
    expect(state.panelMode).toBe('explore');
    expect(state.tableRow).toBeNull();
    expect(state.fitSnapshot.massWindow).toEqual(snapshot.massWindow);
    expect(state.fitSnapshot.backgroundFitRange).toEqual(snapshot.backgroundFitRange);
    expect(state.fitSnapshot.fitResult).toBeNull();
  });

  it('accepts a custom starting range, e.g. the histogram full axis', () => {
    const snapshot = emptyFitSnapshot([2.0, 3.72]);
    expect(snapshot.massWindow).toEqual([2.0, 3.72]);
    expect(snapshot.backgroundFitRange).toEqual([2.0, 3.72]);
  });
});

describe('defaultPbPbSignalWindow', () => {
  it('parks the fixed-width window at the left of the given axis', () => {
    expect(defaultPbPbSignalWindow(2.0)).toEqual([2.0, 2.0 + PBPB_SIGNAL_WINDOW_WIDTH]);
  });
});
