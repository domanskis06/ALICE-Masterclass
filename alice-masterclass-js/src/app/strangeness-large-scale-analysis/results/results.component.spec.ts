import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AngularModule } from '../../shared/angular.module';
import { ApiService, ExerciseKind } from '../../shared/services/api.service';
import { SharedModule } from '../../shared/shared.module';

import { ResultsComponent } from './results.component';

describe('ResultsComponent', () => {
  let component: ResultsComponent;
  let fixture: ComponentFixture<ResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [ResultsComponent],
    imports: [AngularModule,
        SharedModule,
        TranslateModule.forRoot()],
    providers: [ApiService, provideHttpClient(withInterceptorsFromDi())]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('upload gating by session kind', () => {
    beforeEach(() => {
      component.apiService.password = 'pw';
      component.apiService.studentID = 0;
      component.apiService.sessionName = 'SESSION';
    });

    it('stays enabled while the session kind is unknown (fail open)', () => {
      component.apiService.sessionKind = null;
      expect(component.uploadButtonDisabled).toBeFalse();
    });

    it('disables upload when logged into a non-strangeness (e.g. jpsi) session - regression test for the LSA upload button ignoring Event.kind entirely', () => {
      component.apiService.sessionKind = ExerciseKind.JPSI;
      expect(component.wrongExerciseKind).toBeTrue();
      expect(component.uploadButtonDisabled).toBeTrue();
    });

    it('stays enabled when logged into a strangeness session', () => {
      component.apiService.sessionKind = ExerciseKind.STRANGENESS;
      expect(component.uploadButtonDisabled).toBeFalse();
    });
  });
});
