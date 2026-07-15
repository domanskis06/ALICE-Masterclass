import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { SharedModule } from '../shared/shared.module';
import { AngularModule } from '../shared/angular.module';

import { ParticlePropagationRoutingModule } from './particle-propagation-routing.module';

import { ParticlePropagationComponent } from './particle-propagation.component';
import { InstructionsComponent } from './instructions/instructions.component';
// `PropagationWelcomeDialogComponent` is standalone (imported directly by MatDialog.open(), not declared here).

@NgModule({
  declarations: [ParticlePropagationComponent, InstructionsComponent],
  imports: [CommonModule, SharedModule, AngularModule, ParticlePropagationRoutingModule],
})
export class ParticlePropagationModule {}
