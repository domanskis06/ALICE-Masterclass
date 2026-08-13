import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../../shared/angular.module';
import { ApiService, ExerciseKind } from '../../../shared/services/api.service';
import { SharedModule } from '../../../shared/shared.module';
import { SummaryRow } from '../../models/jpsi.models';

import { ResultsTableComponent } from './results-table.component';

/** Minimal but complete row - the template reads every `ResidualFitResult` field while rendering. */
function makeRow(datasetId: SummaryRow['datasetId']): SummaryRow {
  return {
    datasetId,
    nEvents: 1000,
    backgroundFitRange: [1, 5],
    signalWindow: [1, 1.25],
    pol1: [0, 0],
    total: 100,
    residualBackground: 40,
    combinatorialBackground: 10,
    background: 50,
    signal: 50,
    signalError: 7,
    signalToBackground: 1,
    significance: 5,
  };
}

describe('ResultsTableComponent', () => {
  let component: ResultsTableComponent;
  let fixture: ComponentFixture<ResultsTableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ResultsTableComponent],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
      providers: [ApiService, provideHttpClient(withInterceptorsFromDi())],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ResultsTableComponent);
    component = fixture.componentInstance;
    component.apiService.password = 'pw';
    component.apiService.studentID = 0;
    component.apiService.sessionName = 'SESSION';
    component.rows = [makeRow('pp')];
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
});
