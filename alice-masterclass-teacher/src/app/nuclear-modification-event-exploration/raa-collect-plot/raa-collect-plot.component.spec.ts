import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../shared/angular.module';
import { SharedModule } from '../../shared/shared.module';

import { RaaCollectPlotComponent } from './raa-collect-plot.component';

describe('RaaCollectPlotComponent', () => {
  let component: RaaCollectPlotComponent;
  let fixture: ComponentFixture<RaaCollectPlotComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RaaCollectPlotComponent],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(RaaCollectPlotComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should report no mean without points', () => {
    expect(component.mean).toBeNull();
    expect(component.count).toBe(0);
  });

  it('should average the points it is given', () => {
    fixture.componentRef.setInput('points', [
      { student: 0, value: 0.2 },
      { student: 1, value: 0.4 },
    ]);
    fixture.detectChanges();

    expect(component.count).toBe(2);
    expect(component.mean).toBeCloseTo(0.3, 6);
  });

  it('should give each instance its own clip id', () => {
    const other = TestBed.createComponent(RaaCollectPlotComponent).componentInstance;
    expect(other.clipId).not.toBe(component.clipId);
  });

  it('should render one marker per point', () => {
    fixture.componentRef.setInput('maxStudent', 2);
    fixture.componentRef.setInput('points', [
      { student: 0, value: 0.2 },
      { student: 2, value: 0.4 },
    ]);
    fixture.detectChanges();

    const circles = fixture.nativeElement.querySelectorAll('.dots circle');
    expect(circles.length).toBe(2);
  });
});
