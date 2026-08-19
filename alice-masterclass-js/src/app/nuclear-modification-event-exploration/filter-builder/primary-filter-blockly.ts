import * as Blockly from 'blockly';

/** Register primary track filter blocks once. */
export function registerPrimaryFilterBlocks(): void {
  // Guard on a DCA block so older sessions that only had nmf_charge still pick up the new set.
  if ((Blockly.Blocks as Record<string, unknown>)['nmf_dca_xy']) {
    return;
  }

  Blockly.defineBlocksWithJsonArray([
    {
      type: 'nmf_charge',
      message0: 'charge',
      output: 'Number',
      colour: 210,
      tooltip: 'Electric charge of the track',
    },
    {
      type: 'nmf_number',
      message0: '%1',
      args0: [{ type: 'field_number', name: 'NUM', value: 0 }],
      output: 'Number',
      colour: 230,
      tooltip: 'A number literal (e.g. 0 for the charged-track check)',
    },
    {
      type: 'nmf_abs',
      message0: '| %1 |',
      args0: [{ type: 'input_value', name: 'NUM', check: 'Number' }],
      output: 'Number',
      colour: 230,
      tooltip: 'Absolute value — DCA can be signed; the cut uses the magnitude',
    },
    {
      type: 'nmf_compare',
      message0: '%1 %2 %3',
      args0: [
        { type: 'input_value', name: 'A', check: 'Number' },
        {
          type: 'field_dropdown',
          name: 'OP',
          options: [
            ['=', 'EQ'],
            ['≠', 'NEQ'],
            ['<', 'LT'],
          ],
        },
        { type: 'input_value', name: 'B', check: 'Number' },
      ],
      output: 'Boolean',
      colour: 120,
      tooltip: 'Compare two values',
    },
    {
      type: 'nmf_filter_and',
      message0: '%1 AND %2',
      args0: [
        { type: 'input_value', name: 'A', check: 'Boolean' },
        { type: 'input_value', name: 'B', check: 'Boolean' },
      ],
      output: 'Boolean',
      colour: 120,
      tooltip: 'Both conditions must be true',
    },
    {
      type: 'nmf_filter_or',
      message0: '%1 OR %2',
      args0: [
        { type: 'input_value', name: 'A', check: 'Boolean' },
        { type: 'input_value', name: 'B', check: 'Boolean' },
      ],
      output: 'Boolean',
      colour: 120,
      tooltip: 'Either condition may be true',
    },
    {
      type: 'nmf_if',
      message0: 'if %1',
      args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
      message1: 'then %1',
      args1: [{ type: 'input_statement', name: 'DO' }],
      previousStatement: null,
      nextStatement: null,
      colour: 20,
      tooltip: 'Run the body when the condition is true',
    },
    {
      type: 'nmf_keep_track',
      message0: 'keep track',
      previousStatement: null,
      nextStatement: null,
      colour: 20,
      tooltip: 'Keep this track in the selection',
    },
  ]);

  // DCA labels: small FieldLabel for xy / z (Blockly cannot render HTML <sub>).
  const sub = (text: string) => new Blockly.FieldLabel(text, 'nmf-blockly-sub');

  Blockly.Blocks['nmf_dca_xy'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('DCA')
        .appendField(sub('xy'))
        .appendField(' to primary vertex');
      this.setOutput(true, 'Number');
      this.setColour(210);
      this.setTooltip(
        'How far the track misses the primary vertex in the transverse plane (from reconstruction)',
      );
    },
  };

  Blockly.Blocks['nmf_dca_z'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('DCA')
        .appendField(sub('z'))
        .appendField(' to primary vertex');
      this.setOutput(true, 'Number');
      this.setColour(210);
      this.setTooltip(
        'How far the track misses the primary vertex along the beam (from reconstruction)',
      );
    },
  };

  Blockly.Blocks['nmf_dca_cut_xy'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('primary DCA')
        .appendField(sub('xy'))
        .appendField(' cut');
      this.setOutput(true, 'Number');
      this.setColour(65);
      this.setTooltip(
        'Analysis cut on |DCA_xy|: the template physicists chose for this MasterClass (not a number you invent)',
      );
    },
  };

  Blockly.Blocks['nmf_dca_cut_z'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput()
        .appendField('primary DCA')
        .appendField(sub('z'))
        .appendField(' cut');
      this.setOutput(true, 'Number');
      this.setColour(65);
      this.setTooltip(
        'Analysis cut on |DCA_z|: the template physicists chose for this MasterClass (not a number you invent)',
      );
    },
  };
}

export function buildPrimaryFilterToolbox(): Blockly.utils.toolbox.ToolboxInfo {
  return {
    kind: 'flyoutToolbox',
    contents: [
      { kind: 'block', type: 'nmf_charge' },
      { kind: 'block', type: 'nmf_number' },
      { kind: 'block', type: 'nmf_dca_xy' },
      { kind: 'block', type: 'nmf_dca_z' },
      { kind: 'block', type: 'nmf_abs' },
      { kind: 'block', type: 'nmf_dca_cut_xy' },
      { kind: 'block', type: 'nmf_dca_cut_z' },
      { kind: 'block', type: 'nmf_compare' },
      { kind: 'block', type: 'nmf_filter_and' },
      { kind: 'block', type: 'nmf_filter_or' },
      { kind: 'block', type: 'nmf_if' },
      { kind: 'block', type: 'nmf_keep_track' },
    ],
  };
}

