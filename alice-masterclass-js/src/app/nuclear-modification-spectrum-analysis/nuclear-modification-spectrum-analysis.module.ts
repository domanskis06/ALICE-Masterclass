import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../shared/shared.module';
import { AngularModule } from '../shared/angular.module';

import { NuclearModificationSpectrumAnalysisRoutingModule } from './nuclear-modification-spectrum-analysis-routing.module';
import { NuclearModificationSpectrumAnalysisComponent } from './nuclear-modification-spectrum-analysis.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { NmfBlocklyWorkspaceComponent } from './blockly-workspace/blockly-workspace.component';
import { NmfPipelineProblemsComponent } from './pipeline-problems/pipeline-problems.component';
import { NmfRaaPlotsComponent } from './raa-plots/raa-plots.component';
import { NmfSeriesPlotComponent } from './series-plot/series-plot.component';
import { NmfHeatmapPlotComponent } from './heatmap-plot/heatmap-plot.component';
import { NmfPlotDialogComponent } from './plot-dialog/plot-dialog.component';
import { NmfCentralityTableComponent } from './centrality-table/centrality-table.component';
import { NmfResultsTableComponent } from './results-table/results-table.component';
import { NmfSaTutorialService } from './sa-tutorial/sa-tutorial.service';

@NgModule({
  declarations: [
    NuclearModificationSpectrumAnalysisComponent,
    InstructionsComponent,
    NmfBlocklyWorkspaceComponent,
    NmfPipelineProblemsComponent,
    NmfRaaPlotsComponent,
    NmfSeriesPlotComponent,
    NmfHeatmapPlotComponent,
    NmfPlotDialogComponent,
    NmfCentralityTableComponent,
    NmfResultsTableComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    NuclearModificationSpectrumAnalysisRoutingModule,
  ],
  // Tour state is per-visit, so it must not outlive the lazily loaded module.
  providers: [NmfSaTutorialService],
})
export class NuclearModificationSpectrumAnalysisModule {}
