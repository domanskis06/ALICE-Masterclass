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
