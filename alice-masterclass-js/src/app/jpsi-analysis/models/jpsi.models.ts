/** Electron mass in GeV/c^2. Every track the student selects is treated as an electron. */
export const M_ELECTRON = 0.000511;

/** Shared binning of the three mass histograms, in GeV/c^2. */
export const MASS_XMIN = 0;
export const MASS_XMAX = 6;
export const MASS_BINS = 120;
export const MASS_BIN_WIDTH = (MASS_XMAX - MASS_XMIN) / MASS_BINS;

/** Default signal window and the range the student may drag it within. */
export const DEFAULT_MASS_WINDOW: [number, number] = [2.9, 3.3];
export const MASS_WINDOW_LIMITS: [number, number] = [1.5, 5.0];

/** Axis ranges of the dE/dx vs p heatmap. The p axis is logarithmic. */
export const PID_P_MIN = 0.1;
export const PID_P_MAX = 10;
export const PID_DEDX_MIN = 20;
export const PID_DEDX_MAX = 140;
export const PID_P_BINS = 120;
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

export interface SeriesVisibility {
  unlike: boolean;
  posPos: boolean;
  negNeg: boolean;
}

export interface SignalResult {
  windowMin: number;
  windowMax: number;
  /** U: counts of opposite-charge pairs inside the window. */
  unlikeSum: number;
  /** L: counts of same-charge pairs inside the window; this is also the background B. */
  likeSum: number;
  /** max(0, U - L). */
  signal: number;
  /** sqrt(U + L), Poisson error of the difference. */
  signalError: number;
  /** null when the background is zero and the ratio is undefined. */
  signalToBackground: number | null;
  significance: number;
}

export interface SummaryRow extends SignalResult {
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
  cut: PidCut;
  mass: MassHistograms;
  panelMode: MassPanelMode;
  visibility: SeriesVisibility;
  /** Replaces the two same-charge series with their sum while exploring. */
  showBackgroundSum: boolean;
  massWindow: [number, number];
  liveResult: SignalResult | null;
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
    mass: createMassHistograms(),
    panelMode: 'explore',
    visibility: { unlike: true, posPos: true, negNeg: true },
    showBackgroundSum: false,
    massWindow: [...DEFAULT_MASS_WINDOW] as [number, number],
    liveResult: null,
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
