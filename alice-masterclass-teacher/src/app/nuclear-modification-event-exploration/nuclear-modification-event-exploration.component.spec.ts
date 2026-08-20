import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { of } from 'rxjs';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';
import {
  ApiService,
  ExerciseKind,
  NmfEventClass,
  NmfEventExplorationResultAPI,
  SessionAPI,
} from '../shared/services/api.service';

import { NuclearModificationEventExplorationComponent } from './nuclear-modification-event-exploration.component';
import { NmfCollectPlotsComponent } from './collect-plots/collect-plots.component';
import { RaaCollectPlotComponent } from './raa-collect-plot/raa-collect-plot.component';
import { NmfResultsComponent } from './results/results.component';
import { NmfInstructionsComponent } from './instructions/instructions.component';

function entry(eventClass: NmfEventClass, raa: number, raaMinPt: number) {
  return {
    eventClass,
    nColl: 1,
    multiplicity: 10,
    multiplicityMinPt: 5,
    raa,
    raaMinPt,
  };
}

describe('NuclearModificationEventExplorationComponent', () => {
  let component: NuclearModificationEventExplorationComponent;
  let fixture: ComponentFixture<NuclearModificationEventExplorationComponent>;

  let service: ApiService;
  let spyResults: jasmine.Spy;

  const SESSIONS: SessionAPI[] = [
    { id: 1, event: 'Event A', kind: ExerciseKind.RAA, name: 'Session A', password: 'aaa', maxStudents: 10, created: new Date() },
    { id: 2, event: 'Event A', kind: ExerciseKind.RAA, name: 'Session B', password: 'bbb', maxStudents: 10, created: new Date() },
  ];

  const RESULTS: NmfEventExplorationResultAPI[] = [
    {
      student: 0,
      dataset: 1,
      ppEvents: 30,
      meanPpMultiplicity: 12,
      meanPpMultiplicityMinPt: 3,
      entries: [
        entry(NmfEventClass.PBPB_PERIPHERAL, 0.7, 0.6),
        entry(NmfEventClass.PBPB_SEMI_CENTRAL, 0.4, 0.3),
        entry(NmfEventClass.PBPB_CENTRAL, 0.2, 0.1),
      ],
    },
    {
      student: 2,
      dataset: 1,
      ppEvents: 30,
      meanPpMultiplicity: 11,
      meanPpMultiplicityMinPt: 2.5,
      // A student who has only reached the peripheral event yet.
      entries: [entry(NmfEventClass.PBPB_PERIPHERAL, 0.9, 0.8)],
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        NuclearModificationEventExplorationComponent,
        NmfCollectPlotsComponent,
        RaaCollectPlotComponent,
        NmfResultsComponent,
        NmfInstructionsComponent,
      ],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
      providers: [ApiService, provideHttpClient(withInterceptorsFromDi())],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NuclearModificationEventExplorationComponent);
    component = fixture.componentInstance;
    service = fixture.debugElement.injector.get(ApiService);

    spyOn(service, 'getSessions').and.returnValue(of(SESSIONS));
    spyResults = spyOn(
      service,
      'getNuclearModificationEventExplorationResults',
    ).and.returnValue(of(RESULTS));

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should always expose six pads: three classes x two pT windows', () => {
    expect(component.collectSeries.length).toBe(6);
    expect(component.collectSeries.map((s) => s.minPt)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
    expect(component.collectSeries.map((s) => s.eventClass)).toEqual([
      NmfEventClass.PBPB_PERIPHERAL,
      NmfEventClass.PBPB_PERIPHERAL,
      NmfEventClass.PBPB_SEMI_CENTRAL,
      NmfEventClass.PBPB_SEMI_CENTRAL,
      NmfEventClass.PBPB_CENTRAL,
      NmfEventClass.PBPB_CENTRAL,
    ]);
  });

  it('should leave the session selector empty until the user chooses', () => {
    expect(component.sessionID).toBeNull();
    expect(spyResults).not.toHaveBeenCalled();
  });

  it('should reload data when the session changes', () => {
    component.sessionID = 1;
    component.onSessionChange();
    expect(spyResults).toHaveBeenCalledWith(1);

    spyResults.calls.reset();
    component.sessionID = 2;
    component.onSessionChange();
    expect(spyResults).toHaveBeenCalledWith(2);
  });

  it('should index a student result by centrality class', () => {
    component.sessionID = 1;
    component.onSessionChange();

    const first = component.studentResults[0];
    expect(first.byClass[NmfEventClass.PBPB_CENTRAL]?.raa).toBe(0.2);
    expect(component.studentResults[1].byClass[NmfEventClass.PBPB_CENTRAL]).toBeUndefined();
    expect(component.maxStudent).toBe(2);
  });

  it('should plot nothing until students are selected', () => {
    component.sessionID = 1;
    component.onSessionChange();

    for (const series of component.collectSeries) {
      expect(series.points.length).toBe(0);
    }
  });

  it('should add and remove points as students are selected', () => {
    component.sessionID = 1;
    component.onSessionChange();

    component.onAllSelected(true);

    const peripheral = component.collectSeries[0];
    const peripheralMinPt = component.collectSeries[1];
    const central = component.collectSeries[4];

    expect(peripheral.points).toEqual([
      { student: 0, value: 0.7 },
      { student: 2, value: 0.9 },
    ]);
    expect(peripheralMinPt.points).toEqual([
      { student: 0, value: 0.6 },
      { student: 2, value: 0.8 },
    ]);
    // Student 2 has no central entry, so only student 0 shows up there.
    expect(central.points).toEqual([{ student: 0, value: 0.2 }]);

    component.onStudentSelected({ student: 0, selected: false });
    expect(component.collectSeries[0].points).toEqual([{ student: 2, value: 0.9 }]);
    expect(component.collectSeries[4].points).toEqual([]);

    component.onAllSelected(false);
    for (const series of component.collectSeries) {
      expect(series.points.length).toBe(0);
    }
  });
});
