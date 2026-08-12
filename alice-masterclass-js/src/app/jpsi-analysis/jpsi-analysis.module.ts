import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { DatasetToolbarComponent } from './components/dataset-toolbar/dataset-toolbar.component';
import { MassPanelComponent } from './components/mass-panel/mass-panel.component';
import { PbPbResultsComponent } from './components/pbpb-results/pbpb-results.component';
import { PidCutControlsComponent } from './components/pid-cut-controls/pid-cut-controls.component';
import { PidHeatmapComponent } from './components/pid-heatmap/pid-heatmap.component';
import { PidReferenceDialogComponent } from './components/pid-reference-dialog/pid-reference-dialog.component';
import { ResultsTableComponent } from './components/results-table/results-table.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { JpsiAnalysisComponent } from './jpsi-analysis.component';
import { JpsiAnalysisStateService } from './services/jpsi-analysis-state.service';
import { JpsiDataService } from './services/jpsi-data.service';
import { JpsiMinvDataService } from './services/jpsi-minv-data.service';
import { JpsiPairingService } from './services/jpsi-pairing.service';
import { JpsiQuickAnalysisService } from './services/jpsi-quick-analysis.service';
import { JpsiResidualFitService } from './services/jpsi-residual-fit.service';
import { JpsiSignalService } from './services/jpsi-signal.service';
import { JpsiTutorialService } from './services/jpsi-tutorial.service';
import { PbPbMinvStateService } from './services/pbpb-minv-state.service';
import { JpsiWelcomeDialogComponent } from './welcome/jpsi-welcome-dialog.component';

@NgModule({
  declarations: [
    JpsiAnalysisComponent,
    InstructionsComponent,
    DatasetToolbarComponent,
    PidHeatmapComponent,
    PidCutControlsComponent,
    MassPanelComponent,
    ResultsTableComponent,
    PbPbResultsComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    // Not part of the shared AngularModule barrel; only this exercise needs it.
    MatProgressBarModule,
    JpsiWelcomeDialogComponent,
    PidReferenceDialogComponent,
  ],
  providers: [
    JpsiDataService,
    JpsiPairingService,
    JpsiSignalService,
    JpsiResidualFitService,
    JpsiAnalysisStateService,
    JpsiQuickAnalysisService,
    JpsiTutorialService,
    JpsiMinvDataService,
    // Module-scoped (not component-scoped) so accepted Pb-Pb rows — and the preloaded
    // histograms — survive navigating away from /jpsi-analysis and back; only in-progress,
    // unaccepted fit state is cleared on the way out (see resetForNewSession()).
    PbPbMinvStateService,
  ],
})
export class JpsiAnalysisModule {}
