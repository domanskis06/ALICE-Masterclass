import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HTTP_INTERCEPTORS, HttpClient, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { AuthGuard } from './shared/services/auth.guard';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { NavComponent } from './nav/nav.component';

import { AngularModule } from './shared/angular.module';
import { SharedModule } from './shared/shared.module';
import { SessionUrlPipe, SessionComponent } from './session/session.component';
import { AddSessionDialogComponent } from './session/add-session-dialog/add-session-dialog.component';
import { SelectSessionDialogComponent } from './select-session-dialog/select-session-dialog.component';

import { StrangenessVisualAnalysisModule } from './strangeness-visual-analysis/strangeness-visual-analysis.module';
import { StrangenessLargeScaleAnalysisModule } from './strangeness-large-scale-analysis/strangeness-large-scale-analysis.module';
import { JpsiAnalysisModule } from './jpsi-analysis/jpsi-analysis.module';
import { NuclearModificationEventExplorationModule } from './nuclear-modification-event-exploration/nuclear-modification-event-exploration.module';
import { ConfirmDialogComponent } from './session/confirm-dialog/confirm-dialog.component';
import { AddEventDialogComponent } from './session/add-event-dialog/add-event-dialog.component';
import { SelectEventDialogComponent } from './select-event-dialog/select-event-dialog.component';
import { LoginComponent } from './login/login.component';
import { UnauthorizedInterceptor } from './shared/unauthorized.interceptor';
import { InstructionsDialogComponent } from './instructions-dialog/instructions-dialog.component';
import { TranslatedPaginatorIntl } from './shared/translated-paginator-intl';

export function HttpLoaderFactory(http: HttpClient): TranslateHttpLoader {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

@NgModule({ declarations: [
        AppComponent,
        NavComponent,
        SessionUrlPipe,
        SessionComponent,
        AddSessionDialogComponent,
        SelectSessionDialogComponent,
        ConfirmDialogComponent,
        AddEventDialogComponent,
        SelectEventDialogComponent,
        LoginComponent,
        InstructionsDialogComponent
    ],
    bootstrap: [AppComponent], imports: [BrowserModule,
        AppRoutingModule,
        AngularModule,
        SharedModule,
        TranslateModule.forRoot({
          loader: {
            provide: TranslateLoader,
            useFactory: HttpLoaderFactory,
            deps: [HttpClient]
          }
        }),
        StrangenessVisualAnalysisModule,
        StrangenessLargeScaleAnalysisModule,
        JpsiAnalysisModule,
        NuclearModificationEventExplorationModule], providers: [
        { provide: HTTP_INTERCEPTORS, useClass: UnauthorizedInterceptor, multi: true },
        { provide: MatPaginatorIntl, useClass: TranslatedPaginatorIntl },
        AuthGuard,
        SessionUrlPipe,
        provideHttpClient(withInterceptorsFromDi())
    ] })
export class AppModule { }
