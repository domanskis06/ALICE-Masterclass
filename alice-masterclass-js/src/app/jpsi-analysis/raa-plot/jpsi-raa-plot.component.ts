import { AfterViewInit, Component, ElementRef, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as d3 from 'd3';

import { JpsiRaaPlotEntry } from '../../services/jpsi-raa.service';

/**
 * R_AA as a function of the number of participants: one point per Pb-Pb centrality class, with
 * a Poisson-error bar and a dashed reference line at R_AA = 1 (no nuclear modification). Ported
 * from the teacher app's `RaaPlotComponent`
 * (`alice-masterclass-teacher/src/app/jpsi-analysis/raa-plot/raa-plot.component.ts`), plain
 * D3-on-SVG like the LSA `EnhancementPlotComponent`.
 *
 * Unlike the teacher version — which shows every centrality's dot from the start, reasonably
 * read as "no submissions yet" in a live classroom — a centrality with no accepted fit yet is
 * hidden here (`r = 0`, same technique as `EnhancementPlotComponent.updateDots()`), so a single
 * self-paced student never sees a wall of misleading R_AA≈0 points before doing any work.
 */
@Component({
  selector: 'app-jpsi-raa-plot',
  templateUrl: './jpsi-raa-plot.component.html',
  styleUrls: ['./jpsi-raa-plot.component.scss'],
  standalone: false,
})
export class JpsiRaaPlotComponent implements AfterViewInit, OnDestroy {
  readonly SVG = {
    W: 600,
    H: 260,
  };

  readonly MARGIN = {
    TOP: 5,
    RIGHT: 10,
    BOTTOM: 20,
    BOTTOM_XLABEL: 12,
    BOTTOM_TEXT: 3,
    LEFT: 25,
    LEFT_YLABEL: 12,
  };

  readonly CONTENT_AREA = {
    X: this.MARGIN.LEFT + this.MARGIN.LEFT_YLABEL,
    Y: this.MARGIN.TOP,
    W: this.SVG.W - this.MARGIN.LEFT - this.MARGIN.LEFT_YLABEL - this.MARGIN.RIGHT,
    H: this.SVG.H - this.MARGIN.TOP - this.MARGIN.BOTTOM - this.MARGIN.BOTTOM_XLABEL,
  };

  readonly ANIMATION_DURATION = 500;

  /** Fallback Y range while nothing has been accepted yet. */
  private static readonly EMPTY_Y_DOMAIN: [number, number] = [0, 1.3];

  tooltipVisible = false;
  tooltipEntry: JpsiRaaPlotEntry | null = null;
  tooltipX = 0;
  tooltipY = 0;

  @ViewChild('plotFrame')
  private plotFrameRef!: ElementRef<HTMLElement>;

  @ViewChild('xAxis')
  private xAxisRef!: ElementRef<SVGGElement>;

  @ViewChild('yAxis')
  private yAxisRef!: ElementRef<SVGGElement>;

  @ViewChild('dots')
  private dotsRef!: ElementRef<SVGGElement>;

  @ViewChild('errorBars')
  private errorBarsRef!: ElementRef<SVGGElement>;

  @ViewChild('referenceLine')
  private referenceLineRef!: ElementRef<SVGLineElement>;

  @Input()
  get xDomain(): [number, number] {
    return this._xDomain.getValue();
  }
  set xDomain(domain: [number, number]) {
    this._xDomain.next(domain);
  }
  private _xDomain = new BehaviorSubject<[number, number]>([0, 1]);
  private xDomainSubscription = new Subscription();

  private _yDomain = new BehaviorSubject<[number, number]>(JpsiRaaPlotComponent.EMPTY_Y_DOMAIN);
  private yDomainSubscription = new Subscription();

  @Input()
  get data(): JpsiRaaPlotEntry[] {
    return this._data.getValue();
  }
  set data(data: JpsiRaaPlotEntry[]) {
    const points = data ?? [];
    const measured = points.filter((d) => d.measured);
    const yMax = d3.max(measured, (d) => d.raa + d.raaError) ?? 0;

    // 15% headroom so the highest dot/error bar is not drawn on the frame.
    this._yDomain.next(yMax > 0 ? [0, Math.max(yMax * 1.15, 1.3)] : JpsiRaaPlotComponent.EMPTY_Y_DOMAIN);
    this._data.next(points);
  }
  private _data = new BehaviorSubject<JpsiRaaPlotEntry[]>([]);
  private dataSubscription = new Subscription();

  protected xScale: d3.ScaleLinear<number, number> = d3.scaleLinear<number>();
  protected yScale: d3.ScaleLinear<number, number> = d3.scaleLinear<number>();

  constructor(private readonly ngZone: NgZone) {}

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
    if (!this.xAxisRef) {
      return;
    }
    d3.select(this.xAxisRef.nativeElement).transition().duration(this.ANIMATION_DURATION).call(d3.axisBottom(this.xScale));
  }

  private updateYDomain(): void {
    if (!this.yAxisRef) {
      return;
    }
    d3.select(this.yAxisRef.nativeElement).transition().duration(this.ANIMATION_DURATION).call(d3.axisLeft(this.yScale));
  }

  private updateReferenceLine(): void {
    if (!this.referenceLineRef) {
      return;
    }
    d3.select(this.referenceLineRef.nativeElement)
      .attr('x1', this.xScale(this.xDomain[0]))
      .attr('y1', this.yScale(1) + 0.5)
      .attr('x2', this.xScale(this.xDomain[1]))
      .attr('y2', this.yScale(1) + 0.5);
  }

  private updateDots(): void {
    if (!this.dotsRef) {
      return;
    }

    d3.select(this.dotsRef.nativeElement)
      .selectAll<SVGCircleElement, JpsiRaaPlotEntry>('circle')
      .data(this.data)
      .join(
        (enter) =>
          enter
            .append('circle')
            .attr('cx', (d) => this.xScale(d.nParticipants))
            .attr('cy', () => this.yScale(0))
            .attr('r', 0)
            .attr('stroke', 'transparent')
            .attr('stroke-width', 12),
        (update) => update,
        (exit) => exit.remove(),
      )
      .on('mouseenter', (event, d) => this.showTooltip(event, d))
      .on('mousemove', (event, d) => this.showTooltip(event, d))
      .on('mouseleave', () => this.hideTooltip())
      .transition()
      .duration(this.ANIMATION_DURATION)
      .attr('cx', (d) => this.xScale(d.nParticipants))
      .attr('cy', (d) => this.yScale(d.raa))
      .attr('r', (d) => (d.measured ? 4 : 0));
  }

  private updateErrorBars(): void {
    if (!this.errorBarsRef) {
      return;
    }

    d3.select(this.errorBarsRef.nativeElement)
      .selectAll<SVGLineElement, JpsiRaaPlotEntry>('line')
      .data(this.data)
      .join(
        (enter) =>
          enter
            .append('line')
            .attr('x1', (d) => this.xScale(d.nParticipants))
            .attr('x2', (d) => this.xScale(d.nParticipants))
            .attr('y1', (d) => this.yScale(d.raa))
            .attr('y2', (d) => this.yScale(d.raa)),
        (update) => update,
        (exit) => exit.remove(),
      )
      .transition()
      .duration(this.ANIMATION_DURATION)
      .attr('x1', (d) => this.xScale(d.nParticipants))
      .attr('x2', (d) => this.xScale(d.nParticipants))
      .attr('y1', (d) => this.yScale(d.measured ? d.raa + d.raaError : d.raa))
      .attr('y2', (d) => this.yScale(d.measured ? Math.max(0, d.raa - d.raaError) : d.raa));
  }

  private showTooltip(event: MouseEvent, entry: JpsiRaaPlotEntry): void {
    if (!entry.measured || !this.plotFrameRef) {
      this.hideTooltip();
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
