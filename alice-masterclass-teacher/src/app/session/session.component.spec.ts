import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { ApiService, EventAPI, ExerciseKind } from '../shared/services/api.service';

import { SessionComponent, SessionUrlPipe } from './session.component';
import { of } from 'rxjs';


describe('SessionComponent', () => {
  let component: SessionComponent;
  let fixture: ComponentFixture<SessionComponent>;
  let service: ApiService;

  let spy1: jasmine.Spy;
  let spy2: jasmine.Spy;
  let spy3: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SessionComponent],
    imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
    providers: [ApiService, SessionUrlPipe, provideHttpClient(withInterceptorsFromDi())]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SessionComponent);
    component = fixture.componentInstance;
    service = fixture.debugElement.injector.get(ApiService);

    spy1 = spyOn(service, 'autoRefresh').and.returnValue(false);
    spy2 = spyOn(service, 'getEvents').and.returnValue(of([]));
    spy3 = spyOn(service, 'getSessions').and.returnValue(of([]));

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('lists events newest-created first', () => {
    const events: EventAPI[] = [
      { id: 1, name: 'OLDEST', kind: ExerciseKind.STRANGENESS, created: new Date('2026-01-01T00:00:00Z') },
      { id: 2, name: 'NEWEST', kind: ExerciseKind.STRANGENESS, created: new Date('2026-03-01T00:00:00Z') },
      { id: 3, name: 'MIDDLE', kind: ExerciseKind.STRANGENESS, created: new Date('2026-02-01T00:00:00Z') },
    ];
    spy2.and.returnValue(of(events));

    component.reload();

    expect(component.eventsWithSessions.map((item) => item.event.name)).toEqual([
      'NEWEST',
      'MIDDLE',
      'OLDEST',
    ]);
  });
});
