import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StrangenessVisualAnalysisComponent } from './strangeness-visual-analysis.component';
import { MassHistogramsComponent } from './mass-histograms/mass-histograms.component';
import { ResultsComponent } from './results/results.component';
import { InstructionsComponent } from './instructions/instructions.component';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

@NgModule({
  declarations: [
    StrangenessVisualAnalysisComponent,
    MassHistogramsComponent,
    ResultsComponent,
    InstructionsComponent
  ],
  imports: [
    CommonModule,
    AngularModule,
    SharedModule
  ]
})
export class StrangenessVisualAnalysisModule { }
