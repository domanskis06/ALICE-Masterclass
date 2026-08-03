import { Component, OnInit, Input, Output, EventEmitter, ViewChild, ChangeDetectorRef } from '@angular/core';
import { FitService } from '../../shared/services/fit.service';
import { FitHistogramComponent } from '../../shared/components/fit-histogram/fit-histogram.component';

@Component({
    selector: 'app-histogram-display',
    templateUrl: './histogram-display.component.html',
    styleUrls: ['./histogram-display.component.scss'],
    standalone: false
})
export class HistogramDisplayComponent implements OnInit {

  @Input()
  loading: boolean = false;

  @Output()
  rangeChangeEvent: EventEmitter<[number, number]> = new EventEmitter<[number, number]>();

  @Output()
  resetRangeEvent: EventEmitter<void> = new EventEmitter<void>();

  @ViewChild('fitHistogram')
  fitHistogram: FitHistogramComponent | undefined;

  /** Tracks brush zoom so the Unzoom button enables without relying on ViewChild timing. */
  isZoomed = false;

  constructor(
    public fitService: FitService,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.fitService.signalFunction =  (x: number) => 0;
    this.fitService.backgroundFunction = (x: number) => 0;
  }

  onZoom(event: [number, number]) {
    const xmin = this.fitService.data.xmin;
    const xmax = this.fitService.data.xmax;
    this.isZoomed = event[0] !== xmin || event[1] !== xmax;
    this.cdr.markForCheck();
    this.rangeChangeEvent.emit(event);
  }

  onUnzoomClick(): void {
    this.fitHistogram?.unzoom();
  }

  onResetRangeClick(): void {
    this.resetRangeEvent.emit();
  }

}
