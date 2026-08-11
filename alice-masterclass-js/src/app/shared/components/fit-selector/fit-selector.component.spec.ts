import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';
import { AngularModule } from '../../angular.module';
import { FitService } from '../../services/fit.service';
import { SharedModule } from '../../shared.module';

import { FitSelectorComponent } from './fit-selector.component';

describe('FitSelectorComponent', () => {
  let component: FitSelectorComponent;
  let fixture: ComponentFixture<FitSelectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ FitSelectorComponent ],
      imports: [
        AngularModule,
        SharedModule,
        TranslateModule.forRoot()
      ],
      providers: [ FitService ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(FitSelectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('clamps existing slider selections when the axis zooms in', () => {
    component.domainResetToken = 1;
    component.axisRange = [0.4, 0.6];
    component.signal.start = 0.48;
    component.signal.end = 0.52;
    component.background.start = 0.42;
    component.background.end = 0.58;

    component.axisRange = [0.50, 0.55];

    expect(component.signal.start).toBeCloseTo(0.50, 10);
    expect(component.signal.end).toBeCloseTo(0.52, 10);
    expect(component.background.start).toBeCloseTo(0.50, 10);
    expect(component.background.end).toBeCloseTo(0.55, 10);
    expect(component.signal.options.floor).toBeCloseTo(0.50, 10);
    expect(component.signal.options.ceil).toBeCloseTo(0.55, 10);
  });

  it('re-initializes selections when domainResetToken changes', () => {
    component.domainResetToken = 1;
    component.axisRange = [0.4, 0.6];
    component.signal.start = 0.48;
    component.signal.end = 0.52;

    component.domainResetToken = 2;
    component.axisRange = [1.09, 1.16];

    expect(component.signal.start).toBeCloseTo(1.09, 10);
    expect(component.signal.end).toBeCloseTo(1.16, 10);
    expect(component.background.start).toBeCloseTo(1.09, 10);
    expect(component.background.end).toBeCloseTo(1.16, 10);
  });

  it('resetRangesToAxisExtremes restores both sliders to the axis floor/ceil', () => {
    component.domainResetToken = 1;
    component.axisRange = [0.2, 1.2];
    component.signal.start = 0.48;
    component.signal.end = 0.52;
    component.background.start = 0.4;
    component.background.end = 0.8;

    component.resetRangesToAxisExtremes();

    expect(component.signal.start).toBeCloseTo(0.2, 10);
    expect(component.signal.end).toBeCloseTo(1.2, 10);
    expect(component.background.start).toBeCloseTo(0.2, 10);
    expect(component.background.end).toBeCloseTo(1.2, 10);
  });
});
