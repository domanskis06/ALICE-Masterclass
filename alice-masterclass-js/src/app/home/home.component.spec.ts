import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { RouterTestingModule } from '@angular/router/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';
import { DEMO_MODE } from '../shared/demo/demo.tokens';

import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;
  let spy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [HomeComponent],
    imports: [RouterTestingModule,
        AngularModule,
        SharedModule,
        TranslateModule.forRoot()],
    providers: [provideHttpClient(withInterceptorsFromDi())]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;

    spy = spyOn(window.sessionStorage, 'getItem').and.returnValue('true');

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not show the exercise tiles in the workshop build', () => {
    expect(fixture.nativeElement.querySelector('#demo-tiles')).toBeNull();
  });

  it('keeps the collaboration description in the workshop build', () => {
    expect(fixture.nativeElement.querySelector('#text')).toBeTruthy();
  });

  it('keeps the ALICE logo in the top corner in the workshop build', () => {
    expect(fixture.nativeElement.querySelector('#logo')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('#logo-bottom')).toBeNull();
  });
});

describe('HomeComponent (demo build)', () => {
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HomeComponent],
      imports: [RouterTestingModule, AngularModule, SharedModule, TranslateModule.forRoot()],
      providers: [
        provideHttpClient(withInterceptorsFromDi()),
        { provide: DEMO_MODE, useValue: true },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
  });

  it('shows the three exercise tiles, linked to their routes', () => {
    const tile = (testId: string) =>
      fixture.nativeElement.querySelector(`[data-testid="${testId}"]`) as HTMLAnchorElement;

    expect(tile('home-tile-particle-propagation').getAttribute('href')).toBe(
      '/particle-propagation',
    );
    expect(tile('home-tile-strangeness-enhancement').getAttribute('href')).toBe(
      '/strangeness-visual-analysis',
    );
    expect(tile('home-tile-jpsi-suppression').getAttribute('href')).toBe('/jpsi-analysis');
  });

  it('gives every tile its own screenshot', () => {
    const shots = Array.from(
      fixture.nativeElement.querySelectorAll('.demo-tile-shot'),
    ) as HTMLElement[];
    expect(shots.length).toBe(3);

    const images = shots.map((s) => s.style.backgroundImage);
    expect(images.every((i) => i.includes('assets/images/welcome-page/'))).toBeTrue();
    // Three different previews, not the same one three times.
    expect(new Set(images).size).toBe(3);
    // A wide screenshot in a squarer tile needs a crop point, or it centres on
    // whatever happens to be in the middle.
    expect(shots.every((s) => s.style.backgroundPosition !== '')).toBeTrue();
  });

  it('drops the collaboration description in the demo — the tiles replace it', () => {
    expect(fixture.nativeElement.querySelector('#text')).toBeNull();
  });

  it('moves the ALICE logo down to the credits instead of the top corner', () => {
    expect(fixture.nativeElement.querySelector('#logo')).toBeNull();
    expect(fixture.nativeElement.querySelector('#logo-bottom')).toBeTruthy();
  });
});
