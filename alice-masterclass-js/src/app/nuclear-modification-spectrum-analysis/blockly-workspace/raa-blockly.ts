import * as Blockly from 'blockly';

import {
  RaaBinningId,
  RaaCentralityPreset,
  RaaPlotTarget,
  RaaReferenceKind,
  RaaStep,
  RaaStepKind,
} from '../../shared/models/raa/spectrum';

/**
 * Blocks for the Spectrum Analysis recipe.
 *
 * Labels are English literals, like the exercise-1 filter builder: they are the
 * names of physics operations, not UI copy.
 *
 * The workspace starts empty on purpose. The student assembles the normalisation
 * chain themselves — load, select, fill, look up constants, divide, plot.
 */

export const RAA_CENTRALITY_OPTIONS: [string, string][] = [
  ['0–5%', '0-5'],
  ['5–10%', '5-10'],
  ['10–20%', '10-20'],
  ['20–30%', '20-30'],
  ['30–40%', '30-40'],
  ['40–50%', '40-50'],
  ['50–60%', '50-60'],
  ['60–70%', '60-70'],
  ['70–80%', '70-80'],
  ['80–90%', '80-90'],
];


export const RAA_PLOT_OPTIONS: [string, RaaPlotTarget][] = [
  ['pT spectrum', 'pt'],
  ['RAA', 'raa'],
  ['RCP', 'rcp'],
];

export const RAA_REFERENCE_OPTIONS: [string, RaaReferenceKind][] = [
  ['pp', 'pp'],
  ['peripheral', 'peripheral'],
];

export const RAA_PRESET_OPTIONS: [string, RaaCentralityPreset][] = [
  ['0–5 · 30–40 · 70–80', 'three'],
  ['0–5 · 10–20 · 30–40 · 50–60 · 70–80', 'five'],
];

export const RAA_READ_OPTIONS: [string, string][] = [
  ['5.5 GeV/c', '5.5'],
  ['10 GeV/c', '10'],
];

/**
 * Category colours: data, histogram filling, normalisation, output.
 *
 * Explicit hex rather than Blockly hues. Blockly derives a block colour from a
 * hue at a fixed saturation/value that comes out pastel — on the navy workspace
 * the blocks washed out and the white label text sat near the contrast floor.
 * These four are picked so white text clears 4.5:1 on every block, and so the
 * four families stay apart for a red–green colour-blind reader.
 *
 * The same value is the toolbox category colour, so the rail, the flyout blocks
 * and the blocks on the canvas all agree.
 */
/** Toolbox category hues — exported so the mission brief's step groups can
 * reuse the exact colours instead of drifting off with their own copies. */
export const HUE_DATA = '#2563eb';
export const HUE_FILL = '#0f766e';
export const HUE_NORM = '#b45309';
export const HUE_OUTPUT = '#7c3aed';

const STATEMENT = { previousStatement: null, nextStatement: null };

/**
 * Wartość wstawiana przez blok „current class". Wykonawca podmienia ją na klasę
 * bieżącego obrotu pętli `For each centrality`; poza pętlą nie ma czym jej
 * zastąpić i zgłasza problem.
 */
export const RAA_CURRENT_CENTRALITY = '@current';

/** Typ gniazda — pilnuje, by w miejsce klasy dało się wpiąć tylko klasę. */
const CENTRALITY_CHECK = 'RaaCentrality';

/** Gniazdo na klasę centralności, wspólne dla trzech bloków, które jej używają. */
const CENTRALITY_INPUT = {
  type: 'input_value',
  name: 'CENTRALITY',
  check: CENTRALITY_CHECK,
} as const;

