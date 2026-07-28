import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';

import { PageNotFoundComponent, CernToolbarComponent, SpinnerContainerComponent, HistogramComponent } from './components/';
// import { FitHistogramComponent } from './components/fit-histogram/fit-histogram.component';
import { AngularModule } from './angular.module';

@NgModule({
  declarations: [
    PageNotFoundComponent,
    CernToolbarComponent,
    SpinnerContainerComponent,
    HistogramComponent,
    // FitHistogramComponent
  ],
  imports: [
    CommonModule,
    AngularModule,
    TranslateModule
  ],
  exports: [
    CernToolbarComponent,
    SpinnerContainerComponent,
    HistogramComponent,
    TranslateModule,
    // FitHistogramComponent
  ]
})
export class SharedModule {}
