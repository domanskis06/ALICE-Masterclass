import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../shared/angular.module';
import { NmfEventClass } from '../../shared/services/api.service';
import { NmfStudentResult } from '../nuclear-modification-event-exploration.component';

import { NmfResultsComponent } from './results.component';

function studentResult(student: number, selected: boolean, withCentral = true): NmfStudentResult {
  return {
    selected,
    student,
    dataset: 1,
    ppEvents: 30,
    meanPpMultiplicity: 12,
    meanPpMultiplicityMinPt: 3,
    byClass: withCentral
      ? {
          [NmfEventClass.PBPB_CENTRAL]: {
            eventClass: NmfEventClass.PBPB_CENTRAL,
            nColl: 1686.87,
            multiplicity: 3400,
            multiplicityMinPt: 900,
            raa: 0.16,
            raaMinPt: 0.14,
          },
        }
      : {},
  };
}

describe('NmfResultsComponent', () => {
  let component: NmfResultsComponent;
  let fixture: ComponentFixture<NmfResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [NmfResultsComponent],
      imports: [AngularModule, TranslateModule.forRoot()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(NmfResultsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should track partial and full selection', () => {
    component.resultsData = [studentResult(0, false), studentResult(1, false)];
    expect(component.someSelected()).toBe(false);
    expect(component.allSelected()).toBe(false);

    component.resultsData = [studentResult(0, true), studentResult(1, false)];
    expect(component.someSelected()).toBe(true);
    expect(component.allSelected()).toBe(false);

    component.resultsData = [studentResult(0, true), studentResult(1, true)];
    expect(component.someSelected()).toBe(false);
    expect(component.allSelected()).toBe(true);
  });

  it('should not report all-selected on an empty table', () => {
    component.resultsData = [];
    expect(component.allSelected()).toBe(false);
  });

  it('should return null for a class the student has not reported', () => {
    const withCentral = studentResult(0, false);
    const withoutCentral = studentResult(1, false, false);

    expect(component.raa(withCentral, NmfEventClass.PBPB_CENTRAL)).toBe(0.16);
    expect(component.raaMinPt(withCentral, NmfEventClass.PBPB_CENTRAL)).toBe(0.14);
    expect(component.raa(withoutCentral, NmfEventClass.PBPB_CENTRAL)).toBeNull();
    expect(component.raaMinPt(withoutCentral, NmfEventClass.PBPB_CENTRAL)).toBeNull();
  });

  it('should emit selection changes', () => {
    const single = spyOn(component.studentSelectedEvent, 'emit');
    const all = spyOn(component.allSelectedEvent, 'emit');
    const reload = spyOn(component.reloadClickedEvent, 'emit');

    component.selectCheckboxClicked(studentResult(3, false), true);
    expect(single).toHaveBeenCalledWith({ student: 3, selected: true });

    component.allCheckboxClicked(false);
    expect(all).toHaveBeenCalledWith(false);

    component.reloadButtonClicked();
    expect(reload).toHaveBeenCalled();
  });
});
