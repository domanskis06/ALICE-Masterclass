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
import * as d3 from 'd3';

import { jpsiResponsiveChartHeight, MASS_CHART_ASPECT } from '../../models/jpsi.models';
import { PbPbPanelMode, PublishedMinvHistogram } from '../../models/pbpb-minv.models';
import { SERIES_COLOURS } from '../../models/series-colours';

const MARGIN = { top: 10, right: 14, bottom: 40, left: 56 };

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RenderedSeries {
  key: 'like' | 'unlike';
  colour: string;
  bars: Bar[];
}

/** Which of the two raw series are currently drawn — lets the student isolate one at a time. */
export interface PbPbSeriesVisibility {
  unlike: boolean;
  like: boolean;
}

/**
 * Left panel for the published Pb-Pb datasets: the raw digitized histogram from Fig. 15,
 * unlike-sign (red) and like-sign (blue) shown together by default, with a toggle each so the
 * student can isolate one series at a time. Binning comes entirely from the histogram (43
 * bins, 2.0–3.72 GeV/c² today), not from the fixed MASS_* constants used by the track-based
 * mass panel.
 */
@Component({
  selector: 'app-jpsi-pbpb-minv-panel',
  templateUrl: './pbpb-minv-panel.component.html',
  styleUrls: ['./pbpb-minv-panel.component.scss'],
  standalone: false,
})
export class PbPbMinvPanelComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() histogram: PublishedMinvHistogram | null = null;
  @Input() mode: PbPbPanelMode = 'explore';
  @Input() loading = false;
  @Input() canSubtract = false;
  @Input() revision = 0;

  @Output() subtract = new EventEmitter<void>();

  /** Purely local display preference — both series start visible. */
  visibility: PbPbSeriesVisibility = { unlike: true, like: true };

  @ViewChild('host') private hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('svg') private svgRef!: ElementRef<SVGSVGElement>;

  width = 0;
  height = 0;
  series: RenderedSeries[] = [];

  private resizeObserver: ResizeObserver | null = null;
  private viewReady = false;
  private readonly onWindowResize = (): void => this.measureAndRender();

  private readonly xScale = d3.scaleLinear();
  private readonly yScale = d3.scaleLinear();

  protected readonly colours = SERIES_COLOURS;

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

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.resizeObserver = new ResizeObserver(() => this.measureAndRender());
    this.resizeObserver.observe(this.hostRef.nativeElement);
    window.addEventListener('resize', this.onWindowResize);
  }

  ngOnChanges(): void {
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
    const histogram = this.histogram;
    if (this.plotWidth <= 0 || this.plotHeight <= 0 || histogram === null) {
      this.series = [];
      return;
    }

    this.xScale.domain([histogram.xmin, histogram.xmax]);

    const yMax = Math.max(
      this.visibility.unlike ? this.maxOf(histogram.unlike) : 0,
      this.visibility.like ? this.maxOf(histogram.like) : 0,
      1
    );
    this.yScale.domain([0, yMax]);

    const active: Array<{ key: 'like' | 'unlike'; colour: string; values: number[] }> = [];
    // Blue (like-sign) first, red (unlike-sign) on top — matches Fig. 15's presentation.
    if (this.visibility.like) {
      active.push({ key: 'like', colour: this.colours.posPos, values: histogram.like });
    }
    if (this.visibility.unlike) {
      active.push({ key: 'unlike', colour: this.colours.unlike, values: histogram.unlike });
    }

    this.series = active.map((entry) => ({
      key: entry.key,
      colour: entry.colour,
      bars: this.toBars(histogram, entry.values),
    }));

    this.renderAxes();
  }

  private maxOf(values: number[]): number {
    let max = 0;
    for (const value of values) {
      if (value > max) {
        max = value;
      }
    }
    return max;
  }

  private toBars(histogram: PublishedMinvHistogram, values: number[]): Bar[] {
    const bars: Bar[] = [];
    const barWidth = this.plotWidth / histogram.bins;

    for (let bin = 0; bin < histogram.bins; bin++) {
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

  onSubtractClick(): void {
    this.subtract.emit();
  }

  onToggle(key: 'unlike' | 'like'): void {
    this.visibility = { ...this.visibility, [key]: !this.visibility[key] };
    if (this.viewReady) {
      this.render();
    }
  }
}
