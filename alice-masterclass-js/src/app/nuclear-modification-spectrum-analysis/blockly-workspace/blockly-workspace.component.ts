import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as Blockly from 'blockly';

import { RaaStep } from '../../shared/models/raa/spectrum';
import {
  NmfDockedFlyout,
  NmfDockedMetricsManager,
  dockedPickerLayout,
} from './nmf-docked-flyout';
import {
  appendRecipeBlocks,
  buildRaaToolbox,
  createRaaLightTheme,
  recipeFromWorkspace,
  registerRaaBlocks,
} from './raa-blockly';

/** Categories, in the order `buildRaaToolbox` lists them. */
const CATEGORY_INDEX: Record<string, number> = {
  events: 0,
  tracks: 1,
  normalise: 2,
  plot: 3,
};

/** Breathing room between the last category row and the block list under it. */
const RAIL_GAP = 8;

@Component({
  selector: 'app-nmf-blockly-workspace',
  templateUrl: './blockly-workspace.component.html',
  styleUrls: ['./blockly-workspace.component.scss'],
  standalone: false,
})
export class NmfBlocklyWorkspaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('blocklyDiv', { static: true }) blocklyDiv!: ElementRef<HTMLDivElement>;

  @Output() recipeChange = new EventEmitter<RaaStep[]>();

  /** Drives the "drag a block here" hint; false as soon as one block exists. */
  empty = true;

  private workspace: Blockly.WorkspaceSvg | null = null;
  private resizeObserver?: ResizeObserver;
  /** The category the docked picker shows; it is never allowed to close. */
  private pickerCategory = 0;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    registerRaaBlocks();
    this.workspace = Blockly.inject(this.blocklyDiv.nativeElement, {
      toolbox: buildRaaToolbox(),
      theme: createRaaLightTheme(),
      // The block picker is docked under the category list instead of flying out
      // over the canvas. Passed per injection, so exercise 1 keeps the stock one.
      plugins: {
        flyoutsVerticalToolbox: NmfDockedFlyout,
        metricsManager: NmfDockedMetricsManager,
      },
      // Same choices as the exercise-1 filter builder: dragging a block back to
      // the toolbox already deletes it, and zoom buttons only add clutter.
      trashcan: false,
      scrollbars: true,
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 22, length: 2, colour: '#1c3a6b', snap: true },
      zoom: { controls: false, wheel: true, startScale: 0.95 },
      media: 'assets/blockly/media/',
    });

    (window as any).__nmfSeed = (steps: RaaStep[]) => this.appendBlocks(steps);
    // The workspace stays empty: the student builds the chain from nothing.
    this.emitRecipe();
    this.workspace.addChangeListener(this.onWorkspaceChange);

    this.layOutPicker();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.workspace) {
        Blockly.svgResize(this.workspace);
      }
      this.publishStripWidth();
    });
    this.resizeObserver.observe(this.blocklyDiv.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.workspace?.removeChangeListener(this.onWorkspaceChange);
    this.workspace?.dispose();
    this.workspace = null;
  }

  clearWorkspace(): void {
    this.workspace?.clear();
    this.emitRecipe();
  }

  getRecipe(): RaaStep[] {
    return this.workspace ? recipeFromWorkspace(this.workspace) : [];
  }

  /** Tutorial: show the blocks the current step asks for. */
  openCategory(name: 'events' | 'tracks' | 'normalise' | 'plot'): void {
    this.selectCategory(CATEGORY_INDEX[name] ?? 0);
  }

  /** Tutorial escape hatch: place blocks the student could not drag. */
  appendBlocks(steps: RaaStep[]): void {
    if (!this.workspace) {
      return;
    }
    appendRecipeBlocks(this.workspace, steps);
    this.emitRecipe();
  }

  /* —— docked picker —— */

  /**
   * A block pulled out of the flyout is already a top-level block in the
   * workspace the instant the drag begins — Blockly fires BLOCK_CREATE and
   * SELECTED for it before it even fires its own BLOCK_DRAG(isStart: true),
   * so tracking "am I dragging" from event order alone missed exactly the
   * events that mattered most: reading the recipe on the CREATE event
   * counted the block before it was ever dropped and connected to anything,
   * which let a gated tutorial step pass on a block that was only passing
   * through the canvas, mid-air. `workspace.isDragging()` is Blockly's own
   * live state, current no matter which event triggered the check.
   */
  private readonly onWorkspaceChange = (event: Blockly.Events.Abstract): void => {
    if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
      this.rememberOrRestoreCategory();
      return;
    }
    // The drag-end event is the one guaranteed resync: always act on it, in
    // case isDragging() has already flipped back to false by the time this
    // runs (harmless either way, since emitRecipe is idempotent).
    if (event.type === Blockly.Events.BLOCK_DRAG && !(event as Blockly.Events.BlockDrag).isStart) {
      this.emitRecipe();
      return;
    }
    if (this.workspace?.isDragging()) {
      return;
    }
    this.emitRecipe();
  };

  /**
   * The picker is part of the column, not a pop-out, so "no category open" is
   * not a state the student can land in — clicking the open category again, or
   * anything else that clears the selection, re-opens the one that was showing.
   */
  private rememberOrRestoreCategory(): void {
    const toolbox = this.toolbox();
    if (!toolbox) {
      return;
    }
    const selected = toolbox.getSelectedItem();
    if (selected) {
      const index = toolbox.getToolboxItems().indexOf(selected);
      if (index >= 0) {
        this.pickerCategory = index;
      }
      return;
    }
    setTimeout(() => this.selectCategory(this.pickerCategory), 0);
  }

  private selectCategory(index: number): void {
    this.pickerCategory = index;
    const toolbox = this.toolbox();
    if (!toolbox) {
      return;
    }
    // Reselecting the category that is already open closes then reopens the
    // flyout — a visible flash when the tour asks for the same category
    // across several consecutive steps.
    const current = toolbox.getSelectedItem();
    if (current && toolbox.getToolboxItems().indexOf(current) === index) {
      return;
    }
    toolbox.selectItemByPosition(index);
  }

  private toolbox(): Blockly.Toolbox | null {
    return (this.workspace?.getToolbox() as Blockly.Toolbox | null) ?? null;
  }

  /**
   * Give the strip one width for every category and park the picker under the
   * category list.
   *
   * The width is the widest the picker ever needs, found by opening each
   * category once while `dockedPickerLayout.width` is still zero — at which
   * point the picker reports its natural width instead of the pinned one.
   */
  private layOutPicker(): void {
    const toolbox = this.toolbox();
    const flyout = toolbox?.getFlyout();
    if (!toolbox || !flyout) {
      return;
    }

    dockedPickerLayout.width = 0;
    let widest = 0;
    const categories = toolbox.getToolboxItems().length;
    for (let index = 0; index < categories; index++) {
      toolbox.selectItemByPosition(index);
      widest = Math.max(widest, flyout.getWidth());
    }
    dockedPickerLayout.width = Math.ceil(widest);

    const rail = this.rail();
    if (rail) {
      rail.style.width = `${dockedPickerLayout.width}px`;
    }
    dockedPickerLayout.top = this.railHeight();

    if (this.workspace) {
      Blockly.svgResize(this.workspace);
    }
    this.selectCategory(0);
    this.publishStripWidth();
  }

  /** Bottom of the category list, relative to the top of the injection div. */
  private railHeight(): number {
    const rail = this.rail();
    const rows = rail?.querySelector<HTMLElement>('.blocklyToolboxContents');
    if (!rail || !rows) {
      return 0;
    }
    return Math.ceil(rows.getBoundingClientRect().bottom - rail.getBoundingClientRect().top) + RAIL_GAP;
  }

  private rail(): HTMLElement | null {
    return this.blocklyDiv.nativeElement.querySelector<HTMLElement>(
      '.blocklyToolboxDiv',
    );
  }

  private emitRecipe(): void {
    const wasEmpty = this.empty;
    this.empty = (this.workspace?.getAllBlocks(false).length ?? 0) === 0;
    if (wasEmpty !== this.empty) {
      this.cdr.markForCheck();
    }
    this.recipeChange.emit(this.getRecipe());
  }

  /**
   * The strip is sized by Blockly, so the empty-state hint — which must sit
   * beside it, never over it — can only learn that width at runtime.
   */
  private publishStripWidth(): void {
    const rail = this.rail();
    if (rail) {
      this.host.nativeElement.style.setProperty(
        '--nmf-toolbox-w',
        `${Math.round(rail.getBoundingClientRect().width)}px`,
      );
    }
  }
}
