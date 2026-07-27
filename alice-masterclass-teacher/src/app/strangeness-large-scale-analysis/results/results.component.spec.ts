import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../shared/angular.module';

import { ResultsComponent } from './results.component';
import { CentralityNamePipe } from '../strangeness-large-scale-analysis.component';

describe('ResultsComponent', () => {
  let component: ResultsComponent;
  let fixture: ComponentFixture<ResultsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ ResultsComponent, CentralityNamePipe ],
      imports: [ AngularModule, TranslateModule.forRoot() ]
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

  it('should emit reload event on button click', () => {
    const button: HTMLButtonElement = fixture.debugElement.nativeElement.querySelector('button');

    spyOn(component.reloadClickedEvent, 'emit');

    button.click();

    expect(component.reloadClickedEvent.emit).toHaveBeenCalled();
  });
});
