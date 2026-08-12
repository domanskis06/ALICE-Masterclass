import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { PageNotFoundComponent } from './shared/components';

import { SessionRoutingModule } from './session/session-routing.module';
import { LoginRoutingModule } from './login/login-routing.module';
import { StrangenessVisualAnalysisRoutingModule } from './strangeness-visual-analysis/strangeness-visual-analysis-routing.module';
import { StrangenessLargeScaleAnalysisRoutingModule } from './strangeness-large-scale-analysis/strangeness-large-scale-analysis-routing.module';
import { JpsiAnalysisRoutingModule } from './jpsi-analysis/jpsi-analysis-routing.module';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'session',
    pathMatch: 'full'
  },
  {
    path: '**',
    component: PageNotFoundComponent
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes), SessionRoutingModule, LoginRoutingModule, StrangenessVisualAnalysisRoutingModule, StrangenessLargeScaleAnalysisRoutingModule, JpsiAnalysisRoutingModule],
  exports: [RouterModule]
})
export class AppRoutingModule { }
