import { waitForAsync, ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';

import { RouterTestingModule } from '@angular/router/testing';
import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { NavComponent } from './nav.component';

@Component({ template: '', standalone: false })
class BlankComponent {}

const routes: Routes = [
  { path: 'session', component: BlankComponent },
  { path: 'strangeness-visual-analysis', component: BlankComponent },
  { path: 'strangeness-large-scale-analysis', component: BlankComponent },
];

describe('NavComponent', () => {
  let component: NavComponent;
  let fixture: ComponentFixture<NavComponent>;
  let router: Router;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [NavComponent, BlankComponent],
      imports: [
        RouterTestingModule.withRoutes(routes),
        AngularModule,
        SharedModule,
        TranslateModule.forRoot()
      ]
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
});
