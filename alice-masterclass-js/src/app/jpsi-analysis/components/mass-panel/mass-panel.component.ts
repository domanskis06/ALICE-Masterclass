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
  MASS_BINS,
  MASS_CHART_ASPECT,
  MASS_XMAX,
  MASS_XMIN,
  MassPanelMode,
  SeriesVisibility,
  jpsiResponsiveChartHeight,
} from '../../models/jpsi.models';
import { ResidualFitResult } from '../../services/jpsi-residual-fit.service';

import { SERIES_COLOURS } from '../../models/series-colours';

const MARGIN = { top: 10, right: 14, bottom: 40, left: 56 };
/** Headroom above the tallest bar so it never touches the plot's top edge. */
const Y_AXIS_HEADROOM = 1.2;
/** How long the Pol1 line takes to glide into (or out of) place — same feel as LSA's curves. */
const POL1_ANIMATION_MS = 400;

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
 * and two independent sliders: `backgroundFitRange` (what the line is fitted to) and
 * `massWindow` (what gets counted as signal). Bars are used rather than smooth densities
 * because the whole lesson is that these are counts that get subtracted from each other.
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
  @ViewChild('brushGroup') private brushGroupRef!: ElementRef<SVGGElement>;
  @ViewChild('pol1LineEl') private pol1LineRef!: ElementRef<SVGLineElement>;

  width = 0;
  height = 0;
  series: RenderedSeries[] = [];

  /** Unique per instance so several mass panels can exist in the DOM without clip-id clashes. */
  readonly clipId = `jpsi-mass-panel-clip-${nextClipId++}`;

  /**
   * Visible x-domain: equals [xmin, xmax] until the student brush-zooms the chart, exactly
   * like LSA's `HistogramComponent.xDomainZoom`. Both sliders' floor/ceil follow this, not the
   * full dataset span, so a zoomed-in view can only select ranges inside what is on screen.
   */
  private zoomDomain: [number, number] = [this.xmin, this.xmax];
  private readonly brushX: d3.BrushBehavior<unknown> = d3.brushX();

  windowStart = this.massWindow[0];
  windowEnd = this.massWindow[1];
  backgroundStart = this.backgroundFitRange[0];
  backgroundEnd = this.backgroundFitRange[1];

  sliderOptions: Options = this.buildSliderOptions(this.zoomDomain);
  backgroundSliderOptions: Options = this.buildSliderOptions(this.zoomDomain);

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
    this.brushX.on('end', (event) => this.onBrushEnd(event));
    this.resizeObserver = new ResizeObserver(() => this.measureAndRender());
    this.resizeObserver.observe(this.hostRef.nativeElement);
    window.addEventListener('resize', this.onWindowResize);
    // Start invisible: the very first render must not flash a stray line at (0,0).
    d3.select(this.pol1LineRef.nativeElement).attr('opacity', 0);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['xmin'] || changes['xmax']) {
      // A new dataset/centrality — the old zoom no longer means anything.
      this.zoomDomain = [this.xmin, this.xmax];
    }
    if (changes['xmin'] || changes['xmax'] || changes['bins']) {
      this.sliderOptions = this.buildSliderOptions(this.zoomDomain);
      this.backgroundSliderOptions = this.buildSliderOptions(this.zoomDomain);
      this.xScale.domain(this.zoomDomain);
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
  private buildSliderOptions(domain: [number, number]): Options {
    return {
      floor: domain[0],
      ceil: domain[1],
      step: (this.xmax - this.xmin) / this.bins,
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

    this.xScale.domain(this.zoomDomain).range([0, this.plotWidth]);
    this.yScale.range([this.plotHeight, 0]);

    this.render();
    this.updateBrush();
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

  // --- Zoom (brush-drag on the chart), mirroring LSA's HistogramComponent ------------------

  /** True once the student has brush-zoomed away from the full [xmin, xmax] span. */
  get isZoomed(): boolean {
    return this.zoomDomain[0] !== this.xmin || this.zoomDomain[1] !== this.xmax;
  }

  /** Keeps the brush's hit area in sync with the plot's current pixel size. */
  private updateBrush(): void {
    if (!this.brushGroupRef) {
      return;
    }
    const selection = d3.select(this.brushGroupRef.nativeElement);
    this.brushX.extent([
      [0, 0],
      [Math.max(0, this.plotWidth), Math.max(0, this.plotHeight)],
    ]);
    selection.call(this.brushX as never);
    selection.on('dblclick', () => this.resetZoom());
  }

  private onBrushEnd(event: d3.D3BrushEvent<unknown>): void {
    // Ignore the programmatic `.move(null)` call below, which would otherwise re-enter here.
    if (!event.sourceEvent) {
      return;
    }
    const selection = event.selection as [number, number] | null;
    if (selection === null) {
      return;
    }

    const [screenX0, screenX1] = selection;
    const domain: [number, number] = [this.xScale.invert(screenX0), this.xScale.invert(screenX1)];

    if (this.brushGroupRef) {
      d3.select(this.brushGroupRef.nativeElement).call(this.brushX.move as never, null);
    }

    this.applyZoomDomain(domain);
  }

  private applyZoomDomain(domain: [number, number]): void {
    const lo = Math.max(this.xmin, Math.min(domain[0], domain[1]));
    const hi = Math.min(this.xmax, Math.max(domain[0], domain[1]));
    if (!(hi > lo)) {
      return;
    }
    this.zoomDomain = [lo, hi];
    this.refreshRangesForZoom();
    this.render();
  }

  /** Public unzoom — restores the full axis view, used by the "Reset zoom" button. */
  resetZoom(): void {
    this.zoomDomain = [this.xmin, this.xmax];
    this.refreshRangesForZoom();
    this.render();
  }

  /**
   * Both sliders' floor/ceil follow the current zoom, same as LSA's fit-selector `axisRange`:
   * narrowing the zoom clamps any selection that falls outside it (shifting it into view,
   * preserving its width when possible); widening it back out never moves an already-valid
   * selection.
   */
  private refreshRangesForZoom(): void {
    this.sliderOptions = this.buildSliderOptions(this.zoomDomain);
    this.backgroundSliderOptions = this.buildSliderOptions(this.zoomDomain);

    const clampedWindow = MassPanelComponent.clampRangeToView(
      [this.windowStart, this.windowEnd],
      this.zoomDomain
    );
    if (clampedWindow[0] !== this.windowStart || clampedWindow[1] !== this.windowEnd) {
      this.windowStart = clampedWindow[0];
      this.windowEnd = clampedWindow[1];
      this.massWindowChange.emit(clampedWindow);
    }

    const clampedBackground = MassPanelComponent.clampRangeToView(
      [this.backgroundStart, this.backgroundEnd],
      this.zoomDomain
    );
    if (clampedBackground[0] !== this.backgroundStart || clampedBackground[1] !== this.backgroundEnd) {
      this.backgroundStart = clampedBackground[0];
      this.backgroundEnd = clampedBackground[1];
      this.backgroundFitRangeChange.emit(clampedBackground);
    }
  }

  /**
   * Keep a range inside a (possibly narrower) view: clip it, or shift it into view — preserving
   * width when possible — if it now lies entirely outside. Same rule LSA's `FitService` applies
   * on zoom.
   */
  private static clampRangeToView(range: [number, number], view: [number, number]): [number, number] {
    const [v0, v1] = view;
    if (!(v1 > v0)) {
      return range;
    }
    const [a, b] = range;
    if (!(b > a)) {
      return [v0, v1];
    }
    const width = b - a;
    if (b < v0) {
      return [v0, Math.min(v1, v0 + width)];
    }
    if (a > v1) {
      return [Math.max(v0, v1 - width), v1];
    }
    return [Math.max(a, v0), Math.min(b, v1)];
  }

  /** Resets both range sliders to the extremes of the current (possibly zoomed) view. */
  resetRange(): void {
    const [floor, ceil] = this.zoomDomain;
    if (!(ceil > floor)) {
      return;
    }
    this.windowStart = floor;
    this.windowEnd = ceil;
    this.backgroundStart = floor;
    this.backgroundEnd = ceil;
    this.massWindowChange.emit([floor, ceil]);
    this.backgroundFitRangeChange.emit([floor, ceil]);
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
   * Bar edges go through `xScale` (not fixed index math) so a brush-zoom actually rescales and
   * shifts them; the clip-path in the template hides whatever falls outside the zoomed view.
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
   * Glides the Pol1 line into (or out of) place via a d3 attribute transition — the same
   * technique LSA's `FitHistogramComponent` uses for its curves — instead of an Angular
   * binding that would snap it into view instantly. When there is no fit yet (or it was just
   * cleared), the line collapses to a flat, invisible baseline spanning the current background
   * slider, so the next fit always animates *from* that baseline rather than from nothing.
   */
  private updatePol1Line(): void {
    if (!this.pol1LineRef) {
      return;
    }
    const line = this.pol1Line;
    const target =
      line !== null
        ? { ...line, opacity: 1 }
        : {
            x1: MARGIN.left + this.xScale(this.backgroundStart),
            x2: MARGIN.left + this.xScale(this.backgroundEnd),
            y1: MARGIN.top + this.yScale(0),
            y2: MARGIN.top + this.yScale(0),
            opacity: 0,
          };

    d3.select(this.pol1LineRef.nativeElement)
      .transition()
      .duration(POL1_ANIMATION_MS)
      .attr('x1', target.x1)
      .attr('y1', target.y1)
      .attr('x2', target.x2)
      .attr('y2', target.y2)
      .attr('opacity', target.opacity);
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
