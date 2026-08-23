import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { demoExcludedGuard } from '../shared/demo/demo-excluded.guard';
import { NuclearModificationEventExplorationComponent } from './nuclear-modification-event-exploration.component';

const routes: Routes = [
  {
    path: 'nuclear-modification-event-exploration',
    component: NuclearModificationEventExplorationComponent,
    canActivate: [demoExcludedGuard],
  },
];

@NgModule({
  declarations: [],
  imports: [CommonModule, RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NuclearModificationEventExplorationRoutingModule {}
