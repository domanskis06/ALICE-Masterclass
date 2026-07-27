import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CentralityNamePipe, StrangenessLargeScaleAnalysisComponent } from './strangeness-large-scale-analysis.component';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';
import { StrangenessEnhancementPlotComponent } from './strangeness-enhancement-plot/strangeness-enhancement-plot.component';
import { ResultsComponent } from './results/results.component';
import { InstructionsComponent } from './instructions/instructions.component';

@NgModule({
  declarations: [
    StrangenessLargeScaleAnalysisComponent,
    StrangenessEnhancementPlotComponent,
    ResultsComponent,
    CentralityNamePipe,
    InstructionsComponent
  ],
  imports: [
    CommonModule,
    AngularModule,
    SharedModule
  ]
})
export class StrangenessLargeScaleAnalysisModule { }
