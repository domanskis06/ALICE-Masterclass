import { Component, SimpleChange } from '@angular/core';
import { By } from '@angular/platform-browser';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { AngularModule } from '../../../shared/angular.module';
import { SharedModule } from '../../../shared/shared.module';
import { MassPanelMode } from '../../models/jpsi.models';
import { ResidualFitResult } from '../../services/jpsi-residual-fit.service';

import { MassPanelComponent, SeriesEntry, SERIES_COLOURS } from './mass-panel.component';

/** Three track-style series (pp/p-Pb): one opposite-charge, two same-charge. */
function trackSeries(): { primary: SeriesEntry; secondary: SeriesEntry[] } {
  return {
    primary: {
      key: 'unlike',
      colour: SERIES_COLOURS.unlike,
      values: Float64Array.from([1, 2, 3, 4]),
      labelKey: 'JPSI.MASS.SERIES.UNLIKE',
    },
    secondary: [
      {
        key: 'posPos',
        colour: SERIES_COLOURS.posPos,
        values: Float64Array.from([1, 1, 1, 1]),
        labelKey: 'JPSI.MASS.SERIES.POSPOS',
      },
      {
        key: 'negNeg',
        colour: SERIES_COLOURS.negNeg,
        values: Float64Array.from([1, 1, 1, 1]),
        labelKey: 'JPSI.MASS.SERIES.NEGNEG',
      },
    ],
  };
}

/** Two Pb-Pb-style series: one opposite-charge, a single same-charge series (no merge toggle). */
function pbPbSeries(): { primary: SeriesEntry; secondary: SeriesEntry[] } {
  return {
    primary: {
      key: 'unlike',
      colour: SERIES_COLOURS.unlike,
      values: Float64Array.from([5, 6, 7, 8]),
      labelKey: 'JPSI.PBPB.MINV.UNLIKE',
    },
    secondary: [
      {
        key: 'like',
        colour: SERIES_COLOURS.posPos,
        values: Float64Array.from([2, 2, 2, 2]),
        labelKey: 'JPSI.PBPB.MINV.LIKE',
      },
    ],
  };
}

function fitResult(overrides: Partial<ResidualFitResult> = {}): ResidualFitResult {
  return {
    backgroundFitRange: [0, 4],
    signalWindow: [1, 3],
    pol1: [1, 0.5],
    total: 10,
    background: 6,
    signal: 4,
    signalError: 3,
    signalToBackground: 0.67,
    significance: 1.2,
    ...overrides,
  };
}

/**
 * A minimal host driving `MassPanelComponent` through real template bindings, so Angular
 * change detection actually invokes `ngOnChanges` on the panel — assigning its `@Input`s
 * directly on the component instance (without a bound template) would silently skip that,
 * since `ngOnChanges` only fires for changes Angular itself detects via bindings.
 */
@Component({
  standalone: false,
  template: `
    <app-jpsi-mass-panel
      [primarySeries]="primarySeries"
      [secondarySeries]="secondarySeries"
      [mergedSeries]="mergedSeries"
      [residual]="residual"
      [mode]="mode"
      [xmin]="xmin"
      [xmax]="xmax"
      [bins]="bins"
      [visibility]="visibility"
      [showBackgroundSum]="showBackgroundSum"
      [massWindow]="massWindow"
      [backgroundFitRange]="backgroundFitRange"
      [fitResult]="fitResult"
    ></app-jpsi-mass-panel>
  `,
})
class HostComponent {
  primarySeries: SeriesEntry | null = null;
  secondarySeries: SeriesEntry[] = [];
  mergedSeries: SeriesEntry | null = null;
  residual: Float64Array = new Float64Array(4);
  mode: MassPanelMode = 'explore';
  xmin = 0;
  xmax = 4;
  bins = 4;
  visibility: Record<string, boolean> = {};
  showBackgroundSum = false;
  massWindow: [number, number] = [0, 4];
  backgroundFitRange: [number, number] = [0, 4];
  fitResult: ResidualFitResult | null = null;
}

