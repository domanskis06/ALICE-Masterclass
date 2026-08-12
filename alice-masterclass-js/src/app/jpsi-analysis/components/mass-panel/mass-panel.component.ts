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

  @ViewChild('host') private hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svg') private svgRef!: ElementRef<SVGSVGElement>;

  width = 0;
  height = 0;
  series: RenderedSeries[] = [];

  windowStart = this.massWindow[0];
  windowEnd = this.massWindow[1];
  backgroundStart = this.backgroundFitRange[0];
  backgroundEnd = this.backgroundFitRange[1];

  sliderOptions: Options = this.buildSliderOptions();
  backgroundSliderOptions: Options = this.buildSliderOptions();

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
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['xmin'] || changes['xmax'] || changes['bins']) {
      this.sliderOptions = this.buildSliderOptions();
      this.backgroundSliderOptions = this.buildSliderOptions();
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

  private buildSliderOptions(): Options {
    return {
      floor: this.xmin,
      ceil: this.xmax,
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

    this.yScale.domain([0, yMax > 0 ? yMax : 1]);
    this.series = active.map((entry) => ({
      key: entry.key,
      colour: entry.colour,
      bars: this.toBars(entry.values),
    }));

    this.renderAxes();
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

  private toBars(values: Float64Array | number[]): Bar[] {
    const bars: Bar[] = [];
    const barWidth = this.plotWidth / this.bins;

    for (let bin = 0; bin < this.bins; bin++) {
      const value = values[bin];
      if (!(value > 0)) {
        continue;
      }

      const y = this.yScale(value);
      bars.push({
        x: MARGIN.left + bin * barWidth,
        y: MARGIN.top + y,
        width: Math.max(0.8, barWidth),
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

  /** Shaded band showing the counting window, drawn over the residual. */
  get windowRect(): { x: number; width: number } | null {
    if (this.mode !== 'subtracted' || this.plotWidth <= 0) {
      return null;
    }

    // Follow the live thumbs, not the snapped @Input, so the shade stays glued to the drag.
    const x0 = this.xScale(this.windowStart);
    const x1 = this.xScale(this.windowEnd);

    return { x: MARGIN.left + x0, width: Math.max(0, x1 - x0) };
  }

  /** Dashed guides marking the sidebands the Pol1 line is fitted to. */
  get backgroundRangeGuides(): [number, number] | null {
    if (this.mode !== 'subtracted' || this.plotWidth <= 0) {
      return null;
    }
    return [MARGIN.left + this.xScale(this.backgroundStart), MARGIN.left + this.xScale(this.backgroundEnd)];
  }

  /** Pol1 line drawn across the whole visible axis, clamped to the chart's y >= 0 domain. */
  get pol1Line(): { x1: number; y1: number; x2: number; y2: number } | null {
    if (this.mode !== 'subtracted' || this.fitResult === null || this.plotWidth <= 0) {
      return null;
    }
    const [a, b] = this.fitResult.pol1;
    return {
      x1: MARGIN.left + this.xScale(this.xmin),
      y1: MARGIN.top + this.yScale(Math.max(0, a + b * this.xmin)),
      x2: MARGIN.left + this.xScale(this.xmax),
      y2: MARGIN.top + this.yScale(Math.max(0, a + b * this.xmax)),
    };
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
