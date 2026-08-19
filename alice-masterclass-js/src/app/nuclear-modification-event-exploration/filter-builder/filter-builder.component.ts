import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  Output,
  ViewChild,
} from '@angular/core';
import * as Blockly from 'blockly';

import {
  buildPrimaryFilterToolbox,
  createPrimaryFilterLightTheme,
  isValidPrimaryFilter,
  registerPrimaryFilterBlocks,
} from './primary-filter-blockly';

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

  submitError = '';
  submitSuccess = '';

  private workspace: Blockly.WorkspaceSvg | null = null;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    registerPrimaryFilterBlocks();
    this.workspace = Blockly.inject(this.blocklyDiv.nativeElement, {
      toolbox: buildPrimaryFilterToolbox(),
      theme: createPrimaryFilterLightTheme(),
      trashcan: false,
      scrollbars: true,
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 20, length: 2, colour: '#e2e8f0', snap: true },
      zoom: { controls: false, wheel: true, startScale: 1 },
      media: 'assets/blockly/media/',
    });

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
    this.workspace?.dispose();
    this.workspace = null;
  }

  onSubmit(): void {
    this.submitError = '';
    this.submitSuccess = '';
    if (!this.workspace || !isValidPrimaryFilter(this.workspace)) {
      this.submitError =
        'Not quite. You need all three: (1) charged — use charge ≠ 0, or (charge = 1) OR (charge = −1); ' +
        '(2) |DCA<sub>xy</sub>| &lt; primary DCA<sub>xy</sub> cut — wrap DCA<sub>xy</sub> in the |…| block and use the xy cut; ' +
        '(3) |DCA<sub>z</sub>| &lt; primary DCA<sub>z</sub> cut — same with the z cut (not the xy one).';
      return;
    }
    this.submitSuccess =
      'Well done! Now we’ve got a filter — no more clicking tracks by hand. Let’s move on with the analysis.';
    this.filterAccepted.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
