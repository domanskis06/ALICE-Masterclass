import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { of } from 'rxjs';

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { ApiService, SessionAPI, VisualAnalysisResultAPI } from '../shared/services/api.service';

import { StrangenessVisualAnalysisComponent } from './strangeness-visual-analysis.component';
import { MassHistogramsComponent } from './mass-histograms/mass-histograms.component';
import { ResultsComponent } from './results/results.component';
import { InstructionsComponent } from './instructions/instructions.component';

describe('StrangenessVisualAnalysisComponent', () => {
  let component: StrangenessVisualAnalysisComponent;
  let fixture: ComponentFixture<StrangenessVisualAnalysisComponent>;

  let service: ApiService;
  let spySessions: jasmine.Spy;
  let spyResults: jasmine.Spy;

  const SESSIONS: SessionAPI[] = [
    { id: 1, event: 'Event A', name: 'Session A', password: 'aaa', maxStudents: 10, created: new Date() },
    { id: 2, event: 'Event A', name: 'Session B', password: 'bbb', maxStudents: 10, created: new Date() },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [
        StrangenessVisualAnalysisComponent,
        MassHistogramsComponent,
        ResultsComponent,
        InstructionsComponent
    ],
    imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
    providers: [ApiService, provideHttpClient(withInterceptorsFromDi())]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StrangenessVisualAnalysisComponent);
    component = fixture.componentInstance;
    service = fixture.debugElement.injector.get(ApiService);
  });

  describe('with empty set', () => {
    beforeEach(() => {
      spySessions = spyOn(service, 'getSessions').and.returnValue(of([]));
      spyResults = spyOn(service, 'getStrangenessVisualAnalysisResults').and.returnValue(of([]));

      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('with sample set', () => {
    const RESULTS: VisualAnalysisResultAPI[] = [
      {student: 0, dataset: 0, k0: [0.49, 0.48, 0.5], lambda: [], antilambda: [], xi: [], antixi: []},
      {student: 1, dataset: 1, k0: [0.485, 0.49, 0.49], lambda: [], antilambda: [], xi: [], antixi: []},
      {student: 2, dataset: 3, k0: [0.485, 0.49, 0.49], lambda: [], antilambda: [], xi: [], antixi: []},
    ];

    const sessionID: number = 1;

    beforeEach(() => {
      spySessions = spyOn(service, 'getSessions').and.returnValue(of(SESSIONS));
      spyResults = spyOn(service, 'getStrangenessVisualAnalysisResults').and.returnValue(of(RESULTS));

      fixture.detectChanges();
    });

    it('should have fetched data from correct session', () => {
      expect(spyResults).toHaveBeenCalledWith(sessionID);
    });

    it('should reload data when session changes', () => {
      spyResults.calls.reset();
      component.sessionID = 2;
      component.onSessionChange();
      expect(spyResults).toHaveBeenCalledWith(2);
    });

    it('should select and deselect all student entries if requested', () => {
      component.onAllSelected(true);

      for(let i in component.studentResults) {
        expect(component.studentResults[i].selected).toBe(true);
      }

      component.onAllSelected(false);

      for(let i in component.studentResults) {
        expect(component.studentResults[i].selected).toBe(false);
      }
    });

    it('should select and deselect specific entry if requested', () => {
      const student1 = 1;
      const student2 = 2;

      component.onStudentSelected({student: student1, selected: true});

      for(let r of component.studentResults) {
        if (r.student == student1) {
          expect(r.selected).toBe(true);
        } else {
          expect(r.selected).toBe(false);
        }
      }

      component.onStudentSelected({student: student2, selected: true});

      for(let r of component.studentResults) {
        if (r.student == student1 || r.student == student2) {
          expect(r.selected).toBe(true);
        } else {
          expect(r.selected).toBe(false);
        }
      }

      component.onStudentSelected({student: student1, selected: false});

      for(let r of component.studentResults) {
        if (r.student == student2) {
          expect(r.selected).toBe(true);
        } else {
          expect(r.selected).toBe(false);
        }
      }

      component.onStudentSelected({student: student2, selected: false});

      for(let r of component.studentResults) {
        expect(r.selected).toBe(false);
      }
    });
  });
});
