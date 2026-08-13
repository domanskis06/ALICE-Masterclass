/** Pipeline step kinds for Blockly Spectrum Analysis. */
export type RaaPipelineStepKind =
  | 'load_pbpb'
  | 'filter_centrality'
  | 'histogram_pt'
  | 'norm_events'
  | 'norm_ncoll'
  | 'divide_pp'
  | 'compute_raa'
  | 'compute_rcp'
  | 'plot';

export interface RaaPipelineStep {
  kind: RaaPipelineStepKind;
  /** Centrality key e.g. "0-5", "70-80" — used by filter_centrality. */
  centrality?: string;
}

export interface RaaPlotSeries {
  id: string;
  label: string;
  x: number[];
  y: number[];
  yErr?: number[];
}

export interface RaaAnalysisResult {
  warnings: string[];
  /** True when the chain is complete enough for a proper R_AA. */
  valid: boolean;
  ptSpectra: RaaPlotSeries[];
  raa: RaaPlotSeries[];
  rcp: RaaPlotSeries[];
  /** Flattened extract values keyed by `${centrality}|${binIndex}`. */
  extract: Record<string, { value: number; error: number }>;
}

export type RaaCollisionKind = 'pp' | 'peripheral' | 'semi-central' | 'central';

/** Exercise-1 event role by position — mirrors desktop `ECollisionSystem` / `NewEvent`. */
export type RaaEventRole =
  | 'pp7TeV'
  | 'pp276TeV'
  | 'pbPbPeripheral'
  | 'pbPbSemiCentral'
  | 'pbPbCentral';

export interface RaaShowcaseEntry {
  id: string;
  file: string;
  collision: RaaCollisionKind;
  labelKey: string;
  nColl: number;
  centrality?: string;
}

export interface RaaMetadata {
  bins: number[];
  nColl: Record<string, number>;
  centralityBins: string[];
  showcase: RaaShowcaseEntry[];
  /** Real event numbers per dataset in exercise order (idx 0 = 7 TeV demo, 31–33 = PbPb). */
  datasets: Record<string, number[]>;
  /** Collision system for each of the 34 exercise slots — same mapping as desktop `NewEvent`. */
  eventRoles: RaaEventRole[];
  /** Part-1 N_coll correction factors from desktop `EventDisplay.h`. */
  nCollPart1?: Record<string, number>;
}

export interface RaaPtSpectraStub {
  bins: number[];
  spectra: Record<string, { counts: number[]; nEvents: number }>;
}

export interface RaaPpReferenceStub {
  bins: number[];
  values: number[];
}

export interface RaaEventSummary {
  multiplicity: number;
  highPtCount: number;
  meanPt: number;
}

export interface RaaQuickRaaEntry {
  collision: RaaCollisionKind;
  centrality?: string;
  yieldAll: number;
  yieldHighPt: number;
  nColl: number;
  raaAll: number | null;
  raaHighPt: number | null;
}
