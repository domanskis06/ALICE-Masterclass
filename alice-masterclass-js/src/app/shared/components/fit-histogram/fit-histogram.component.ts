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

  @Input()
  signalShown: boolean = true;

  @Input()
  backgroundShown: boolean = true;

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

  private lineGenerator: d3.Line<[number, number]> = d3.line();

  constructor() {
    super();
  }

  ngAfterViewInit(): void {
    super.ngAfterViewInit();

    this.signalFunctionSubscription = this._signalFunction.subscribe((signalFunction) => {
      this.updatePoints();
      this.updateLines();
    });

    this.backgroundFunctionSubscription = this._backgroundFunction.subscribe((backgroundFunction) => {
      this.updatePoints();
      this.updateLines();
    });

    this.signalRangeSubscription = this._signalRange.subscribe((signalRange) => {
      this.updatePoints();
      this.updateLines();
    });

    this.backgroundRangeSubscription = this._backgroundRange.subscribe((backgroundRange) => {
      this.updatePoints();
      this.updateLines();
    });
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

    const intervalB = (this.backgroundRange[1] - this.backgroundRange[0]) / this.LINE_POINTS;

    for (let x = this.backgroundRange[0]; x < this.backgroundRange[1]; x += intervalB) {
      this.backgroundPoints.push([x, this.backgroundFunction(x)]);
    }

    this.signalPoints = [];

    const intervalS = (this.signalRange[1] - this.signalRange[0]) / this.LINE_POINTS;

    for (let x = this.signalRange[0]; x < this.signalRange[1]; x += intervalS) {
      this.signalPoints.push([x, this.signalFunction(x)]);
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

  protected updateXDomain(): void {
    super.updateXDomain();

    if (this.backgroundRef && this.signalRef) {
      this.lineGenerator
        .x( (d) => { return this.xScale(d[0])} )
        .y( (d) => { return this.yScale(d[1])} );

      this.updateLines();
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

  /** Nice ticks every 0.04 within the visible zoom domain (LSA only). */
  protected getXTickValues(): number[] {
    const step = 0.04;
    const [zoom0, zoom1] = this.xDomainZoom;
    if (!(zoom1 > zoom0)) {
      return super.getXTickValues();
    }

    const first = Math.ceil((zoom0 - 1e-9) / step) * step;
    const ticks: number[] = [];
    for (let value = first; value <= zoom1 + 1e-9; value += step) {
      const rounded = Math.round(value / step) * step;
      if (rounded >= zoom0 - 1e-9 && rounded <= zoom1 + 1e-9) {
        ticks.push(Number(rounded.toFixed(2)));
      }
    }
    return ticks.length > 0 ? ticks : super.getXTickValues();
  }

  protected getXTickFormat(): (value: number) => string {
    return (value: number) => value.toFixed(2);
  }

}
