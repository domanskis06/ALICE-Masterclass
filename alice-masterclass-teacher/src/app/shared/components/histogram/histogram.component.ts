import { Component, AfterViewInit, ViewChild, ElementRef, Input, HostBinding, Output, EventEmitter, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as d3 from 'd3';

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

  public readonly SVG = {
    W: 400,
    H: 200
  }

  public readonly MARGIN = {
    TOP: 5,
    RIGHT: 10,
    BOTTOM: 20,
    BOTTOM_XLABEL: 10,
    BOTTOM_TEXT: 3,
    LEFT: 25,
    LEFT_YLABEL: 10
  };

  public readonly CONTENT_AREA = {
    X: this.MARGIN.LEFT + this.MARGIN.LEFT_YLABEL,
    Y: this.MARGIN.TOP,
    W: this.SVG.W - this.MARGIN.LEFT - this.MARGIN.LEFT_YLABEL - this.MARGIN.RIGHT,
    H: this.SVG.H - this.MARGIN.TOP - this.MARGIN.BOTTOM - this.MARGIN.BOTTOM_XLABEL
  };

  public readonly ANIMATION_DURATION: number = 500;

  @ViewChild('svg')
  private svgRef!: ElementRef;

  private get svg(): SVGElement {
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
  get xDomain(): [number, number] { return this._xDomain; }
  set xDomain(domain: [number, number]) {
    this._xDomain = domain;

    this.xDomainZoom = domain;
  }
  private _xDomain: [number, number] = [0, 1];

  get xDomainZoom(): [number, number] { return this._xDomainZoom.getValue(); }
  set xDomainZoom(domainZoom: [number, number]) {
    this._xDomainZoom.next(domainZoom);
  }
  private _xDomainZoom: BehaviorSubject<[number, number]> = new BehaviorSubject([0, 1]);
  private xDomainZoomSubscription: Subscription = new Subscription;

  @Input()
  get yDomain(): [number, number] { return this._yDomain.getValue(); }
  set yDomain(domain: [number, number]) {
    this._yDomain.next(domain);
  }
  private _yDomain: BehaviorSubject<[number, number]> = new BehaviorSubject([0, 1]);
  private yDomainSubscription: Subscription = new Subscription;

  @Input()
  get bins(): number { return this._bins.getValue(); }
  set bins(bins: number) {
    this._bins.next(bins);
  }
  private _bins: BehaviorSubject<number> = new BehaviorSubject(1);
  private binsSubscription: Subscription = new Subscription;

  @Input()
  get data(): Array<number> { return this._data.getValue(); }
  set data(data: Array<number>) {
    this.binGenerator.domain(this.xDomain).thresholds(this.bins);

    const bins = this.binGenerator(data);

    const yMax = d3.max(bins, (d: d3.Bin<number, number>) => { return d.length; }) ?? 0;

    if (yMax !== 0) {
      this.yDomain = [0, yMax];
    } else {
      this.yDomain = [0, 1];
    }

    this._data.next(data);
  }
  private _data: BehaviorSubject<Array<number>> = new BehaviorSubject<Array<number>>([]);
  private dataSubscription: Subscription = new Subscription;

  @Input()
  get enableZoom(): boolean { return this._enableZoom.getValue(); }
  set enableZoom(enableZoom: boolean) {
    this._enableZoom.next(enableZoom);
  }
  private _enableZoom: BehaviorSubject<boolean> = new BehaviorSubject<boolean>(false);
  private enableZoomSubscription: Subscription = new Subscription;

  @Output()
  zoomEvent: EventEmitter<[number, number]> = new EventEmitter<[number, number]>();

  protected binCenter(bin: d3.Bin<number, number>) {
    return (bin.x1! - bin.x0!) / 2 + bin.x0!;
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

    this.binsSubscription = this._bins.subscribe((bins) => {
      this.updateBars();
    })

    this.dataSubscription = this._data.subscribe((data) => {
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
    this.xDomainZoomSubscription.unsubscribe();
    this.yDomainSubscription.unsubscribe();
    this.binsSubscription.unsubscribe();
    this.dataSubscription.unsubscribe();
    this.enableZoomSubscription.unsubscribe();
  }

  private updateBars(): void {
    this.binGenerator.domain(this.xDomain).thresholds(this.bins);

    const bins = this.binGenerator(this.data);

    let barWidth = 0;

    // One pixel wider to cover any floating point errors that definetely will happen
    if (bins.length > 0) {
      barWidth = (this.xScale(bins[0].x1!) - this.xScale(bins[0].x0!)) + 1;
    }

    const barsSelection = this.barsSelector.selectAll('rect').data(bins);

    // If a new bar is needed, prematurely place it on the X axis with zero height
    // to avoid an awkward animation from the upper left corner of the image (SVG origin point)
    // If a bar has to be removed, remove it.
    // Animate both the newly added and already existing bars to their final height
    barsSelection
      .join(
        (enter) => {
          return enter
            .append('rect')
            .attr('transform', (d) => {
              return `translate(${this.xScale(this.binCenter(d))}, ${this.CONTENT_AREA.H})`;
            })
            .attr('width', barWidth)
        },
        (update) => {
          return update;
        },
        (exit) => {
          return exit.remove();
        }
      )
      .transition().duration(this.ANIMATION_DURATION)
      .attr('width', barWidth)
      .attr('transform', (d) => {
        return `translate(${this.xScale(this.binCenter(d))}, ${this.yScale(d.length)})`;
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

  protected updateXDomain(): void {
    if (this.xAxisRef) {
      this.xAxisSelector.transition().duration(this.ANIMATION_DURATION).call(d3.axisBottom(this.xScale));
    }
  }

  protected updateYDomain(): void {
    if (this.yAxisRef) {
      this.yAxisSelector.transition().duration(this.ANIMATION_DURATION).call(d3.axisLeft(this.yScale));
    }
  }

}
