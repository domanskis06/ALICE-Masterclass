import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { demoExcludedGuard } from '../shared/demo/demo-excluded.guard';
import { NuclearModificationSpectrumAnalysisComponent } from './nuclear-modification-spectrum-analysis.component';

const routes: Routes = [
  {
    path: 'nuclear-modification-spectrum-analysis',
    component: NuclearModificationSpectrumAnalysisComponent,
    canActivate: [demoExcludedGuard],
  },
];

@NgModule({
  declarations: [],
  imports: [CommonModule, RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NuclearModificationSpectrumAnalysisRoutingModule {}
