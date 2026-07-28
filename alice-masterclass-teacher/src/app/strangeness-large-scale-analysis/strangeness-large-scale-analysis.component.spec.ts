import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { of } from 'rxjs';

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { ApiService, CentralityType, CollisionType, EventAPI, ParticleType, StrangenesLargeScaleAnalysisResultAPI } from '../shared/services/api.service';

import { CentralityNamePipe, StrangenessLargeScaleAnalysisComponent } from './strangeness-large-scale-analysis.component';
import { StrangenessEnhancementPlotComponent } from './strangeness-enhancement-plot/strangeness-enhancement-plot.component';
import { ResultsComponent } from './results/results.component';
import { InstructionsComponent } from './instructions/instructions.component';

describe('StrangenessLargeScaleAnalysisComponent', () => {
  let component: StrangenessLargeScaleAnalysisComponent;
  let fixture: ComponentFixture<StrangenessLargeScaleAnalysisComponent>;

  let service: ApiService;
  let spyEvents: jasmine.Spy;
  let spyResults: jasmine.Spy;

  const EVENTS: EventAPI[] = [
    { id: 1, name: 'Event A', created: new Date() },
    { id: 2, name: 'Event B', created: new Date() },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [
        StrangenessLargeScaleAnalysisComponent,
        StrangenessEnhancementPlotComponent,
        ResultsComponent,
        CentralityNamePipe,
        InstructionsComponent
    ],
    imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
    providers: [ApiService, provideHttpClient(withInterceptorsFromDi())]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(StrangenessLargeScaleAnalysisComponent);
    component = fixture.componentInstance;
    service = fixture.debugElement.injector.get(ApiService);

    spyOn(service, 'autoRefresh').and.returnValue(false);
  });

  describe('with empty set', () => {
    beforeEach(() => {
      spyEvents = spyOn(service, 'getEvents').and.returnValue(of([]));
      spyResults = spyOn(service, 'getStrangenessLargeScaleAnalysisResults').and.returnValue(of([]));

      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });
  });

  describe('with sample set', () => {
    const RESULTS: StrangenesLargeScaleAnalysisResultAPI[] = [
      {particle: ParticleType.KAON, collision: CollisionType.PBPB, centrality: CentralityType.C000_010, signal: [5, 10, 15]},
      {particle: ParticleType.LAMBDA, collision: CollisionType.PBPB, centrality: CentralityType.C000_010, signal: [5, 10, 15]},
      {particle: ParticleType.ANTI_LAMBDA, collision: CollisionType.PBPB, centrality: CentralityType.C000_010, signal: [5, 10, 15]},
    ];

    const eventID: number = 1;

    beforeEach(() => {
      spyEvents = spyOn(service, 'getEvents').and.returnValue(of(EVENTS));
      spyResults = spyOn(service, 'getStrangenessLargeScaleAnalysisResults').and.returnValue(of(RESULTS));

      fixture.detectChanges();
    });

    it('should leave event selector empty until user chooses', () => {
      expect(component.eventID).toBeNull();
      expect(spyResults).not.toHaveBeenCalled();
    });

    it('should reload data when event changes', () => {
      component.eventID = eventID;
      component.onEventChange();
      expect(spyResults).toHaveBeenCalledWith(eventID);

      spyResults.calls.reset();
      component.eventID = 2;
      component.onEventChange();
      expect(spyResults).toHaveBeenCalledWith(2);
    });
  });
});
