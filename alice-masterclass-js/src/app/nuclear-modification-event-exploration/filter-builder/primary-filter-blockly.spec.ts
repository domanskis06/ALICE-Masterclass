import {
  buildPrimaryFilterToolbox,
  buildValidPrimaryFilter,
  isValidPrimaryFilter,
  registerPrimaryFilterBlocks,
} from './primary-filter-blockly';
import * as Blockly from 'blockly';

describe('primary filter blockly', () => {
  beforeEach(() => {
    registerPrimaryFilterBlocks();
  });

  function connect(parent: Blockly.Block, input: string, child: Blockly.Block): void {
    parent.getInput(input)!.connection!.connect(child.outputConnection!);
  }

  function connectStatement(parent: Blockly.Block, input: string, child: Blockly.Block): void {
    parent.getInput(input)!.connection!.connect(child.previousConnection!);
  }

  function makeNumber(ws: Blockly.Workspace, value: number): Blockly.Block {
    const n = ws.newBlock('nmf_number');
    n.setFieldValue(String(value), 'NUM');
    return n;
  }

  function makeCompare(
    ws: Blockly.Workspace,
    op: 'EQ' | 'NEQ' | 'LT',
    left: Blockly.Block,
    right: Blockly.Block
  ): Blockly.Block {
    const cmp = ws.newBlock('nmf_compare');
    cmp.setFieldValue(op, 'OP');
    connect(cmp, 'A', left);
    connect(cmp, 'B', right);
    return cmp;
  }

  function makeChargeNotZero(ws: Blockly.Workspace): Blockly.Block {
    return makeCompare(ws, 'NEQ', ws.newBlock('nmf_charge'), makeNumber(ws, 0));
  }

  function makeChargeEquals(ws: Blockly.Workspace, value: number): Blockly.Block {
    return makeCompare(ws, 'EQ', ws.newBlock('nmf_charge'), makeNumber(ws, value));
  }

  function makeAbs(ws: Blockly.Workspace, inner: Blockly.Block): Blockly.Block {
    const abs = ws.newBlock('nmf_abs');
    connect(abs, 'NUM', inner);
    return abs;
  }

  function makeDcaXyPasses(ws: Blockly.Workspace): Blockly.Block {
    return makeCompare(
      ws,
      'LT',
      makeAbs(ws, ws.newBlock('nmf_dca_xy')),
      ws.newBlock('nmf_dca_cut_xy')
    );
  }

  function makeDcaZPasses(ws: Blockly.Workspace): Blockly.Block {
    return makeCompare(
      ws,
      'LT',
      makeAbs(ws, ws.newBlock('nmf_dca_z')),
      ws.newBlock('nmf_dca_cut_z')
    );
  }

  function makeAnd(ws: Blockly.Workspace, a: Blockly.Block, b: Blockly.Block): Blockly.Block {
    const and = ws.newBlock('nmf_filter_and');
    connect(and, 'A', a);
    connect(and, 'B', b);
    return and;
  }

  function makeOr(ws: Blockly.Workspace, a: Blockly.Block, b: Blockly.Block): Blockly.Block {
    const or = ws.newBlock('nmf_filter_or');
    connect(or, 'A', a);
    connect(or, 'B', b);
    return or;
  }

  /** charged AND xy AND z — nested AND, any grouping. */
  function makeFullPrimaryCond(
    ws: Blockly.Workspace,
    charged: Blockly.Block = makeChargeNotZero(ws)
  ): Blockly.Block {
    return makeAnd(ws, makeAnd(ws, charged, makeDcaXyPasses(ws)), makeDcaZPasses(ws));
  }

  function assembleIfKeep(ws: Blockly.Workspace, cond: Blockly.Block): void {
    const ifBlock = ws.newBlock('nmf_if');
    const keep = ws.newBlock('nmf_keep_track');
    connect(ifBlock, 'COND', cond);
    connectStatement(ifBlock, 'DO', keep);
  }

  it('registers filter blocks and toolbox', () => {
    expect(Blockly.Blocks['nmf_charge']).toBeTruthy();
    expect(Blockly.Blocks['nmf_dca_xy']).toBeTruthy();
    expect(Blockly.Blocks['nmf_dca_z']).toBeTruthy();
    expect(Blockly.Blocks['nmf_abs']).toBeTruthy();
    expect(Blockly.Blocks['nmf_dca_cut_xy']).toBeTruthy();
    expect(Blockly.Blocks['nmf_dca_cut_z']).toBeTruthy();
    expect(Blockly.Blocks['nmf_if']).toBeTruthy();
    expect(Blockly.Blocks['nmf_keep_track']).toBeTruthy();
    const toolbox = buildPrimaryFilterToolbox();
    expect(toolbox.kind).toBe('categoryToolbox');
    const categories = toolbox.contents as { contents?: { type?: string }[] }[];
    const types = categories.flatMap((category) => (category.contents ?? []).map((c) => c.type));
    expect(types).toContain('nmf_dca_xy');
    expect(types).toContain('nmf_dca_cut_xy');
    expect(types).not.toContain('nmf_from_primary');
  });

  it('accepts charged AND |DCA_xy|<cut_xy AND |DCA_z|<cut_z then keep', () => {
    const ws = new Blockly.Workspace();
    try {
      assembleIfKeep(ws, makeFullPrimaryCond(ws));
      expect(isValidPrimaryFilter(ws)).toBeTrue();
    } finally {
      ws.dispose();
    }
  });

  it('accepts different AND nesting / order', () => {
    const ws = new Blockly.Workspace();
    try {
      const cond = makeAnd(
        ws,
        makeDcaZPasses(ws),
        makeAnd(ws, makeDcaXyPasses(ws), makeChargeNotZero(ws))
      );
      assembleIfKeep(ws, cond);
      expect(isValidPrimaryFilter(ws)).toBeTrue();
    } finally {
      ws.dispose();
    }
  });

  it('accepts (charge = 1 OR charge = −1) with DCA cuts', () => {
    const ws = new Blockly.Workspace();
    try {
      const charged = makeOr(ws, makeChargeEquals(ws, 1), makeChargeEquals(ws, -1));
      assembleIfKeep(ws, makeFullPrimaryCond(ws, charged));
      expect(isValidPrimaryFilter(ws)).toBeTrue();
    } finally {
      ws.dispose();
    }
  });

  it('rejects empty workspace', () => {
    const ws = new Blockly.Workspace();
    try {
      expect(isValidPrimaryFilter(ws)).toBeFalse();
    } finally {
      ws.dispose();
    }
  });

  it('rejects charged only (missing DCA cuts)', () => {
    const ws = new Blockly.Workspace();
    try {
      assembleIfKeep(ws, makeChargeNotZero(ws));
      expect(isValidPrimaryFilter(ws)).toBeFalse();
    } finally {
      ws.dispose();
    }
  });

  it('rejects DCA cuts without charged', () => {
    const ws = new Blockly.Workspace();
    try {
      assembleIfKeep(ws, makeAnd(ws, makeDcaXyPasses(ws), makeDcaZPasses(ws)));
      expect(isValidPrimaryFilter(ws)).toBeFalse();
    } finally {
      ws.dispose();
    }
  });

  it('rejects typed centimetre literals instead of named cuts', () => {
    const ws = new Blockly.Workspace();
    try {
      const xy = makeCompare(
        ws,
        'LT',
        makeAbs(ws, ws.newBlock('nmf_dca_xy')),
        makeNumber(ws, 0.5)
      );
      const cond = makeAnd(ws, makeAnd(ws, makeChargeNotZero(ws), xy), makeDcaZPasses(ws));
      assembleIfKeep(ws, cond);
      expect(isValidPrimaryFilter(ws)).toBeFalse();
    } finally {
      ws.dispose();
    }
  });

  it('rejects if without keep track body', () => {
    const ws = new Blockly.Workspace();
    try {
      const ifBlock = ws.newBlock('nmf_if');
      connect(ifBlock, 'COND', makeFullPrimaryCond(ws));
      expect(isValidPrimaryFilter(ws)).toBeFalse();
    } finally {
      ws.dispose();
    }
  });

  it('rejects charge = 0 as charged check', () => {
    const ws = new Blockly.Workspace();
    try {
      const wrong = makeCompare(ws, 'EQ', ws.newBlock('nmf_charge'), makeNumber(ws, 0));
      assembleIfKeep(ws, makeFullPrimaryCond(ws, wrong));
      expect(isValidPrimaryFilter(ws)).toBeFalse();
    } finally {
      ws.dispose();
    }
  });

  it('buildValidPrimaryFilter assembles a filter that passes validation', () => {
    const ws = new Blockly.Workspace();
    try {
      buildValidPrimaryFilter(ws);
      expect(isValidPrimaryFilter(ws)).toBeTrue();
    } finally {
      ws.dispose();
    }
  });

  it('buildValidPrimaryFilter replaces whatever was already on the workspace', () => {
    const ws = new Blockly.Workspace();
    try {
      ws.newBlock('nmf_charge');
      buildValidPrimaryFilter(ws);
      expect(isValidPrimaryFilter(ws)).toBeTrue();
      expect(ws.getTopBlocks(false).length).toBe(1);
    } finally {
      ws.dispose();
    }
  });
});
