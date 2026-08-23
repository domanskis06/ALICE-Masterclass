import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as Blockly from 'blockly';

import {
  NmfDockedFlyout,
  NmfDockedMetricsManager,
  dockedPickerLayout,
} from '../../shared/blockly/nmf-docked-flyout';
import {
  buildPrimaryFilterToolbox,
  buildValidPrimaryFilter,
  createPrimaryFilterLightTheme,
  isValidPrimaryFilter,
  registerPrimaryFilterBlocks,
} from './primary-filter-blockly';

/** Breathing room between the last category row and the block list under it. */
const RAIL_GAP = 8;

@Component({
  selector: 'app-nmf-filter-builder',
  templateUrl: './filter-builder.component.html',
  styleUrls: ['./filter-builder.component.scss'],
  standalone: false,
})
export class NmfFilterBuilderComponent implements AfterViewInit, OnDestroy {
  @ViewChild('blocklyDiv', { static: true }) blocklyDiv!: ElementRef<HTMLDivElement>;

  @Output() filterAccepted = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();

  /**
   * Whether the panel may be dismissed. The host keeps this false until a valid
   * filter has been submitted: building the filter is the one step the rest of
   * the exercise depends on, so there must be no way to click past it.
   */
  @Input() dismissible = true;

  /**
   * Shows the "Build it for me" escape hatch. The host only sets this when the
   * student skipped the guided tutorial — someone running the exercise without
   * the tour still needs a way to get past this step.
   */
  @Input() autoBuildAvailable = false;

  /**
   * Shows the "why we do not click forever" note above the task. Set on the
   * workshop path, where the builder opens right after the student has
   * hand-picked every primary of one event and the point needs making.
   */
  @Input() showHandPickingNote = false;

  submitError = '';
  submitSuccess = '';

  private workspace: Blockly.WorkspaceSvg | null = null;
  private resizeObserver?: ResizeObserver;
  /** The category the docked picker shows; it is never allowed to close. */
  private pickerCategory = 0;

  ngAfterViewInit(): void {
    registerPrimaryFilterBlocks();
    this.workspace = Blockly.inject(this.blocklyDiv.nativeElement, {
      toolbox: buildPrimaryFilterToolbox(),
      theme: createPrimaryFilterLightTheme(),
      // Same docked picker as Spectrum Analysis's Blockly workspace: the block
      // list sits under the category rail instead of flying out over the canvas.
      plugins: {
        flyoutsVerticalToolbox: NmfDockedFlyout,
        metricsManager: NmfDockedMetricsManager,
      },
      trashcan: false,
      scrollbars: true,
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 20, length: 2, colour: '#e2e8f0', snap: true },
      zoom: { controls: false, wheel: true, startScale: 1 },
      media: 'assets/blockly/media/',
    });

    this.workspace.addChangeListener(this.onWorkspaceChange);
    this.layOutPicker();

    this.resizeObserver = new ResizeObserver(() => {
      if (this.workspace) {
        Blockly.svgResize(this.workspace);
      }
    });
    this.resizeObserver.observe(this.blocklyDiv.nativeElement);
    // Overlay / tour mount can settle a frame later; resize twice so the flyout is hittable.
    for (const delay of [0, 50, 200]) {
      setTimeout(() => {
        if (this.workspace) {
          Blockly.svgResize(this.workspace);
        }
      }, delay);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.workspace?.removeChangeListener(this.onWorkspaceChange);
    this.workspace?.dispose();
    this.workspace = null;
  }

  onSubmit(): void {
    this.submitError = '';
    this.submitSuccess = '';
    if (!this.workspace || !isValidPrimaryFilter(this.workspace)) {
      this.submitError =
        'Not quite. You need all three:' +
        '<ul class="nmf-filter-error-list">' +
        '<li>charged (hint: charge ≠ 0)</li>' +
        '<li>|DCA<sub>xy</sub>| &lt; primary DCA<sub>xy</sub> cut</li>' +
        '<li>|DCA<sub>z</sub>| &lt; primary DCA<sub>z</sub> cut</li>' +
        '</ul>';
      return;
    }
    this.submitSuccess =
      'Well done! Now we’ve got a filter, no more clicking tracks by hand. Let’s move on with the analysis.';
    this.filterAccepted.emit();
  }

  onClose(): void {
    this.closed.emit();
  }

  onAutoBuild(): void {
    if (!this.workspace) {
      return;
    }
    buildValidPrimaryFilter(this.workspace);
    this.submitError = '';
    this.submitSuccess = '';
  }

  /* —— docked picker —— */

  private readonly onWorkspaceChange = (event: Blockly.Events.Abstract): void => {
    if (event.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
      this.rememberOrRestoreCategory();
    }
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
    // flyout — a visible flash for no reason.
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
   * category list. The width is the widest the picker ever needs, found by
   * opening each category once while `dockedPickerLayout.width` is still zero,
   * at which point the picker reports its natural width instead of the pinned one.
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
    return this.blocklyDiv.nativeElement.querySelector<HTMLElement>('.blocklyToolboxDiv');
  }
}
