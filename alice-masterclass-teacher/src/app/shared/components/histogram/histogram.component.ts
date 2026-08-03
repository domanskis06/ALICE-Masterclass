import { Component, AfterViewInit, ViewChild, ElementRef, Input, HostBinding, Output, EventEmitter, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as d3 from 'd3';

/** From this bin count, x-axis tick labels are drawn at -45°. */
const X_TICK_LABEL_ROTATE_BINS = 15;
/** Half-length of X-axis tick marks (same distance above and below the axis). */
const X_TICK_SIZE = 6;

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

  /**
   * When true, SVG stretches to the cell (no letterboxing). Used by VA mass-histograms
   * so the 80%-scaled panel is filled by plots instead of empty bands.
   */
  @Input()
  stretchToFit = false;

  /**
   * Expand the nominal x domain to cover all data and draw mirrored tick marks
   * (same behaviour as student VA mass-histograms).
   */
  @Input()
  expandDomainToData = false;

  readonly SVG = {
    W: 400,
    // Extra height vs original 200: room under Invariant Mass for glyph descenders
    // (), ²) that would otherwise clip at the viewBox edge.
    H: 216
  }

  readonly MARGIN = {
    TOP: 5,
    RIGHT: 10,
    BOTTOM: 20,
    // Keeps plot height same as original (H - TOP - BOTTOM - BOTTOM_XLABEL = 165).
    BOTTOM_XLABEL: 26,
    // Baseline inset from viewBox bottom — clears ), ² (clipped when this was 0).
    BOTTOM_TEXT: 10,
    LEFT: 25,
    LEFT_YLABEL: 10
  };

  get CONTENT_AREA() {
    const m = this.MARGIN;
    return {
      X: m.LEFT + m.LEFT_YLABEL,
      Y: m.TOP,
      W: this.SVG.W - m.LEFT - m.LEFT_YLABEL - m.RIGHT,
      H: this.SVG.H - m.TOP - m.BOTTOM - m.BOTTOM_XLABEL
    };
  }

  /**
   * Extra SVG y nudge for the axis title while x-tick labels are at -45°
   * (they hang lower than upright numbers and would otherwise collide).
   */
  private static readonly X_AXIS_LABEL_ROTATED_NUDGE = 14;

  /** Baseline y for the horizontal axis title. */
  get xAxisLabelY(): number {
    const rotatedNudge = this.shouldRotateXTickLabels()
      ? HistogramComponent.X_AXIS_LABEL_ROTATED_NUDGE
      : 0;
    return this.SVG.H - this.MARGIN.BOTTOM_TEXT + rotatedNudge;
  }

  protected readonly ANIMATION_DURATION: number = 200;

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
   * Working axis range: equals `_baseXDomain`, or expanded to cover data when
   * `expandDomainToData` is enabled.
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

  protected binCenter(bin: d3.Bin<number, number>) {
    const x0 = bin.x0 ?? 0;
    const x1 = bin.x1 ?? x0;
    return (x1 - x0) / 2 + x0;
  }

  /**
   * Expand the nominal domain so every finite sample is inside when
   * `expandDomainToData` is on; otherwise keep the parent xmin/xmax.
   */
  private domainCovering(values: Iterable<number>): [number, number] {
    let lo = this._baseXDomain[0];
    let hi = this._baseXDomain[1];
    if (!this.expandDomainToData) {
      return [lo, hi];
    }
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
      this.xDomainZoom = next;
    }
  }

  constructor() { }

  ngAfterViewInit(): void {
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

    // Default 30 bins on a 0.3-wide *.xx0 domain → exact 0.01 edges (avoid FP drift).
    const snapToHundredths = n === 30;
    const thresholds: number[] = [];
    for (let i = 1; i < n; i++) {
      let value = x0 + ((x1 - x0) * i) / n;
      if (snapToHundredths) {
        value = Math.round(value * 100) / 100;
      }
      thresholds.push(value);
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
    const span = zoom1 - zoom0;
    const fullSpan = this.xDomain[1] - this.xDomain[0];
    const zoomedIn = fullSpan > 0 && span < fullSpan * 0.999;
    const maxTicks = zoomedIn ? 40 : 25;
    if (visible.length <= maxTicks) {
      return visible;
    }

    const step = Math.ceil(visible.length / maxTicks);
    return visible.filter((_, index) => index % step === 0);
  }

  protected getXTickFormat(): (value: number) => string {
    return (value: number) => {
      // At 30 bins edges are *.xx0 — two decimals are exact; otherwise keep three.
      const decimals = Math.round(this.bins) === 30 ? 2 : 3;
      return value.toFixed(decimals).replace(/\.?0+$/, '');
    };
  }

  protected shouldRotateXTickLabels(): boolean {
    return Math.round(this.bins) >= X_TICK_LABEL_ROTATE_BINS;
  }

  protected updateXDomain(): void {
    const axis = d3.axisBottom(this.xScale)
      .tickValues(this.getXTickValues())
      .tickFormat((d) => this.getXTickFormat()(d as number));

    if (this.expandDomainToData) {
      axis.tickSizeInner(X_TICK_SIZE);
    }

    this.xAxisSelector
      .transition()
      .duration(this.ANIMATION_DURATION)
      .call(axis)
      .end()
      .then(() => this.applyXTickStyle())
      .catch(() => this.applyXTickStyle());
  }

  private applyXTickStyle(): void {
    if (this.expandDomainToData) {
      this.xAxisSelector
        .selectAll<SVGLineElement, unknown>('.tick line')
        .attr('y1', -X_TICK_SIZE)
        .attr('y2', X_TICK_SIZE);
    }

    const tickLabels = this.xAxisSelector.selectAll<SVGTextElement, unknown>('text');
    if (this.shouldRotateXTickLabels()) {
      tickLabels
        .attr('transform', 'rotate(-45)')
        .style('text-anchor', 'end')
        .attr('dx', '-0.55em')
        .attr('dy', '0.32em');
    } else {
      tickLabels
        .attr('transform', null)
        .style('text-anchor', null)
        .attr('dx', null)
        .attr('dy', '0.71em');
    }
  }

  protected updateYDomain(): void {
    const yMax = Math.max(0, Math.round(this.yScale.domain()[1]));
    const tickValues = this.getIntegerYTickValues(yMax, 11);

    this.yAxisSelector
      .transition()
      .duration(this.ANIMATION_DURATION)
      .call(
        d3.axisLeft(this.yScale)
          .tickValues(tickValues)
          .tickFormat((d) => String(d as number))
      );
  }

  /**
   * Integer-only Y ticks on a uniform step, at most `maxTicks` marks.
   * Does not force-label `yMax` when it breaks the step (same as upstream d3 axis):
   * e.g. yMax=41 → step 5 → labels 0…40, bar may still reach 41.
   */
  private getIntegerYTickValues(yMax: number, maxTicks: number): number[] {
    if (yMax <= 0) {
      return [0];
    }

    const step = Math.max(1, Math.ceil(yMax / (maxTicks - 1)));
    const ticks: number[] = [];
    for (let value = 0; value <= yMax; value += step) {
      ticks.push(value);
    }
    return ticks;
  }

}
