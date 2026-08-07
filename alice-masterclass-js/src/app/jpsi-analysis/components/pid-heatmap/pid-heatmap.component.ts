import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';

import {
  PID_DEDX_BINS,
  PID_DEDX_MAX,
  PID_DEDX_MIN,
  PID_P_BINS,
  PID_P_MAX,
  PID_P_MIN,
  PidCut,
} from '../../models/jpsi.models';

const MARGIN = { top: 8, right: 12, bottom: 42, left: 52 };

/**
 * dE/dx versus momentum density plot.
 *
 * Cells are painted on a canvas because a 120 by 100 grid of SVG rectangles would be far
 * too slow to repaint while Quick Analysis is running. Axes and the selection rectangle
 * stay in an SVG overlay so they render crisply and can be styled.
 */
@Component({
  selector: 'app-jpsi-pid-heatmap',
  templateUrl: './pid-heatmap.component.html',
  styleUrls: ['./pid-heatmap.component.scss'],
  standalone: false,
})
export class PidHeatmapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() bins: Uint32Array = new Uint32Array(PID_P_BINS * PID_DEDX_BINS);
  @Input() maxCount = 0;
  @Input() cut!: PidCut;
  /** Bumped by the parent whenever the bins changed, so drawing is not guesswork. */
  @Input() revision = 0;

  @ViewChild('host') private hostRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas') private canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('svg') private svgRef!: ElementRef<SVGSVGElement>;

  width = 0;
  height = 0;
  private resizeObserver: ResizeObserver | null = null;
  private viewReady = false;

  private readonly xScale = d3.scaleLog().domain([PID_P_MIN, PID_P_MAX]);
  private readonly yScale = d3.scaleLinear().domain([PID_DEDX_MIN, PID_DEDX_MAX]);

  constructor(private readonly changeDetector: ChangeDetectorRef) {}

  /**
   * The first measurement is left to the observer, which delivers the initial size in a
   * later task. Measuring synchronously here would write width and height after Angular
   * has already checked the bindings that read them.
   */
  ngAfterViewInit(): void {
    this.viewReady = true;

    this.resizeObserver = new ResizeObserver(() => this.measureAndDraw());
    this.resizeObserver.observe(this.hostRef.nativeElement);
  }

  ngOnChanges(): void {
    if (this.viewReady) {
      this.draw();
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  private measureAndDraw(): void {
    const rect = this.hostRef.nativeElement.getBoundingClientRect();
    if (rect.width <= 0) {
      return;
    }

    this.width = rect.width;
    this.height = Math.max(240, Math.min(420, rect.width * 0.72));

    this.xScale.range([0, this.plotWidth]);
    this.yScale.range([this.plotHeight, 0]);

    this.draw();
    this.changeDetector.markForCheck();
  }

  get plotWidth(): number {
    return Math.max(0, this.width - MARGIN.left - MARGIN.right);
  }

  get plotHeight(): number {
    return Math.max(0, this.height - MARGIN.top - MARGIN.bottom);
  }

  get margin() {
    return MARGIN;
  }

  private draw(): void {
    if (this.plotWidth <= 0 || this.plotHeight <= 0) {
      return;
    }
    this.drawCells();
    this.drawAxes();
  }

  private drawCells(): void {
    const canvas = this.canvasRef.nativeElement;
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.round(this.plotWidth * ratio);
    canvas.height = Math.round(this.plotHeight * ratio);
    canvas.style.width = `${this.plotWidth}px`;
    canvas.style.height = `${this.plotHeight}px`;

    const context = canvas.getContext('2d');
    if (context === null) {
      return;
    }

    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, this.plotWidth, this.plotHeight);

    if (this.maxCount <= 0) {
      return;
    }

    // Counts span orders of magnitude between the dense pion band and the sparse tails,
    // so a linear colour ramp would leave everything but the band invisible.
    const colour = d3
      .scaleSequential(d3.interpolateViridis)
      .domain([0, Math.log1p(this.maxCount)]);

    const cellWidth = this.plotWidth / PID_P_BINS;
    const cellHeight = this.plotHeight / PID_DEDX_BINS;

    for (let dedxBin = 0; dedxBin < PID_DEDX_BINS; dedxBin++) {
      for (let pBin = 0; pBin < PID_P_BINS; pBin++) {
        const count = this.bins[dedxBin * PID_P_BINS + pBin];
        if (count === 0) {
          continue;
        }

        context.fillStyle = colour(Math.log1p(count));
        context.fillRect(
          pBin * cellWidth,
          this.plotHeight - (dedxBin + 1) * cellHeight,
          Math.ceil(cellWidth),
          Math.ceil(cellHeight)
        );
      }
    }
  }

  private drawAxes(): void {
    const svg = d3.select(this.svgRef.nativeElement);

    svg
      .select<SVGGElement>('.x-axis')
      .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top + this.plotHeight})`)
      .call(
        d3
          .axisBottom(this.xScale)
          .tickValues([0.6, 1, 2, 3, 5, 10])
          .tickFormat((value) => String(value)) as never
      );

    svg
      .select<SVGGElement>('.y-axis')
      .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`)
      .call(d3.axisLeft(this.yScale).ticks(6) as never);
  }

  /** Selection rectangle in pixels, for the SVG overlay. */
  get cutRect(): { x: number; y: number; width: number; height: number } | null {
    if (this.plotWidth <= 0 || this.cut === undefined) {
      return null;
    }

    const x0 = this.xScale(Math.max(PID_P_MIN, this.cut.pMin));
    const x1 = this.xScale(Math.min(PID_P_MAX, this.cut.pMax));
    const y0 = this.yScale(Math.min(PID_DEDX_MAX, this.cut.dedxMax));
    const y1 = this.yScale(Math.max(PID_DEDX_MIN, this.cut.dedxMin));

    return {
      x: MARGIN.left + Math.min(x0, x1),
      y: MARGIN.top + Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
    };
  }
}