describe('MassPanelComponent', () => {
  let hostFixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let panel: MassPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [HostComponent, MassPanelComponent],
      imports: [AngularModule, SharedModule, TranslateModule.forRoot()],
    }).compileComponents();

    hostFixture = TestBed.createComponent(HostComponent);
    host = hostFixture.componentInstance;
    // Every test finishes setting up `host`'s fields first and calls this exactly once as its
    // first change-detection pass. Angular here also verifies a bound expression is stable
    // right after painting it, so this fixture is never pre-painted with placeholder input
    // values (e.g. `primarySeries = null`) before a test overwrites them.
  });

  function init(): void {
    hostFixture.detectChanges();
    panel = hostFixture.debugElement.query(By.directive(MassPanelComponent))
      .componentInstance as MassPanelComponent;
  }

  /**
   * Forces a deterministic chart size without depending on real browser layout or
   * `ResizeObserver` timing (both flaky in a detached test fixture): stubs the chart host's
   * `getBoundingClientRect` and calls the same private measurement path `ngAfterViewInit`
   * wires the observer to.
   */
  function layout(widthPx = 400): void {
    const chartHost = hostFixture.debugElement.query(By.css('.mass-panel__chart'))
      .nativeElement as HTMLElement;
    spyOn(chartHost, 'getBoundingClientRect').and.returnValue({
      width: widthPx,
      height: 220,
      top: 0,
      left: 0,
      right: widthPx,
      bottom: 220,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    (panel as unknown as { measureAndRender: () => void }).measureAndRender();
  }

  it('should create', () => {
    init();
    expect(panel).toBeTruthy();
  });

  describe('generic rawSeries rendering', () => {
    it('draws all three track series (unlike/posPos/negNeg) when every toggle is on', () => {
      const { primary, secondary } = trackSeries();
      host.primarySeries = primary;
      host.secondarySeries = secondary;
      host.visibility = { unlike: true, posPos: true, negNeg: true };
      init();
      layout();

      expect(panel.series.map((s) => s.key)).toEqual(['unlike', 'posPos', 'negNeg']);
    });

    it('draws only the two Pb-Pb series (unlike/like); the merge toggle needs >1 same-charge series', () => {
      const { primary, secondary } = pbPbSeries();
      host.primarySeries = primary;
      host.secondarySeries = secondary;
      host.visibility = { unlike: true, like: true };
      init();
      layout();

      expect(panel.series.map((s) => s.key)).toEqual(['unlike', 'like']);
      expect(hostFixture.debugElement.query(By.css('.mass-panel__sum-toggle'))).toBeNull();
    });

    it('hides a series once its toggle is switched off, regardless of dataset shape', () => {
      const { primary, secondary } = trackSeries();
      host.primarySeries = primary;
      host.secondarySeries = secondary;
      host.visibility = { unlike: true, posPos: false, negNeg: true };
      init();
      layout();

      expect(panel.series.map((s) => s.key)).toEqual(['unlike', 'negNeg']);
    });

    it('shows the merged series instead of the raw same-charge series once toggled on', () => {
      const { primary, secondary } = trackSeries();
      host.primarySeries = primary;
      host.secondarySeries = secondary;
      host.mergedSeries = {
        key: 'background',
        colour: SERIES_COLOURS.background,
        values: Float64Array.from([2, 2, 2, 2]),
        labelKey: 'JPSI.MASS.SERIES.BACKGROUND',
      };
      host.visibility = { unlike: true, posPos: true, negNeg: true };
      host.showBackgroundSum = true;
      init();
      layout();

      expect(panel.series.map((s) => s.key)).toEqual(['unlike', 'background']);
    });
  });

  describe('subtracted mode: Pol1 line', () => {
    it('draws no Pol1 line before a fit has run', () => {
      host.mode = 'subtracted';
      host.residual = Float64Array.from([1, 2, 3, 4]);
      init();
      layout();

      expect(panel.pol1Line).toBeNull();
    });

    it('draws the Pol1 line across the full visible axis once a fit result is set', () => {
      host.mode = 'subtracted';
      host.residual = Float64Array.from([1, 2, 3, 4]);
      host.fitResult = fitResult({ pol1: [1, 0.5] });
      init();
      layout();

      expect(panel.pol1Line).not.toBeNull();
      expect(panel.pol1Line!.x1).toBeLessThan(panel.pol1Line!.x2);
    });
  });

  describe('two independent range sliders', () => {
    function initWithRanges(): void {
      host.xmin = 1;
      host.xmax = 5;
      host.bins = 80;
      host.massWindow = [2, 3];
      host.backgroundFitRange = [1, 5];
      host.mode = 'subtracted';
      init();
    }

    it('initialises each slider from its own @Input, independently of the other', () => {
      initWithRanges();

      expect(panel.windowStart).toBe(2);
      expect(panel.windowEnd).toBe(3);
      expect(panel.backgroundStart).toBe(1);
      expect(panel.backgroundEnd).toBe(5);
    });

    it('emits massWindowChange without touching backgroundFitRangeChange, and vice versa', () => {
      initWithRanges();
      const windowEvents: [number, number][] = [];
      const backgroundEvents: [number, number][] = [];
      panel.massWindowChange.subscribe((v) => windowEvents.push(v));
      panel.backgroundFitRangeChange.subscribe((v) => backgroundEvents.push(v));

      panel.windowStart = 2.5;
      panel.onWindowChangeEnd();
      expect(windowEvents).toEqual([[2.5, 3]]);
      expect(backgroundEvents.length).toBe(0);

      panel.backgroundStart = 1.5;
      panel.onBackgroundRangeChangeEnd();
      expect(backgroundEvents).toEqual([[1.5, 5]]);
      // The earlier window-slider drag must not leak a second event onto this emitter.
      expect(windowEvents.length).toBe(1);
    });

    it('ignores the parent pushing a snapped massWindow back while still dragging, to avoid fighting the pointer', () => {
      initWithRanges();
      // Drive `ngOnChanges` directly rather than through another `hostFixture.detectChanges()`
      // cycle: this is exactly what Angular calls once the parent's `[massWindow]` binding
      // receives a new value, and testing it directly avoids entangling this drag-guard
      // assertion with ngx-slider's own two-way `[(value)]` binding on the very same field.
      panel.windowStart = 2.2; // simulates ngx-slider mid-drag
      panel.onWindowChange(); // marks windowDragging = true, emits the live value upstream

      // The parent (state service) snaps to a bin edge and pushes it straight back down.
      panel.massWindow = [2, 3];
      panel.ngOnChanges({ massWindow: new SimpleChange([2, 3], [2, 3], false) });
      expect(panel.windowStart).toBe(2.2); // still the live drag value, not overwritten

      panel.onWindowChangeEnd(); // marks windowDragging = false
      panel.massWindow = [2.5, 3];
      panel.ngOnChanges({ massWindow: new SimpleChange([2, 3], [2.5, 3], false) });
      expect(panel.windowStart).toBe(2.5); // now free to sync again
    });
  });

  it('emits fit and acceptResult straight through, so the host can call JpsiResidualFitService', () => {
    init();
    let fitCount = 0;
    let acceptCount = 0;
    panel.fit.subscribe(() => fitCount++);
    panel.acceptResult.subscribe(() => acceptCount++);

    panel.fit.emit();
    panel.acceptResult.emit();

    expect(fitCount).toBe(1);
    expect(acceptCount).toBe(1);
  });

  it('formatRatio renders an em dash for a null signal-to-background ratio', () => {
    init();
    expect(panel.formatRatio(null)).toBe('—');
    expect(panel.formatRatio(1.5)).toBe('1.50');
  });
});