/** Register the recipe blocks once per page. */
export function registerRaaBlocks(): void {
  if ((Blockly.Blocks as Record<string, unknown>)['raa_load_tracks']) {
    return;
  }

  Blockly.defineBlocksWithJsonArray([
    {
      type: 'raa_load_events',
      message0: 'Load events',
      ...STATEMENT,
      colour: HUE_DATA,
      tooltip: 'Open the Pb–Pb event sample (multiplicity and centrality per collision).',
    },
    {
      type: 'raa_if_centrality',
      message0: 'If centrality %1',
      args0: [{ ...CENTRALITY_INPUT }],
      inputsInline: true,
      ...STATEMENT,
      colour: HUE_DATA,
      tooltip: 'Keep only the collisions of this centrality class.',
    },
    {
      type: 'raa_count_events',
      message0: 'Count events → N%1',
      args0: [{ type: 'field_label', name: 'SUB', text: 'evt', class: 'nmf-blockly-sub' }],
      ...STATEMENT,
      colour: HUE_DATA,
      tooltip: 'Store the number of selected collisions as N_evt for later divisions.',
    },
    {
      type: 'raa_fill_multiplicity',
      message0: 'Fill multiplicity histogram',
      ...STATEMENT,
      colour: HUE_FILL,
      tooltip: 'How many charged tracks each of those collisions produced.',
    },
    {
      type: 'raa_plot_mult_cent',
      message0: 'Plot multiplicity vs centrality',
      ...STATEMENT,
      colour: HUE_OUTPUT,
      tooltip: 'Every event as one point: this is where the centrality classes come from.',
    },
    {
      type: 'raa_load_tracks',
      message0: 'Load Pb–Pb tracks',
      ...STATEMENT,
      colour: HUE_DATA,
      tooltip: 'Open the charged-track sample for all centrality classes.',
    },
    {
      type: 'raa_select_centrality',
      message0: 'Select centrality %1',
      args0: [{ ...CENTRALITY_INPUT }],
      inputsInline: true,
      ...STATEMENT,
      colour: HUE_DATA,
      tooltip: 'Use the tracks of one centrality class.',
    },
    {
      type: 'raa_cut_pt',
      message0: 'Cut pT above %1 GeV/c',
      args0: [{ type: 'field_number', name: 'PT_CUT', value: 0.15, min: 0.15, max: 15 }],
      ...STATEMENT,
      colour: HUE_FILL,
      tooltip: 'Ignore tracks softer than this when filling the histogram.',
    },
    {
      type: 'raa_create_hist',
      message0: 'Create empty pT histogram (0.2 GeV/c bins)',
      ...STATEMENT,
      colour: HUE_FILL,
      tooltip: 'Allocate momentum bins, 0.2 GeV/c wide from 0.2 to 15 GeV/c.',
    },
    {
      type: 'raa_fill_hist',
      message0: 'Fill histogram from tracks',
      ...STATEMENT,
      colour: HUE_FILL,
      tooltip: 'Count the selected tracks into the empty histogram.',
    },
    {
      type: 'raa_lookup_ncoll',
      message0: 'Look up number of collisions for %1 → N%2',
      args0: [
        { ...CENTRALITY_INPUT },
        { type: 'field_label', name: 'SUB', text: 'coll', class: 'nmf-blockly-sub' },
      ],
      inputsInline: true,
      ...STATEMENT,
      colour: HUE_NORM,
      tooltip:
        'Average number of nucleon–nucleon collisions in one Pb–Pb collision of that class.',
    },
    {
      type: 'raa_divide_bin_width',
      message0: 'Divide by bin width',
      ...STATEMENT,
      colour: HUE_NORM,
      tooltip:
        'Turn counts per bin into counts per GeV/c. Bins of different width cannot be compared without it.',
    },
    {
      type: 'raa_divide_events',
      message0: 'Divide by N%1',
      args0: [{ type: 'field_label', name: 'SUB', text: 'evt', class: 'nmf-blockly-sub' }],
      ...STATEMENT,
      colour: HUE_NORM,
      tooltip: 'Uses the N_evt you counted. Yield per collision instead of per data sample.',
    },
    {
      type: 'raa_divide_ncoll',
      message0: 'Divide by N%1',
      args0: [{ type: 'field_label', name: 'SUB', text: 'coll', class: 'nmf-blockly-sub' }],
      ...STATEMENT,
      colour: HUE_NORM,
      tooltip: 'Uses the number of collisions you looked up.',
    },
    {
      type: 'raa_clone_spectrum',
      message0: 'Clone spectrum',
      ...STATEMENT,
      colour: HUE_NORM,
      tooltip: 'Keep a copy of the current spectrum (e.g. before switching the reference).',
    },
    {
      type: 'raa_load_pp',
      message0: 'Load pp reference',
      ...STATEMENT,
      colour: HUE_DATA,
      tooltip: 'The published proton–proton spectrum, already per event and per GeV/c.',
    },
    {
      type: 'raa_load_peripheral',
      message0: 'Load peripheral 70–80% spectrum',
      ...STATEMENT,
      colour: HUE_DATA,
      tooltip: 'Build the 70–80% yield with the same normalisations you already applied.',
    },
    {
      type: 'raa_divide_reference',
      message0: 'Divide by loaded reference %1',
      args0: [
        { type: 'field_dropdown', name: 'REFERENCE', options: RAA_REFERENCE_OPTIONS },
      ],
      ...STATEMENT,
      colour: HUE_NORM,
      tooltip: 'pp → R_AA; peripheral → R_CP. Load the reference first.',
    },
    {
      type: 'raa_plot',
      message0: 'Plot as %1',
      args0: [{ type: 'field_dropdown', name: 'TARGET', options: RAA_PLOT_OPTIONS }],
      ...STATEMENT,
      colour: HUE_OUTPUT,
      tooltip: 'Draw the result. Each run adds a series for the centrality class you chose.',
    },
    {
      type: 'raa_draw_line',
      message0: 'Draw line at 1',
      ...STATEMENT,
      colour: HUE_OUTPUT,
      tooltip: 'Mark R_AA = 1 (or R_CP = 1) on the next ratio plot.',
    },
    {
      type: 'raa_read_value',
      message0: 'Read value at %1',
      args0: [{ type: 'field_dropdown', name: 'PT', options: RAA_READ_OPTIONS }],
      ...STATEMENT,
      colour: HUE_OUTPUT,
      tooltip: 'Record the spectrum value in that momentum bin.',
    },
  ]);

  Blockly.defineBlocksWithJsonArray([
    {
      // Literał klasy — to, co wcześniej było dropdownem wbudowanym w trzy bloki.
      // Wstawiany jako shadow, więc domyślny wygląd tamtych bloków się nie zmienia.
      type: 'raa_centrality',
      message0: '%1',
      args0: [
        { type: 'field_dropdown', name: 'CENTRALITY', options: RAA_CENTRALITY_OPTIONS },
      ],
      output: CENTRALITY_CHECK,
      colour: HUE_DATA,
      tooltip: 'One fixed centrality class.',
    },
    {
      // Zmienna pętli. Ten sam kształt co literał, więc wchodzi w te same gniazda.
      type: 'raa_current_centrality',
      message0: 'current class',
      output: CENTRALITY_CHECK,
      colour: HUE_OUTPUT,
      tooltip:
        'The class the surrounding "For each centrality" loop is on right now. Drop it wherever you would otherwise pin one class, and the same chain runs for every class in the set.',
    },
  ]);

  Blockly.Blocks['raa_for_each'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('For each centrality')
        .appendField(new Blockly.FieldDropdown(RAA_PRESET_OPTIONS), 'PRESET');
      this.appendStatementInput('BODY').setCheck(null).appendField('do');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(HUE_OUTPUT);
      this.setTooltip(
        'Run the inner chain once per class in the set. Use this instead of pressing Run five times.',
      );
    },
  };
}

