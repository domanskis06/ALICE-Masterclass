import * as Blockly from 'blockly';

import {
  RAA_CURRENT_CENTRALITY,
  buildRaaToolbox,
  fullRecipe,
  recipeFromWorkspace,
  registerRaaBlocks,
  wholeSampleRecipe,
} from './raa-blockly';

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

  /** Wpina literał klasy w gniazdo CENTRALITY — w aplikacji robi to shadow z toolboxa. */
  function plugCentrality(block: Blockly.Block, centrality: string): Blockly.Block {
    const value = workspace.newBlock('raa_centrality');
    value.setFieldValue(centrality, 'CENTRALITY');
    block.getInput('CENTRALITY')!.connection!.connect(value.outputConnection!);
    return value;
  }

  it('exposes the toolbox categories with the granular blocks', () => {
    const toolbox = buildRaaToolbox();
    const categories = toolbox.contents as { name: string; contents: { type: string }[] }[];
    expect(categories.map((c) => c.name)).toEqual([
      'Events',
      'Tracks',
      'Normalise',
      'Classes',
      'References & plot',
    ]);
    const types = categories.flatMap((c) => c.contents.map((b) => b.type));
    expect(types).toContain('raa_load_tracks');
    expect(types).toContain('raa_lookup_ncoll');
    expect(types).toContain('raa_for_each');
    expect(types).toContain('raa_draw_line');
    // Klasa jako wartość: literał i zmienna pętli wchodzą w to samo gniazdo.
    expect(types).toContain('raa_centrality');
    expect(types).toContain('raa_current_centrality');
  });

  it('gives every centrality socket a shadow class, so nothing starts empty', () => {
    const toolbox = buildRaaToolbox();
    const categories = toolbox.contents as {
      contents: { type: string; inputs?: Record<string, { shadow: { type: string } }> }[];
    }[];
    const consumers = categories
      .flatMap((c) => c.contents)
      .filter((b) =>
        ['raa_if_centrality', 'raa_select_centrality', 'raa_lookup_ncoll'].includes(b.type),
      );
    expect(consumers.length).toBe(3);
    for (const block of consumers) {
      expect(block.inputs?.['CENTRALITY']?.shadow?.type).toBe('raa_centrality');
    }
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
    plugCentrality(blocks[0], '20-30');
    plugCentrality(blocks[2], '0-5');
    blocks[3].setFieldValue('peripheral', 'REFERENCE');
    blocks[4].setFieldValue('rcp', 'TARGET');

    const recipe = recipeFromWorkspace(workspace);
    expect(recipe[0].centrality).toBe('20-30');
    expect(recipe[1].binning).toBe('fixed');
    expect(recipe[2].nCollCentrality).toBe('0-5');
    expect(recipe[3].reference).toBe('peripheral');
    expect(recipe[4].plotAs).toBe('rcp');
  });

  it('reports the loop variable instead of a fixed class', () => {
    const select = workspace.newBlock('raa_select_centrality');
    const current = workspace.newBlock('raa_current_centrality');
    select.getInput('CENTRALITY')!.connection!.connect(current.outputConnection!);

    const recipe = recipeFromWorkspace(workspace);
    expect(recipe[0].centrality).toBe(RAA_CURRENT_CENTRALITY);
  });

  it('falls back to the first class when the socket is empty', () => {
    workspace.newBlock('raa_select_centrality');

    const recipe = recipeFromWorkspace(workspace);
    expect(recipe[0].centrality).toBe('0-5');
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

  it('takes the centrality class as a plugged-in value, never as a field', () => {
    // Regression: `createBlock` used to call setFieldValue(..., 'CENTRALITY').
    // Once the class became its own block, that threw on the first such step
    // and aborted the rest of "Build it for me" — only `Load events` appeared.
    for (const type of ['raa_if_centrality', 'raa_select_centrality', 'raa_lookup_ncoll']) {
      const block = workspace.newBlock(type);
      expect(block.getInput('CENTRALITY'))
        .withContext(`${type} should expose a CENTRALITY socket`)
        .toBeTruthy();
      expect(block.getField('CENTRALITY'))
        .withContext(`${type} should have no CENTRALITY field`)
        .toBeNull();
    }
  });

  it('every kind the auto-built solution uses maps to a real block', () => {
    const TYPES: Record<string, string> = {
      load_events: 'raa_load_events',
      if_centrality: 'raa_if_centrality',
      count_events: 'raa_count_events',
      fill_multiplicity: 'raa_fill_multiplicity',
      plot_mult_vs_centrality: 'raa_plot_mult_cent',
      load_tracks: 'raa_load_tracks',
      select_centrality: 'raa_select_centrality',
      create_hist: 'raa_create_hist',
      fill_hist: 'raa_fill_hist',
      lookup_ncoll: 'raa_lookup_ncoll',
      divide_bin_width: 'raa_divide_bin_width',
      divide_events: 'raa_divide_events',
      divide_ncoll: 'raa_divide_ncoll',
      load_pp: 'raa_load_pp',
      divide_reference: 'raa_divide_reference',
      draw_line_at_one: 'raa_draw_line',
      plot: 'raa_plot',
      read_value: 'raa_read_value',
      for_each_centrality: 'raa_for_each',
    };
    const check = (steps: ReturnType<typeof fullRecipe>): void => {
      for (const step of steps) {
        const type = TYPES[step.kind];
        expect(type).withContext(`no block for kind ${step.kind}`).toBeTruthy();
        expect(() => workspace.newBlock(type)).not.toThrow();
        if (step.body?.length) {
          check(step.body);
        }
      }
    };
    check(wholeSampleRecipe());
    check(fullRecipe());
  });

  it('keeps multiplicity vs centrality out of the per-class loop', () => {
    // It covers the whole sample and defines the classes, so putting it under
    // a centrality filter raises MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS and its
    // checklist step never ticks.
    expect(wholeSampleRecipe().map((s) => s.kind)).toEqual([
      'load_events',
      'plot_mult_vs_centrality',
    ]);
    const kinds = fullRecipe().flatMap((s) => [s.kind, ...(s.body ?? []).map((b) => b.kind)]);
    expect(kinds).not.toContain('plot_mult_vs_centrality');
  });

  it('measures every class in one Run, via the five-class loop', () => {
    const loop = fullRecipe().find((s) => s.kind === 'for_each_centrality')!;
    expect(loop.centralityPreset).toBe('five');
    // The body is class-agnostic: it reads the class from the loop variable.
    for (const step of loop.body ?? []) {
      const centrality = step.centrality ?? step.nCollCentrality;
      if (centrality) {
        expect(centrality).toBe(RAA_CURRENT_CENTRALITY);
      }
    }
  });
});