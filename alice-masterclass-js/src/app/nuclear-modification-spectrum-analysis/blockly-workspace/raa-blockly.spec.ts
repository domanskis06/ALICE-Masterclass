import { registerRaaBlocks, buildRaaToolbox } from './raa-blockly';
import * as Blockly from 'blockly';

describe('raa-blockly registration', () => {
  it('registers blocks idempotently and builds a toolbox', () => {
    registerRaaBlocks();
    registerRaaBlocks();
    expect(Blockly.Blocks['raa_load_pbpb']).toBeTruthy();
    const toolbox = buildRaaToolbox();
    expect(toolbox.kind).toBe('categoryToolbox');
    expect((toolbox.contents as unknown[]).length).toBeGreaterThan(0);
  });
});
