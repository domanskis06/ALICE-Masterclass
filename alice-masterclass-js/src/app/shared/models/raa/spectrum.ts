/**
 * Spectrum Analysis (exercise 2) data model.
 *
 * The student assembles the whole normalisation chain, so the engine has to carry
 * enough state to tell them what is physically wrong rather than which block is
 * missing. A spectrum therefore remembers its unit and the operations already
 * applied to it, not just its numbers.
 */

/** Where a spectrum stands: each division flips one flag, in any order. */
export interface RaaUnit {
  /** Divided by bin width — `ptHist->Scale(..., "WIDTH")` in the desktop version. */
  perGeV: boolean;
  /** Divided by the number of events in the class. */
  perEvent: boolean;
  /** Divided by the number of collisions. */
  perNColl: boolean;
  /** Divided by another spectrum, so the result is a dimensionless ratio. */
  ratio: boolean;
}

export const RAA_UNIT_COUNTS: RaaUnit = {
  perGeV: false,
  perEvent: false,
  perNColl: false,
  ratio: false,
};

/** Operations a spectrum can carry, in the order the student applied them. */
export type RaaOp =
  | 'histogram'
  | 'divide_bin_width'
  | 'divide_events'
  | 'divide_ncoll'
  | 'divide_pp'
  | 'divide_peripheral';

export type RaaBinningId = 'alice' | 'equal-0.5' | 'equal-1' | 'coarse';

export interface RaaBinning {
  id: RaaBinningId;
  /** Bin edges in GeV/c. */
  edges: number[];
  /** True when every bin has the same width — then a missing `/bin width` only
   *  rescales the spectrum instead of distorting its shape. */
  uniform: boolean;
}

/** A p_T spectrum at some point along the normalisation chain. */
export interface RaaSpectrum {
  /** Bin edges in GeV/c; length is `values.length + 1`. */
  edges: number[];
  /** Bin content in the current unit. */
  values: number[];
  /** Fractional uncertainty per bin — the one quantity every division preserves. */
  relErr: number[];
  /** Entries per bin before any scaling, so sqrt(N) stays meaningful. */
  counts: number[];
  /** Bins that never received an entry: not drawn, reported instead. */
  empty: boolean[];
  centrality: string;
  nEvents: number;
  nColl: number;
  binning: RaaBinningId;
  unit: RaaUnit;
  ops: RaaOp[];
}

/** Tracks of one centrality class, as the lossless 0.01 GeV/c tally. */
export interface RaaTrackSample {
  centrality: string;
  ptMin: number;
  ptStep: number;
  /** Counts per fine bin. */
  counts: number[];
  nEvents: number;
  nColl: number;
  /** Tracks above the last fine edge; they belong to no bin of any binning. */
  overflow: number;
}

/** Events of one centrality class, straight from `events.json`. */
export interface RaaEventSample {
  centrality: string;
  multiplicities: number[];
  nEvents: number;
}

/* —— assets —— */

export interface RaaTracksFineAsset {
  ptMin: number;
  ptStep: number;
  nFine: number;
  aliceBins: number[];
  classes: Record<
    string,
    { counts: number[]; nEvents: number; nColl: number; overflow: number }
  >;
}

export interface RaaEventsAsset {
  mult: number[];
  cent: number[];
}

export interface RaaPpAsset {
  bins: number[];
  values: number[];
}

export interface RaaTracksDemoAsset {
  classes: Record<string, number[]>;
}

/* —— recipe —— */

export type RaaStepKind =
  | 'load_events'
  | 'if_centrality'
  | 'count_events'
  | 'fill_multiplicity'
  | 'plot_mult_vs_centrality'
  | 'load_tracks'
  | 'select_centrality'
  | 'cut_pt'
  | 'create_hist'
  | 'fill_hist'
  | 'lookup_ncoll'
  | 'divide_bin_width'
  | 'divide_events'
  | 'divide_ncoll'
  | 'clone_spectrum'
  | 'load_pp'
  | 'load_peripheral'
  | 'divide_reference'
  | 'for_each_centrality'
  | 'plot'
  | 'draw_line_at_one'
  | 'read_value';

