import { Component, AfterViewInit, OnDestroy, Input, HostBinding, ViewChild, ElementRef } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as d3 from 'd3';

import { HistogramComponent } from '../histogram/histogram.component';

@Component({
    selector: 'app-fit-histogram',
    templateUrl: './fit-histogram.component.html',
    styleUrls: ['./fit-histogram.component.scss'],
    standalone: false
})
export class FitHistogramComponent extends HistogramComponent implements AfterViewInit, OnDestroy {
  readonly LINE_POINTS: number = 100;

  /** ViewBox height — room for ticks + Invariant Mass without excess bottom chrome. */
  override readonly SVG = {
    W: 400,
    H: 224
  };

  @Input()
  @HostBinding("style.--signal-color")
  public signalColor: string = "#F00000";

  @Input()
  @HostBinding("style.--background-color")
  public backgroundColor: string = "#0066CC";

  @ViewChild('signal')
  public signalRef!: ElementRef;

  private get signal(): SVGPathElement {
    return this.signalRef.nativeElement;
  }

  private get signalSelector(): d3.Selection<SVGPathElement, unknown, null, undefined> {
    return d3.select(this.signal);
  }

  @ViewChild('background')
  public backgroundRef!: ElementRef;

  private get background(): SVGPathElement {
    return this.backgroundRef.nativeElement;
  }

  private get backgroundSelector(): d3.Selection<SVGPathElement, unknown, null, undefined> {
    return d3.select(this.background);
  }

  @ViewChild('fitRanges')
  private fitRangesRef!: ElementRef;

  private get fitRanges(): SVGGElement {
    return this.fitRangesRef.nativeElement;
  }