export function createPrimaryFilterLightTheme(): Blockly.Theme {
  return Blockly.Theme.defineTheme('nmfFilterLight', {
    name: 'nmfFilterLight',
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: '#ffffff',
      toolboxBackgroundColour: '#f1f5f9',
      toolboxForegroundColour: '#0f172a',
      flyoutBackgroundColour: '#f8fafc',
      flyoutForegroundColour: '#0f172a',
      flyoutOpacity: 1,
      scrollbarColour: '#94a3b8',
      insertionMarkerColour: '#38bdf8',
      insertionMarkerOpacity: 0.4,
      scrollbarOpacity: 0.5,
      cursorColour: '#0f172a',
    },
  });
}

function isChargeValue(block: Blockly.Block): boolean {
  return block.type === 'nmf_charge';
}

function isNumberLiteral(block: Blockly.Block, value: number): boolean {
  return block.type === 'nmf_number' && Number(block.getFieldValue('NUM')) === value;
}

/** True for `charge = n` or `n = charge`. */
function isChargeEquals(block: Blockly.Block, value: number): boolean {
  if (block.type !== 'nmf_compare' || block.getFieldValue('OP') !== 'EQ') {
    return false;
  }
  const a = block.getInputTargetBlock('A');
  const b = block.getInputTargetBlock('B');
  if (!a || !b) {
    return false;
  }
  return (
    (isChargeValue(a) && isNumberLiteral(b, value)) ||
    (isChargeValue(b) && isNumberLiteral(a, value))
  );
}

/** True for `charge ≠ 0` or `0 ≠ charge`. */
function isChargeNotZero(block: Blockly.Block): boolean {
  if (block.type !== 'nmf_compare' || block.getFieldValue('OP') !== 'NEQ') {
    return false;
  }
  const a = block.getInputTargetBlock('A');
  const b = block.getInputTargetBlock('B');
  if (!a || !b) {
    return false;
  }
  return (
    (isChargeValue(a) && isNumberLiteral(b, 0)) ||
    (isChargeValue(b) && isNumberLiteral(a, 0))
  );
}

/**
 * Charged-track check: `charge ≠ 0`, or `(charge = 1) OR (charge = −1)`
 * (either OR operand order).
 */
function isChargedExpr(block: Blockly.Block): boolean {
  if (isChargeNotZero(block)) {
    return true;
  }
  if (block.type !== 'nmf_filter_or') {
    return false;
  }
  const a = block.getInputTargetBlock('A');
  const b = block.getInputTargetBlock('B');
  if (!a || !b) {
    return false;
  }
  return (
    (isChargeEquals(a, 1) && isChargeEquals(b, -1)) ||
    (isChargeEquals(a, -1) && isChargeEquals(b, 1))
  );
}

function isAbsOf(block: Blockly.Block, innerType: string): boolean {
  if (block.type !== 'nmf_abs') {
    return false;
  }
  const inner = block.getInputTargetBlock('NUM');
  return !!inner && inner.type === innerType;
}

/** `|DCA_xy to PV| < primary DCA cut (xy)`. */
function isDcaXyPassesCut(block: Blockly.Block): boolean {
  if (block.type !== 'nmf_compare' || block.getFieldValue('OP') !== 'LT') {
    return false;
  }
  const a = block.getInputTargetBlock('A');
  const b = block.getInputTargetBlock('B');
  if (!a || !b) {
    return false;
  }
  return isAbsOf(a, 'nmf_dca_xy') && b.type === 'nmf_dca_cut_xy';
}

/** `|DCA_z to PV| < primary DCA cut (z)`. */
function isDcaZPassesCut(block: Blockly.Block): boolean {
  if (block.type !== 'nmf_compare' || block.getFieldValue('OP') !== 'LT') {
    return false;
  }
  const a = block.getInputTargetBlock('A');
  const b = block.getInputTargetBlock('B');
  if (!a || !b) {
    return false;
  }
  return isAbsOf(a, 'nmf_dca_z') && b.type === 'nmf_dca_cut_z';
}

/** Flatten nested ANDs into leaf boolean expressions. */
function flattenAndLeaves(block: Blockly.Block): Blockly.Block[] {
  if (block.type === 'nmf_filter_and') {
    const a = block.getInputTargetBlock('A');
    const b = block.getInputTargetBlock('B');
    return [...(a ? flattenAndLeaves(a) : []), ...(b ? flattenAndLeaves(b) : [])];
  }
  return [block];
}

/**
 * Valid physicist primary filter (MasterClass DCA algorithm):
 *   if (
 *     charged
 *     AND |DCA_xy| < primary DCA cut (xy)
 *     AND |DCA_z|  < primary DCA cut (z)
 *   ) then keep track
 *
 * Nested AND order is free. Charged is `charge ≠ 0` or `(charge = 1) OR (charge = −1)`.
 * Cuts are named analysis blocks — not typed centimetre literals.
 */
export function isValidPrimaryFilter(workspace: Blockly.Workspace): boolean {
  const tops = workspace.getTopBlocks(true);
  const ifBlock = tops.find((b) => b.type === 'nmf_if');
  if (!ifBlock) {
    return false;
  }
  const cond = ifBlock.getInputTargetBlock('COND');
  if (!cond) {
    return false;
  }
  const leaves = flattenAndLeaves(cond);
  if (leaves.length !== 3) {
    return false;
  }
  let charged = false;
  let xy = false;
  let z = false;
  for (const leaf of leaves) {
    if (isChargedExpr(leaf)) {
      if (charged) {
        return false;
      }
      charged = true;
    } else if (isDcaXyPassesCut(leaf)) {
      if (xy) {
        return false;
      }
      xy = true;
    } else if (isDcaZPassesCut(leaf)) {
      if (z) {
        return false;
      }
      z = true;
    } else {
      return false;
    }
  }
  if (!charged || !xy || !z) {
    return false;
  }
  const body = ifBlock.getInputTargetBlock('DO');
  return !!body && body.type === 'nmf_keep_track' && !body.getNextBlock();
}
