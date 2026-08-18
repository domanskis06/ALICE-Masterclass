import { Component, AfterViewInit, ViewChild, ElementRef, Input, OnDestroy, NgZone } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as d3 from 'd3';

import { JpsiRaaPlotEntry } from '../jpsi-raa.models';

/**
 * R_AA as a function of the number of participants: one point per Pb-Pb centrality class,
 * with a Poisson-error bar and a dashed reference line at R_AA = 1 (no nuclear modification).
 * Built the same way as the LSA `StrangenessEnhancementPlotComponent` (plain D3-on-SVG, no
 * charting library), so it can be projected into the same card/toolbar layout.
 */
@Component({
    selector: 'app-raa-plot',
    templateUrl: './raa-plot.component.html',
    styleUrls: ['./raa-plot.component.scss'],
    standalone: false
})
export class RaaPlotComponent implements AfterViewInit, OnDestroy {

  public readonly SVG = {
    W: 600,
    H: 260
  };

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

  public tooltipVisible = false;
  public tooltipEntry: JpsiRaaPlotEntry | null = null;
  public tooltipX = 0;
  public tooltipY = 0;

  @ViewChild('svg')
  private svgRef!: ElementRef;

  @ViewChild('plotFrame')
  private plotFrameRef!: ElementRef<HTMLElement>;

