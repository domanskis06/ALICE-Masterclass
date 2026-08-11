import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { AngularModule } from '../shared/angular.module';

import { StrangenessLargeScaleAnalysisComponent } from './strangeness-large-scale-analysis.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { HistogramSelectorComponent } from './histogram-selector/histogram-selector.component';
import { HistogramDisplayComponent } from './histogram-display/histogram-display.component';
import { ResultsComponent } from './results/results.component'
import { EnhancementResultsComponent } from './enhancement-results/enhancement-results.component';
import { EnhancementPlotComponent } from './enhancement-plot/enhancement-plot.component';
import { FitService } from '../shared/services/fit.service';
import { LsaTutorialService } from './lsa-tutorial/lsa-tutorial.service';
import { LsaTutorialWelcomeDialogComponent } from './lsa-tutorial/lsa-tutorial-welcome-dialog.component';

@NgModule({
  declarations: [
    StrangenessLargeScaleAnalysisComponent,
    InstructionsComponent,
    HistogramSelectorComponent,
    HistogramDisplayComponent,
    ResultsComponent,
    EnhancementResultsComponent,
    EnhancementPlotComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    LsaTutorialWelcomeDialogComponent,
  ],
  providers: [
    FitService,
    LsaTutorialService,
  ]
})
export class StrangenessLargeScaleAnalysisModule { }
