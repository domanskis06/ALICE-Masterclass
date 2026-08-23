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

  it('should return null for non-finite values', () => {
    component.data = [0.2];
    fixture.detectChanges();

    expect(component.previewBinTarget(Number.NaN)).toBeNull();
  });

  it('expands the axis and rebins when expandDomainToData is enabled', () => {
    component.expandDomainToData = true;
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

    const thresholds = (component as unknown as { getBinThresholds(): number[] }).getBinThresholds();
    expect(thresholds.length).toBe(5);
    expect(thresholds[0]).toBeCloseTo(0.6, 10);
    expect(thresholds[4]).toBeCloseTo(1.0, 10);
  });

  it('keeps the parent domain when expandDomainToData is disabled', () => {
    component.expandDomainToData = false;
    component.xDomain = [0.5, 0.6];
    component.bins = 6;
    component.data = [0.52, 1.1];
    fixture.detectChanges();

    expect(component.xDomain).toEqual([0.5, 0.6]);
    expect(component.resolveIncomingBin(1.1)).toBeNull();
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

  it('unzoom restores the full x domain and emits zoomEvent', () => {
    const zoomSpy = spyOn(component.zoomEvent, 'emit');
    component.xDomain = [0.4, 0.6];
    component.data = [0.45, 0.5, 0.55];
    fixture.detectChanges();

    (component as unknown as { xDomainZoom: [number, number] }).xDomainZoom = [0.48, 0.52];
    expect(component.isZoomed).toBeTrue();

    component.unzoom();

    expect(component.xDomainZoom).toEqual([0.4, 0.6]);
    expect(component.isZoomed).toBeFalse();
    expect(zoomSpy).toHaveBeenCalledWith([0.4, 0.6]);
  });

  it('returns denser x-tick budgets after zooming in', () => {
    // Avoid a second detectChanges after bumping bins (HostBinding rotate flag).
    component.bins = 100;
    component.xDomain = [0, 1];

    (component as unknown as { xDomainZoom: [number, number] }).xDomainZoom = [0.2, 0.35];
    const zoomedTicks = (component as unknown as { getXTickValues(): number[] }).getXTickValues();

    (component as unknown as { xDomainZoom: [number, number] }).xDomainZoom = [0, 1];
    const fullTicks = (component as unknown as { getXTickValues(): number[] }).getXTickValues();

    expect(zoomedTicks.length).toBeGreaterThan(0);
    expect(fullTicks.length).toBeGreaterThan(0);
    const zoomSpan = 0.15;
    const fullSpan = 1;
    expect(zoomedTicks.length / zoomSpan).toBeGreaterThan(fullTicks.length / fullSpan);
  });

  it('value-counts mode ticks only the discrete categories', () => {
    component.xDomain = [-1.5, 1.5];
    component.discreteValues = [-1, 1];
    component.data = [1, -1, 1, 1, -1];
    fixture.detectChanges();

    const ticks = (component as unknown as { getXTickValues(): number[] }).getXTickValues();
    expect(ticks).toEqual([-1, 1]);

    const format = (component as unknown as { getXTickFormat(): (v: number) => string }).getXTickFormat();
    expect(format(-1)).toBe('-1');
    expect(format(1)).toBe('1');

    const incoming = component.resolveIncomingBin(-1);
    expect(incoming).not.toBeNull();
    expect(incoming!.binIndex).toBe(0);
    expect(incoming!.binCenter).toBeCloseTo(-1, 5);
    expect(incoming!.projectedCount).toBe(3);
  });

  it('styles the mean line inline, since scoped CSS never reaches d3 nodes', () => {
    component.xDomain = [0, 1];
    component.showMean = true;
    component.data = [0.4, 0.6];
    // showMean flips MARGIN.TOP (adds room for the label above the plot); this test
    // sets it directly on the component (not through a parent template binding, the
    // path Angular's checkNoChanges assumes), which trips NG0100 on the resulting
    // one-time margin change. Skip the extra checkNoChanges pass for this call only.
    fixture.detectChanges(false);

    const line: SVGLineElement = fixture.nativeElement.querySelector('.histogram-mean-line');
    const label: SVGTextElement = fixture.nativeElement.querySelector('.histogram-mean-label');
    expect(line).toBeTruthy();
    expect(label).toBeTruthy();

    // Regresja: reguły z histogram.component.scss nie obejmują węzłów dokładanych
    // przez d3 (brak atrybutu _ngcontent-*), więc kreska musi nieść styl inline.
    expect(line.style.stroke).toBeTruthy();
    expect(line.style.strokeDasharray).toBeTruthy();
    expect(line.style.strokeDasharray).not.toBe('none');
    expect(parseFloat(label.style.fontSize)).toBeLessThan(9);
    expect(label.textContent).toContain('0.50');
  });

  it('draws discrete categories as touching bars', () => {
    component.xDomain = [-2, 2];
    component.discreteValues = [-1, 1];
    component.data = [1, -1, 1];
    fixture.detectChanges();

    const rects: SVGRectElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('#bars rect')
    );
    expect(rects.length).toBe(2);

    // Słupki są pozycjonowane przez transform, nie przez atrybut x — ten zostaje zerem.
    const originX = (rect: SVGRectElement): number =>
      parseFloat(/translate\(([-\d.]+)/.exec(rect.getAttribute('transform') ?? '')?.[1] ?? 'NaN');
    const widthOf = (rect: SVGRectElement): number =>
      parseFloat(rect.getAttribute('width') ?? 'NaN');

    // 1 px przerwy technicznej między słupkami zostaje; chodzi o to, by nie było
    // dziury na pół kategorii, jak przy szerokości 70% odstępu.
    const gap = originX(rects[1]) - (originX(rects[0]) + widthOf(rects[0]));
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(2);
  });

  it('expands the axis when the flag arrives after the data', () => {
    // Kolejność jak w szablonach: data i xDomain są przypisywane przed flagą.
    // Kafelek maskował błąd, bo dostaje kolejne `data`; dialog dostaje migawkę
    // i bez settera zostawał na domenie bazowej.
    component.xDomain = [0, 30];
    component.data = [5, 12, 578];
    expect(component.xDomain).toEqual([0, 30]);

    component.expandDomainToData = true;

    expect(component.xDomain[1]).toBe(578);
  });

  it('shrinks back to the nominal range when expansion is switched off', () => {
    component.expandDomainToData = true;
    component.xDomain = [0, 30];
    component.data = [5, 578];
    expect(component.xDomain[1]).toBe(578);

    component.expandDomainToData = false;

    expect(component.xDomain).toEqual([0, 30]);
  });
});