  @ViewChild('xAxis')
  private xAxisRef!: ElementRef;
  private get xAxisSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.xAxisRef.nativeElement);
  }

  @ViewChild('yAxis')
  private yAxisRef!: ElementRef;
  private get yAxisSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.yAxisRef.nativeElement);
  }

  @ViewChild('dots')
  private dotsRef!: ElementRef;
  private get dotsSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.dotsRef.nativeElement);
  }

  @ViewChild('errorBars')
  private errorBarsRef!: ElementRef;
  private get errorBarsSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.errorBarsRef.nativeElement);
  }

  @ViewChild('referenceLine')
  private referenceLineRef!: ElementRef;
  private get referenceLineSelector(): d3.Selection<SVGGElement, unknown, null, undefined> {
    return d3.select(this.referenceLineRef.nativeElement);
  }

  @Input()
  get xDomain(): [number, number] { return this._xDomain.getValue(); }
  set xDomain(domain: [number, number]) {
    this._xDomain.next(domain);
  }
  private _xDomain: BehaviorSubject<[number, number]> = new BehaviorSubject<[number, number]>([0, 1]);
  private xDomainSubscription: Subscription = new Subscription();

  private _yDomain: BehaviorSubject<[number, number]> = new BehaviorSubject<[number, number]>([0, 2]);
  private yDomainSubscription: Subscription = new Subscription();

  @Input()
  get data(): Array<JpsiRaaPlotEntry> { return this._data.getValue(); }
  set data(data: Array<JpsiRaaPlotEntry>) {
    const yMax = d3.max(data, (d) => d.raa + d.raaError) ?? 0;
    this._yDomain.next([0, Math.max(yMax * 1.15, 1.3)]);
    this._data.next(data);
  }
  private _data: BehaviorSubject<Array<JpsiRaaPlotEntry>> = new BehaviorSubject<Array<JpsiRaaPlotEntry>>([]);
  private dataSubscription: Subscription = new Subscription();

  protected xScale: d3.ScaleLinear<number, number> = d3.scaleLinear<number>();
  protected yScale: d3.ScaleLinear<number, number> = d3.scaleLinear<number>();

  constructor(private readonly ngZone: NgZone) { }

  ngAfterViewInit(): void {
    this.xScale.range([0, this.CONTENT_AREA.W]);
    this.yScale.range([this.CONTENT_AREA.H, 0]);

    this.xDomainSubscription = this._xDomain.subscribe((domain) => {
      this.xScale.domain(domain);
      this.updateXDomain();
      this.updateReferenceLine();
    });

    this.yDomainSubscription = this._yDomain.subscribe((domain) => {
      this.yScale.domain(domain);
      this.updateYDomain();
      this.updateReferenceLine();
    });

    this.dataSubscription = this._data.subscribe(() => {
      this.updateDots();
      this.updateErrorBars();
    });
  }

  ngOnDestroy(): void {
    this.xDomainSubscription.unsubscribe();
    this.yDomainSubscription.unsubscribe();
    this.dataSubscription.unsubscribe();
  }

  private updateXDomain(): void {
    if (this.xAxisRef) {
      this.xAxisSelector.transition().duration(this.ANIMATION_DURATION).call(d3.axisBottom(this.xScale));
    }
  }

  private updateYDomain(): void {
    if (this.yAxisRef) {
      this.yAxisSelector.transition().duration(this.ANIMATION_DURATION).call(d3.axisLeft(this.yScale));
    }
  }

  private updateReferenceLine(): void {
    if (!this.referenceLineRef) {
      return;
    }
    this.referenceLineSelector
      .attr('x1', this.xScale(this.xDomain[0]))
      .attr('y1', this.yScale(1) + 0.5)
      .attr('x2', this.xScale(this.xDomain[1]))
      .attr('y2', this.yScale(1) + 0.5);
  }

  private updateDots(): void {
    const dotsSelection = this.dotsSelector.selectAll<SVGCircleElement, JpsiRaaPlotEntry>('circle').data(this.data);

    dotsSelection
      .join(
        (enter) => enter
          .append('circle')
          .attr('cx', (d) => this.xScale(d.nParticipants))
          .attr('cy', (d) => this.yScale(0))
          .attr('r', 0)
          .attr('stroke', 'transparent')
          .attr('stroke-width', 12),
        (update) => update,
        (exit) => exit.remove()
      )
      .on('mouseenter', (event, d) => this.showTooltip(event, d))
      .on('mousemove', (event, d) => this.showTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip())
      .transition().duration(this.ANIMATION_DURATION)
      .attr('cx', (d) => this.xScale(d.nParticipants))
      .attr('cy', (d) => this.yScale(d.raa))
      .attr('r', 4);
  }

  private updateErrorBars(): void {
    // Centralities with no real submission yet have raa === raaError === 0 (see
    // JpsiRaaService.relativeStatError); drawing a zero-length bar there is harmless, but a
    // low-statistics bin with a spurious near-zero signal can still round to a visible sliver.
    // Only draw a bar where there is an actual measurement.
    const measured = this.data.filter((d) => d.raa > 0);
    const barsSelection = this.errorBarsSelector
      .selectAll<SVGLineElement, JpsiRaaPlotEntry>('line')
      .data(measured, (d) => d.centralityId);

    barsSelection
      .join(
        (enter) => enter
          .append('line')
          .attr('x1', (d) => this.xScale(d.nParticipants))
          .attr('x2', (d) => this.xScale(d.nParticipants))
          .attr('y1', (d) => this.yScale(d.raa))
          .attr('y2', (d) => this.yScale(d.raa)),
        (update) => update,
        (exit) => exit.remove()
      )
      .transition().duration(this.ANIMATION_DURATION)
      .attr('x1', (d) => this.xScale(d.nParticipants))
      .attr('x2', (d) => this.xScale(d.nParticipants))
      .attr('y1', (d) => this.yScale(d.raa + d.raaError))
      .attr('y2', (d) => this.yScale(Math.max(0, d.raa - d.raaError)));
  }

  private showTooltip(event: MouseEvent, entry: JpsiRaaPlotEntry): void {
    if (!this.plotFrameRef) {
      return;
    }

    const frameRect = this.plotFrameRef.nativeElement.getBoundingClientRect();
    this.ngZone.run(() => {
      this.tooltipEntry = entry;
      this.tooltipVisible = true;
      this.tooltipX = event.clientX - frameRect.left;
      this.tooltipY = event.clientY - frameRect.top;
    });
  }

  private hideTooltip(): void {
    this.ngZone.run(() => {
      this.tooltipVisible = false;
      this.tooltipEntry = null;
    });
  }
}
