import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { AngularModule } from '../shared/angular.module';
import { SharedModule } from '../shared/shared.module';

import { SelectSessionDialogComponent } from './select-session-dialog.component';
import { ApiService, ExerciseKind, SessionAPI } from '../shared/services/api.service';
import { of } from 'rxjs';


describe('SelectSessionDialogComponent', () => {
  let component: SelectSessionDialogComponent;
  let fixture: ComponentFixture<SelectSessionDialogComponent>;

  let service: ApiService;
  let spy: jasmine.Spy;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    declarations: [SelectSessionDialogComponent],
    imports: [AngularModule, SharedModule],
    providers: [
        { provide: MAT_DIALOG_DATA, useValue: {} },
        { provide: MatDialogRef, useFactory: () => jasmine.createSpyObj('MatDialogRef', ['close']) },
        provideHttpClient(withInterceptorsFromDi())
    ]
})
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(SelectSessionDialogComponent);
    component = fixture.componentInstance;
    service = fixture.debugElement.injector.get(ApiService);
  });

  describe('with empty set', () => {
    beforeEach(() => {
      spy = spyOn(service, 'getSessions').and.returnValue(of([]));
      fixture.detectChanges();
    });

    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should have fetched sessions', () => {
      expect(service.getSessions).toHaveBeenCalled();
    })
  });

  describe('with sample set', () => {
    const SESSIONS: SessionAPI[] = [
      {id: 1, event: 'TEST', kind: ExerciseKind.STRANGENESS, name: 'TestName', password: 'testpassword', maxStudents: 15, created: new Date(Date.now())},
      {id: 2, event: 'TEST2', kind: ExerciseKind.STRANGENESS, name: 'TestName2', password: 'testpassword2', maxStudents: 30, created: new Date(Date.now())}
    ];

    beforeEach(() => {
      spy = spyOn(service, 'getSessions').and.returnValue(of(SESSIONS));
      fixture.detectChanges();
    });

    it('should have displayed events in a select element', () => {
      for (let i in component.sessions) {
        expect(component.sessions[i].id).toBe(SESSIONS[i].id);
        expect(component.sessions[i].event).toBe(SESSIONS[i].event);
        expect(component.sessions[i].name).toBe(SESSIONS[i].name);
        expect(component.sessions[i].password).toBe(SESSIONS[i].password);
        expect(component.sessions[i].maxStudents).toBe(SESSIONS[i].maxStudents);
        expect(component.sessions[i].created).toBe(SESSIONS[i].created);
      }
    });

    it('should have invalid form if nothing selected', () => {
      expect(component.form.valid).toBeFalsy();
    });

    it('should have disabled button if nothing selected', () => {
      const button: HTMLButtonElement = fixture.debugElement.nativeElement.querySelector('button');

      expect(button.disabled).toBe(true);
    });

    it('should unlock button when selection is made', () => {
      const button: HTMLButtonElement = fixture.debugElement.nativeElement.querySelector('button');

      component.form.controls.session.setValue(SESSIONS[1].id);
      fixture.detectChanges();

      expect(button.disabled).toBe(false);
    });

    it('should emit event when button is clicked', () => {
      const button: HTMLButtonElement = fixture.debugElement.nativeElement.querySelector('button');

      component.form.controls.session.setValue(SESSIONS[1].id);
      fixture.detectChanges();

      spyOn(component.proceedClickedEvent, 'emit');

      button.click();

      expect(component.proceedClickedEvent.emit).toHaveBeenCalled();
      expect(component.proceedClickedEvent.emit).toHaveBeenCalledWith(SESSIONS[1].id);
    });
  });

});
