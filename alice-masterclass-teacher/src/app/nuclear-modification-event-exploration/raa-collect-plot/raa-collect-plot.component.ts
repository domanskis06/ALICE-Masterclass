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

/** One student's R_AA for one centrality class and one pT window. */
export interface RaaCollectPoint {
  student: number;
  value: number;
}

/**
 * One pad of the desktop instructor tool's Collect canvas
 * (`Raa/instructors/Collect.h`): every student's R_AA for a single Pb-Pb
 * centrality class, drawn against the student group number, with the dashed
 * R_AA = 1 reference line and the mean over the included students.
 */
@Component({
  selector: 'app-raa-collect-plot',
  templateUrl: './raa-collect-plot.component.html',
  styleUrls: ['./raa-collect-plot.component.scss'],
  standalone: false,
})
export class RaaCollectPlotComponent implements AfterViewInit, OnDestroy {
  private static nextId = 0;

  /** Unique per instance: six pads share the page, each needs its own clipPath. */
  readonly clipId = `raa-collect-${RaaCollectPlotComponent.nextId++}`;

  @Input()
  @HostBinding('style.--marker-color')
  public color = '#38bdf8';

  /** Hollow markers for the pT > 1 GeV/c pads, filled for the inclusive ones. */
  @Input() public hollow = false;

  public readonly SVG = { W: 420, H: 220 };

  public readonly MARGIN = {
    TOP: 8,
    RIGHT: 12,
    BOTTOM: 22,
    BOTTOM_XLABEL: 12,
    BOTTOM_TEXT: 4,
    LEFT: 28,
    LEFT_YLABEL: 12,
  };

  public readonly CONTENT_AREA = {
    X: this.MARGIN.LEFT + this.MARGIN.LEFT_YLABEL,
    Y: this.MARGIN.TOP,
    W: this.SVG.W - this.MARGIN.LEFT - this.MARGIN.LEFT_YLABEL - this.MARGIN.RIGHT,
    H: this.SVG.H - this.MARGIN.TOP - this.MARGIN.BOTTOM - this.MARGIN.BOTTOM_XLABEL,
  };

  public readonly ANIMATION_DURATION = 400;

  public tooltipVisible = false;
  public tooltipPoint: RaaCollectPoint | null = null;
  public tooltipX = 0;
  public tooltipY = 0;

  @ViewChild('plotFrame') private plotFrameRef!: ElementRef<HTMLElement>;
  @ViewChild('xAxis') private xAxisRef!: ElementRef<SVGGElement>;
  @ViewChild('yAxis') private yAxisRef!: ElementRef<SVGGElement>;
  @ViewChild('dots') private dotsRef!: ElementRef<SVGGElement>;
  @ViewChild('unityLine') private unityLineRef!: ElementRef<SVGLineElement>;
  @ViewChild('meanLine') private meanLineRef!: ElementRef<SVGLineElement>;

  @Input()
  get maxStudent(): number {
    return this._maxStudent.getValue();
  }
  set maxStudent(value: number) {
    this._maxStudent.next(value);
  }
  private _maxStudent = new BehaviorSubject<number>(0);

  @Input()
  get points(): RaaCollectPoint[] {
    return this._points.getValue();
  }
  set points(points: RaaCollectPoint[]) {
    this._points.next(points ?? []);
  }
  private _points = new BehaviorSubject<RaaCollectPoint[]>([]);

  private subscriptions = new Subscription();

  protected xScale = d3.scaleLinear<number>();
  protected yScale = d3.scaleLinear<number>();

  constructor(private readonly ngZone: NgZone) {}

  /** Mean R_AA over the included students — the number the instructor quotes. */
  get mean(): number | null {
    const points = this.points;
    if (!points.length) {
      return null;
    }
    return points.reduce((sum, p) => sum + p.value, 0) / points.length;
  }

  get count(): number {
    return this.points.length;
  }

