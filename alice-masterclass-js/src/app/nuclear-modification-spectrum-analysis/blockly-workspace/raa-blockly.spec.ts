import * as Blockly from 'blockly';

import { buildRaaToolbox, recipeFromWorkspace, registerRaaBlocks } from './raa-blockly';

describe('raa-blockly', () => {
  let workspace: Blockly.Workspace;

  beforeAll(() => registerRaaBlocks());

  beforeEach(() => {
    workspace = new Blockly.Workspace();
  });

  afterEach(() => {
    workspace.dispose();
  });

  function stack(types: string[]): Blockly.Block[] {
    const blocks = types.map((type) => workspace.newBlock(type));
    for (let i = 0; i < blocks.length - 1; i++) {
      blocks[i].nextConnection!.connect(blocks[i + 1].previousConnection!);
    }
    return blocks;
  }

  it('exposes the four toolbox categories with the granular blocks', () => {
    const toolbox = buildRaaToolbox();
    const categories = toolbox.contents as { name: string; contents: { type: string }[] }[];
    expect(categories.map((c) => c.name)).toEqual([
      'Events',
      'Tracks',
      'Normalise',
      'References & plot',
    ]);
    const types = categories.flatMap((c) => c.contents.map((b) => b.type));
    expect(types).toContain('raa_load_tracks');
    expect(types).toContain('raa_lookup_ncoll');
    expect(types).toContain('raa_for_each');
    expect(types).toContain('raa_draw_line');
  });

  it('reads a full normalisation chain in order', () => {
    stack([
      'raa_load_events',
      'raa_if_centrality',
      'raa_count_events',
      'raa_load_tracks',
      'raa_select_centrality',
      'raa_create_hist',
      'raa_fill_hist',
      'raa_lookup_ncoll',
      'raa_divide_bin_width',
      'raa_divide_events',
      'raa_divide_ncoll',
      'raa_load_pp',
      'raa_divide_reference',
      'raa_draw_line',
      'raa_plot',
    ]);

    const kinds = recipeFromWorkspace(workspace).map((step) => step.kind);
    expect(kinds).toEqual([
      'load_events',
      'if_centrality',
      'count_events',
      'load_tracks',
      'select_centrality',
      'create_hist',
      'fill_hist',
      'lookup_ncoll',
      'divide_bin_width',
      'divide_events',
      'divide_ncoll',
      'load_pp',
      'divide_reference',
      'draw_line_at_one',
      'plot',
    ]);
  });

  it('keeps the event part and the spectrum part of one recipe even as two stacks', () => {
    stack(['raa_load_events', 'raa_if_centrality', 'raa_count_events']);
    stack(['raa_load_tracks', 'raa_select_centrality', 'raa_create_hist', 'raa_fill_hist']);

    const kinds = recipeFromWorkspace(workspace).map((step) => step.kind);
    expect(kinds).toContain('load_events');
    expect(kinds).toContain('fill_hist');
  });

  it('carries dropdown choices into the recipe', () => {
    const blocks = stack([
      'raa_select_centrality',
      'raa_create_hist',
      'raa_lookup_ncoll',
      'raa_divide_reference',
      'raa_plot',
    ]);
    blocks[0].setFieldValue('20-30', 'CENTRALITY');
    blocks[1].setFieldValue('alice', 'BINNING');
    blocks[2].setFieldValue('0-5', 'CENTRALITY');
    blocks[3].setFieldValue('peripheral', 'REFERENCE');
    blocks[4].setFieldValue('rcp', 'TARGET');

    const recipe = recipeFromWorkspace(workspace);
    expect(recipe[0].centrality).toBe('20-30');
    expect(recipe[1].binning).toBe('alice');
    expect(recipe[2].nCollCentrality).toBe('0-5');
    expect(recipe[3].reference).toBe('peripheral');
    expect(recipe[4].plotAs).toBe('rcp');
  });

  it('reads the body of a for-each block', () => {
    const loop = workspace.newBlock('raa_for_each');
    loop.setFieldValue('five', 'PRESET');
    const create = workspace.newBlock('raa_create_hist');
    const fill = workspace.newBlock('raa_fill_hist');
    create.nextConnection!.connect(fill.previousConnection!);
    loop.getInput('BODY')!.connection!.connect(create.previousConnection!);

    const recipe = recipeFromWorkspace(workspace);
    expect(recipe[0].kind).toBe('for_each_centrality');
    expect(recipe[0].centralityPreset).toBe('five');
    expect(recipe[0].body?.map((s) => s.kind)).toEqual(['create_hist', 'fill_hist']);
  });

  it('an empty workspace is an empty recipe', () => {
    expect(recipeFromWorkspace(workspace)).toEqual([]);
  });
});
