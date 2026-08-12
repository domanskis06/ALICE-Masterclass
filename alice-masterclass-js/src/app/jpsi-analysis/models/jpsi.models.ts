import { ResidualFitResult } from '../services/jpsi-residual-fit.service';

/** Electron mass in GeV/c^2. Every track the student selects is treated as an electron. */
export const M_ELECTRON = 0.000511;

/** Shared binning of the three mass histograms, in GeV/c^2. */
export const MASS_XMIN = 1;
export const MASS_XMAX = 5;
/** Keep 50 MeV bins: (5 − 1) GeV / 0.05 GeV = 80. */
export const MASS_BINS = 80;
export const MASS_BIN_WIDTH = (MASS_XMAX - MASS_XMIN) / MASS_BINS;

/** Signal-window drag limits; match the histogram axis and start at both ends. */
export const MASS_WINDOW_LIMITS: [number, number] = [MASS_XMIN, MASS_XMAX];
export const DEFAULT_MASS_WINDOW: [number, number] = [
  MASS_WINDOW_LIMITS[0],
  MASS_WINDOW_LIMITS[1],
];

/** Axis ranges of the dE/dx vs p heatmap. The p axis is logarithmic. */
export const PID_P_MIN = 0.1;
export const PID_P_MAX = 10;
/** Log-space endpoints of the momentum axis — slider units match pixel motion. */
export const PID_LOG_P_MIN = Math.log(PID_P_MIN);
export const PID_LOG_P_MAX = Math.log(PID_P_MAX);
export const PID_DEDX_MIN = 20;
export const PID_DEDX_MAX = 140;
export const PID_P_BINS = 120;

/** SVG/canvas margins of the PID heatmap — shared so the momentum slider can align. */
export const PID_HEATMAP_MARGIN = {
  top: 8,
  /** Colour-bar gap + bar + count-axis. */
  right: 12 + 14 + 34,
  bottom: 42,
  left: 52,
} as const;

/** Height / width targets used while the panel is still under the viewport cap. */
export const PID_CHART_ASPECT = 0.72;
export const MASS_CHART_ASPECT = 0.55;

/**
 * Chart host height from panel width. Preserves the aspect ratio on wide layouts and
 * only stops growing when the plot would dominate the viewport (large monitors).
 */
export function jpsiResponsiveChartHeight(
  widthPx: number,
  heightOverWidth: number,
  minHeightPx: number,
): number {
  const fromAspect = widthPx * heightOverWidth;
  const viewportCap =
    typeof window !== 'undefined' ? Math.max(420, window.innerHeight * 0.55) : 420;
  const absoluteMax = 780;
  return Math.round(Math.max(minHeightPx, Math.min(fromAspect, viewportCap, absoluteMax)));
}
/**
 * One bin per unit of dE/dx. The VSD stores dE/dx as whole numbers, so any bin width
 * other than an integer makes some bins swallow two values and their neighbours one,
 * which paints periodic bright rows across the whole plot.
 */
export const PID_DEDX_BINS = PID_DEDX_MAX - PID_DEDX_MIN;

/**
 * Above this many candidate pairs the histograms are not built at all. The widest
 * possible selection on p-Pb sits near three million pairs, so this only guards against
 * a future dataset that is far larger than the ones shipped today.
 */
export const MAX_PAIRS = 5_000_000;

/** Events pulled per network request; must match the converter. */
export const BATCH_SIZE = 100;

export type DatasetId = 'pp' | 'pPb';

export interface PidCut {
  pMin: number;
  pMax: number;
  dedxMin: number;
  dedxMax: number;
}

export const DEFAULT_PID_CUT: PidCut = {
  pMin: PID_P_MIN,
  pMax: PID_P_MAX,
  dedxMin: PID_DEDX_MIN,
  dedxMax: PID_DEDX_MAX,
};

/**
 * Tracks of a single event. Pairs may only be formed inside one of these, which is why
 * events are never flattened into one list.
 */
export interface CompactEvent {
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  p: Float32Array;
  dedx: Float32Array;
  sign: Int8Array;
}

