import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../shared/shared.module';
import { AngularModule } from '../shared/angular.module';

import { NmfEeTutorialService } from './ee-tutorial/ee-tutorial.service';
import { NmfEeTutorialWelcomeDialogComponent } from './ee-tutorial/ee-tutorial-welcome-dialog.component';
import { NmfAnalysisPanelComponent } from './analysis-panel/analysis-panel.component';
import { NmfHistogramDialogComponent } from './histogram-dialog/histogram-dialog.component';
import { NmfQuickRaaComponent } from './quick-raa/quick-raa.component';
import { NmfFilterBuilderComponent } from './filter-builder/filter-builder.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { NuclearModificationEventExplorationComponent } from './nuclear-modification-event-exploration.component';
import { NuclearModificationEventExplorationRoutingModule } from './nuclear-modification-event-exploration-routing.module';
import { NmfEventCharacteristicsComponent } from './event-characteristics/event-characteristics.component';

@NgModule({
  declarations: [
    NuclearModificationEventExplorationComponent,
    InstructionsComponent,
    NmfEventCharacteristicsComponent,
    NmfHistogramDialogComponent,
    NmfAnalysisPanelComponent,
    NmfQuickRaaComponent,
    NmfFilterBuilderComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    NuclearModificationEventExplorationRoutingModule,
    NmfEeTutorialWelcomeDialogComponent,
  ],
  providers: [NmfEeTutorialService],
})
export class NuclearModificationEventExplorationModule {}
