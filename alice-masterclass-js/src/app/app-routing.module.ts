import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { PageNotFoundComponent } from './shared/components';

import { HomeRoutingModule } from './home/home-routing.module';
import { AboutRoutingModule } from './about/about-routing.module';
import { StrangenessVisualAnalysisRoutingModule } from './strangeness-visual-analysis/strangeness-visual-analysis-routing.module';
import { StrangenessLargeScaleAnalysisRoutingModule } from './strangeness-large-scale-analysis/strangeness-large-scale-analysis-routing.module';
import { ParticlePropagationRoutingModule } from './particle-propagation/particle-propagation-routing.module';
import { JpsiAnalysisRoutingModule } from './jpsi-analysis/jpsi-analysis-routing.module';
import { NuclearModificationEventExplorationRoutingModule } from './nuclear-modification-event-exploration/nuclear-modification-event-exploration-routing.module';
import { NuclearModificationSpectrumAnalysisRoutingModule } from './nuclear-modification-spectrum-analysis/nuclear-modification-spectrum-analysis-routing.module';

const routes: Routes = [
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
  {
    path: '**',
    component: PageNotFoundComponent
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes),    HomeRoutingModule,
    // AboutRoutingModule,
    StrangenessVisualAnalysisRoutingModule,
    StrangenessLargeScaleAnalysisRoutingModule,
    ParticlePropagationRoutingModule,
    JpsiAnalysisRoutingModule,
    NuclearModificationEventExplorationRoutingModule,
    NuclearModificationSpectrumAnalysisRoutingModule,
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
