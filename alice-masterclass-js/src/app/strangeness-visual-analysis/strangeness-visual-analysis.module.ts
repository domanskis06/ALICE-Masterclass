import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '../shared/shared.module';
import { AngularModule } from '../shared/angular.module';

import { StrangenessVisualAnalysisRoutingModule } from './strangeness-visual-analysis-routing.module';

import { StrangenessVisualAnalysisComponent } from './strangeness-visual-analysis.component';
import { ParticleMassComponent } from './particle-mass/particle-mass.component';
import { CalculatorComponent } from './calculator/calculator.component';
import { MassHistogramsComponent } from './mass-histograms/mass-histograms.component';
import { InstructionsComponent } from './instructions/instructions.component';

@NgModule({
  declarations: [
    StrangenessVisualAnalysisComponent,
    ParticleMassComponent,
    CalculatorComponent,
    MassHistogramsComponent,
    InstructionsComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    StrangenessVisualAnalysisRoutingModule,
  ]
})
export class StrangenessVisualAnalysisModule { }