  ngAfterViewInit(): void {
    this.xScale.range([0, this.CONTENT_AREA.W]);
    this.yScale.range([this.CONTENT_AREA.H, 0]);

    this.subscriptions.add(this._maxStudent.subscribe(() => this.redraw()));
    this.subscriptions.add(this._points.subscribe(() => this.redraw()));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private redraw(): void {
    if (!this.xAxisRef || !this.yAxisRef || !this.dotsRef) {
      return;
    }

    this.updateScales();
    this.updateAxes();
    this.updateLines();
    this.updateDots();
  }

  private updateScales(): void {
    const span = Math.max(1, this.maxStudent);
    this.xScale.domain([-0.5, span + 0.5]);

    // Always keep R_AA = 1 in view: that line is the whole point of the plot.
    const maxValue = d3.max(this.points, (p) => p.value) ?? 0;
    this.yScale.domain([0, Math.max(1.25, maxValue * 1.15)]);
  }

  private updateAxes(): void {
    const ticks = Math.min(10, Math.max(2, this.maxStudent + 1));

    d3.select(this.xAxisRef.nativeElement)
      .transition()
      .duration(this.ANIMATION_DURATION)
      .call(d3.axisBottom(this.xScale).ticks(ticks).tickFormat(d3.format('d')));

    d3.select(this.yAxisRef.nativeElement)
      .transition()
      .duration(this.ANIMATION_DURATION)
      .call(d3.axisLeft(this.yScale).ticks(5));
  }

  private updateLines(): void {
    const x1 = this.xScale(this.xScale.domain()[0]);
    const x2 = this.xScale(this.xScale.domain()[1]);

    d3.select(this.unityLineRef.nativeElement)
      .attr('x1', x1)
      .attr('x2', x2)
      .attr('y1', this.yScale(1) + 0.5)
      .attr('y2', this.yScale(1) + 0.5);

    const mean = this.mean;
    const meanLine = d3.select(this.meanLineRef.nativeElement);

    if (mean === null) {
      meanLine.attr('opacity', 0);
      return;
    }

    meanLine
      .attr('opacity', 1)
      .attr('x1', x1)
      .attr('x2', x2)
      .transition()
      .duration(this.ANIMATION_DURATION)
      .attr('y1', this.yScale(mean) + 0.5)
      .attr('y2', this.yScale(mean) + 0.5);
  }

  private updateDots(): void {
    d3.select(this.dotsRef.nativeElement)
      .selectAll<SVGCircleElement, RaaCollectPoint>('circle')
      .data(this.points, (p: RaaCollectPoint) => p.student)
      .join(
        (enter) =>
          enter
            .append('circle')
            .attr('cx', (p) => this.xScale(p.student))
            .attr('cy', this.yScale(0))
            .attr('r', 0)
            .attr('stroke-width', 2),
        (update) => update,
        (exit) => exit.remove(),
      )
      .classed('hollow', this.hollow)
      .on('mouseenter', (event: MouseEvent, p) => this.showTooltip(event, p))
      .on('mousemove', (event: MouseEvent, p) => this.showTooltip(event, p))
      .on('mouseleave', () => this.hideTooltip())
      .transition()
      .duration(this.ANIMATION_DURATION)
      .attr('cx', (p) => this.xScale(p.student))
      .attr('cy', (p) => this.yScale(p.value))
      .attr('r', 4);
  }

  private showTooltip(event: MouseEvent, point: RaaCollectPoint): void {
    if (!this.plotFrameRef) {
      return;
    }

    const frameRect = this.plotFrameRef.nativeElement.getBoundingClientRect();
    this.ngZone.run(() => {
      this.tooltipPoint = point;
      this.tooltipVisible = true;
      this.tooltipX = event.clientX - frameRect.left;
      this.tooltipY = event.clientY - frameRect.top;
    });
  }

  private hideTooltip(): void {
    this.ngZone.run(() => {
      this.tooltipVisible = false;
      this.tooltipPoint = null;
    });
  }
}
