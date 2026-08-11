import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { TranslateModule } from '@ngx-translate/core';

import { PageNotFoundComponent, CernToolbarComponent, EventDisplayComponent, SpinnerContainerComponent, HistogramComponent, FitHistogramComponent, FitSelectorComponent } from './components/';
import { WebviewDirective } from './directives/';
import { AngularModule } from './angular.module';

@NgModule({
  declarations: [
    PageNotFoundComponent,
    WebviewDirective,
    CernToolbarComponent,
    EventDisplayComponent,
    SpinnerContainerComponent,
    HistogramComponent,
    FitHistogramComponent,
    FitSelectorComponent
  ],
  imports: [
    CommonModule,
    TranslateModule,
    AngularModule
  ],
  exports: [
    TranslateModule,
    WebviewDirective,
    CernToolbarComponent,
    EventDisplayComponent,
    SpinnerContainerComponent,
    HistogramComponent,
    FitHistogramComponent,
    FitSelectorComponent
  ]
})
export class SharedModule {}
