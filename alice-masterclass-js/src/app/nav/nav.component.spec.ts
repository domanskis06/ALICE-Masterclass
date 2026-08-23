import { waitForAsync, ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, Routes } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { Component } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';
import { DEMO_MODE } from '../shared/demo/demo.tokens';

import { NavComponent } from './nav.component';

@Component({ template: '', standalone: false })
class BlankComponent {}

const routes: Routes = [
  { path: 'home', component: BlankComponent },
  { path: 'strangeness-visual-analysis', component: BlankComponent },
  { path: 'strangeness-large-scale-analysis', component: BlankComponent },
  { path: 'particle-propagation', component: BlankComponent },
];

describe('NavComponent', () => {
  let component: NavComponent;
  let fixture: ComponentFixture<NavComponent>;
  let router: Router;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
    declarations: [NavComponent, BlankComponent],
    imports: [AngularModule,
        SharedModule,
        RouterTestingModule.withRoutes(routes),
        TranslateModule.forRoot()],
    providers: [provideHttpClient(withInterceptorsFromDi())]
}).compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(NavComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    fixture.detectChanges();
  });

  it('should compile', () => {
    expect(component).toBeTruthy();
  });

  it('should activate the nav item for the current route', async () => {
    await router.navigateByUrl('/strangeness-visual-analysis');
    fixture.detectChanges();

    const activated = fixture.nativeElement.querySelectorAll('a.mdc-list-item--activated');
    expect(activated.length).toBe(1);
    expect(activated[0].getAttribute('href')).toContain('/strangeness-visual-analysis');
  });

  it('shows the nuclear-modification exercises in the workshop build', () => {
    expect(
      fixture.nativeElement.querySelector('[data-testid="nav-link-nmf-event-exploration"]'),
    ).toBeTruthy();
    expect(
      fixture.nativeElement.querySelector('[data-testid="nav-link-nmf-spectrum-analysis"]'),
    ).toBeTruthy();
  });
});

describe('NavComponent (demo build)', () => {
  let fixture: ComponentFixture<NavComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [NavComponent, BlankComponent],
      imports: [
        AngularModule,
        SharedModule,
        RouterTestingModule.withRoutes(routes),
        TranslateModule.forRoot(),
      ],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        { provide: DEMO_MODE, useValue: true },
      ],
    }).compileComponents();
  }));

  it('hides the nuclear-modification exercises — not offered in the public demo yet', () => {
    fixture = TestBed.createComponent(NavComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="nav-link-nmf-event-exploration"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="nav-link-nmf-spectrum-analysis"]'),
    ).toBeNull();
  });
});
