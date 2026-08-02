import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../shared/shared.module';
import { AngularModule } from '../shared/angular.module';

import { NuclearModificationSpectrumAnalysisRoutingModule } from './nuclear-modification-spectrum-analysis-routing.module';
import { NuclearModificationSpectrumAnalysisComponent } from './nuclear-modification-spectrum-analysis.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { NmfBlocklyWorkspaceComponent } from './blockly-workspace/blockly-workspace.component';
import { NmfPipelineRunBarComponent } from './pipeline-run-bar/pipeline-run-bar.component';
import { NmfRaaPlotsComponent } from './raa-plots/raa-plots.component';
import { NmfExtractPanelComponent } from './extract-panel/extract-panel.component';

@NgModule({
  declarations: [
    NuclearModificationSpectrumAnalysisComponent,
    InstructionsComponent,
    NmfBlocklyWorkspaceComponent,
    NmfPipelineRunBarComponent,
    NmfRaaPlotsComponent,
    NmfExtractPanelComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    NuclearModificationSpectrumAnalysisRoutingModule,
  ],
})
export class NuclearModificationSpectrumAnalysisModule {}
