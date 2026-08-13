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
 * Poisson error) from the residual-fit yield extraction, and the number of analysed events.
 * This mirrors `SummaryRow`/`PbPbYieldRow` from the student app, reduced to the few numbers the
 * teacher-side R_AA calculation actually needs. The mass window the signal was extracted from
 * is deliberately *not* part of this payload: the student app locks that window to a fixed
 * width per system (`SIGNAL_WINDOW_WIDTH`/`PBPB_SIGNAL_WINDOW_WIDTH` in the student app's
 * `jpsi.models.ts`/`pbpb-minv.models.ts`) that matches Acc×epsilon's calibration window
 * exactly, so there is nothing left for the teacher side to correct for (see "Mass-window
 * safety net" in `ci/docs/jpsi-analysis-teacher.md`).
 */
export interface JpsiRawSignal {
  system: CollisionSystemId;
  signal: number;
  signalError: number;
  nEvents: number;
}

/**
 * A raw signal enriched with everything derived from it. `JpsiRaaService.computeResults`
 * produces one of these per submitted signal, including pp/p-Pb - but `JpsiAnalysisComponent`
 * only ever passes the Pb-Pb rows on to the teacher Results table (see "Why a fixed pp
 * reference?" in `ci/docs/jpsi-analysis-teacher.md`).
 */
export interface JpsiResultRow {
  system: CollisionSystemId;
  systemLabel: string;
  nParticipants: number | null;
  nColl: number | null;
  nEvents: number;
  signal: number;
  signalError: number;
  /** Acc x epsilon for this system/centrality. */
  efficiency: number;
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
