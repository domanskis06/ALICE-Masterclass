import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../shared/shared.module';
import { AngularModule } from '../shared/angular.module';

import { NuclearModificationEventExplorationRoutingModule } from './nuclear-modification-event-exploration-routing.module';
import { NuclearModificationEventExplorationComponent } from './nuclear-modification-event-exploration.component';
import { InstructionsComponent } from './instructions/instructions.component';
import { NmfEventCharacteristicsComponent } from './event-characteristics/event-characteristics.component';
import { NmfHistogramDialogComponent } from './histogram-dialog/histogram-dialog.component';
import { NmfQuickRaaComponent } from './quick-raa/quick-raa.component';
import { NmfFilterBuilderComponent } from './filter-builder/filter-builder.component';
import { NmfEeTutorialService } from './ee-tutorial/ee-tutorial.service';
import { NmfEeTutorialWelcomeDialogComponent } from './ee-tutorial/ee-tutorial-welcome-dialog.component';
import { NmfHistogramHelpDialogComponent } from './histogram-help-dialog/histogram-help-dialog.component';
import { NmfAnalysisDialogComponent } from './analysis-dialog/analysis-dialog.component';

@NgModule({
  declarations: [
    NuclearModificationEventExplorationComponent,
    InstructionsComponent,
    NmfEventCharacteristicsComponent,
    NmfHistogramDialogComponent,
    NmfAnalysisDialogComponent,
    NmfQuickRaaComponent,
    NmfFilterBuilderComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    AngularModule,
    NuclearModificationEventExplorationRoutingModule,
    NmfEeTutorialWelcomeDialogComponent,
    NmfHistogramHelpDialogComponent,
  ],
  providers: [NmfEeTutorialService],
})
export class NuclearModificationEventExplorationModule {}
