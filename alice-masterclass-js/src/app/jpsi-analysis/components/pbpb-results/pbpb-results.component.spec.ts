import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../../shared/angular.module';
import { ApiService, ExerciseKind } from '../../../shared/services/api.service';
import { SharedModule } from '../../../shared/shared.module';
import { PbPbYieldRow } from '../../models/pbpb-minv.models';

import { PbPbResultsComponent } from './pbpb-results.component';

/** Minimal but complete row - the template reads every `fit`/`published` field while rendering. */
function makeRow(centralityId: PbPbYieldRow['centralityId']): PbPbYieldRow {
  return {
    centralityId,
    centralityLabel: '0-10%',
    fit: {
      backgroundFitRange: [2.5, 4],
      signalWindow: [2.9, 3.14],
      pol1: [0, 0],
      total: 100,
      residualBackground: 40,
      combinatorialBackground: 10,
      background: 50,
      signal: 50,
      signalError: 7,
      signalToBackground: 1,
      significance: 5,
    },
    published: {
      nTotal: 100,
      nTotalErr: 10,
      nBkg: 50,
      nBkgErr: 7,
      nJpsi: 50,
      nJpsiErr: 7,
      sOverB: 1,
      significance: 5,
      significanceNote: '',
    },
    acceptedAt: Date.now(),
  };
}

describe('PbPbResultsComponent', () => {
  let component: PbPbResultsComponent;
  let fixture: ComponentFixture<PbPbResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PbPbResultsComponent],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
      providers: [ApiService, provideHttpClient(withInterceptorsFromDi())],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(PbPbResultsComponent);
    component = fixture.componentInstance;
    component.apiService.password = 'pw';
    component.apiService.studentID = 0;
    component.apiService.sessionName = 'SESSION';
    component.rows = [makeRow('pbPb_0_5')];
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('stays enabled while the session kind is unknown (fail open)', () => {
    component.apiService.sessionKind = null;
    expect(component.uploadDisabled).toBeFalse();
  });

  it('disables upload when logged into a non-jpsi (e.g. strangeness) session', () => {
    component.apiService.sessionKind = ExerciseKind.STRANGENESS;
    expect(component.wrongExerciseKind).toBeTrue();
    expect(component.uploadDisabled).toBeTrue();
  });

  it('stays enabled when logged into a jpsi session with accepted rows', () => {
    component.apiService.sessionKind = ExerciseKind.JPSI;
    expect(component.uploadDisabled).toBeFalse();
  });

  it('stays enabled with zero Pb-Pb rows when pp/p-Pb rows exist elsewhere on the page', () => {
    component.apiService.sessionKind = ExerciseKind.JPSI;
    component.rows = [];
    component.hasOtherResults = true;
    expect(component.uploadDisabled).toBeFalse();
  });

  it('disables upload with zero rows anywhere', () => {
    component.apiService.sessionKind = ExerciseKind.JPSI;
    component.rows = [];
    component.hasOtherResults = false;
    expect(component.uploadDisabled).toBeTrue();
  });
});
