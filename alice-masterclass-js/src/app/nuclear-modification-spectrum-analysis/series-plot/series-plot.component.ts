import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';

import { RaaHistogram, RaaSeries } from '../../shared/models/raa/spectrum';
import {
  drawGrid,
  drawLabel,
  leftMarginFor,
  measure,
  NMF_PLOT_FALLBACK,
  NmfPlotBox,
  NmfPlotMargin,
} from '../../shared/utils/nmf-plot-svg';

/** Points with error bars, or a step outline for a plain histogram. */
export type NmfSeriesMode = 'points' | 'steps';

/**
 * Series plot for Spectrum Analysis: logarithmic axes, error bars and a reference
 * line at one. Nothing in the repository does this — `HistogramComponent` hard-codes
 * `d3.scaleLinear` and draws no uncertainties — so it is a component of its own,
 * shared by the R_AA, R_CP, p_T spectrum and multiplicity plots.
 */
@Component({
  selector: 'app-nmf-series-plot',
  templateUrl: './series-plot.component.html',
  styleUrls: ['./series-plot.component.scss'],
  standalone: false,
})
export class NmfSeriesPlotComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  @Input() series: RaaSeries[] = [];
  @Input() mode: NmfSeriesMode = 'points';
  @Input() xLog = true;
  @Input() yLog = true;
  @Input() yDomain: [number, number] | null = null;
  /** Horizontal guide, drawn at one for the ratios. */
  @Input() referenceLine: number | null = null;
  @Input() xLabel = '';
  @Input() yLabel = '';
  @Input() showLegend = true;
  @Input() emptyLabel = '';
  /**
   * ROOT-style statistics box. The desktop app shows one on every histogram; the
   * card head carries the same numbers, so it is opt-in for the enlarged view.
   */
  @Input() statBox: { label: string; value: string }[] = [];

  private ready = false;
  private box: NmfPlotBox = { ...NMF_PLOT_FALLBACK };
  private resizeObserver?: ResizeObserver;

  constructor(
    private readonly host: ElementRef<HTMLElement>,
    private readonly zone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    this.ready = true;
    this.observeSize();
    this.draw();
  }

  ngOnChanges(): void {
    if (this.ready) {
      this.draw();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  /** Redraw at the element's real size; re-laying out a card must not stretch it. */
  private observeSize(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    this.zone.runOutsideAngular(() => {
      this.resizeObserver = new ResizeObserver(() => {
        const next = measure(this.host.nativeElement);
        if (next.width !== this.box.width || next.height !== this.box.height) {
          this.draw();
        }
      });
      this.resizeObserver.observe(this.host.nativeElement);
    });
  }

  private draw(): void {
    this.box = measure(this.host.nativeElement);
    const { width, height } = this.box;
    const margin = this.marginFor();

    const svg = d3.select(this.svgRef.nativeElement);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'none');

    const drawable = this.series.filter((s) => s.points.length > 0);
    if (!drawable.length) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('class', 'nmf-plot-empty')
        .text(this.emptyLabel);
      return;
    }

    const x = this.buildXScale(drawable, margin, width);
    const y = this.buildYScale(drawable, margin, height);
    const plot = svg.append('g');

    drawGrid(plot, y, margin.left, width - margin.right, yTicksOf(y, this.yLog));
    this.drawAxes(plot, x, y, margin, width, height);
    if (this.referenceLine !== null) {
      this.drawReferenceLine(plot, x, y, this.referenceLine, margin);
    }
    for (const s of drawable) {
      if ((s.render ?? this.mode) === 'steps') {
        this.drawSteps(plot, s, x, y);
      } else {
        this.drawPoints(plot, s, x, y);
      }
    }
    if (this.showLegend) {
      this.drawLegend(svg, drawable, margin, width);
    }
    if (this.statBox.length) {
      this.drawStatBox(svg, margin, width, drawable.length);
    }
  }

  /**
   * The caption sits outside the tick labels, so a long unit widens the margin
   * instead of being clipped — the `counts / event / GeV/c / N_coll` case.
   */
  private marginFor(): NmfPlotMargin {
    const compact = this.box.height < 240;
    return {
      top: 14,
      right: 18,
      bottom: compact ? 38 : 46,
      left: leftMarginFor(this.yLabel, this.yLog ? 52 : 44),
    };
  }

  private buildXScale(
    series: RaaSeries[],
    margin: NmfPlotMargin,
    width: number,
  ): d3.ScaleContinuousNumeric<number, number> {
    const low = d3.min(series, (s) => d3.min(s.points, (p) => p.xLow)) ?? 0;
    const high = d3.max(series, (s) => d3.max(s.points, (p) => p.xHigh)) ?? 1;
    const range: [number, number] = [margin.left, width - margin.right];
    if (this.xLog) {
      return d3.scaleLog().domain([Math.max(low, 1e-3), high]).range(range);
    }
    return d3.scaleLinear().domain([low, high]).range(range);
  }

  private buildYScale(
    series: RaaSeries[],
    margin: NmfPlotMargin,
    height: number,
  ): d3.ScaleContinuousNumeric<number, number> {
    const range: [number, number] = [height - margin.bottom, margin.top];
    if (this.yDomain) {
      return d3.scaleLinear().domain(this.yDomain).range(range).clamp(true);
    }

    const values = series.flatMap((s) =>
      s.points.flatMap((p) => [p.y - p.yErr, p.y, p.y + p.yErr]),
    );
    if (this.yLog) {
      const positive = values.filter((v) => v > 0);
      const low = d3.min(positive) ?? 1e-6;
      const high = d3.max(positive) ?? 1;
      return d3
        .scaleLog()
        .domain([low / 1.6, high * 1.6])
        .range(range);
    }
    const high = d3.max(values) ?? 1;
    return d3
      .scaleLinear()
      .domain([Math.min(d3.min(values) ?? 0, 0), high * 1.12])
      .range(range);
  }

  private drawAxes(
    plot: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleContinuousNumeric<number, number>,
    y: d3.ScaleContinuousNumeric<number, number>,
    margin: NmfPlotMargin,
    width: number,
    height: number,
  ): void {
    const bottom = height - margin.bottom;
    const tight = width < 420;

    plot
      .append('g')
      .attr('class', 'nmf-plot-axis')
      .attr('transform', `translate(0,${bottom})`)
      .call(
        this.xLog
          ? d3.axisBottom(x).ticks(tight ? 4 : 6, '~g')
          : d3.axisBottom(x).ticks(tight ? 4 : 6),
      );

    plot
      .append('g')
      .attr('class', 'nmf-plot-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(
        this.yLog
          ? d3.axisLeft(y).ticks(4, '~e')
          : d3.axisLeft(y).ticks(tight ? 4 : 5),
      );

    if (this.xLabel) {
      drawLabel(plot, this.xLabel)
        .attr('class', 'nmf-plot-axis-label')
        .attr('x', (margin.left + width - margin.right) / 2)
        .attr('y', height - 8)
        .attr('text-anchor', 'middle');
    }
    if (this.yLabel) {
      drawLabel(plot, this.yLabel)
        .attr('class', 'nmf-plot-axis-label')
        .attr('transform', 'rotate(-90)')
        .attr('x', -(margin.top + height - margin.bottom) / 2)
        .attr('y', 14)
        .attr('text-anchor', 'middle');
    }
  }

  private drawReferenceLine(
    plot: d3.Selection<SVGGElement, unknown, null, undefined>,
    x: d3.ScaleContinuousNumeric<number, number>,
    y: d3.ScaleContinuousNumeric<number, number>,
    at: number,
    margin: NmfPlotMargin,
  ): void {
    const [x0, x1] = x.range();
    plot
      .append('line')
      .attr('class', 'nmf-plot-reference')
      .attr('x1', x0)
      .attr('x2', x1)
      .attr('y1', y(at))
      .attr('y2', y(at));
    // Left of the plot, where the legend never is.
    plot
      .append('text')
      .attr('class', 'nmf-plot-reference-label')
      .attr('x', margin.left + 5)
      .attr('y', y(at) - 5)
      .attr('text-anchor', 'start')
      .text(String(at));
  }

  private drawPoints(
    plot: d3.Selection<SVGGElement, unknown, null, undefined>,
    s: RaaSeries,
    x: d3.ScaleContinuousNumeric<number, number>,
    y: d3.ScaleContinuousNumeric<number, number>,
  ): void {
    const [yBottom, yTop] = y.range();
    const clamp = (value: number) => Math.min(Math.max(value, yTop), yBottom);
    const visible = s.points.filter((p) => !this.yLog || p.y > 0);
    const group = plot.append('g').attr('class', 'nmf-plot-series');

    for (const point of visible) {
      const cx = x(point.x);
      const cy = clamp(y(point.y));
      const upper = clamp(y(point.y + point.yErr));
      const lower = clamp(y(Math.max(point.y - point.yErr, this.yLog ? point.y / 1e3 : -Infinity)));

      group
        .append('line')
        .attr('class', 'nmf-plot-error')
        .attr('stroke', s.color)
        .attr('x1', cx)
        .attr('x2', cx)
        .attr('y1', upper)
        .attr('y2', lower);
      // Horizontal whisker spans the bin, so the reader sees the binning itself.
      group
        .append('line')
        .attr('class', 'nmf-plot-error')
        .attr('stroke', s.color)
        .attr('x1', x(point.xLow))
        .attr('x2', x(point.xHigh))
        .attr('y1', cy)
        .attr('y2', cy);
      group
        .append('circle')
        .attr('fill', s.color)
        .attr('cx', cx)
        .attr('cy', cy)
        .attr('r', 2.6);
    }
  }

  /** Bin outline, the shape ROOT draws for a plain histogram. */
  private drawSteps(
    plot: d3.Selection<SVGGElement, unknown, null, undefined>,
    s: RaaSeries,
    x: d3.ScaleContinuousNumeric<number, number>,
    y: d3.ScaleContinuousNumeric<number, number>,
  ): void {
    const [yBottom] = y.range();
    const path: [number, number][] = [];
    for (const point of s.points) {
      const value = this.yLog && point.y <= 0 ? null : point.y;
      const py = value === null ? yBottom : y(value);
      path.push([x(point.xLow), py]);
      path.push([x(point.xHigh), py]);
    }
    plot
      .append('path')
      .attr('class', 'nmf-plot-steps')
      .classed('nmf-plot-steps--dashed', s.dashed === true)
      .attr('stroke', s.color)
      .attr('d', d3.line()(path) ?? '');
  }

  private drawLegend(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    series: RaaSeries[],
    margin: NmfPlotMargin,
    width: number,
  ): void {
    const legend = svg
      .append('g')
      .attr('class', 'nmf-plot-legend')
      .attr('transform', `translate(${width - margin.right - 6}, ${margin.top + 8})`);

    series.forEach((s, index) => {
      const row = legend.append('g').attr('transform', `translate(0, ${index * 15})`);
      row
        .append('rect')
        .attr('x', -9)
        .attr('y', -7)
        .attr('width', 9)
        .attr('height', 9)
        .attr('fill', s.color);
      row.append('text').attr('x', -14).attr('text-anchor', 'end').text(s.label);
    });
  }

  /** ROOT's stat box, under the legend so the two never collide. */
  private drawStatBox(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    margin: NmfPlotMargin,
    width: number,
    legendRows: number,
  ): void {
    const top = margin.top + 8 + (this.showLegend ? legendRows * 15 + 8 : 0);
    const box = svg
      .append('g')
      .attr('class', 'nmf-plot-statbox')
      .attr('transform', `translate(${width - margin.right - 6}, ${top})`);

    this.statBox.forEach((entry, index) => {
      box
        .append('text')
        .attr('x', 0)
        .attr('y', index * 14)
        .attr('text-anchor', 'end')
        .text(`${entry.label} ${entry.value}`);
    });
  }
}

/** Ticks the grid follows; a log axis gets its decades rather than 5 even steps. */
function yTicksOf(y: d3.ScaleContinuousNumeric<number, number>, log: boolean): number[] {
  return log ? (y as d3.ScaleLogarithmic<number, number>).ticks(4) : y.ticks(5);
}

/** A histogram drawn by the same renderer: bin outline plus sqrt(N) bars. */
export function histogramAsSeries(histogram: RaaHistogram): RaaSeries {
  const points = histogram.counts.map((count, index) => ({
    x: (histogram.edges[index] + histogram.edges[index + 1]) / 2,
    xLow: histogram.edges[index],
    xHigh: histogram.edges[index + 1],
    y: count,
    yErr: Math.sqrt(count),
  }));
  return {
    id: `mult_${histogram.label}`,
    label: histogram.label,
    color: histogram.color,
    points,
  };
}
