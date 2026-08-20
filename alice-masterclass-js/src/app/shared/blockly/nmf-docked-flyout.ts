import * as Blockly from 'blockly';

/**
 * A block picker docked into the toolbox column instead of Blockly's default
 * flyout, which slides out over the canvas and disappears again.
 *
 * The left strip is category list on top, the selected category's blocks stacked
 * underneath it, filling the rest of the column. Nothing about dragging changes:
 * this is still a real Blockly flyout attached to the same target workspace, so
 * the gesture that lifts a block out of it is Blockly's own.
 *
 * Both classes are handed to a single `Blockly.inject` through its `plugins`
 * option rather than registered globally, so each Blockly injection in the app
 * (Event Exploration's primary filter, Spectrum Analysis's recipe) opts in on
 * its own instead of this becoming Blockly's default everywhere.
 */

/** Geometry of the picker, in pixels of the injection div. */
export const dockedPickerLayout = {
  /** Top of the picker: the bottom of the category list above it. */
  top: 0,
  /**
   * Width of the whole strip. Zero means "not measured yet" — the picker then
   * reports its natural width, which is how the component measures it.
   */
  width: 0,
};

/**
 * Blocks are drawn slightly smaller in the picker than on the canvas, so the
 * strip the picker needs stays a third of the column rather than half of it.
 */
const PICKER_SCALE = 0.85;

export class NmfDockedFlyout extends Blockly.VerticalFlyout {
  constructor(options: Blockly.Options) {
    super(options);
    // Pinned. Blockly reads this in several places: the toolbox stops clearing
    // the selection when the canvas is clicked, and the strip becomes a valid
    // drop target for deleting a block again.
    this.autoClose = false;
  }

  override getFlyoutScale(): number {
    return PICKER_SCALE;
  }

  /** Flush with the left edge of the strip, under the category list. */
  override getX(): number {
    return 0;
  }

  override getY(): number {
    return dockedPickerLayout.top;
  }

  override position(): void {
    if (!this.isVisible() || !this.targetWorkspace?.isVisible()) {
      return;
    }
    const view = this.targetWorkspace.getMetricsManager().getViewMetrics();
    const y = this.getY();
    this.height_ = Math.max(0, view.height - y);

    // Square corners: the picker is flush inside the strip, so the rounded
    // pop-out shape Blockly draws would only bite into the block list.
    this.svgBackground_?.setAttribute(
      'd',
      `M 0,0 h ${this.width_} v ${this.height_} h ${-this.width_} z`,
    );

    this.positionAt_(this.width_, this.height_, this.getX(), y);
  }

  /**
   * Blockly sizes a flyout to its widest block, so every category would give the
   * strip a different width. Pin it to the measured maximum instead — the strip
   * has to stand still while the student clicks between categories.
   */
  protected override reflowInternal_(): void {
    super.reflowInternal_();
    if (dockedPickerLayout.width && this.width_ !== dockedPickerLayout.width) {
      this.width_ = dockedPickerLayout.width;
      this.position();
    }
  }
}

/**
 * The picker lives inside the column the toolbox already reserves, so — unlike a
 * normal pinned flyout — it must not push the canvas further right a second
 * time. Zeroing its width is exactly that statement.
 */
export class NmfDockedMetricsManager extends Blockly.MetricsManager {
  override getFlyoutMetrics(opt_own?: boolean): Blockly.MetricsManager.ToolboxMetrics {
    return { ...super.getFlyoutMetrics(opt_own), width: 0 };
  }
}
