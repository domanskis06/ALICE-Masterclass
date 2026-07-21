import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { AngularModule } from '../../angular.module';
import { SharedModule } from '../../shared.module';

import { HistogramComponent } from './histogram.component';

describe('HistogramComponent', () => {
  let component: HistogramComponent;
  let fixture: ComponentFixture<HistogramComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ HistogramComponent ],
      imports: [
        AngularModule,
        SharedModule,
      ]
    })
    .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(HistogramComponent);
    component = fixture.componentInstance;
    component.xDomain = [0, 1];
    component.bins = 10;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should preview the bin that would receive a new value', () => {
    component.data = [0.15, 0.16];
    fixture.detectChanges();

    const target = component.previewBinTarget(0.15);
    expect(target).not.toBeNull();
    expect(target!.binIndex).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(target!.targetX)).toBeTrue();
    expect(Number.isFinite(target!.targetY)).toBeTrue();
  });

  it('should return null when the value falls outside the domain', () => {
    component.data = [0.2];
    fixture.detectChanges();

    expect(component.previewBinTarget(2.5)).toBeNull();
  });

  it('should pulse a bin without throwing', fakeAsync(() => {
    component.data = [0.2, 0.25, 0.55];
    fixture.detectChanges();
    tick(0);

    const target = component.previewBinTarget(0.2);
    expect(target).not.toBeNull();
    expect(() => component.pulseBin(target!.binIndex)).not.toThrow();
    tick(500);
  }));
});