export type RaaPlotTarget = 'pt' | 'raa' | 'rcp';

export type RaaReferenceKind = 'pp' | 'peripheral';

/** Presets for the for-each block. */
export type RaaCentralityPreset = 'three' | 'five';

export interface RaaStep {
  kind: RaaStepKind;
  /** Centrality class for if/select/lookup. */
  centrality?: string;
  /** `create_hist`: which binning to allocate. */
  binning?: RaaBinningId;
  /** `cut_pt`: keep tracks at or above this p_T (GeV/c). */
  ptCut?: number;
  /** `lookup_ncoll`: class whose number of collisions is read. */
  nCollCentrality?: string;
  /** `divide_reference`: which loaded reference to divide by. */
  reference?: RaaReferenceKind;
  /** `for_each_centrality`: which set of classes to iterate. */
  centralityPreset?: RaaCentralityPreset;
  /** `for_each_centrality`: body run once per class. */
  body?: RaaStep[];
  /** `plot`: what to draw. */
  plotAs?: RaaPlotTarget;
  /** `read_value`: momentum to read off (GeV/c). */
  readAt?: number;
}

/* —— results —— */

export interface RaaPoint {
  /** Bin centre in GeV/c. */
  x: number;
  xLow: number;
  xHigh: number;
  y: number;
  /** Absolute uncertainty on `y`. */
  yErr: number;
}

export interface RaaSeries {
  id: string;
  label: string;
  centrality?: string;
  color: string;
  points: RaaPoint[];
  /** Unit the spectrum ended up in, shown on the axis so the chain stays visible. */
  unit?: string;
  /** When set, the plot card draws a horizontal reference at this y. */
  referenceLine?: number | null;
  /** Overrides the card's drawing mode — the pp reference is a step outline
   *  even on a plot whose measured points are drawn as markers. */
  render?: 'points' | 'steps';
  /** Dashed outline, used to mark a series that is a reference rather than a
   *  measurement of the student's own. */
  dashed?: boolean;
}

export interface RaaHistogram {
  edges: number[];
  counts: number[];
  label: string;
  color: string;
  centrality: string;
  /** Total entries — for the multiplicity histogram this is N_evt. */
  entries: number;
}

export interface RaaHeatmapCell {
  /** Column index along multiplicity, row index along centrality. */
  ix: number;
  iy: number;
  count: number;
}

export interface RaaHeatmap {
  xEdges: number[];
  yEdges: number[];
  cells: RaaHeatmapCell[];
  maxCount: number;
  /** Centrality range to mark, when the recipe selected one. */
  highlight?: { from: number; to: number; centrality: string };
}

/** A physics-level complaint about the recipe, not a missing-block list. */
export interface RaaProblem {
  /** i18n key under NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.PROBLEM. */
  key: string;
  severity: 'error' | 'warning';
  params?: Record<string, string | number>;
}

export interface RaaReadout {
  centrality: string;
  target: RaaPlotTarget;
  points: RaaPoint[];
}

/** One number the recipe explicitly read off, via the `Read value at` block. */
export interface RaaReported {
  centrality: string;
  target: RaaPlotTarget;
  /** Momentum asked for, in GeV/c — not the bin centre. */
  pt: number;
  value: number;
  error: number;
}

export interface RaaRunResult {
  /** True when the recipe produced a dimensionless ratio with nothing missing. */
  ok: boolean;
  problems: RaaProblem[];
  ptSpectra: RaaSeries[];
  raa: RaaSeries[];
  rcp: RaaSeries[];
  multiplicity: RaaHistogram | null;
  multVsCentrality: RaaHeatmap | null;
  readouts: RaaReadout[];
  /** Values the `Read value at` blocks pulled out, in the order they ran. */
  reported: RaaReported[];
  /**
   * The published pp spectrum, present once the recipe loaded it. Drawn on the
   * p_T card so the division the next block performs is visible, the way the
   * desktop app puts Pb–Pb and pp on one canvas.
   */
  ppReference: RaaSeries | null;
  /** Event count the event part measured, so the tutorial can point back at it. */
  nEvents: number | null;
  centrality: string | null;
}
