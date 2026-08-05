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
import { LetsUsPanelComponent } from './lets-us-panel/lets-us-panel.component';
import { VaTutorialService } from './va-tutorial/va-tutorial.service';
import { VaTutorialWelcomeDialogComponent } from './va-tutorial/va-tutorial-welcome-dialog.component';

@NgModule({
  declarations: [
    StrangenessVisualAnalysisComponent,
    ParticleMassComponent,
    CalculatorComponent,
    MassHistogramsComponent,
    InstructionsComponent,
    LetsUsPanelComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    StrangenessVisualAnalysisRoutingModule,
    VaTutorialWelcomeDialogComponent,
  ],
  providers: [
    VaTutorialService,
  ],
})
export class StrangenessVisualAnalysisModule { }
