import { TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AngularModule } from './shared/angular.module';
import { SharedModule } from './shared/shared.module';

import { ApiService } from './shared/services/api.service';
import { AppComponent } from './app.component';
import { NavComponent } from './nav/nav.component';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [
        AppComponent,
        NavComponent
    ],
    imports: [RouterTestingModule,
        AngularModule,
        SharedModule,
        TranslateModule.forRoot()],
    providers: [
        ApiService,
        provideHttpClient(withInterceptorsFromDi())
    ]
}).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have as title 'alice-masterclass-teacher'`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('alice-masterclass-teacher');
  });

  // it('should render title', () => {
  //   const fixture = TestBed.createComponent(AppComponent);
  //   fixture.detectChanges();
  //   const compiled = fixture.nativeElement;
  //   expect(compiled.querySelector('.content span').textContent).toContain('alice-masterclass-teacher app is running!');
  // });
});
