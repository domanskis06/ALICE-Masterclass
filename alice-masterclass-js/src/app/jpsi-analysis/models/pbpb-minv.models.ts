import { ResidualFitResult } from '../services/jpsi-residual-fit.service';
import { DatasetId } from './jpsi.models';

/** All eight Pb-Pb centrality classes digitized from Figs. 14–15 — each is its own "collision system". */
export type PbPbCentralityId =
  | 'pbPb_0_5'
  | 'pbPb_5_10'
  | 'pbPb_10_20'
  | 'pbPb_20_30'
  | 'pbPb_30_40'
  | 'pbPb_40_50'
  | 'pbPb_50_70'
  | 'pbPb_70_90';

/** Ascending centrality order, i.e. the order they appear in the collision-system dropdown. */
export const PBPB_CENTRALITY_IDS: readonly PbPbCentralityId[] = [
  'pbPb_0_5',
  'pbPb_5_10',
  'pbPb_10_20',
  'pbPb_20_30',
  'pbPb_30_40',
  'pbPb_40_50',
  'pbPb_50_70',
  'pbPb_70_90',
];

/** Drives the Pb-Pb portion of the flat collision-system dropdown. */
export interface PbPbCentralityDescriptor {
  id: PbPbCentralityId;
  shortLabelKey: string;
}

export const PBPB_CENTRALITY_DESCRIPTORS: readonly PbPbCentralityDescriptor[] = PBPB_CENTRALITY_IDS.map(
  (id) => ({ id, shortLabelKey: `JPSI.DATASET.${id.toUpperCase()}_SHORT` })
);

/** Everything selectable in the toolbar dropdown: track-based datasets plus published Pb-Pb centralities. */
export type CollisionSystemId = DatasetId | PbPbCentralityId;

const PBPB_CENTRALITY_ID_SET: ReadonlySet<string> = new Set(PBPB_CENTRALITY_IDS);

export function isPbPbCentralityId(id: CollisionSystemId): id is PbPbCentralityId {
  return PBPB_CENTRALITY_ID_SET.has(id);
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
  fit: ResidualFitResult;
  published: PublishedMinvPublished;
  acceptedAt: number;
}

/**
 * Everything the shared mass panel needs for one centrality, kept alive so switching away and
 * back restores it verbatim. Much simpler than the old FitService-backed snapshot (LSAData +
 * Gauss/polynomial hints) now that the fit itself is a stateless, closed-form Pol1 call —
 * there is no optimizer seed left to remember.
 */
export interface PbPbFitSnapshot {
  massWindow: [number, number];
  backgroundFitRange: [number, number];
  fitResult: ResidualFitResult | null;
}

export function emptyFitSnapshot(range: [number, number] = [0, 1]): PbPbFitSnapshot {
  return {
    massWindow: [...range],
    backgroundFitRange: [...range],
    fitResult: null,
  };
}

/** Everything the UI needs for one Pb-Pb centrality, kept alive for the app's lifetime. */
export interface PbPbCentralityState {
  centralityId: PbPbCentralityId;
  histogram: PublishedMinvHistogram | null;
  loading: boolean;
  panelMode: PbPbPanelMode;
  fitSnapshot: PbPbFitSnapshot;
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
 * only meaningful once the student has subtracted the background. This is what the Pol1 fit
 * reads — clamping it before fitting would systematically bias the background upward.
 */
export function rawResidual(histogram: PublishedMinvHistogram): Float64Array {
  const residual = new Float64Array(histogram.bins);
  for (let i = 0; i < histogram.bins; i++) {
    residual[i] = histogram.unlike[i] - histogram.like[i];
  }
  return residual;
}

/** Same as `rawResidual`, clamped to zero — what the mass panel draws as bars. */
export function clampedResidual(histogram: PublishedMinvHistogram): Float64Array {
  const residual = rawResidual(histogram);
  for (let i = 0; i < residual.length; i++) {
    residual[i] = Math.max(0, residual[i]);
  }
  return residual;
}
