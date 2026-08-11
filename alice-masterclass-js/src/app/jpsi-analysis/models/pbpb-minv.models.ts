import { LSAData } from '../../shared/models';
import { FitResult } from '../../shared/services/fit.service';
import { DatasetId } from './jpsi.models';

/** The two Pb-Pb centrality classes published in Fig. 15 — each is its own "collision system". */
export type PbPbCentralityId = 'pbPb_50_70' | 'pbPb_70_90';

export const PBPB_CENTRALITY_IDS: readonly PbPbCentralityId[] = ['pbPb_50_70', 'pbPb_70_90'];

/** Drives the second `<mat-optgroup>` of the collision-system dropdown. */
export interface PbPbCentralityDescriptor {
  id: PbPbCentralityId;
  shortLabelKey: string;
}

export const PBPB_CENTRALITY_DESCRIPTORS: readonly PbPbCentralityDescriptor[] = [
  { id: 'pbPb_50_70', shortLabelKey: 'JPSI.DATASET.PBPB_50_70_SHORT' },
  { id: 'pbPb_70_90', shortLabelKey: 'JPSI.DATASET.PBPB_70_90_SHORT' },
];

/** Everything selectable in the toolbar dropdown: track-based datasets plus published Pb-Pb centralities. */
export type CollisionSystemId = DatasetId | PbPbCentralityId;

export function isPbPbCentralityId(id: CollisionSystemId): id is PbPbCentralityId {
  return id === 'pbPb_50_70' || id === 'pbPb_70_90';
}

export interface PublishedMinvSource {
  note: string;
  figure: number;
  localPdf: string;
  url: string;
  digitizedWith: string;
  renderDpi: number;
  binWidthGeV: number;
  nEvents: number;
  calibration?: string;
}

/** Known values from the paper, shipped alongside the digitized histogram to validate the student's fit. */
export interface PublishedMinvPublished {
  nTotal: number;
  nTotalErr: number;
  nBkg: number;
  nBkgErr: number;
  nJpsi: number;
  nJpsiErr: number;
  sOverB: number;
  significance: number;
  significanceNote: string;
}

export interface PublishedMinvFitHint {
  signalWindow: [number, number];
  peakMean: number;
  peakSigma: number;
  aGaussHint: [number, number, number];
}

/** 1:1 with the pbPb_*.json schema. Unlike/like are counts per bin; residual is always derived at runtime. */
export interface PublishedMinvHistogram {
  schemaVersion: number;
  datasetId: string;
  centrality: string;
  centralityLabel: string;
  source: PublishedMinvSource;
  xmin: number;
  xmax: number;
  bins: number;
  binCenters: number[];
  unlike: number[];
  like: number[];
  unlikeErr: number[];
  likeErr: number[];
  published: PublishedMinvPublished;
  fitHint: PublishedMinvFitHint;
}

export interface PbPbManifestEntry {
  id: PbPbCentralityId;
  file: string;
  centrality: string;
}

export interface PbPbManifest {
  histograms: PbPbManifestEntry[];
}

export type PbPbPanelMode = 'explore' | 'subtracted';

/** One accepted fit, frozen for the results table (and, later, R_AA). */
export interface PbPbYieldRow {
  centralityId: PbPbCentralityId;
  centralityLabel: string;
  fit: FitResult;
  published: PublishedMinvPublished;
  acceptedAt: number;
}

/**
 * Everything `FitService` holds that must survive a switch to the other centrality and be
 * restored verbatim on return, since `FitService` itself is a single shared instance.
 */
export interface FitSnapshot {
  data: LSAData;
  signalFitRange: [number, number];
  backgroundFitRange: [number, number];
  aGaussHint: [number, number, number];
  aPolyHint: [number, number, number];
  result: FitResult | null;
  signalFunction: (x: number) => number;
  backgroundFunction: (x: number) => number;
}

export function emptyFitSnapshot(): FitSnapshot {
  return {
    data: { xmin: 0, xmax: 1, bins: 1, data: [] },
    signalFitRange: [0, 1],
    backgroundFitRange: [0, 1],
    aGaussHint: [0, 0, 0],
    aPolyHint: [0, 0, 0],
    result: null,
    signalFunction: (x: number) => 0,
    backgroundFunction: (x: number) => 0,
  };
}

/** Everything the UI needs for one Pb-Pb centrality, kept alive for the app's lifetime. */
export interface PbPbCentralityState {
  centralityId: PbPbCentralityId;
  histogram: PublishedMinvHistogram | null;
  loading: boolean;
  panelMode: PbPbPanelMode;
  fitSnapshot: FitSnapshot;
  tableRow: PbPbYieldRow | null;
}

export function createPbPbCentralityState(centralityId: PbPbCentralityId): PbPbCentralityState {
  return {
    centralityId,
    histogram: null,
    loading: false,
    panelMode: 'explore',
    fitSnapshot: emptyFitSnapshot(),
    tableRow: null,
  };
}

/**
 * Residual per bin, unclamped. Digitization noise can push a bin slightly negative after
 * U - L; the raw U/L chart never shows negatives (source counts are non-negative), so this is
 * only meaningful once the student has subtracted the background.
 */
export function rawResidual(histogram: PublishedMinvHistogram): Float64Array {
  const residual = new Float64Array(histogram.bins);
  for (let i = 0; i < histogram.bins; i++) {
    residual[i] = histogram.unlike[i] - histogram.like[i];
  }
  return residual;
}

/**
 * Bridge from a binned, published histogram to what the shared `FitService` expects: a flat
 * list of "unbinned" samples that it re-bins itself via d3.bin. Repeating each bin center
 * round(count) times reproduces the same per-bin counts after re-binning, as long as the
 * caller keeps xmin/xmax/bins identical to the source histogram — which this function does by
 * construction, so no separate "bridge test" of consistency is needed beyond that guarantee.
 *
 * Negative bins are clamped to 0 here: FitService has no notion of a negative count. They are
 * still shown, unclamped, on the raw U/L chart before this bridge ever runs.
 */
export function residualToLsaData(histogram: PublishedMinvHistogram): LSAData {
  const data: number[] = [];
  const residual = rawResidual(histogram);

  for (let i = 0; i < histogram.bins; i++) {
    const count = Math.max(0, Math.round(residual[i]));
    for (let k = 0; k < count; k++) {
      data.push(histogram.binCenters[i]);
    }
  }

  return { xmin: histogram.xmin, xmax: histogram.xmax, bins: histogram.bins, data };
}

/** Full histogram span — the starting point for both fit-range sliders, same as LSA. */
export function defaultFitRange(histogram: PublishedMinvHistogram): [number, number] {
  return [histogram.xmin, histogram.xmax];
}
