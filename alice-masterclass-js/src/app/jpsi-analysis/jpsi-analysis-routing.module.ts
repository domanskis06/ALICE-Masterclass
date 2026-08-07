import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { JpsiAnalysisComponent } from './jpsi-analysis.component';

const routes: Routes = [
  {
    path: 'jpsi-analysis',
    component: JpsiAnalysisComponent,
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class JpsiAnalysisRoutingModule {}
