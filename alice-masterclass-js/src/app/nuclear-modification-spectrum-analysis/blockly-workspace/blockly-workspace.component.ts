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

import { RaaPipelineStep } from '../../shared/models/raa/raa';
import {
  buildRaaToolbox,
  createRaaDarkTheme,
  pipelineFromWorkspace,
  registerRaaBlocks,
  seedStarterPipeline,
} from './raa-blockly';

@Component({
  selector: 'app-nmf-blockly-workspace',
  templateUrl: './blockly-workspace.component.html',
  styleUrls: ['./blockly-workspace.component.scss'],
  standalone: false,
})
export class NmfBlocklyWorkspaceComponent implements AfterViewInit, OnDestroy {
  @ViewChild('blocklyDiv', { static: true }) blocklyDiv!: ElementRef<HTMLDivElement>;

  @Output() pipelineChange = new EventEmitter<RaaPipelineStep[]>();

  private workspace: Blockly.WorkspaceSvg | null = null;
  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    registerRaaBlocks();
    const theme = createRaaDarkTheme();
    this.workspace = Blockly.inject(this.blocklyDiv.nativeElement, {
      toolbox: buildRaaToolbox(),
      theme,
      trashcan: true,
      scrollbars: true,
      move: { scrollbars: true, drag: true, wheel: true },
      grid: { spacing: 20, length: 2, colour: '#1e293b', snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.95 },
      media: 'assets/blockly/media/',
    });

    seedStarterPipeline(this.workspace);
    this.emitPipeline();
    this.workspace.addChangeListener(() => this.emitPipeline());

    this.resizeObserver = new ResizeObserver(() => {
      if (this.workspace) {
        Blockly.svgResize(this.workspace);
      }
    });
    this.resizeObserver.observe(this.blocklyDiv.nativeElement);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.workspace?.dispose();
    this.workspace = null;
  }

  clearWorkspace(): void {
    this.workspace?.clear();
    this.emitPipeline();
  }

  getPipeline(): RaaPipelineStep[] {
    return this.workspace ? pipelineFromWorkspace(this.workspace) : [];
  }

  private emitPipeline(): void {
    this.pipelineChange.emit(this.getPipeline());
  }
}
