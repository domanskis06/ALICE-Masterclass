import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { AngularModule } from '../shared/angular.module';
import { ApiService, EventAPI, ExerciseKind } from '../shared/services/api.service';
import { SharedModule } from '../shared/shared.module';

import { SelectEventDialogComponent } from './select-event-dialog.component';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';

describe('SelectEventDialogComponent', () => {
  let component: SelectEventDialogComponent;
  let fixture: ComponentFixture<SelectEventDialogComponent>;

  let service: ApiService;
  let spy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SelectEventDialogComponent],
    imports: [AngularModule, SharedModule],
    providers: [
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: MatDialogRef, useFactory: () => jasmine.createSpyObj('MatDialogRef', ['close']) },
        ApiService,
        provideHttpClient(withInterceptorsFromDi())
    ]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SelectEventDialogComponent);
    component = fixture.componentInstance;
    service = fixture.debugElement.injector.get(ApiService);
  });

  describe('with empty set', () => {
    beforeEach(() => {
      spy = spyOn(service, 'getEvents').and.returnValue(of([]));
      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have fetched the events', () => {
      expect(service.getEvents).toHaveBeenCalled();
    })
  });

  describe('with sample set', () => {
    const EVENTS: EventAPI[] = [
      {id: 1, name: 'TEST', kind: ExerciseKind.STRANGENESS, created: new Date(Date.now())},
      {id: 2, name: 'TEST2', kind: ExerciseKind.STRANGENESS, created: new Date(Date.now())}
    ];

    beforeEach(() => {
      spy = spyOn(service, 'getEvents').and.returnValue(of(EVENTS));
      fixture.detectChanges();
    });

    it('should have fetched events', () => {
      for (let i in component.events) {
        expect(component.events[i].id).toBe(EVENTS[i].id);
        expect(component.events[i].name).toBe(EVENTS[i].name);
        expect(component.events[i].created).toBe(EVENTS[i].created);
      }
    });

    it('should have invalid form if nothing is selected', () => {
      expect(component.form.valid).toBeFalsy();
    });

    it('should have disabled button if nothing is selected', () => {
      const button: HTMLButtonElement = fixture.debugElement.nativeElement.querySelector('button');

      expect(button.disabled).toBe(true);
    });

    it('should unlock button when selection is made', () => {
      const button: HTMLButtonElement = fixture.debugElement.nativeElement.querySelector('button');

      component.form.controls.event.setValue(EVENTS[1].id);
      fixture.detectChanges();

      expect(button.disabled).toBe(false);
    });

    it('should emit event when button is clicked', () => {
      const button: HTMLButtonElement = fixture.debugElement.nativeElement.querySelector('button');

      component.form.controls.event.setValue(EVENTS[1].id);
      fixture.detectChanges();

      spyOn(component.proceedClickedEvent, 'emit');

      button.click();

      expect(component.proceedClickedEvent.emit).toHaveBeenCalled();
      expect(component.proceedClickedEvent.emit).toHaveBeenCalledWith(EVENTS[1].id);
    });
  });

});
