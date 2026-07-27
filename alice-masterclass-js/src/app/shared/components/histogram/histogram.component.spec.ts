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

  it('should return null for non-finite values', () => {
    component.data = [0.2];
    fixture.detectChanges();

    expect(component.previewBinTarget(Number.NaN)).toBeNull();
  });

  it('expands the axis and rebins when a value falls outside the base domain', () => {
    component.xDomain = [0.5, 0.6];
    component.bins = 6;
    component.data = [0.52];
    fixture.detectChanges();

    expect(component.xDomain).toEqual([0.5, 0.6]);

    const preview = component.resolveIncomingBin(1.1);
    expect(preview).not.toBeNull();
    expect(preview!.binIndex).toBe(5);

    component.data = [0.52, 1.1];
    fixture.detectChanges();

    expect(component.xDomain[0]).toBeCloseTo(0.5, 10);
    expect(component.xDomain[1]).toBeCloseTo(1.1, 10);

    // 6 equal bins on [0.5, 1.1] → left edges 0.5, 0.6, 0.7, 0.8, 0.9, 1.0
    // (user example listed mid-style steps; equal-width rebin is the rule).
    const thresholds = (component as unknown as { getBinThresholds(): number[] }).getBinThresholds();
    expect(thresholds.length).toBe(5);
    expect(thresholds[0]).toBeCloseTo(0.6, 10);
    expect(thresholds[4]).toBeCloseTo(1.0, 10);
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
