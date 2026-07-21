import { TestBed, waitForAsync } from '@angular/core/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AppComponent } from './app.component';
import { TranslateModule } from '@ngx-translate/core';
import { ApiService } from './shared/services/api.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NavModule } from './nav/nav.module';

describe('AppComponent', () => {
  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
    declarations: [AppComponent],
    imports: [RouterTestingModule,
        TranslateModule.forRoot(),
        NavModule,
        NoopAnimationsModule],
    providers: [ApiService, provideHttpClient(withInterceptorsFromDi())]
}).compileComponents();
  }));

  it('should create the app', waitForAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.debugElement.componentInstance;
    expect(app).toBeTruthy();
  }));

  it('should render the global flying-ball overlay', waitForAsync(() => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const ball = fixture.nativeElement.querySelector('.flying-ball');
    expect(ball).toBeTruthy();
  }));
});