const TYPE_TO_KIND: Record<string, RaaStepKind> = {
  raa_load_events: 'load_events',
  raa_if_centrality: 'if_centrality',
  raa_count_events: 'count_events',
  raa_fill_multiplicity: 'fill_multiplicity',
  raa_plot_mult_cent: 'plot_mult_vs_centrality',
  raa_load_tracks: 'load_tracks',
  raa_select_centrality: 'select_centrality',
  raa_cut_pt: 'cut_pt',
  raa_create_hist: 'create_hist',
  raa_fill_hist: 'fill_hist',
  raa_lookup_ncoll: 'lookup_ncoll',
  raa_divide_bin_width: 'divide_bin_width',
  raa_divide_events: 'divide_events',
  raa_divide_ncoll: 'divide_ncoll',
  raa_clone_spectrum: 'clone_spectrum',
  raa_load_pp: 'load_pp',
  raa_load_peripheral: 'load_peripheral',
  raa_divide_reference: 'divide_reference',
  raa_for_each: 'for_each_centrality',
  raa_plot: 'plot',
  raa_draw_line: 'draw_line_at_one',
  raa_read_value: 'read_value',
};

const KIND_TO_TYPE: Record<RaaStepKind, string> = Object.entries(TYPE_TO_KIND).reduce(
  (acc, [type, kind]) => ({ ...acc, [kind]: type }),
  {} as Record<RaaStepKind, string>,
);

