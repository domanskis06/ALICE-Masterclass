import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { AuthGuard } from '../shared/services/auth.guard';

import { JpsiAnalysisComponent } from './jpsi-analysis.component';

const routes: Routes = [
  {
    path: 'jpsi-analysis',
    component: JpsiAnalysisComponent,
    canActivate: [AuthGuard]
  }
];

@NgModule({
  declarations: [],
  imports: [CommonModule, RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class JpsiAnalysisRoutingModule {}
