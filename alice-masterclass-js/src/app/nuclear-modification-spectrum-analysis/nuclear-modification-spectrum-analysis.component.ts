import { Component, OnInit, Type, ViewChild } from '@angular/core';

import { InstructionsProvider } from '../shared/interfaces';
import {
  RaaAnalysisResult,
  RaaPipelineStep,
  RaaPlotSeries,
} from '../shared/models/raa/raa';
import { RaaAnalysisService } from '../services/raa-analysis.service';
import { RaaDataService } from '../services/raa-data.service';
import { InstructionsComponent } from './instructions/instructions.component';
import { NmfBlocklyWorkspaceComponent } from './blockly-workspace/blockly-workspace.component';

@Component({
  selector: 'app-nuclear-modification-spectrum-analysis',
  templateUrl: './nuclear-modification-spectrum-analysis.component.html',
  styleUrls: ['./nuclear-modification-spectrum-analysis.component.scss'],
  standalone: false,
})
export class NuclearModificationSpectrumAnalysisComponent
  implements OnInit, InstructionsProvider
{
  instructionsComponent: Type<any> = InstructionsComponent;

  @ViewChild(NmfBlocklyWorkspaceComponent)
  blockly?: NmfBlocklyWorkspaceComponent;

  pipeline: RaaPipelineStep[] = [];
  running = false;
  valid: boolean | null = null;
  warnings: string[] = [];

  ptSpectra: RaaPlotSeries[] = [];
  raa: RaaPlotSeries[] = [];
  rcp: RaaPlotSeries[] = [];
  extract: Record<string, { value: number; error: number }> = {};
  centralityBins: string[] = [];
  binCount = 0;

  constructor(
    private readonly analysis: RaaAnalysisService,
    private readonly data: RaaDataService,
  ) {}

  ngOnInit(): void {
    this.data.getMetadata().subscribe((meta) => {
      this.centralityBins = meta.centralityBins;
      this.binCount = Math.max(meta.bins.length - 1, 0);
    });
  }

  onPipelineChange(steps: RaaPipelineStep[]): void {
    this.pipeline = steps;
  }

  onRun(): void {
    const steps = this.blockly?.getPipeline() ?? this.pipeline;
    this.running = true;
    this.analysis.run(steps).subscribe({
      next: (result: RaaAnalysisResult) => {
        this.valid = result.valid;
        this.warnings = result.warnings;
        this.ptSpectra = result.ptSpectra;
        this.raa = result.raa;
        this.rcp = result.rcp;
        this.extract = result.extract;
        this.running = false;
      },
      error: () => {
        this.running = false;
        this.valid = false;
        this.warnings = ['Failed to run analysis.'];
      },
    });
  }

  onClear(): void {
    this.blockly?.clearWorkspace();
    this.valid = null;
    this.warnings = [];
    this.ptSpectra = [];
    this.raa = [];
    this.rcp = [];
    this.extract = {};
  }
}
