import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import { CoreModule } from './core/core.module';
import { SharedModule } from './shared/shared.module';
import { AngularModule } from './shared/angular.module';

import { AppRoutingModule } from './app-routing.module';

// NG Translate
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

import { HomeModule } from './home/home.module';
import { NavModule } from './nav/nav.module';
import { StrangenessVisualAnalysisModule } from './strangeness-visual-analysis/strangeness-visual-analysis.module';
import { StrangenessLargeScaleAnalysisModule } from './strangeness-large-scale-analysis/strangeness-large-scale-analysis.module';
import { ParticlePropagationModule } from './particle-propagation/particle-propagation.module';
import { AboutModule } from './about/about.module';

import { AppComponent } from './app.component';
import { AuthDialogComponent } from './auth-dialog/auth-dialog.component';
import { SelectDatasetDialogComponent } from './select-dataset-dialog/select-dataset-dialog.component';
import { InstructionsDialogComponent } from './instructions-dialog/instructions-dialog.component';

// AoT requires an exported function for factories
export function HttpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

@NgModule({
  declarations: [AppComponent, AuthDialogComponent, SelectDatasetDialogComponent, InstructionsDialogComponent],
  imports: [
    BrowserModule,
    HttpClientModule,
    CoreModule,
    SharedModule,
    AngularModule,
    AppRoutingModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: HttpLoaderFactory,
        deps: [HttpClient]
      }
    }),
    HomeModule,
    NavModule,
    AboutModule,
    StrangenessVisualAnalysisModule,
    StrangenessLargeScaleAnalysisModule,
    ParticlePropagationModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
