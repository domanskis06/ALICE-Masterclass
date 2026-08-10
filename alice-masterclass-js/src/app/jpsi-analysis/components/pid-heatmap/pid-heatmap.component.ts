import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import * as d3 from 'd3';

import {
  PID_DEDX_BINS,
  PID_DEDX_MAX,
  PID_DEDX_MIN,
  PID_HEATMAP_MARGIN,
  PID_P_BINS,
  PID_P_MAX,
  PID_P_MIN,
  PidCut,
} from '../../models/jpsi.models';

const MARGIN = PID_HEATMAP_MARGIN;

/** Major p-axis labels; everything else is tick-only. */
const X_LABELLED_TICKS = new Set([0.1, 0.2, 0.5, 1, 2, 5, 10]);

/**
 * Log-decade tick marks on [PID_P_MIN, PID_P_MAX]. Uneven pixel spacing within each
 * decade is what makes the logarithmic scale readable; only {@link X_LABELLED_TICKS}
 * keep numeric labels.
 */
const X_AXIS_TICKS: readonly number[] = [
  0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
];

/**
 * Twenty fixed colours for the PID heatmap (violet at the bottom → red at the top). The
 * palette never changes; only the count→index mapping moves as more tracks fill the
 * heatmap.
 */
const PID_PALETTE: readonly string[] = [
  '#2200FF',
  '#1427FF',
  '#1453FF',
  '#1494FF',
  '#00A3FF',
  '#00BBFF',
  '#00FFFC',
  '#00FFCC',
  '#00FF85',
  '#00FF55',
  '#00FF0D',
  '#22FF00',
  '#69FF00',
  '#99FF00',
  '#E1FF00',
  '#FFEE00',
  '#FFA700',
  '#FF7700',
  '#FF2F00',
  '#FF0000',
];

/**
 * Map a bin count onto the fixed 20-colour palette. As maxCount grows, each colour covers
 * a wider count range — the colour steps stay put, the binning slides across them.
 */
function paletteColour(count: number, maxCount: number): string {
  if (count <= 0 || maxCount <= 0) {
    return '#ffffff';
  }

  const nColors = PID_PALETTE.length;
  const index = Math.min(
    nColors - 1,
    Math.max(0, Math.floor(0.01 + (count / maxCount) * nColors))
  );
  return PID_PALETTE[index];
}

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

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.viewReady) {
      return;
    }
    // Cut-only updates move the dashed rectangle via the template; skip a full redraw.
    if (changes['bins'] || changes['maxCount'] || changes['revision']) {
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

    for (let dedxBin = 0; dedxBin < PID_DEDX_BINS; dedxBin++) {
      // Cell edges are snapped to whole pixels so neighbouring cells neither overlap nor
      // leave seams, which would show up as stripes over the dense bands.
      const yTop = Math.round((this.plotHeight * (PID_DEDX_BINS - dedxBin - 1)) / PID_DEDX_BINS);
      const yBottom = Math.round((this.plotHeight * (PID_DEDX_BINS - dedxBin)) / PID_DEDX_BINS);

      for (let pBin = 0; pBin < PID_P_BINS; pBin++) {
        const count = this.bins[dedxBin * PID_P_BINS + pBin];
        if (count === 0) {
          continue;
        }

        const xLeft = Math.round((this.plotWidth * pBin) / PID_P_BINS);
        const xRight = Math.round((this.plotWidth * (pBin + 1)) / PID_P_BINS);

        context.fillStyle = paletteColour(count, this.maxCount);
        context.fillRect(
          xLeft,
          yTop,
          Math.max(1, xRight - xLeft),
          Math.max(1, yBottom - yTop)
        );
      }
    }
  }

  get colourBar(): { x: number; y: number; width: number; height: number } {
    const gap = 12;
    const width = 14;
    return {
      x: MARGIN.left + this.plotWidth + gap,
      y: MARGIN.top,
      width,
      height: this.plotHeight,
    };
  }

  /** Discrete colour-bar bands, bottom (violet) to top (red), fixed palette order. */
  get colourBarBands(): { y: number; height: number; colour: string }[] {
    const bar = this.colourBar;
    const n = PID_PALETTE.length;
    return PID_PALETTE.map((colour, i) => {
      const yTop = Math.round(bar.y + (bar.height * (n - i - 1)) / n);
      const yBottom = Math.round(bar.y + (bar.height * (n - i)) / n);
      return {
        y: yTop,
        height: Math.max(1, yBottom - yTop),
        colour,
      };
    });
  }

  private drawAxes(): void {
    const svg = d3.select(this.svgRef.nativeElement);

    const xAxis = svg
      .select<SVGGElement>('.x-axis')
      .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top + this.plotHeight})`);

    xAxis.call(
      d3
        .axisBottom(this.xScale)
        .tickValues(X_AXIS_TICKS as number[])
        .tickFormat((value) =>
          X_LABELLED_TICKS.has(+value) ? String(+value) : ''
        ) as never
    );

    // Shorter marks for unlabelled decade ticks so the labelled ones stay dominant.
    xAxis.selectAll<SVGGElement, number>('.tick').each(function (value) {
      if (!X_LABELLED_TICKS.has(+value)) {
        d3.select(this).select('line').attr('y2', 4);
      }
    });

    svg
      .select<SVGGElement>('.y-axis')
      .attr('transform', `translate(${MARGIN.left}, ${MARGIN.top})`)
      .call(d3.axisLeft(this.yScale).ticks(6) as never);

    const bar = this.colourBar;
    const countScale = d3
      .scaleLinear()
      .domain([0, Math.max(1, this.maxCount)])
      .range([this.plotHeight, 0]);

    svg
      .select<SVGGElement>('.count-axis')
      .attr('transform', `translate(${bar.x + bar.width}, ${MARGIN.top})`)
      .call(d3.axisRight(countScale).ticks(6) as never);
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
