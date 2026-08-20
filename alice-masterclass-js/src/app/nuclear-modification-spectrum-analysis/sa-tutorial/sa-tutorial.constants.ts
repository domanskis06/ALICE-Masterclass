import { RaaStep, RaaStepKind } from '../../shared/models/raa/spectrum';

/**
 * Step indices of the main Spectrum Analysis tour. Kept next to the gate table
 * so that inserting a step cannot silently unlock a gated one.
 */
export const NMF_SA_STEP_LAYOUT = 0;
export const NMF_SA_STEP_RUN_BAR = 1;
export const NMF_SA_STEP_LOAD_EVENTS = 2;
export const NMF_SA_STEP_HIST_MULTIPLICITY = 3;
export const NMF_SA_STEP_MULT_VS_CENTRALITY = 4;
export const NMF_SA_STEP_HIST_PT = 5;
export const NMF_SA_STEP_LOOK_AT_KINKS = 6;
export const NMF_SA_STEP_BIN_WIDTH = 7;
export const NMF_SA_STEP_EVENTS_NORM = 8;
export const NMF_SA_STEP_NCOLL = 9;
export const NMF_SA_STEP_RAA = 10;
/** The collected-results sheet. */
export const NMF_SA_STEP_RESULTS = 11;
export const NMF_SA_STEP_COLLECT = 12;
export const NMF_SA_STEP_DONE = 13;

/** Centrality class the tour builds its example with. */
export const NMF_SA_TOUR_CENTRALITY = '0-5';

/** Centrality classes a group is asked to collect, per the Münster README. */
export const NMF_SA_CLASSES_TO_COLLECT = 5;

export const NMF_SA_SELECTOR_PAGE = '#nmf-sa-tour-page';
export const NMF_SA_SELECTOR_WORKSPACE = '#nmf-sa-tour-workspace';
export const NMF_SA_SELECTOR_RUN = '#nmf-sa-tour-run';
export const NMF_SA_SELECTOR_PLOTS = '#nmf-sa-tour-plots';
export const NMF_SA_SELECTOR_RESULTS = '#nmf-sa-tour-results';

export type NmfSaToolboxCategory = 'events' | 'tracks' | 'normalise' | 'plot';

/** What a gated step waits for before the tour may advance. */
export interface NmfSaGate {
  /** Every one of these must be in the recipe (nested bodies count). */
  kinds: RaaStepKind[];
  /** Run has to be pressed after the blocks are in place. */
  requireRun?: boolean;
  /** Distinct centrality classes that must be on the R_AA plot. */
  classes?: number;
}

export const NMF_SA_GATES: Record<number, NmfSaGate> = {
  [NMF_SA_STEP_LOAD_EVENTS]: {
    kinds: ['load_events', 'if_centrality', 'count_events'],
  },
  [NMF_SA_STEP_HIST_MULTIPLICITY]: {
    kinds: ['fill_multiplicity'],
    requireRun: true,
  },
  [NMF_SA_STEP_MULT_VS_CENTRALITY]: {
    kinds: ['plot_mult_vs_centrality'],
    requireRun: true,
  },
  [NMF_SA_STEP_HIST_PT]: {
    // 'plot' too: nothing lands on the p_T tile until a Plot block draws it, and
    // the very next tour step points straight at that tile.
    kinds: ['load_tracks', 'select_centrality', 'create_hist', 'fill_hist', 'plot'],
    requireRun: true,
  },
  [NMF_SA_STEP_BIN_WIDTH]: { kinds: ['divide_bin_width'], requireRun: true },
  [NMF_SA_STEP_EVENTS_NORM]: { kinds: ['divide_events'], requireRun: true },
  [NMF_SA_STEP_NCOLL]: {
    kinds: ['lookup_ncoll', 'divide_ncoll'],
    requireRun: true,
  },
  [NMF_SA_STEP_RAA]: {
    kinds: ['load_pp', 'divide_reference', 'draw_line_at_one', 'plot'],
    requireRun: true,
  },
  [NMF_SA_STEP_COLLECT]: { kinds: [], classes: NMF_SA_CLASSES_TO_COLLECT },
};

/** Flatten a recipe including for-each bodies, for gate checks. */
export function flattenRecipeKinds(recipe: RaaStep[]): RaaStepKind[] {
  const kinds: RaaStepKind[] = [];
  for (const step of recipe) {
    kinds.push(step.kind);
    if (step.body?.length) {
      kinds.push(...flattenRecipeKinds(step.body));
    }
  }
  return kinds;
}
