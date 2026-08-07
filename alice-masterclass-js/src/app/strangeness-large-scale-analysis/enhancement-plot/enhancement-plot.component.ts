import {
  AfterViewInit,
  Component,
  ElementRef,
  HostBinding,
  Input,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';
import * as d3 from 'd3';

import {
  ENHANCEMENT_ANTILAMBDA_COLOR,
  ENHANCEMENT_KAON_COLOR,
  ENHANCEMENT_LAMBDA_COLOR,
  StrangenessEnhancementPlotEntry,
} from '../../services/lsa-enhancement.service';
import { ParticleType } from '../../shared/services/api.service';

/**
 * Enhancement versus number of participants, one dot per species and centrality
 * bin. Rendered next to the invariant-mass histogram in the demo layout.
 */
@Component({
    selector: 'app-enhancement-plot',
    templateUrl: './enhancement-plot.component.html',
    styleUrls: ['./enhancement-plot.component.scss'],
    standalone: false
})
export class EnhancementPlotComponent implements AfterViewInit, OnDestroy {
  protected readonly ParticleType = ParticleType;

  @HostBinding('style.--kaon-color')
  readonly kaonColor: string = ENHANCEMENT_KAON_COLOR;

  @HostBinding('style.--lambda-color')
  readonly lambdaColor: string = ENHANCEMENT_LAMBDA_COLOR;

  @HostBinding('style.--antilambda-color')
  readonly antilambdaColor: string = ENHANCEMENT_ANTILAMBDA_COLOR;

  readonly SVG = {
    W: 600,
    H: 300
  };

  readonly MARGIN = {
    TOP: 5,
    RIGHT: 10,
    BOTTOM: 20,
    BOTTOM_XLABEL: 12,
    BOTTOM_TEXT: 3,
    LEFT: 25,
    LEFT_YLABEL: 12
  };

  readonly CONTENT_AREA = {
    X: this.MARGIN.LEFT + this.MARGIN.LEFT_YLABEL,
    Y: this.MARGIN.TOP,
    W: this.SVG.W - this.MARGIN.LEFT - this.MARGIN.LEFT_YLABEL - this.MARGIN.RIGHT,
    H: this.SVG.H - this.MARGIN.TOP - this.MARGIN.BOTTOM - this.MARGIN.BOTTOM_XLABEL
  };

  readonly ANIMATION_DURATION: number = 500;

  /** Fallback Y range while no fit has been accepted yet. */
  private static readonly EMPTY_Y_DOMAIN: [number, number] = [0, 2.6];

  tooltipVisible = false;
  tooltipEntry: StrangenessEnhancementPlotEntry | null = null;
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

  @ViewChild('line')
  private lineRef!: ElementRef<SVGLineElement>;

  @Input()
  get xDomain(): [number, number] { return this._xDomain.getValue(); }
  set xDomain(domain: [number, number]) {
    this._xDomain.next(domain);
  }
  private _xDomain = new BehaviorSubject<[number, number]>([0, 1]);
  private xDomainSubscription = new Subscription();

  get yDomain(): [number, number] { return this._yDomain.getValue(); }
  private _yDomain = new BehaviorSubject<[number, number]>(EnhancementPlotComponent.EMPTY_Y_DOMAIN);
  private yDomainSubscription = new Subscription();

  @Input()
  get data(): Array<StrangenessEnhancementPlotEntry> { return this._data.getValue(); }
  set data(data: Array<StrangenessEnhancementPlotEntry>) {
    const points = data ?? [];
    const yMax = d3.max(points, (d) => d.enhancement) ?? 0;

    // 10% headroom so the highest dot is not drawn on the frame.
    this._yDomain.next(yMax > 0 ? [0, yMax * 1.1] : EnhancementPlotComponent.EMPTY_Y_DOMAIN);
    this._data.next(points);
  }
  private _data = new BehaviorSubject<Array<StrangenessEnhancementPlotEntry>>([]);
  private dataSubscription = new Subscription();

  protected xScale: d3.ScaleLinear<number, number> = d3.scaleLinear<number>();
  protected yScale: d3.ScaleLinear<number, number> = d3.scaleLinear<number>();

  constructor(private readonly ngZone: NgZone) { }

  ngAfterViewInit(): void {
    this.xScale.range([0, this.CONTENT_AREA.W]);
    this.yScale.range([this.CONTENT_AREA.H, 0]);

    this.xDomainSubscription = this._xDomain.subscribe((domain) => {
      this.xScale.domain(domain);
      this.updateXDomain();
    });

    this.yDomainSubscription = this._yDomain.subscribe((domain) => {
      this.yScale.domain(domain);
      this.updateYDomain();
    });

    this.dataSubscription = this._data.subscribe(() => this.updateDots());
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
    d3.select(this.xAxisRef.nativeElement)
      .transition().duration(this.ANIMATION_DURATION)
      .call(d3.axisBottom(this.xScale));
  }

  private updateYDomain(): void {
    if (!this.yAxisRef) {
      return;
    }
    d3.select(this.yAxisRef.nativeElement)
      .transition().duration(this.ANIMATION_DURATION)
      .call(d3.axisLeft(this.yScale));

    // Dashed guide at enhancement = 1 (no enhancement relative to pp).
    d3.select(this.lineRef.nativeElement)
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
      .selectAll<SVGCircleElement, StrangenessEnhancementPlotEntry>('circle')
      .data(this.data)
      .join(
        (enter) => enter
          .append('circle')
          .attr('class', (d) => this.dotClass(d.particle))
          .attr('cx', (d) => this.xScale(d.nParticipants))
          .attr('cy', () => this.yScale(0))
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
      .attr('cy', (d) => this.yScale(d.enhancement))
      .attr('r', (d) => d.enhancement > 0 ? 4 : 0);
  }

  private dotClass(particle: ParticleType): string {
    switch (particle) {
      case ParticleType.KAON:
        return 'kaon';
      case ParticleType.LAMBDA:
        return 'lambda';
      case ParticleType.ANTI_LAMBDA:
        return 'antilambda';
      default:
        return '';
    }
  }

  private showTooltip(event: MouseEvent, entry: StrangenessEnhancementPlotEntry): void {
    if (entry.enhancement <= 0 || !this.plotFrameRef) {
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

  protected tooltipParticleKey(particle: ParticleType): string {
    return `STRANGENESS.HISTOGRAM_SELECTOR.${particle.toUpperCase()}`;
  }
}
