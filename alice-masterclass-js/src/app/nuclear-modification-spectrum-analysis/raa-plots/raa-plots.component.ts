import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';

import { RaaPlotSeries } from '../../shared/models/raa/raa';

@Component({
  selector: 'app-nmf-raa-plots',
  templateUrl: './raa-plots.component.html',
  styleUrls: ['./raa-plots.component.scss'],
  standalone: false,
})
export class NmfRaaPlotsComponent implements AfterViewInit, OnChanges {
  @ViewChild('ptSvg', { static: true }) ptSvg!: ElementRef<SVGSVGElement>;
  @ViewChild('raaSvg', { static: true }) raaSvg!: ElementRef<SVGSVGElement>;
  @ViewChild('rcpSvg', { static: true }) rcpSvg!: ElementRef<SVGSVGElement>;

  @Input() ptSpectra: RaaPlotSeries[] = [];
  @Input() raa: RaaPlotSeries[] = [];
  @Input() rcp: RaaPlotSeries[] = [];

  private ready = false;

  ngAfterViewInit(): void {
    this.ready = true;
    this.redraw();
  }

  ngOnChanges(_changes: SimpleChanges): void {
    if (this.ready) {
      this.redraw();
    }
  }

  private redraw(): void {
    drawSeries(this.ptSvg.nativeElement, this.ptSpectra, 'pT spectra', true);
    drawSeries(this.raaSvg.nativeElement, this.raa, 'R_AA', false, [0, 1.4]);
    drawSeries(this.rcpSvg.nativeElement, this.rcp, 'R_CP', false, [0, 2.0]);
  }
}

const COLORS = ['#38bdf8', '#f472b6', '#4ade80', '#fbbf24'];

function drawSeries(
  svgEl: SVGSVGElement,
  series: RaaPlotSeries[],
  title: string,
  logY: boolean,
  yDomain?: [number, number],
): void {
  const width = 420;
  const height = 220;
  const margin = { top: 28, right: 16, bottom: 36, left: 48 };
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', `0 0 ${width} ${height}`);

  svg
    .append('text')
    .attr('x', margin.left)
    .attr('y', 16)
    .attr('fill', '#e5edf7')
    .attr('font-size', 12)
    .text(title);

  if (!series.length || !series[0].x.length) {
    svg
      .append('text')
      .attr('x', width / 2)
      .attr('y', height / 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(226,232,240,0.7)')
      .attr('font-size', 12)
      .text('Run the pipeline to see results');
    return;
  }

  const allX = series.flatMap((s) => s.x);
  const allY = series.flatMap((s) => s.y).filter((v) => Number.isFinite(v) && v > 0);
  const x = d3
    .scaleLog()
    .domain([Math.max(d3.min(allX) ?? 0.1, 0.1), d3.max(allX) ?? 15])
    .range([margin.left, width - margin.right]);

  let y: d3.ScaleContinuousNumeric<number, number>;
  if (logY) {
    y = d3
      .scaleLog()
      .domain([Math.max(d3.min(allY) ?? 1e-6, 1e-6), d3.max(allY) ?? 1])
      .range([height - margin.bottom, margin.top]);
  } else {
    const maxY = yDomain?.[1] ?? Math.max(d3.max(allY) ?? 1, 1);
    y = d3
      .scaleLinear()
      .domain([yDomain?.[0] ?? 0, maxY])
      .range([height - margin.bottom, margin.top]);
  }

  const g = svg.append('g');
  g.append('g')
    .attr('transform', `translate(0,${height - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5, '~s'))
    .call((axis) => axis.selectAll('text').attr('fill', '#94a3b8'))
    .call((axis) => axis.selectAll('line,path').attr('stroke', '#475569'));

  g.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(5))
    .call((axis) => axis.selectAll('text').attr('fill', '#94a3b8'))
    .call((axis) => axis.selectAll('line,path').attr('stroke', '#475569'));

  series.forEach((s, i) => {
    const color = COLORS[i % COLORS.length];
    const line = d3
      .line<number>()
      .x((_d, idx) => x(s.x[idx]))
      .y((_d, idx) => y(Math.max(s.y[idx], logY ? 1e-12 : 0)));
    g.append('path')
      .datum(s.y)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', 1.5)
      .attr('d', line as any);

    g.selectAll(`.pt-${i}`)
      .data(s.x)
      .enter()
      .append('circle')
      .attr('cx', (_d, idx) => x(s.x[idx]))
      .attr('cy', (_d, idx) => y(Math.max(s.y[idx], logY ? 1e-12 : 0)))
      .attr('r', 2.5)
      .attr('fill', color);
  });
}