/** Three mass histograms sharing the binning constants above. */
export interface MassHistograms {
  /** e+e-: signal plus random combinations. */
  unlike: Float64Array;
  /** e+e+: background only. */
  posPos: Float64Array;
  /** e-e-: background only. */
  negNeg: Float64Array;
}

export function createMassHistograms(): MassHistograms {
  return {
    unlike: new Float64Array(MASS_BINS),
    posPos: new Float64Array(MASS_BINS),
    negNeg: new Float64Array(MASS_BINS),
  };
}

export type MassPanelMode = 'explore' | 'subtracted';

/** Keyed by series key ('unlike', 'posPos', 'negNeg', ...) rather than fixed fields, so the
 * same shape works for track datasets (three raw series) and Pb-Pb (two: unlike/like). */
export type SeriesVisibility = Record<string, boolean>;

export interface SummaryRow extends ResidualFitResult {
  datasetId: DatasetId;
  nEvents: number;
}

export interface DatasetAnalysisState {
  datasetId: DatasetId;
  processedCount: number;
  nextEventIndex: number;
  processedEvents: CompactEvent[];
  /** Flattened 2D grid, PID_P_BINS columns by PID_DEDX_BINS rows. */
  pidBins: Uint32Array;
  /** Highest single-cell count, kept for the heatmap colour scale. */
  pidMax: number;
  /** Draft cut mirrored by the PID sliders (does not rebuild mass until accepted). */
  cut: PidCut;
  /**
   * Cut last applied with Accept selected range. Null until the student accepts once;
   * mass histograms stay empty until then.
   */
  appliedCut: PidCut | null;
  mass: MassHistograms;
  panelMode: MassPanelMode;
  visibility: SeriesVisibility;
  /** Replaces the two same-charge series with their sum while exploring. */
  showBackgroundSum: boolean;
  /** Counting window: everything inside it, after the Pol1 background is subtracted, is the yield. */
  massWindow: [number, number];
  /** Sidebands used to fit the Pol1 residual background (excludes massWindow). */
  backgroundFitRange: [number, number];
  /** Only set once the student presses Fit; null again after any range/data change. */
  fitResult: ResidualFitResult | null;
  tableRow: SummaryRow | null;
  tooWideSelection: boolean;
}

export interface DatasetDescriptor {
  id: DatasetId;
  labelKey: string;
  nEvents: number;
  batches: number;
}

export interface JpsiManifest {
  batchSize: number;
  datasets: DatasetDescriptor[];
}

/** Raw columnar batch as emitted by data/jpsi/convert_events.C. */
export interface JpsiBatch {
  datasetId: DatasetId;
  firstEventIndex: number;
  eventCount: number;
  trackOffsets: number[];
  px: number[];
  py: number[];
  pz: number[];
  p: number[];
  dedx: number[];
  sign: number[];
}

export function createDatasetState(datasetId: DatasetId): DatasetAnalysisState {
  return {
    datasetId,
    processedCount: 0,
    nextEventIndex: 0,
    processedEvents: [],
    pidBins: new Uint32Array(PID_P_BINS * PID_DEDX_BINS),
    pidMax: 0,
    cut: { ...DEFAULT_PID_CUT },
    appliedCut: null,
    mass: createMassHistograms(),
    panelMode: 'explore',
    visibility: { unlike: true, posPos: true, negNeg: true },
    showBackgroundSum: false,
    massWindow: [...DEFAULT_MASS_WINDOW] as [number, number],
    backgroundFitRange: [...DEFAULT_MASS_WINDOW] as [number, number],
    fitResult: null,
    tableRow: null,
    tooWideSelection: false,
  };
}

/** Snaps a mass value to the nearest bin edge so window sums cover whole bins. */
export function snapToBinEdge(value: number): number {
  const index = Math.round((value - MASS_XMIN) / MASS_BIN_WIDTH);
  const clamped = Math.min(MASS_BINS, Math.max(0, index));
  return MASS_XMIN + clamped * MASS_BIN_WIDTH;
}
