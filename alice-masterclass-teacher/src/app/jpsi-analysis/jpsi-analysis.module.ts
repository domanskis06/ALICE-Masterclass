import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { JpsiAnalysisComponent } from './jpsi-analysis.component';
import { RaaPlotComponent } from './raa-plot/raa-plot.component';
import { ResultsComponent } from './results/results.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { JpsiRaaService } from './jpsi-raa.service';

@NgModule({
  declarations: [
    JpsiAnalysisComponent,
    RaaPlotComponent,
    ResultsComponent,
    InstructionsComponent
  ],
  imports: [
    CommonModule,
    AngularModule,
    SharedModule
  ],
  providers: [
    JpsiRaaService
  ]
})
export class JpsiAnalysisModule { }
