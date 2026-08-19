import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { NuclearModificationEventExplorationComponent } from './nuclear-modification-event-exploration.component';
import { NmfCollectPlotsComponent } from './collect-plots/collect-plots.component';
import { RaaCollectPlotComponent } from './raa-collect-plot/raa-collect-plot.component';
import { NmfResultsComponent } from './results/results.component';
import { NmfInstructionsComponent } from './instructions/instructions.component';

@NgModule({
  declarations: [
    NuclearModificationEventExplorationComponent,
    NmfCollectPlotsComponent,
    RaaCollectPlotComponent,
    NmfResultsComponent,
    NmfInstructionsComponent,
  ],
  imports: [CommonModule, AngularModule, SharedModule],
})
export class NuclearModificationEventExplorationModule {}