export function buildRaaToolbox(): Blockly.utils.toolbox.ToolboxInfo {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Events',
        colour: HUE_DATA,
        contents: [
          { kind: 'block', type: 'raa_load_events' },
          {
            kind: 'block',
            type: 'raa_if_centrality',
            inputs: { CENTRALITY: { shadow: { type: 'raa_centrality' } } },
          },
          { kind: 'block', type: 'raa_count_events' },
          { kind: 'block', type: 'raa_fill_multiplicity' },
          { kind: 'block', type: 'raa_plot_mult_cent' },
        ],
      },
      {
        kind: 'category',
        name: 'Tracks',
        colour: HUE_FILL,
        contents: [
          { kind: 'block', type: 'raa_load_tracks' },
          {
            kind: 'block',
            type: 'raa_select_centrality',
            inputs: { CENTRALITY: { shadow: { type: 'raa_centrality' } } },
          },
          { kind: 'block', type: 'raa_cut_pt' },
          { kind: 'block', type: 'raa_create_hist' },
          { kind: 'block', type: 'raa_fill_hist' },
        ],
      },
      {
        kind: 'category',
        name: 'Normalise',
        colour: HUE_NORM,
        contents: [
          {
            kind: 'block',
            type: 'raa_lookup_ncoll',
            inputs: { CENTRALITY: { shadow: { type: 'raa_centrality' } } },
          },
          { kind: 'block', type: 'raa_divide_bin_width' },
          { kind: 'block', type: 'raa_divide_events' },
          { kind: 'block', type: 'raa_divide_ncoll' },
        ],
      },
      {
        // Osobna kategoria, bo te dwa bloki nie należą do żadnego etapu analizy —
        // wchodzą w gniazdo klasy w trzech różnych miejscach.
        kind: 'category',
        name: 'Classes',
        colour: HUE_OUTPUT,
        contents: [
          { kind: 'block', type: 'raa_centrality' },
          { kind: 'block', type: 'raa_current_centrality' },
        ],
      },
      {
        kind: 'category',
        name: 'References & plot',
        colour: HUE_OUTPUT,
        contents: [
          { kind: 'block', type: 'raa_load_pp' },
          { kind: 'block', type: 'raa_divide_reference' },
          { kind: 'block', type: 'raa_for_each' },
          { kind: 'block', type: 'raa_plot' },
          { kind: 'block', type: 'raa_draw_line' },
          { kind: 'block', type: 'raa_read_value' },
        ],
      },
    ],
  };
}

export function createRaaLightTheme(): Blockly.Theme {
  return Blockly.Theme.defineTheme('nmfLight', {
    name: 'nmfLight',
    base: Blockly.Themes.Classic,
    /**
     * Blockly measures label text with these values, so the font has to be set
     * here and not in CSS — styling `.blocklyText` after the fact leaves the
     * block outlines sized for the old metrics and the text spills out.
     */
    fontStyle: {
      family: 'Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif',
      weight: '600',
      size: 11.5,
    },
    componentStyles: {
      // Three tones of near-white: rail, canvas, flyout. Each surface is a step
      // apart so the three regions read as separate without a hard seam —
      // mirrors exercise 1's filter-builder theme (nmfFilterLight).
      workspaceBackgroundColour: '#ffffff',
      toolboxBackgroundColour: '#f1f5f9',
      toolboxForegroundColour: '#0f172a',
      flyoutBackgroundColour: '#f8fafc',
      flyoutForegroundColour: '#0f172a',
      flyoutOpacity: 1,
      scrollbarColour: '#94a3b8',
      insertionMarkerColour: '#b71c1c',
      insertionMarkerOpacity: 0.4,
      scrollbarOpacity: 0.5,
      cursorColour: '#0f172a',
    },
  });
}

/**
 * Read the recipe out of the workspace.
 *
 * Every connected stack counts, top to bottom and left to right. Nested bodies
 * of `for each` are attached as `step.body`.
 */
export function recipeFromWorkspace(workspace: Blockly.Workspace): RaaStep[] {
  const steps: RaaStep[] = [];
  for (const top of workspace.getTopBlocks(true)) {
    let block: Blockly.Block | null = top;
    while (block) {
      const step = stepOf(block);
      if (step) {
        steps.push(step);
      }
      block = block.getNextBlock();
    }
  }
  return steps;
}