  private get fitRangesSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.fitRanges);
  }

  @Input()
  signalShown: boolean = true;

  @Input()
  backgroundShown: boolean = true;

  /** Draw vertical min/max guides for the selected signal/background intervals. */
  @Input()
  showFitRangeGuides: boolean = true;

  @Input()
  get signalFunction(): (x: number) => number { return this._signalFunction.getValue(); }
  set signalFunction(signalFunction: (x: number) => number) {
    this._signalFunction.next(signalFunction);
  }
  private _signalFunction: BehaviorSubject<(x: number) => number> = new BehaviorSubject((x: number) => 0);
  private signalFunctionSubscription: Subscription = null;

  @Input()
  get backgroundFunction(): (x: number) => number { return this._backgroundFunction.getValue(); }
  set backgroundFunction(backgroundFunction: (x: number) => number) {
    this._backgroundFunction.next(backgroundFunction);
  }
  private _backgroundFunction: BehaviorSubject<(x: number) => number> = new BehaviorSubject((x: number) => 0);
  private backgroundFunctionSubscription: Subscription = null;

  @Input()
  get signalRange(): [number, number] { return this._signalRange.getValue(); }
  set signalRange(signalRange: [number, number]) {
    this._signalRange.next(signalRange);
  }
  private _signalRange: BehaviorSubject<[number, number]> = new BehaviorSubject([0, 1]);
  private signalRangeSubscription: Subscription = null;

  @Input()
  get backgroundRange(): [number, number] { return this._backgroundRange.getValue(); }
  set backgroundRange(backgroundRange: [number, number]) {
    this._backgroundRange.next(backgroundRange);
  }
  private _backgroundRange: BehaviorSubject<[number, number]> = new BehaviorSubject([0, 1]);
  private backgroundRangeSubscription: Subscription = null;

  private signalPoints: Array<[number, number]> = [];
  private backgroundPoints: Array<[number, number]> = [];

  /**
   * X-span used to sample fit curves. Snapshotted when fit functions change so
   * dragging the signal/background sliders only moves the range guides, not the curves.
   */
  private curveSignalRange: [number, number] = [0, 1];
  private curveBackgroundRange: [number, number] = [0, 1];

  private lineGenerator: d3.Line<[number, number]> = d3.line();

  constructor() {
    super();
  }

  ngAfterViewInit(): void {
    super.ngAfterViewInit();

    this.signalFunctionSubscription = this._signalFunction.subscribe(() => {
      this.snapshotCurveRanges();
      this.updatePoints();
      this.updateLines();
    });

    this.backgroundFunctionSubscription = this._backgroundFunction.subscribe(() => {
      this.snapshotCurveRanges();
      this.updatePoints();
      this.updateLines();
    });

    this.signalRangeSubscription = this._signalRange.subscribe(() => {
      // Live slider changes update guides only — curves wait for the next Fit.
      this.updateFitRangeGuides();
    });

    this.backgroundRangeSubscription = this._backgroundRange.subscribe(() => {
      this.updateFitRangeGuides();
    });
  }

  private snapshotCurveRanges(): void {
    this.curveSignalRange = [this.signalRange[0], this.signalRange[1]];
    this.curveBackgroundRange = [this.backgroundRange[0], this.backgroundRange[1]];
  }

  ngOnDestroy(): void {
    super.ngOnDestroy();

    this.signalFunctionSubscription.unsubscribe();
    this.backgroundFunctionSubscription.unsubscribe();
    this.signalRangeSubscription.unsubscribe();
    this.backgroundRangeSubscription.unsubscribe();
  }

  private updatePoints(): void {
    this.backgroundPoints = [];

    const [b0, b1] = this.curveBackgroundRange;
    const intervalB = (b1 - b0) / this.LINE_POINTS;

    if (b1 > b0 && intervalB > 0) {
      for (let x = b0; x < b1; x += intervalB) {
        this.backgroundPoints.push([x, this.backgroundFunction(x)]);
      }
    }

    this.signalPoints = [];

    const [s0, s1] = this.curveSignalRange;
    const intervalS = (s1 - s0) / this.LINE_POINTS;

    if (s1 > s0 && intervalS > 0) {
      for (let x = s0; x < s1; x += intervalS) {
        this.signalPoints.push([x, this.signalFunction(x)]);
      }
    }
  }

  private updateLines(): void {
    this.backgroundSelector
      .transition()
      .duration(this.ANIMATION_DURATION)
      .attr('d', this.lineGenerator(this.backgroundPoints));

    this.signalSelector
      .transition()
      .duration(this.ANIMATION_DURATION)
      .attr('d', this.lineGenerator(this.signalPoints));
  }

  private updateFitRangeGuides(): void {
    if (!this.fitRangesRef) {
      return;
    }

    const root = this.fitRangesSelector;
    root.selectAll('*').remove();

    if (!this.showFitRangeGuides) {
      return;
    }

    this.appendRangeGuide(root, this.backgroundRange, 'background-range');
    this.appendRangeGuide(root, this.signalRange, 'signal-range');
  }

  private appendRangeGuide(
    root: d3.Selection<SVGGElement, unknown, null, undefined>,
    range: [number, number],
    cssClass: string
  ): void {
    const [a, b] = range;
    if (!(b > a)) {
      return;
    }

    const x0 = this.xScale(a);
    const x1 = this.xScale(b);
    const group = root.append('g').attr('class', cssClass);

    group.append('rect')
      .attr('class', 'fit-range-band')
      .attr('x', Math.min(x0, x1))
      .attr('y', 0)
      .attr('width', Math.max(0, Math.abs(x1 - x0)))
      .attr('height', this.CONTENT_AREA.H);

    group.append('line')
      .attr('class', 'fit-range-line')
      .attr('x1', x0)
      .attr('x2', x0)
      .attr('y1', 0)
      .attr('y2', this.CONTENT_AREA.H);

    group.append('line')
      .attr('class', 'fit-range-line')
      .attr('x1', x1)
      .attr('x2', x1)
      .attr('y1', 0)
      .attr('y2', this.CONTENT_AREA.H);
  }

  protected updateXDomain(): void {
    super.updateXDomain();

    if (this.backgroundRef && this.signalRef) {
      this.lineGenerator
        .x( (d) => { return this.xScale(d[0])} )
        .y( (d) => { return this.yScale(d[1])} );

      this.updateLines();
      this.updateFitRangeGuides();
    }
  }

  protected updateYDomain(): void {
    super.updateYDomain();

    if (this.backgroundRef && this.signalRef) {
      this.lineGenerator
        .x( (d) => { return this.xScale(d[0])} )
        .y( (d) => { return this.yScale(d[1])} );

      this.updateLines();
    }
  }

  /**
   * Adaptive nice ticks on the visible zoom domain (denser after zoom-in).
   * Falls back to the shared bin-edge ticks when the span is invalid.
   */
  protected getXTickValues(): number[] {
    const [zoom0, zoom1] = this.xDomainZoom;
    if (!(zoom1 > zoom0)) {
      return super.getXTickValues();
    }

    const span = zoom1 - zoom0;
    const targetTicks = 10;
    const rawStep = span / targetTicks;
    const niceSteps = [0.001, 0.002, 0.005, 0.01, 0.02, 0.025, 0.04, 0.05, 0.1, 0.2, 0.25, 0.5];
    let step = niceSteps[niceSteps.length - 1];
    for (const candidate of niceSteps) {
      if (candidate >= rawStep) {
        step = candidate;
        break;
      }
    }

    const first = Math.ceil((zoom0 - 1e-12) / step) * step;
    const ticks: number[] = [];
    const decimals = step < 0.01 ? 3 : 2;
    for (let value = first; value <= zoom1 + 1e-12; value += step) {
      const rounded = Number(value.toFixed(decimals + 1));
      if (rounded >= zoom0 - 1e-12 && rounded <= zoom1 + 1e-12) {
        ticks.push(Number(rounded.toFixed(decimals)));
      }
    }
    return ticks.length > 0 ? ticks : super.getXTickValues();
  }

  protected getXTickFormat(): (value: number) => string {
    const [zoom0, zoom1] = this.xDomainZoom;
    const span = zoom1 - zoom0;
    const decimals = span <= 0.05 ? 3 : 2;
    return (value: number) => value.toFixed(decimals);
  }

}
