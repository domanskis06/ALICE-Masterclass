import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Options } from '@angular-slider/ngx-slider';
import * as d3 from 'd3';

import {
  DEFAULT_SIGNAL_WINDOW,
  MASS_BINS,
  MASS_CHART_ASPECT,
  MASS_XMAX,
  MASS_XMIN,
  MassPanelMode,
  SIGNAL_WINDOW_WIDTH,
  SeriesVisibility,
  jpsiResponsiveChartHeight,
} from '../../models/jpsi.models';
import { ResidualFitResult } from '../../services/jpsi-residual-fit.service';

import { SERIES_COLOURS } from '../../models/series-colours';

const MARGIN = { top: 10, right: 14, bottom: 40, left: 56 };
/** Headroom above the tallest bar so it never touches the plot's top edge. */
const Y_AXIS_HEADROOM = 1.2;

let nextClipId = 0;

export { SERIES_COLOURS };

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderedSeries {
  key: string;
  colour: string;
  bars: Bar[];
}

/** One drawable series: pp/p-Pb passes unlike/posPos/negNeg, Pb-Pb passes unlike/like. */
export interface SeriesEntry {
  key: string;
  colour: string;
  values: Float64Array | number[];
  labelKey: string;
}

/**
 * The invariant mass panel, shared by pp, p-Pb and Pb-Pb (decision: one colourful chart
 * everywhere, see the plan doc "jeden panel Minv z Pol1 residual fit").
 *
 * In explore mode the student compares opposite-charge pairs against same-charge pairs; after
 * subtraction only the residual is drawn, together with a Pol1 line fitted to the sidebands
 * and two sliders: `backgroundFitRange` (what the line is fitted to — a free two-handle range)
 * and `massWindow` (what gets counted as signal — a fixed-width block the student can only
 * slide, see `signalWindowWidth`). Bars are used rather than smooth densities because the whole
 * lesson is that these are counts that get subtracted from each other.
 *
 * All maths (the Pol1 fit itself, the yield) happens in `JpsiResidualFitService`, called by the
 * host's state service — this component only draws whatever `fitResult` it is given.
 */
