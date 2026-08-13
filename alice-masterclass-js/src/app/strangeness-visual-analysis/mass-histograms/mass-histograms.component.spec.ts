import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { TranslateModule } from '@ngx-translate/core';
import { AngularModule } from '../../shared/angular.module';
import { SharedModule } from '../../shared/shared.module';

import { ApiService, ExerciseKind } from '../../shared/services/api.service';

import {
  KAON_MASS_GEV,
  KAON_MASS_HALF_WIDTH,
  LAMBDA_MASS_GEV,
  LAMBDA_MASS_HALF_WIDTH,
  MassHistogramsComponent,
  XI_MASS_GEV,
  XI_MASS_HALF_WIDTH,
  massCenteredXDomain,
} from './mass-histograms.component';

describe('massCenteredXDomain', () => {
  it('returns [center − halfWidth, center + halfWidth]', () => {
    expect(massCenteredXDomain(1.0, 0.2)).toEqual([0.8, 1.2]);
    expect(massCenteredXDomain(KAON_MASS_GEV, KAON_MASS_HALF_WIDTH)).toEqual([
      KAON_MASS_GEV - KAON_MASS_HALF_WIDTH,
      KAON_MASS_GEV + KAON_MASS_HALF_WIDTH,
    ]);
  });
});

describe('MassHistogramsComponent', () => {
  let component: MassHistogramsComponent;
  let fixture: ComponentFixture<MassHistogramsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [MassHistogramsComponent],
    imports: [AngularModule,
        SharedModule,
        TranslateModule.forRoot()],
    providers: [ApiService, provideHttpClient(withInterceptorsFromDi())]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(MassHistogramsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should default all histograms to 10 bins', () => {
    expect(component.bins).toBe(10);
  });

  it('should clamp typed bin counts to 1–25', () => {
    component.onBinsInput(0);
    expect(component.bins).toBe(1);
    component.onBinsInput(999);
    expect(component.bins).toBe(25);
    component.onBinsInput(12.6);
    expect(component.bins).toBe(13);
  });

  it('centers each histogram X domain on the particle nominal mass', () => {
    expect(component.kaonXDomain).toEqual(
      massCenteredXDomain(KAON_MASS_GEV, KAON_MASS_HALF_WIDTH),
    );
    expect(component.lambdaXDomain).toEqual(
      massCenteredXDomain(LAMBDA_MASS_GEV, LAMBDA_MASS_HALF_WIDTH),
    );
    expect(component.antiLambdaXDomain).toEqual(
      massCenteredXDomain(LAMBDA_MASS_GEV, LAMBDA_MASS_HALF_WIDTH),
    );
    expect(component.xiXDomain).toEqual(
      massCenteredXDomain(XI_MASS_GEV, XI_MASS_HALF_WIDTH),
    );
    expect(component.antiXiXDomain).toEqual(
      massCenteredXDomain(XI_MASS_GEV, XI_MASS_HALF_WIDTH),
    );

    const mid = ([lo, hi]: [number, number]) => (lo + hi) / 2;
    expect(mid(component.kaonXDomain)).toBeCloseTo(KAON_MASS_GEV, 10);
    expect(mid(component.lambdaXDomain)).toBeCloseTo(LAMBDA_MASS_GEV, 10);
    expect(mid(component.antiLambdaXDomain)).toBeCloseTo(LAMBDA_MASS_GEV, 10);
  });

  describe('upload gating by session kind', () => {
    let apiService: ApiService;

    beforeEach(() => {
      apiService = TestBed.inject(ApiService);
      apiService.password = 'pw';
      apiService.studentID = 0;
      apiService.sessionName = 'SESSION';
      component.uploadDisabled = false;
    });

    it('stays enabled while the session kind is unknown (fail open)', () => {
      apiService.sessionKind = null;
      expect(component.uploadButtonDisabled).toBeFalse();
    });

    it('disables upload when logged into a non-strangeness (e.g. jpsi) session', () => {
      apiService.sessionKind = ExerciseKind.JPSI;
      expect(component.wrongExerciseKind).toBeTrue();
      expect(component.uploadButtonDisabled).toBeTrue();
    });

    it('stays enabled when logged into a strangeness session', () => {
      apiService.sessionKind = ExerciseKind.STRANGENESS;
      expect(component.uploadButtonDisabled).toBeFalse();
    });
  });
});
