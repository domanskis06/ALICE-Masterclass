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

import { RaaHeatmap } from '../../shared/models/raa/spectrum';
import {
  drawLabel,
  leftMarginFor,
  measure,
  NMF_PLOT_FALLBACK,
  NmfPlotBox,
  NmfPlotMargin,
} from '../../shared/utils/nmf-plot-svg';

/**
 * Multiplicity against centrality, the `DrawH2(multCentHist)` half of `Analyse.C`.
 * The colour scale is logarithmic like the notebook's `LogNorm()`, because the
 * band of ordinary events is orders of magnitude denser than its edges. The
 * selected centrality class is marked, so the student can see their own choice
 * as a slice of the plot that defines those classes in the first place.
 */
@Component({
  selector: 'app-nmf-heatmap-plot',
  templateUrl: './heatmap-plot.component.html',
  styleUrls: ['./heatmap-plot.component.scss'],
  standalone: false,
})
export class NmfHeatmapPlotComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;

  @Input() heatmap: RaaHeatmap | null = null;
  @Input() xLabel = '';
  @Input() yLabel = '';
  @Input() emptyLabel = '';

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

  /** Same reason as the series plot: draw at the real size, never stretched. */
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
    const margin: NmfPlotMargin = {
      top: 14,
      // The colour bar and its ticks live in the right margin.
      right: 56,
      bottom: height < 240 ? 38 : 46,
      left: leftMarginFor(this.yLabel, 40),
    };

    const svg = d3.select(this.svgRef.nativeElement);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`).attr('preserveAspectRatio', 'none');

    const map = this.heatmap;
    if (!map || !map.cells.length) {
      svg
        .append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .attr('class', 'nmf-plot-empty')
        .text(this.emptyLabel);
      return;
    }

    const x = d3
      .scaleLinear()
      .domain([map.xEdges[0], map.xEdges[map.xEdges.length - 1]])
      .range([margin.left, width - margin.right]);
    const y = d3
      .scaleLinear()
      .domain([map.yEdges[0], map.yEdges[map.yEdges.length - 1]])
      .range([height - margin.bottom, margin.top]);
    const color = d3
      .scaleSequentialLog(d3.interpolateViridis)
      .domain([1, Math.max(map.maxCount, 2)]);

    const plot = svg.append('g');
    const cellWidth = x(map.xEdges[1]) - x(map.xEdges[0]);
    const cellHeight = y(map.yEdges[0]) - y(map.yEdges[1]);

    for (const cell of map.cells) {
      plot
        .append('rect')
        .attr('class', 'nmf-heatmap-cell')
        .attr('x', x(map.xEdges[cell.ix]))
        .attr('y', y(map.yEdges[cell.iy + 1]))
        .attr('width', Math.max(cellWidth, 1))
        .attr('height', Math.max(cellHeight, 1))
        .attr('fill', color(cell.count));
    }

    if (map.highlight) {
      const top = y(map.highlight.to);
      plot
        .append('rect')
        .attr('class', 'nmf-heatmap-highlight')
        .attr('x', margin.left)
        .attr('y', top)
        .attr('width', width - margin.right - margin.left)
        .attr('height', Math.max(y(map.highlight.from) - top, 2));
      plot
        .append('text')
        .attr('class', 'nmf-heatmap-highlight-label')
        .attr('x', margin.left + 6)
        .attr('y', top - 4)
        .text(`${map.highlight.centrality.replace('-', '\u2013')}%`);
    }

    const tight = width < 420;
    plot
      .append('g')
      .attr('class', 'nmf-plot-axis')
      .attr('transform', `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(tight ? 4 : 6));
    plot
      .append('g')
      .attr('class', 'nmf-plot-axis')
      .attr('transform', `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(5));

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

    this.drawColorBar(svg, color, map.maxCount, margin, width, height);
  }

  private drawColorBar(
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    color: d3.ScaleSequential<string>,
    maxCount: number,
    margin: NmfPlotMargin,
    width: number,
    height: number,
  ): void {
    const barX = width - margin.right + 12;
    const barTop = margin.top;
    const barHeight = height - margin.bottom - margin.top;
    const steps = 24;
    const scale = d3
      .scaleLog()
      .domain([1, Math.max(maxCount, 2)])
      .range([barTop + barHeight, barTop]);

    const bar = svg.append('g').attr('class', 'nmf-heatmap-colorbar');
    for (let i = 0; i < steps; i++) {
      const value = scale.invert(barTop + barHeight - (i * barHeight) / steps);
      bar
        .append('rect')
        .attr('x', barX)
        .attr('y', barTop + barHeight - ((i + 1) * barHeight) / steps)
        .attr('width', 10)
        .attr('height', barHeight / steps + 0.5)
        .attr('fill', color(value));
    }
    bar
      .append('g')
      .attr('class', 'nmf-plot-axis')
      .attr('transform', `translate(${barX + 10},0)`)
      .call(d3.axisRight(scale).ticks(3, '~s'));
  }
}