@Component({
  selector: 'app-jpsi-mass-panel',
  templateUrl: './mass-panel.component.html',
  styleUrls: ['./mass-panel.component.scss'],
  standalone: false,
})
export class MassPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Opposite-charge series (track: unlike; Pb-Pb: unlike). */
  @Input() primarySeries: SeriesEntry | null = null;
  /** Same-charge series (track: posPos + negNeg; Pb-Pb: like, alone). */
  @Input() secondarySeries: SeriesEntry[] = [];
  /** Precomputed sum of `secondarySeries`, shown instead of them when `showBackgroundSum`. */
  @Input() mergedSeries: SeriesEntry | null = null;
  /** Residual bars in 'subtracted' mode, clamped to zero for display (see `JpsiSignalService`). */
  @Input() residual: Float64Array = new Float64Array(MASS_BINS);
  @Input() mode: MassPanelMode = 'explore';
  @Input() xmin = MASS_XMIN;
  @Input() xmax = MASS_XMAX;
  @Input() bins = MASS_BINS;
  @Input() visibility: SeriesVisibility = {};
  /** Only meaningful (and only rendered) when `secondarySeries.length > 1`. */
  @Input() showBackgroundSum = false;
  @Input() massWindow: [number, number] = [MASS_XMIN, MASS_XMAX];
  @Input() backgroundFitRange: [number, number] = [MASS_XMIN, MASS_XMAX];
  /**
   * Fixed width (GeV/c^2) the signal-window slider is locked to — the student can slide the
   * window but never resize it (see `SIGNAL_WINDOW_WIDTH`/`PBPB_SIGNAL_WINDOW_WIDTH`). Passed
   * in per dataset shape since pp/p-Pb and Pb-Pb use different binning and therefore different
   * fixed widths.
   */
  @Input() signalWindowWidth = SIGNAL_WINDOW_WIDTH;
  /** Position the "Reset range" button restores the signal window to. */
  @Input() defaultSignalWindow: [number, number] = DEFAULT_SIGNAL_WINDOW;
  @Input() fitResult: ResidualFitResult | null = null;
  @Input() canSubtract = false;
  @Input() canAccept = false;
  @Input() tooWideSelection = false;
  @Input() hasData = false;
  @Input() loading = false;
  @Input() emptyHintKey = 'JPSI.MASS.EMPTY';
  @Input() revision = 0;

  @Output() toggleSeries = new EventEmitter<string>();
  @Output() showBackgroundSumChange = new EventEmitter<boolean>();
  @Output() subtract = new EventEmitter<void>();
  @Output() showComponents = new EventEmitter<void>();
  @Output() massWindowChange = new EventEmitter<[number, number]>();
  @Output() backgroundFitRangeChange = new EventEmitter<[number, number]>();
  @Output() fit = new EventEmitter<void>();
  @Output() acceptResult = new EventEmitter<void>();
  @Output() clearFit = new EventEmitter<void>();

  @ViewChild('host') private hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svg') private svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('pol1LineEl') private pol1LineRef!: ElementRef<SVGLineElement>;

  width = 0;
  height = 0;
  series: RenderedSeries[] = [];

  /** Unique per instance so several mass panels can exist in the DOM without clip-id clashes. */
  readonly clipId = `jpsi-mass-panel-clip-${nextClipId++}`;

  windowStart = this.massWindow[0];
  windowEnd = this.massWindow[1];
  backgroundStart = this.backgroundFitRange[0];
  backgroundEnd = this.backgroundFitRange[1];

  /**
   * The signal window is a fixed-width block the student can only slide, never resize —
   * `minRange`/`maxRange` pinned to `signalWindowWidth` plus `draggableRangeOnly` turn
   * `ngx-slider`'s usual two independent thumbs into a single draggable block. The background
   * sideband slider stays a normal, freely resizable two-handle range.
   */
  sliderOptions: Options = this.buildSignalSliderOptions();
  backgroundSliderOptions: Options = this.buildBackgroundSliderOptions();

  private resizeObserver: ResizeObserver | null = null;
  private viewReady = false;
  /**
   * While the student drags a thumb, the parent snaps the range to bin edges and pushes it
   * back via @Input. Writing those snapped values into [(value)]/[(highValue)] mid-drag makes
   * ngx-slider fight the pointer (classic right-thumb oscillation).
   */
  private windowDragging = false;
  private backgroundRangeDragging = false;
  private readonly onWindowResize = (): void => this.measureAndRender();

  private readonly xScale = d3.scaleLinear();
  private readonly yScale = d3.scaleLinear();

  get margin() {
    return MARGIN;
  }

  get plotWidth(): number {
    return Math.max(0, this.width - MARGIN.left - MARGIN.right);
  }

  get plotHeight(): number {
    return Math.max(0, this.height - MARGIN.top - MARGIN.bottom);
  }

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  /**
   * The first measurement is left to the observer, which delivers the initial size in a
   * later task. Measuring synchronously here would write width, height and the bars after
   * Angular has already checked the bindings that read them.
   */
  ngAfterViewInit(): void {
    this.viewReady = true;
    this.resizeObserver = new ResizeObserver(() => this.measureAndRender());
    this.resizeObserver.observe(this.hostRef.nativeElement);
    window.addEventListener('resize', this.onWindowResize);
    this.updatePol1Line();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['xmin'] || changes['xmax'] || changes['bins'] || changes['signalWindowWidth']) {
      this.sliderOptions = this.buildSignalSliderOptions();
      this.backgroundSliderOptions = this.buildBackgroundSliderOptions();
      this.xScale.domain([this.xmin, this.xmax]);
    }
    if (changes['massWindow'] && !this.windowDragging) {
      this.windowStart = this.massWindow[0];
      this.windowEnd = this.massWindow[1];
    }
    if (changes['backgroundFitRange'] && !this.backgroundRangeDragging) {
      this.backgroundStart = this.backgroundFitRange[0];
      this.backgroundEnd = this.backgroundFitRange[1];
    }
    if (this.viewReady) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onWindowResize);
  }

  /** Step follows this histogram's own bin width, so a drag always lands on a real bin edge. */
  private buildBackgroundSliderOptions(): Options {
    return {
      floor: this.xmin,
      ceil: this.xmax,
      step: (this.xmax - this.xmin) / this.bins,
      translate: (value: number) => value.toFixed(2),
    };
  }

  /**
   * Same floor/ceil/step as the background slider, but `minRange`/`maxRange` pinned to the
   * same value plus `draggableRangeOnly` lock the two thumbs together into a single block of
   * exactly `signalWindowWidth` wide — dragging anywhere on the bar slides the whole window,
   * neither edge can move independently.
   */
  private buildSignalSliderOptions(): Options {
    return {
      floor: this.xmin,
      ceil: this.xmax,
      step: (this.xmax - this.xmin) / this.bins,
      minRange: this.signalWindowWidth,
      maxRange: this.signalWindowWidth,
      draggableRangeOnly: true,
      translate: (value: number) => value.toFixed(2),
    };
  }

  private measureAndRender(): void {
    const rect = this.hostRef.nativeElement.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    this.width = rect.width;
    this.height = jpsiResponsiveChartHeight(rect.width, MASS_CHART_ASPECT, 280);

    this.xScale.domain([this.xmin, this.xmax]).range([0, this.plotWidth]);
    this.yScale.range([this.plotHeight, 0]);

    this.render();
    this.changeDetector.markForCheck();
  }

  private render(): void {
    if (this.plotWidth <= 0 || this.plotHeight <= 0) {
      this.series = [];
      return;
    }

    const active = this.activeSeries();
    const yMax = active.reduce((max, entry) => Math.max(max, this.maxOf(entry.values)), 0);

    this.yScale.domain([0, yMax > 0 ? yMax * Y_AXIS_HEADROOM : 1]);
    this.series = active.map((entry) => ({
      key: entry.key,
      colour: entry.colour,
      bars: this.toBars(entry.values),
    }));

    this.renderAxes();
    this.updatePol1Line();
  }

  /**
   * Resets the background sideband slider to the full axis, and the signal window back to its
   * fixed-width default position (`defaultSignalWindow`) — the two ranges reset independently
   * since only the background range is a free two-handle selection.
   */
  resetRange(): void {
    if (!(this.xmax > this.xmin)) {
      return;
    }
    this.backgroundStart = this.xmin;
    this.backgroundEnd = this.xmax;
    this.backgroundFitRangeChange.emit([this.xmin, this.xmax]);

    const [defaultStart, defaultEnd] = this.defaultSignalWindow;
    this.windowStart = defaultStart;
    this.windowEnd = defaultEnd;
    this.massWindowChange.emit([defaultStart, defaultEnd]);
  }

  /** Which series are drawn, given the mode and the student's toggles. */
  private activeSeries(): SeriesEntry[] {
    if (this.mode === 'subtracted') {
      return [
        { key: 'residual', colour: SERIES_COLOURS.residual, values: this.residual, labelKey: '' },
      ];
    }

    const active: SeriesEntry[] = [];

    if (this.primarySeries !== null && this.isSeriesVisible(this.primarySeries.key)) {
      active.push(this.primarySeries);
    }

    // Merging the same-charge series shows the student the object that is actually going to
    // be subtracted. Only meaningful when there is more than one to merge (Pb-Pb has only one).
    if (this.showBackgroundSum && this.secondarySeries.length > 1) {
      if (
        this.mergedSeries !== null &&
        this.secondarySeries.some((s) => this.isSeriesVisible(s.key))
      ) {
        active.push(this.mergedSeries);
      }
      return active;
    }

    for (const entry of this.secondarySeries) {
      if (this.isSeriesVisible(entry.key)) {
        active.push(entry);
      }
    }

    return active;
  }

  isSeriesVisible(key: string): boolean {
    return this.visibility[key] !== false;
  }

  private maxOf(values: Float64Array | number[]): number {
    let max = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > max) {
        max = values[i];
      }
    }
    return max;
  }

  /**
   * Bar edges go through `xScale` rather than fixed index math so the clip-path in the
   * template can safely hide anything that ever falls outside the plotting area (e.g. during a
   * resize), even though the axis itself no longer zooms.
   */
  private toBars(values: Float64Array | number[]): Bar[] {
    const bars: Bar[] = [];
    const binWidth = (this.xmax - this.xmin) / this.bins;

    for (let bin = 0; bin < this.bins; bin++) {
      const value = values[bin];
      if (!(value > 0)) {
        continue;
      }

      const dataX0 = this.xmin + bin * binWidth;
      const screenX0 = this.xScale(dataX0);
      const screenX1 = this.xScale(dataX0 + binWidth);
      if (screenX1 < 0 || screenX0 > this.plotWidth) {
        continue;
      }

      const y = this.yScale(value);
      bars.push({
        x: MARGIN.left + screenX0,
        y: MARGIN.top + y,
        width: Math.max(0.8, screenX1 - screenX0),
        height: Math.max(0, this.plotHeight - y),
      });
    }

    return bars;
  }

  private renderAxes(): void {
    const svg = d3.select(this.svgRef.nativeElement);

    svg
      .select<SVGGElement>('.x-axis')
      .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top + this.plotHeight})`)
      .call(d3.axisBottom(this.xScale).ticks(7) as never);

    svg
      .select<SVGGElement>('.y-axis')
      .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`)
      .call(d3.axisLeft(this.yScale).ticks(5) as never);
  }

  /**
   * Shaded band + edge guides for one of the two ranges, coloured like its matching slider
   * (signal = pink, background = navy — same accents LSA uses for its fit-selector sliders).
   * Follows the live thumbs, not the snapped @Input, so the shading stays glued to the drag.
   */
  private rangeBand(
    start: number,
    end: number
  ): { x: number; width: number; lineX0: number; lineX1: number } | null {
    if (this.mode !== 'subtracted' || this.plotWidth <= 0) {
      return null;
    }
    const x0 = MARGIN.left + this.xScale(start);
    const x1 = MARGIN.left + this.xScale(end);
    return { x: Math.min(x0, x1), width: Math.max(0, Math.abs(x1 - x0)), lineX0: x0, lineX1: x1 };
  }

  /** Signal counting window: everything inside it (above the Pol1 line) is the yield. */
  get windowBand() {
    return this.rangeBand(this.windowStart, this.windowEnd);
  }

  /** Sidebands the Pol1 line is fitted to. */
  get backgroundBand() {
    return this.rangeBand(this.backgroundStart, this.backgroundEnd);
  }

  /**
   * Pol1 line drawn only across the background fit range it was actually fitted to (frozen in
   * `fitResult.backgroundFitRange` at the last Fit click), exactly like LSA's fit curves never
   * extending past their own sideband selection — dragging the slider afterwards must not
   * stretch or move this line until Fit is pressed again.
   */
  get pol1Line(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (this.mode !== 'subtracted' || this.fitResult === null || this.plotWidth <= 0) {
      return null;
    }
    const [a, b] = this.fitResult.pol1;
    const [x0, x1] = this.fitResult.backgroundFitRange;
    return {
      x1: MARGIN.left + this.xScale(x0),
      y1: MARGIN.top + this.yScale(Math.max(0, a + b * x0)),
      x2: MARGIN.left + this.xScale(x1),
      y2: MARGIN.top + this.yScale(Math.max(0, a + b * x1)),
    };
  }

  /**
   * Snap the Pol1 line to its fitted endpoints (or hide it). LSA morphs a multi-point
   * path `d` over 200 ms; for a straight residual line that grow-from-baseline effect
   * just felt slow, so we set geometry immediately instead.
   */
  private updatePol1Line(): void {
    if (!this.pol1LineRef) {
      return;
    }
    const line = this.pol1Line;
    const el = d3.select(this.pol1LineRef.nativeElement);
    // Cancel any in-flight transition left over from an older build.
    el.interrupt();

    if (line === null) {
      el
        .attr('x1', MARGIN.left + this.xScale(this.backgroundStart))
        .attr('x2', MARGIN.left + this.xScale(this.backgroundEnd))
        .attr('y1', MARGIN.top + this.yScale(0))
        .attr('y2', MARGIN.top + this.yScale(0))
        .attr('opacity', 0);
      return;
    }

    el
      .attr('x1', line.x1)
      .attr('y1', line.y1)
      .attr('x2', line.x2)
      .attr('y2', line.y2)
      .attr('opacity', 1);
  }

  onWindowChange(): void {
    this.windowDragging = true;
    this.massWindowChange.emit([this.windowStart, this.windowEnd]);
  }

  onWindowChangeEnd(): void {
    this.windowDragging = false;
    this.massWindowChange.emit([this.windowStart, this.windowEnd]);
  }

  onBackgroundRangeChange(): void {
    this.backgroundRangeDragging = true;
    this.backgroundFitRangeChange.emit([this.backgroundStart, this.backgroundEnd]);
  }

  onBackgroundRangeChangeEnd(): void {
    this.backgroundRangeDragging = false;
    this.backgroundFitRangeChange.emit([this.backgroundStart, this.backgroundEnd]);
  }

  onToggle(key: string): void {
    this.toggleSeries.emit(key);
  }

  onBackgroundSumChange(show: boolean): void {
    this.showBackgroundSumChange.emit(show);
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }

  protected readonly colours = SERIES_COLOURS;
}
