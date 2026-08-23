import { RaaStep, RaaStepKind } from '../../shared/models/raa/spectrum';
import { HUE_DATA, HUE_FILL, HUE_NORM, HUE_OUTPUT } from '../blockly-workspace/raa-blockly';

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
  /**
   * `RaaProblem.key`s that, if the last Run raised any of them, block this
   * gate even though `kinds`/`requireRun` are otherwise satisfied — e.g. the
   * blocks are all there, but in an order that makes the result wrong.
   */
  forbidProblemKeys?: string[];
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
    forbidProblemKeys: ['MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS'],
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

export interface NmfSaMissionStep {
  labelKey: string;
  /** Same kind/run check the tutorial gates use — a checkmark here means the
   *  tutorial would consider this exact step satisfied too. */
  gate: NmfSaGate;
}

export interface NmfSaMissionGroup {
  name: string;
  accent: string;
  steps: NmfSaMissionStep[];
}

const MISSION_PREFIX = 'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.';

/**
 * The "Your code must:" plan — shown in full before the first plot, then as a
 * compact progress strip beside the block picker. Single source of truth for
 * both views, and for the per-step checkmark (`NmfSaTutorialService.isMissionStepDone`).
 */
export const MISSION_GROUPS: NmfSaMissionGroup[] = [
  {
    name: 'Events',
    accent: HUE_DATA,
    steps: [
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_1`,
        gate: { kinds: ['load_events', 'if_centrality'], requireRun: true },
      },
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_2`,
        gate: { kinds: ['count_events'], requireRun: true },
      },
      {
        // Matches the tutorial's own "Count what is inside them" gate
        // (NMF_SA_STEP_HIST_MULTIPLICITY) — the mission plan used to skip
        // this step entirely even though the guided tour requires it.
        labelKey: `${MISSION_PREFIX}MISSION_STEP_3`,
        gate: { kinds: ['fill_multiplicity'], requireRun: true },
      },
      {
        // Matches NMF_SA_STEP_MULT_VS_CENTRALITY ("See the whole sample at once").
        labelKey: `${MISSION_PREFIX}MISSION_STEP_4`,
        gate: {
          kinds: ['plot_mult_vs_centrality'],
          requireRun: true,
          forbidProblemKeys: ['MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS'],
        },
      },
    ],
  },
  {
    name: 'Tracks',
    accent: HUE_FILL,
    steps: [
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_5`,
        gate: { kinds: ['load_tracks', 'select_centrality'], requireRun: true },
      },
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_6`,
        gate: { kinds: ['create_hist', 'fill_hist'], requireRun: true },
      },
    ],
  },
  {
    name: 'Normalise',
    accent: HUE_NORM,
    steps: [
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_7`,
        gate: { kinds: ['lookup_ncoll'], requireRun: true },
      },
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_8`,
        gate: {
          kinds: ['divide_bin_width', 'divide_events', 'divide_ncoll'],
          requireRun: true,
        },
      },
    ],
  },
  {
    name: 'References & plot',
    accent: HUE_OUTPUT,
    steps: [
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_9`,
        gate: { kinds: ['load_pp'], requireRun: true },
      },
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_10`,
        gate: { kinds: ['divide_reference'], requireRun: true },
      },
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_11`,
        gate: { kinds: ['draw_line_at_one', 'plot'], requireRun: true },
      },
      {
        labelKey: `${MISSION_PREFIX}MISSION_STEP_12`,
        gate: { kinds: ['read_value'], requireRun: true },
      },
    ],
  },
];

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
