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
  ViewChild,
} from '@angular/core';
import { Options } from '@angular-slider/ngx-slider';
import * as d3 from 'd3';

import {
  DEFAULT_MASS_WINDOW,
  MASS_BINS,
  MASS_BIN_WIDTH,
  MASS_CHART_ASPECT,
  MASS_WINDOW_LIMITS,
  MASS_XMAX,
  MASS_XMIN,
  MassHistograms,
  MassPanelMode,
  SeriesVisibility,
  SignalResult,
  jpsiResponsiveChartHeight,
} from '../../models/jpsi.models';

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

/**
 * The invariant mass panel.
 *
 * One chart, several overlaid series. In explore mode the student compares opposite-charge
 * pairs against same-charge pairs; after subtraction only the residual is drawn. Bars are
 * used rather than smooth densities because the whole lesson is that these are counts that
 * get subtracted from each other.
 */
@Component({
  selector: 'app-jpsi-mass-panel',
  templateUrl: './mass-panel.component.html',
  styleUrls: ['./mass-panel.component.scss'],
  standalone: false,
})
export class MassPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() mass!: MassHistograms;
  @Input() residual: Float64Array = new Float64Array(MASS_BINS);
  @Input() background: Float64Array = new Float64Array(MASS_BINS);
  @Input() mode: MassPanelMode = 'explore';
  @Input() visibility: SeriesVisibility = { unlike: true, posPos: true, negNeg: true };
  @Input() showBackgroundSum = false;
  @Input() massWindow: [number, number] = [...DEFAULT_MASS_WINDOW];
  @Input() liveResult: SignalResult | null = null;
  @Input() canSubtract = false;
  @Input() canAccept = false;
  @Input() tooWideSelection = false;
  @Input() hasData = false;
  @Input() revision = 0;

  @Output() toggleSeries = new EventEmitter<'unlike' | 'posPos' | 'negNeg'>();
  @Output() showBackgroundSumChange = new EventEmitter<boolean>();
  @Output() subtract = new EventEmitter<void>();
  @Output() showComponents = new EventEmitter<void>();
  @Output() massWindowChange = new EventEmitter<[number, number]>();
  @Output() acceptResult = new EventEmitter<void>();

  @ViewChild('host') private hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svg') private svgRef!: ElementRef<SVGSVGElement>;

  width = 0;
  height = 0;
  series: RenderedSeries[] = [];

  windowStart = this.massWindow[0];
  windowEnd = this.massWindow[1];
  windowOptions: Options = {
    floor: MASS_WINDOW_LIMITS[0],
    ceil: MASS_WINDOW_LIMITS[1],
    step: MASS_BIN_WIDTH,
    translate: (value: number) => value.toFixed(2),
  };

  private resizeObserver: ResizeObserver | null = null;
  private viewReady = false;
  private readonly onWindowResize = (): void => this.measureAndRender();

  private readonly xScale = d3.scaleLinear().domain([MASS_XMIN, MASS_XMAX]);
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

  ngOnChanges(): void {
    this.windowStart = this.massWindow[0];
    this.windowEnd = this.massWindow[1];
    if (this.viewReady) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.onWindowResize);
  }

  private measureAndRender(): void {
    const rect = this.hostRef.nativeElement.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    this.width = rect.width;
    this.height = jpsiResponsiveChartHeight(rect.width, MASS_CHART_ASPECT, 280);

    this.xScale.range([0, this.plotWidth]);
    this.yScale.range([this.plotHeight, 0]);

    this.render();
    this.changeDetector.markForCheck();
  }

  private render(): void {
    if (this.plotWidth <= 0 || this.plotHeight <= 0 || this.mass === undefined) {
      this.series = [];
      return;
    }

    const active = this.activeSeries();
    const yMax = active.reduce(
      (max, entry) => Math.max(max, this.maxOf(entry.values)),
      0
    );

    this.yScale.domain([0, yMax > 0 ? yMax : 1]);
    this.series = active.map((entry) => ({
      key: entry.key,
      colour: entry.colour,
      bars: this.toBars(entry.values),
    }));

    this.renderAxes();
  }

  /** Which series are drawn, given the mode and the student's toggles. */
  private activeSeries(): Array<{ key: string; colour: string; values: Float64Array }> {
    if (this.mode === 'subtracted') {
      return [{ key: 'residual', colour: SERIES_COLOURS.residual, values: this.residual }];
    }

    const active: Array<{ key: string; colour: string; values: Float64Array }> = [];

    if (this.visibility.unlike) {
      active.push({ key: 'unlike', colour: SERIES_COLOURS.unlike, values: this.mass.unlike });
    }

    // The two same-charge series are individually small; merging them shows the student
    // the object that is actually going to be subtracted.
    if (this.showBackgroundSum) {
      if (this.visibility.posPos || this.visibility.negNeg) {
        active.push({
          key: 'background',
          colour: SERIES_COLOURS.background,
          values: this.background,
        });
      }
      return active;
    }

    if (this.visibility.posPos) {
      active.push({ key: 'posPos', colour: SERIES_COLOURS.posPos, values: this.mass.posPos });
    }
    if (this.visibility.negNeg) {
      active.push({ key: 'negNeg', colour: SERIES_COLOURS.negNeg, values: this.mass.negNeg });
    }

    return active;
  }

  private maxOf(values: Float64Array): number {
    let max = 0;
    for (let i = 0; i < values.length; i++) {
      if (values[i] > max) {
        max = values[i];
      }
    }
    return max;
  }

  private toBars(values: Float64Array): Bar[] {
    const bars: Bar[] = [];
    const barWidth = this.plotWidth / MASS_BINS;

    for (let bin = 0; bin < MASS_BINS; bin++) {
      const value = values[bin];
      if (value <= 0) {
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

    const x0 = this.xScale(this.massWindow[0]);
    const x1 = this.xScale(this.massWindow[1]);

    return { x: MARGIN.left + x0, width: Math.max(0, x1 - x0) };
  }

  onWindowChange(): void {
    this.massWindowChange.emit([this.windowStart, this.windowEnd]);
  }

  onToggle(series: 'unlike' | 'posPos' | 'negNeg'): void {
    this.toggleSeries.emit(series);
  }

  onBackgroundSumChange(show: boolean): void {
    this.showBackgroundSumChange.emit(show);
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }

  protected readonly colours = SERIES_COLOURS;
}
