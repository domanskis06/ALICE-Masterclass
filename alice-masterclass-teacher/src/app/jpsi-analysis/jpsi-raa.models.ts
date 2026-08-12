/** The eight Pb-Pb centrality classes used throughout the student J/psi exercise. */
export type PbPbCentralityId =
  | 'pbPb_0_5'
  | 'pbPb_5_10'
  | 'pbPb_10_20'
  | 'pbPb_20_30'
  | 'pbPb_30_40'
  | 'pbPb_40_50'
  | 'pbPb_50_70'
  | 'pbPb_70_90';

/** Ascending centrality order, i.e. the order they should appear in tables and legends. */
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

/** Every collision system a student can submit a J/psi signal for. */
export type CollisionSystemId = 'pp' | 'pPb' | PbPbCentralityId;

export function isPbPbCentrality(system: CollisionSystemId): system is PbPbCentralityId {
  return system.startsWith('pbPb_');
}

/** Human-readable label for a collision system, used in the table and the plot tooltip. */
export function collisionSystemLabel(system: CollisionSystemId): string {
  switch (system) {
    case 'pp':
      return 'pp';
    case 'pPb':
      return 'p-Pb';
    case 'pbPb_0_5':
      return 'Pb-Pb 0-5%';
    case 'pbPb_5_10':
      return 'Pb-Pb 5-10%';
    case 'pbPb_10_20':
      return 'Pb-Pb 10-20%';
    case 'pbPb_20_30':
      return 'Pb-Pb 20-30%';
    case 'pbPb_30_40':
      return 'Pb-Pb 30-40%';
    case 'pbPb_40_50':
      return 'Pb-Pb 40-50%';
    case 'pbPb_50_70':
      return 'Pb-Pb 50-70%';
    case 'pbPb_70_90':
      return 'Pb-Pb 70-90%';
  }
}

/**
 * What a student ultimately submits per collision system: the fitted J/psi signal (and its
 * Poisson error) from the residual-fit yield extraction, the mass window used to extract it,
 * and the number of analysed events. This mirrors `SummaryRow`/`PbPbYieldRow` from the student
 * app, reduced to the few numbers the teacher-side R_AA calculation actually needs.
 */
export interface JpsiRawSignal {
  system: CollisionSystemId;
  signal: number;
  signalError: number;
  nEvents: number;
  /** [low, high] mass window (GeV/c^2) the signal was extracted from - see `windowEfficiencyFactor`. */
  massWindow: [number, number];
}

/** One row of the teacher Results table: a raw signal enriched with everything derived from it. */
export interface JpsiResultRow {
  system: CollisionSystemId;
  systemLabel: string;
  nParticipants: number | null;
  nColl: number | null;
  nEvents: number;
  signal: number;
  signalError: number;
  /** Base Acc x epsilon for this system/centrality, BEFORE the mass-window correction. */
  efficiency: number;
  /** Mass-window efficiency factor actually applied on top of `efficiency` (1 = reference window). */
  windowFactor: number;
  correctedYield: number;
  raa: number | null;
  raaError: number | null;
}

/** One point of the central R_AA vs. Npart plot - only Pb-Pb centrality classes have an R_AA. */
export interface JpsiRaaPlotEntry {
  centralityId: PbPbCentralityId;
  centralityLabel: string;
  nParticipants: number;
  raa: number;
  raaError: number;
}