function stepOf(block: Blockly.Block): RaaStep | null {
  const kind = TYPE_TO_KIND[block.type];
  if (!kind) {
    return null;
  }
  const step: RaaStep = { kind };

  if (
    kind === 'if_centrality' ||
    kind === 'select_centrality' ||
    kind === 'lookup_ncoll'
  ) {
    const cent = centralityOf(block);
    step.centrality = cent;
    if (kind === 'lookup_ncoll') {
      step.nCollCentrality = cent;
    }
  }
  if (kind === 'create_hist') {
    step.binning = 'fixed';
  }
  if (kind === 'cut_pt') {
    step.ptCut = Number(block.getFieldValue('PT_CUT')) || 0.15;
  }
  if (kind === 'divide_reference') {
    step.reference = (block.getFieldValue('REFERENCE') as RaaReferenceKind) || 'pp';
  }
  if (kind === 'for_each_centrality') {
    step.centralityPreset =
      (block.getFieldValue('PRESET') as RaaCentralityPreset) || 'three';
    const bodyBlock = block.getInputTargetBlock('BODY');
    step.body = stackFrom(bodyBlock);
  }
  if (kind === 'plot') {
    step.plotAs = (block.getFieldValue('TARGET') as RaaPlotTarget) || 'raa';
  }
  if (kind === 'read_value') {
    step.readAt = Number(block.getFieldValue('PT')) || 5.5;
  }
  return step;
}

/**
 * Klasa wpięta w gniazdo bloku. Pusty gniazdo traktujemy jak pierwszą klasę —
 * to samo zachowanie, co dawniej miał dropdown bez wyboru.
 */
function centralityOf(block: Blockly.Block): string {
  const plugged = block.getInputTargetBlock('CENTRALITY');
  if (!plugged) {
    return '0-5';
  }
  if (plugged.type === 'raa_current_centrality') {
    return RAA_CURRENT_CENTRALITY;
  }
  return plugged.getFieldValue('CENTRALITY') || '0-5';
}

function stackFrom(start: Blockly.Block | null): RaaStep[] {
  const steps: RaaStep[] = [];
  let block = start;
  while (block) {
    const step = stepOf(block);
    if (step) {
      steps.push(step);
    }
    block = block.getNextBlock();
  }
  return steps;
}

/**
 * Append blocks to the end of the recipe. Used by the tutorial's “place it for
 * me” escape hatch, so a class cannot get stuck on one drag.
 */
/**
 * Place `steps` as a stack of their own, at `(x, y)`, without attaching to
 * anything already on the canvas.
 */
export function placeRecipeStack(
  workspace: Blockly.WorkspaceSvg,
  steps: RaaStep[],
  x: number,
  y: number,
): void {
  let previous: Blockly.Block | null = null;
  for (const step of steps) {
    const block = createBlock(workspace, step);
    if (!block) {
      continue;
    }
    if (previous?.nextConnection && block.previousConnection) {
      previous.nextConnection.connect(block.previousConnection);
    } else if (!previous) {
      block.moveBy(x, y);
    }
    previous = block;
  }
  workspace.render();
}

export function appendRecipeBlocks(
  workspace: Blockly.WorkspaceSvg,
  steps: RaaStep[],
): void {
  for (const step of steps) {
    const block = createBlock(workspace, step);
    if (!block) {
      continue;
    }
    const tail = lastBlockOfRecipe(workspace, block);
    if (tail?.nextConnection && block.previousConnection) {
      tail.nextConnection.connect(block.previousConnection);
    } else {
      block.moveBy(40, 40);
    }
  }
  workspace.render();
}

/**
 * The whole-sample chain, kept as its own stack.
 *
 * `Plot multiplicity vs centrality` covers every event and is what *defines*
 * the classes, so it must not sit under an `If centrality` — doing so raises
 * `MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS` and its checklist step never ticks.
 * Hence two separate stacks rather than one long chain.
 */
export function wholeSampleRecipe(): RaaStep[] {
  return [{ kind: 'load_events' }, { kind: 'plot_mult_vs_centrality' }];
}

/**
 * The measurement, run once per centrality class.
 *
 * Wrapped in `For each centrality` over the five-class preset: that is what the
 * exercise actually asks for ("repeat for several centrality classes"), and it
 * collects all five in one Run instead of making the student rebuild the chain
 * five times. The class is passed as the loop variable, so the same body serves
 * every turn.
 */
