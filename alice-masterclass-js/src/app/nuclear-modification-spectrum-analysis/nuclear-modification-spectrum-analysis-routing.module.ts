import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { NuclearModificationSpectrumAnalysisComponent } from './nuclear-modification-spectrum-analysis.component';

const routes: Routes = [
  {
    path: 'nuclear-modification-spectrum-analysis',
    component: NuclearModificationSpectrumAnalysisComponent,
  },
];

@NgModule({
  declarations: [],
  imports: [CommonModule, RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class NuclearModificationSpectrumAnalysisRoutingModule {}
