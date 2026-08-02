import * as Blockly from 'blockly';

import { RaaPipelineStep, RaaPipelineStepKind } from '../../shared/models/raa/raa';

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
];

const BLOCK_DEFS: Blockly.utils.toolbox.BlockInfo[] = [];

/** Register custom RAA pipeline blocks once. */
export function registerRaaBlocks(): void {
  if ((Blockly.Blocks as Record<string, unknown>)['raa_load_pbpb']) {
    return;
  }

  Blockly.defineBlocksWithJsonArray([
    {
      type: 'raa_load_pbpb',
      message0: 'Load Pb–Pb data',
      previousStatement: null,
      nextStatement: null,
      colour: 210,
      tooltip: 'Load heavy-ion collision data',
    },
    {
      type: 'raa_filter_centrality',
      message0: 'Filter centrality %1',
      args0: [
        {
          type: 'field_dropdown',
          name: 'CENTRALITY',
          options: RAA_CENTRALITY_OPTIONS,
        },
      ],
      previousStatement: null,
      nextStatement: null,
      colour: 210,
      tooltip: 'Keep events in the selected centrality class',
    },
    {
      type: 'raa_histogram_pt',
      message0: 'Histogram pT',
      previousStatement: null,
      nextStatement: null,
      colour: 160,
      tooltip: 'Fill transverse-momentumpectrum',
    },
    {
      type: 'raa_norm_events',
      message0: 'Normalize by N_evt',
      previousStatement: null,
      nextStatement: null,
      colour: 160,
      tooltip: 'Divide by number of events',
    },
    {
      type: 'raa_norm_ncoll',
      message0: 'Divide by ⟨N_coll⟩',
      previousStatement: null,
      nextStatement: null,
      colour: 160,
      tooltip: 'Scale by average binary collisions',
    },
    {
      type: 'raa_divide_pp',
      message0: 'Divide by pp reference',
      previousStatement: null,
      nextStatement: null,
      colour: 40,
      tooltip: 'Divide by proton–proton spectrum',
    },
    {
      type: 'raa_compute_raa',
      message0: 'Compute R_AA',
      previousStatement: null,
      nextStatement: null,
      colour: 20,
      tooltip: 'Build the nuclear modification factor',
    },
    {
      type: 'raa_compute_rcp',
      message0: 'Compute R_CP',
      previousStatement: null,
      nextStatement: null,
      colour: 20,
      tooltip: 'Central-to-peripheral ratio',
    },
    {
      type: 'raa_plot',
      message0: 'Plot results',
      previousStatement: null,
      nextStatement: null,
      colour: 290,
      tooltip: 'Show spectra and ratios',
    },
  ]);

  void BLOCK_DEFS;
}

const TYPE_TO_KIND: Record<string, RaaPipelineStepKind> = {
  raa_load_pbpb: 'load_pbpb',
  raa_filter_centrality: 'filter_centrality',
  raa_histogram_pt: 'histogram_pt',
  raa_norm_events: 'norm_events',
  raa_norm_ncoll: 'norm_ncoll',
  raa_divide_pp: 'divide_pp',
  raa_compute_raa: 'compute_raa',
  raa_compute_rcp: 'compute_rcp',
  raa_plot: 'plot',
};

export function buildRaaToolbox(): Blockly.utils.toolbox.ToolboxInfo {
  return {
    kind: 'categoryToolbox',
    contents: [
      {
        kind: 'category',
        name: 'Data',
        colour: '210',
        contents: [
          { kind: 'block', type: 'raa_load_pbpb' },
          { kind: 'block', type: 'raa_filter_centrality' },
        ],
      },
      {
        kind: 'category',
        name: 'Spectra',
        colour: '160',
        contents: [
          { kind: 'block', type: 'raa_histogram_pt' },
          { kind: 'block', type: 'raa_norm_events' },
          { kind: 'block', type: 'raa_norm_ncoll' },
        ],
      },
      {
        kind: 'category',
        name: 'Ratios',
        colour: '20',
        contents: [
          { kind: 'block', type: 'raa_divide_pp' },
          { kind: 'block', type: 'raa_compute_raa' },
          { kind: 'block', type: 'raa_compute_rcp' },
        ],
      },
      {
        kind: 'category',
        name: 'Output',
        colour: '290',
        contents: [{ kind: 'block', type: 'raa_plot' }],
      },
    ],
  };
}

export function createRaaDarkTheme(): Blockly.Theme {
  return Blockly.Theme.defineTheme('nmfDark', {
    name: 'nmfDark',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#0a1832',
      toolboxBackgroundColour: '#0f172a',
      toolboxForegroundColour: '#e5edf7',
      flyoutBackgroundColour: '#111827',
      flyoutForegroundColour: '#e5edf7',
      flyoutOpacity: 0.95,
      scrollbarColour: '#334155',
      insertionMarkerColour: '#38bdf8',
      insertionMarkerOpacity: 0.4,
      scrollbarOpacity: 0.5,
      cursorColour: '#f8fafc',
    },
  });
}

/** Walk the first connected statement stack into a typed pipeline. */
export function pipelineFromWorkspace(workspace: Blockly.Workspace): RaaPipelineStep[] {
  const tops = workspace.getTopBlocks(true);
  if (tops.length === 0) {
    return [];
  }
  // Prefer a stack that starts with Load Pb–Pb; otherwise use the first top block.
  let start =
    tops.find((b) => b.type === 'raa_load_pbpb') ?? tops[0];

  const steps: RaaPipelineStep[] = [];
  let block: Blockly.Block | null = start;
  while (block) {
    const kind = TYPE_TO_KIND[block.type];
    if (kind) {
      const step: RaaPipelineStep = { kind };
      if (kind === 'filter_centrality') {
        step.centrality = block.getFieldValue('CENTRALITY') || '0-5';
      }
      steps.push(step);
    }
    block = block.getNextBlock();
  }
  return steps;
}

/** Seed a suggested starter chain for first-time students. */
export function seedStarterPipeline(workspace: Blockly.WorkspaceSvg): void {
  const xmlText = `
<xml xmlns="https://developers.google.com/blockly/xml">
  <block type="raa_load_pbpb" x="40" y="40">
    <next>
      <block type="raa_filter_centrality">
        <field name="CENTRALITY">0-5</field>
        <next>
          <block type="raa_histogram_pt">
            <next>
              <block type="raa_norm_events">
                <next>
                  <block type="raa_norm_ncoll">
                    <next>
                      <block type="raa_divide_pp">
                        <next>
                          <block type="raa_compute_raa">
                            <next>
                              <block type="raa_plot"></block>
                            </next>
                          </block>
                        </next>
                      </block>
                    </next>
                  </block>
                </next>
              </block>
            </next>
          </block>
        </next>
      </block>
    </next>
  </block>
</xml>`;
  const xml = Blockly.utils.xml.textToDom(xmlText);
  Blockly.Xml.domToWorkspace(xml, workspace);
}