export function fullRecipe(): RaaStep[] {
  const perClass: RaaStep[] = [
    { kind: 'if_centrality', centrality: RAA_CURRENT_CENTRALITY },
    { kind: 'count_events' },
    { kind: 'fill_multiplicity' },
    { kind: 'select_centrality', centrality: RAA_CURRENT_CENTRALITY },
    { kind: 'create_hist', binning: 'fixed' },
    { kind: 'fill_hist' },
    { kind: 'lookup_ncoll', nCollCentrality: RAA_CURRENT_CENTRALITY },
    { kind: 'divide_bin_width' },
    { kind: 'divide_events' },
    { kind: 'divide_ncoll' },
    { kind: 'load_pp' },
    { kind: 'divide_reference', reference: 'pp' },
    { kind: 'draw_line_at_one' },
    { kind: 'plot', plotAs: 'raa' },
    { kind: 'read_value', readAt: 5.5 },
    { kind: 'read_value', readAt: 10 },
  ];
  return [
    { kind: 'load_events' },
    { kind: 'load_tracks' },
    { kind: 'for_each_centrality', centralityPreset: 'five', body: perClass },
  ];
}

/**
 * Fill a block's `CENTRALITY` socket with the right value block: the loop
 * variable for `@current`, otherwise a plain class literal.
 */
function plugCentralityValue(
  workspace: Blockly.WorkspaceSvg,
  block: Blockly.Block,
  centrality: string,
): void {
  const input = block.getInput('CENTRALITY');
  if (!input?.connection) {
    return;
  }
  const value =
    centrality === RAA_CURRENT_CENTRALITY
      ? workspace.newBlock('raa_current_centrality')
      : workspace.newBlock('raa_centrality');
  if (centrality !== RAA_CURRENT_CENTRALITY) {
    value.setFieldValue(centrality, 'CENTRALITY');
  }
  value.initSvg();
  value.render();
  input.connection.connect(value.outputConnection!);
}

function createBlock(
  workspace: Blockly.WorkspaceSvg,
  step: RaaStep,
): Blockly.Block | null {
  const type = KIND_TO_TYPE[step.kind];
  if (!type) {
    return null;
  }
  const block = workspace.newBlock(type);
  // `CENTRALITY` is a value input, not a field: the class arrives as its own
  // plugged-in block. Setting it as a field throws, which used to abort the
  // whole recipe after the first block.
  const centrality = step.centrality ?? step.nCollCentrality;
  if (centrality && block.getInput('CENTRALITY')) {
    plugCentralityValue(workspace, block, centrality);
  }
  if (step.ptCut != null && block.getField('PT_CUT')) {
    block.setFieldValue(String(step.ptCut), 'PT_CUT');
  }
  if (step.reference) {
    if (block.getField('REFERENCE')) {
      block.setFieldValue(step.reference, 'REFERENCE');
    }
  }
  if (step.centralityPreset) {
    if (block.getField('PRESET')) {
      block.setFieldValue(step.centralityPreset, 'PRESET');
    }
  }
  if (step.plotAs) {
    if (block.getField('TARGET')) {
      block.setFieldValue(step.plotAs, 'TARGET');
    }
  }
  if (step.readAt != null && block.getField('PT')) {
    const key = String(step.readAt);
    if (RAA_READ_OPTIONS.some(([, value]) => value === key)) {
      block.setFieldValue(key, 'PT');
    }
  }
  if (step.kind === 'for_each_centrality' && step.body?.length) {
    let previous: Blockly.Block | null = null;
    for (const child of step.body) {
      const inner = createBlock(workspace, child);
      if (!inner) {
        continue;
      }
      if (!previous) {
        const body = block.getInput('BODY');
        body?.connection?.connect(inner.previousConnection!);
      } else if (previous.nextConnection && inner.previousConnection) {
        previous.nextConnection.connect(inner.previousConnection);
      }
      previous = inner;
    }
  }
  block.initSvg();
  block.render();
  return block;
}

/** Bottom of the longest existing stack, so appended blocks keep one recipe. */
function lastBlockOfRecipe(
  workspace: Blockly.WorkspaceSvg,
  exclude: Blockly.Block,
): Blockly.Block | null {
  let best: Blockly.Block | null = null;
  let bestLength = 0;
  for (const top of workspace.getTopBlocks(true)) {
    if (top.id === exclude.id) {
      continue;
    }
    let block: Blockly.Block = top;
    let length = 1;
    while (block.getNextBlock()) {
      block = block.getNextBlock()!;
      length += 1;
    }
    if (length > bestLength) {
      bestLength = length;
      best = block;
    }
  }
  return best;
}
