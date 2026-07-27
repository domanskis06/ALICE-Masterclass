import { Component, AfterViewInit, ViewChild, ElementRef, Input, HostBinding, Output, EventEmitter, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as d3 from 'd3';

const BIN_LANDING_PULSE_CLASS = 'bin-landing-pulse';
const BIN_LANDING_PULSE_MS = 480;
/** From this bin count, x-axis tick labels are drawn at -45°. */
const X_TICK_LABEL_ROTATE_BINS = 15;
/** Half-length of X-axis tick marks (same distance above and below the axis). */
const X_TICK_SIZE = 6;

/** Logical bin that would receive a new value (no screen coordinates). */
export interface HistogramIncomingBin {
  binIndex: number;
  /** Center of the destination bin in data units (same as xDomain). */
  binCenter: number;
  /** Projected count in that bin after the value is added. */
  projectedCount: number;
  /** Current y-domain max used for vertical placement hints. */
  yMax: number;
}

/** Viewport-pixel landing spot for a flying particle. */
export interface HistogramBinTarget {
  targetX: number;
  targetY: number;
  binIndex: number;
}

@Component({
    selector: 'app-histogram',
    templateUrl: './histogram.component.html',
    styleUrls: ['./histogram.component.scss'],
    standalone: false
})
export class HistogramComponent implements AfterViewInit, OnDestroy {
  @Input()
  @HostBinding("style.--bar-color")
  public barColor: string = "#4169E1";

  @HostBinding('class.histogram-x-ticks-rotated')
  get xTicksRotated(): boolean {
    return this.shouldRotateXTickLabels();
  }

  readonly SVG = {
    W: 400,
    // Tall enough for rotated tick labels + x-axis title without viewBox clipping.
    H: 218
  }

  readonly MARGIN = {
    TOP: 3,
    RIGHT: 10,
    // Room for -45° tick labels under the plot.
    BOTTOM: 36,
    // Separate band for the axis title below the tick labels (keeps title off the card edge).
    BOTTOM_XLABEL: 28,
    // Baseline inset from the viewBox bottom — large enough that descenders / ² are not clipped.
    BOTTOM_TEXT: 14,
    // Room for y-axis tick numbers.
    LEFT: 32,
    // Room for the vertical axis title ("Counts").
    LEFT_YLABEL: 12
  };

  readonly CONTENT_AREA = {
    X: this.MARGIN.LEFT + this.MARGIN.LEFT_YLABEL,
    Y: this.MARGIN.TOP,
    W: this.SVG.W - this.MARGIN.LEFT - this.MARGIN.LEFT_YLABEL - this.MARGIN.RIGHT,
    H: this.SVG.H - this.MARGIN.TOP - this.MARGIN.BOTTOM - this.MARGIN.BOTTOM_XLABEL
  };

  protected readonly ANIMATION_DURATION: number = 250;

  @ViewChild('svg')
  private svgRef!: ElementRef;

  private get svg(): SVGSVGElement {
    return this.svgRef.nativeElement;
  }

  @ViewChild('xAxis')
  private xAxisRef!: ElementRef;

  private get xAxis(): SVGGElement {
    return this.xAxisRef.nativeElement;
  }

  private get xAxisSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.xAxis);
  }

  @ViewChild('yAxis')
  private yAxisRef!: ElementRef;

  private get yAxis(): SVGGElement {
    return this.yAxisRef.nativeElement;
  }

  private get yAxisSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.yAxis);
  }

  @ViewChild('bars')
  private barsRef!: ElementRef;

  private get bars(): SVGGElement {
    return this.barsRef.nativeElement;
  }

  private get barsSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.bars);
  }

  @ViewChild('brush')
  private brushRef!: ElementRef;

  private get brush(): SVGGElement {
    return this.brushRef.nativeElement;
  }

  private get brushSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.brush);
  }

  protected xScale: d3.ScaleLinear<number,number> = d3.scaleLinear<number>();
  protected yScale: d3.ScaleLinear<number,number> = d3.scaleLinear<number>();
  private binGenerator: d3.HistogramGeneratorNumber<number, number> = d3.bin<number, number>();
  private brushX: d3.BrushBehavior<number> = d3.brushX()

  @Input()
  get xDomain(): [number, number] { return this._effectiveXDomain; }
  set xDomain(domain: [number, number]) {
    this._baseXDomain = domain;
    this.applyEffectiveDomain(this.data);
  }
  /** Nominal axis range from the parent (e.g. Kaon [0.4, 0.6]). */
  private _baseXDomain: [number, number] = [0, 1];
  /**
   * Working axis range: at least `_baseXDomain`, expanded to cover every finite
   * data value so misclassified masses still land in a bin.
   */
  private _effectiveXDomain: [number, number] = [0, 1];

  get xDomainZoom(): [number, number] { return this._xDomainZoom.getValue(); }
  set xDomainZoom(domainZoom: [number, number]) {
    this._xDomainZoom.next(domainZoom);
  }
  private _xDomainZoom: BehaviorSubject<[number, number]> = new BehaviorSubject([0, 1]);
  private xDomainZoomSubscription: Subscription | null = null;

  @Input()
  get yDomain(): [number, number] { return this._yDomain.getValue(); }
  set yDomain(domain: [number, number]) {
    this._yDomain.next(domain);
  }
  private _yDomain: BehaviorSubject<[number, number]> = new BehaviorSubject([0, 1]);
  private yDomainSubscription: Subscription | null = null;

  @Input()
  get bins(): number { return this._bins.getValue(); }
  set bins(bins: number) {
    this._bins.next(bins);
  }
  private _bins: BehaviorSubject<number> = new BehaviorSubject(1);
  private binsSubscription: Subscription | null = null;

  @Input()
  get data(): Array<number> { return this._data.getValue(); }
  set data(data: Array<number>) {
    this.applyEffectiveDomain(data);

    this.binGenerator.domain(this.xDomain).thresholds(this.getBinThresholds());

    const bins = this.binGenerator(data);

    const yMax = d3.max(bins, (d: d3.Bin<number, number>) => { return d.length; }) ?? 0;

    if (yMax !== 0) {
      this.yDomain = [0, yMax];
    } else {
      this.yDomain = [0, 1];
    }

    this._data.next(data);
  }
  private _data: BehaviorSubject<Array<number>> = new BehaviorSubject<number[]>([]);
  private dataSubscription: Subscription | null = null;

  @Input()
  get enableZoom(): boolean { return this._enableZoom.getValue(); }
  set enableZoom(enableZoom: boolean) {
    this._enableZoom.next(enableZoom);
  }
  private _enableZoom: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private enableZoomSubscription: Subscription | null = null;

  @Output()
  zoomEvent: EventEmitter<[number, number]> = new EventEmitter<[number, number]>();

  private viewInitialized = false;
  private pulseClearTimeout: number | null = null;

  protected binCenter(bin: d3.Bin<number, number>) {
    const x0 = bin.x0 ?? 0;
    const x1 = bin.x1 ?? x0;
    return (x1 - x0) / 2 + x0;
  }

  /**
   * Expand the nominal domain so every finite sample (and optional extras) is inside.
   * Bin count stays fixed — equal-width bins cover the new span.
   */
  private domainCovering(values: Iterable<number>): [number, number] {
    let lo = this._baseXDomain[0];
    let hi = this._baseXDomain[1];
    for (const value of values) {
      if (!Number.isFinite(value)) {
        continue;
      }
      if (value < lo) {
        lo = value;
      }
      if (value > hi) {
        hi = value;
      }
    }
    if (!(hi > lo)) {
      hi = lo + Number.EPSILON;
    }
    return [lo, hi];
  }

  private applyEffectiveDomain(values: Iterable<number>): void {
    const next = this.domainCovering(values);
    const prev = this._effectiveXDomain;
    this._effectiveXDomain = next;
    if (prev[0] !== next[0] || prev[1] !== next[1] || this.xDomainZoom[0] !== next[0] || this.xDomainZoom[1] !== next[1]) {
      // Keep the brush zoom in sync with the working axis (full span after expand/shrink).
      this.xDomainZoom = next;
    }
  }

  constructor() { }

  ngAfterViewInit(): void {
    this.viewInitialized = true;
    this.xScale.range([0, this.CONTENT_AREA.W]);
    this.yScale.range([this.CONTENT_AREA.H, 0]);

    this.xDomainZoomSubscription = this._xDomainZoom.subscribe((domainZoom) => {
      this.xScale.domain(domainZoom);

      this.updateXDomain();
      this.updateBars();
    });

    this.yDomainSubscription = this._yDomain.subscribe((domain) => {
      this.yScale.domain(domain);

      this.updateYDomain();
    });

    this.binsSubscription = this._bins.subscribe(() => {
      this.updateBars();
      this.updateXDomain();
    });

    this.dataSubscription = this._data.subscribe(() => {
      this.updateBars();

      this.resetZoom();
    });

    this.brushX
      .extent([ [0, 0], [this.CONTENT_AREA.W, this.CONTENT_AREA.H] ])
      .on('end', (event) => this.onZoom(event));

    this.enableZoomSubscription = this._enableZoom.subscribe((enableZoom) => {
      if (enableZoom) {
        this.brushSelector.call(<any>this.brushX);
        this.brushSelector.on('dblclick', () => this.resetZoom());
      } else {
        this.brushSelector.selectAll().remove();
      }
    });
  }

  ngOnDestroy(): void {
    this.xDomainZoomSubscription?.unsubscribe();
    this.yDomainSubscription?.unsubscribe();
    this.binsSubscription?.unsubscribe();
    this.dataSubscription?.unsubscribe();
    this.enableZoomSubscription?.unsubscribe();
    if (this.pulseClearTimeout !== null) {
      window.clearTimeout(this.pulseClearTimeout);
      this.pulseClearTimeout = null;
    }
  }

  /**
   * Which bin would receive `value` (data-space only — screen mapping is done by the parent grid).
   * Uses the domain that would apply after `value` is added (so out-of-range masses expand the axis).
   */
  resolveIncomingBin(value: number): HistogramIncomingBin | null {
    if (!this.viewInitialized || !Number.isFinite(value)) {
      return null;
    }

    const domain = this.domainCovering([...this.data, value]);
    const thresholds = this.getBinThresholdsFor(domain);
    this.binGenerator.domain(domain).thresholds(thresholds);
    const currentBins = this.binGenerator(this.data);
    const projectedBins = this.binGenerator([...this.data, value]);

    const binIndex = projectedBins.findIndex(
      (bin, index) => bin.length > (currentBins[index]?.length ?? 0)
    );
    if (binIndex < 0) {
      return null;
    }

    const bin = projectedBins[binIndex];
    const x0 = bin.x0 ?? domain[0];
    const x1 = bin.x1 ?? x0;
    const yMax = Math.max(d3.max(projectedBins, (d) => d.length) ?? 1, this.yDomain[1] || 1);

    return {
      binIndex,
      binCenter: (x0 + x1) / 2,
      projectedCount: bin.length,
      yMax,
    };
  }

  /** Smoothly scroll this plot into view (used before / with a cross-component flight). */
  scrollPlotIntoView(): void {
    if (!this.viewInitialized) {
      return;
    }
    this.svg.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  }

  /**
   * Viewport landing spot: X = bin center, Y = vertical middle of this plot's SVG.
   * Maps against the projected (possibly expanded) domain so the flight lands where the bar will sit.
   */
  previewBinTarget(value: number): HistogramBinTarget | null {
    const incoming = this.resolveIncomingBin(value);
    if (!incoming) {
      return null;
    }

    const svgRect = this.svg.getBoundingClientRect();
    if (svgRect.width <= 0 || svgRect.height <= 0) {
      return null;
    }

    const domain = this.domainCovering([...this.data, value]);
    const previousDomain = this.xScale.domain() as [number, number];
    this.xScale.domain(domain);

    const svgX = this.CONTENT_AREA.X + this.xScale(incoming.binCenter);
    const svgY = this.CONTENT_AREA.Y + this.CONTENT_AREA.H / 2;
    const ctm = this.svg.getScreenCTM();

    let targetX = svgRect.left + svgRect.width / 2;
    let targetY = svgRect.top + svgRect.height / 2;
    if (ctm) {
      const mapped = new DOMPoint(svgX, svgY).matrixTransform(ctm);
      if (Number.isFinite(mapped.x) && Number.isFinite(mapped.y)) {
        targetX = mapped.x;
        targetY = mapped.y;
      }
    }

    this.xScale.domain(previousDomain);

    return {
      binIndex: incoming.binIndex,
      targetX,
      targetY,
    };
  }

  /** Brief highlight on the bar that just received a new entry. */
  pulseBin(binIndex: number): void {
    if (!this.viewInitialized || binIndex < 0) {
      return;
    }

    requestAnimationFrame(() => {
      const rect = this.bars.querySelector(`rect[data-bin-index="${binIndex}"]`) as SVGRectElement | null;
      if (!rect) {
        return;
      }

      rect.classList.remove(BIN_LANDING_PULSE_CLASS);
      // Force reflow so re-adding the class restarts the CSS animation.
      void rect.getBoundingClientRect();
      rect.classList.add(BIN_LANDING_PULSE_CLASS);

      if (this.pulseClearTimeout !== null) {
        window.clearTimeout(this.pulseClearTimeout);
      }
      this.pulseClearTimeout = window.setTimeout(() => {
        rect.classList.remove(BIN_LANDING_PULSE_CLASS);
        this.pulseClearTimeout = null;
      }, BIN_LANDING_PULSE_MS);
    });
  }

  private updateBars(): void {
    this.binGenerator.domain(this.xDomain).thresholds(this.getBinThresholds());

    const bins = this.binGenerator(this.data);

    const fullBarWidth = (bin: d3.Bin<number, number>) => {
      const x0 = bin.x0 ?? this.xDomain[0];
      const x1 = bin.x1 ?? x0;
      return Math.max(0, this.xScale(x1) - this.xScale(x0));
    };

    // Sample width in SVG units: when bars are ~1px on screen, light greys wash out
    // against white (anti-aliasing). Use a darker fill until the user zooms in.
    const sampleW = bins.length > 0 ? fullBarWidth(bins[0]) : 10;
    const dense = sampleW < 2.5;
    const fillColor = dense ? '#6E6E6E' : this.barColor;

    const barX = (bin: d3.Bin<number, number>) => {
      const w = fullBarWidth(bin);
      const gap = w >= 3 ? 1 : 0;
      return this.xScale(bin.x0 ?? this.xDomain[0]) + gap / 2;
    };
    const barWidth = (bin: d3.Bin<number, number>) => {
      const w = fullBarWidth(bin);
      const gap = w >= 3 ? 1 : 0;
      return Math.max(0, w - gap);
    };

    const barsSelection = this.barsSelector.selectAll<SVGRectElement, d3.Bin<number, number>>('rect').data(bins);

    // Bars span [x0, x1] so they sit *between* axis tick labels (bin edges),
    // not centered on them.
    barsSelection
      .join(
        (enter) => {
          return enter
            .append('rect')
            .attr('transform', (d) => {
              return `translate(${barX(d)}, ${this.CONTENT_AREA.H})`;
            })
            .attr('width', barWidth)
            .attr('height', 0);
        },
        (update) => {
          return update;
        },
        (exit) => {
          return exit.remove();
        }
      )
      .attr('data-bin-index', (_d, i) => i)
      .style('fill', fillColor)
      .transition().duration(this.ANIMATION_DURATION)
      .attr('width', barWidth)
      .attr('transform', (d) => {
        return `translate(${barX(d)}, ${this.yScale(d.length)})`;
      })
      .attr('height', (d) => {
        return this.CONTENT_AREA.H - this.yScale(d.length);
      });
  }

  protected onZoom(event: any): void {
    const extent = event.selection;

    if (extent !== null) {
      const newDomain = extent.map(this.xScale.invert);
      this.xDomainZoom = newDomain;

      this.brushSelector.call(<any>this.brushX.move, null);

      this.zoomEvent.emit(newDomain);
    }
  }

  protected resetZoom(): void {
    this.xDomainZoom = this.xDomain;

    this.zoomEvent.emit(this.xDomain);
  }

  /**
   * Interior edges of `bins` equal-width intervals on `domain` (defaults to effective xDomain).
   * 2 bins → 1 tick (midpoint), 3 bins → 2 ticks, etc.
   */
  protected getBinThresholds(): number[] {
    return this.getBinThresholdsFor(this.xDomain);
  }

  protected getBinThresholdsFor(domain: [number, number]): number[] {
    const n = Math.max(1, Math.round(this.bins));
    const [x0, x1] = domain;
    if (!(x1 > x0) || n <= 1) {
      return [];
    }

    const thresholds: number[] = [];
    for (let i = 1; i < n; i++) {
      thresholds.push(x0 + ((x1 - x0) * i) / n);
    }
    return thresholds;
  }

  protected getXTickValues(): number[] {
    const [zoom0, zoom1] = this.xDomainZoom;
    const thresholds = this.getBinThresholds();
    if (thresholds.length === 0) {
      const [x0, x1] = this.xDomain;
      return [(x0 + x1) / 2];
    }

    const visible = thresholds.filter((value) => value >= zoom0 && value <= zoom1);
    // Keep the axis readable when there are many bins (still land on bin edges).
    const maxTicks = 25;
    if (visible.length <= maxTicks) {
      return visible;
    }

    const step = Math.ceil(visible.length / maxTicks);
    return visible.filter((_, index) => index % step === 0);
  }

  protected getXTickFormat(): (value: number) => string {
    return (value: number) => {
      // Three decimals so adjacent bin edges stay distinct; drop trailing zeros
      // (e.g. 0.500 → "0.5", 0.416 → "0.416").
      return value.toFixed(3).replace(/\.?0+$/, '');
    };
  }

  protected shouldRotateXTickLabels(): boolean {
    return Math.round(this.bins) >= X_TICK_LABEL_ROTATE_BINS;
  }

  protected updateXDomain(): void {
    const axis = d3.axisBottom(this.xScale)
      .tickValues(this.getXTickValues())
      .tickFormat((d) => this.getXTickFormat()(d as number))
      .tickSizeInner(X_TICK_SIZE);

    this.xAxisSelector
      .transition()
      .duration(this.ANIMATION_DURATION)
      .call(axis)
      .end()
      .then(() => this.applyXTickStyle())
      .catch(() => this.applyXTickStyle());
  }

  private applyXTickStyle(): void {
    // Mirror ticks above the axis so bin edges are visible in the plot.
    this.xAxisSelector
      .selectAll<SVGLineElement, unknown>('.tick line')
      .attr('y1', -X_TICK_SIZE)
      .attr('y2', X_TICK_SIZE);

    const rotated = this.shouldRotateXTickLabels();

    this.xAxisSelector
      .selectAll<SVGTextElement, unknown>('text')
      .attr('transform', rotated ? 'rotate(-45)' : null)
      .style('text-anchor', rotated ? 'end' : null)
      .attr('dx', rotated ? '-0.55em' : null)
      .attr('dy', rotated ? '0.32em' : '0.71em');
  }

  protected updateYDomain(): void {
    this.yAxisSelector.transition().duration(this.ANIMATION_DURATION).call(d3.axisLeft(this.yScale));
  }

}
