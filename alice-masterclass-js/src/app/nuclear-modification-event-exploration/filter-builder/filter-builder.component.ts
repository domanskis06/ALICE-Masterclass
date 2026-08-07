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
      trashcan: true,
      scrollbars: true,
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 22, length: 2, colour: '#dbe3ee', snap: true },
      zoom: { controls: true, wheel: true, startScale: 1 },
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
        'Your filter is incomplete. Keep the track when it is charged AND |DCA_xy| < primary DCA cut (xy) AND |DCA_z| < primary DCA cut (z).';
      return;
    }
    this.submitSuccess =
      'Correct! You built the DCA primary-track filter physicists use in this MasterClass.';
    this.filterAccepted.emit();
  }

  onClose(): void {
    this.closed.emit();
  }
}
