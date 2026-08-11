import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { Options } from '@angular-slider/ngx-slider';

import {
  PID_DEDX_MAX,
  PID_DEDX_MIN,
  PID_HEATMAP_MARGIN,
  PID_LOG_P_MAX,
  PID_LOG_P_MIN,
  PID_P_MAX,
  PID_P_MIN,
  PidCut,
} from '../../models/jpsi.models';
import { JpsiTutorialService } from '../../services/jpsi-tutorial.service';

/** Width of the vertical dE/dx column (label + slider), kept in sync with the SCSS. */
const DEDX_COLUMN_WIDTH_PX = 92;
const PLOT_ROW_GAP_PX = 12;
/**
 * ngx-slider pointer is 32×32; the model value sits at the pointer centre, so the track
 * must overhang each plot edge by this half-size for the min/max thumbs to land on the axes.
 */
const SLIDER_THUMB_HALF_PX = 16;

/** Fine enough that thumbs feel continuous; equal Δu ⇒ equal Δx on the log heatmap. */
const LOG_P_STEP = (PID_LOG_P_MAX - PID_LOG_P_MIN) / 400;

@Component({
  selector: 'app-jpsi-pid-cut-controls',
  templateUrl: './pid-cut-controls.component.html',
  styleUrls: ['./pid-cut-controls.component.scss'],
  standalone: false,
})
export class PidCutControlsComponent implements OnChanges {
  @Input() cut!: PidCut;
  @Input() disabled = false;

  /** Immediate cut while dragging — drives the PID selection rectangle only. */
  @Output() cutPreview = new EventEmitter<PidCut>();
  /** Commits the current slider selection into the mass histograms. */
  @Output() acceptRange = new EventEmitter<PidCut>();
  @Output() resetCuts = new EventEmitter<void>();

  constructor(private readonly tutorial: JpsiTutorialService) {}

  /** Momentum thumbs live in log(p) so motion matches the heatmap's log-x axis. */
  logPMin = PID_LOG_P_MIN;
  logPMax = PID_LOG_P_MAX;
  dedxMin = PID_DEDX_MIN;
  dedxMax = PID_DEDX_MAX;

  pOptions: Options = this.buildPOptions(false);
  dedxOptions: Options = this.buildDedxOptions(false);

  /** True between userChange and userChangeEnd — blocks cut→thumb echo. */
  private sliderDragging = false;

  readonly dedxColumnWidth = DEDX_COLUMN_WIDTH_PX;
  /**
   * Align momentum thumbs with the plot edges: inset to the canvas, then overhang by half
   * a thumb so the min/max centres sit on the Y-axis / right plot edge.
   */
  readonly momentumInsetLeft =
    DEDX_COLUMN_WIDTH_PX + PLOT_ROW_GAP_PX + PID_HEATMAP_MARGIN.left - SLIDER_THUMB_HALF_PX;
  readonly momentumInsetRight = PID_HEATMAP_MARGIN.right - SLIDER_THUMB_HALF_PX;
  /**
   * Vertical slider fills the heatmap host; pad so min/max thumb centres sit on the X-axis
   * and the top of the plot (host includes axis label margins).
   */
  readonly dedxPadTop = Math.max(0, SLIDER_THUMB_HALF_PX - PID_HEATMAP_MARGIN.top);
  readonly dedxPadBottom = PID_HEATMAP_MARGIN.bottom - SLIDER_THUMB_HALF_PX;

  ngOnChanges(changes: SimpleChanges): void {
    // Never push an echoed draft cut back into the thumbs while dragging: parent stores
    // physical p = exp(logP), and re-applying Math.log(p) fights ngx-slider (especially
    // near the right-hand floor/ceil) and makes the high thumb oscillate.
    if (
      changes['cut'] &&
      this.cut !== undefined &&
      !this.sliderDragging &&
      !this.cutsMatch(this.cut, this.currentCut())
    ) {
      this.logPMin = Math.log(this.clampP(this.cut.pMin));
      this.logPMax = Math.log(this.clampP(this.cut.pMax));
      this.dedxMin = this.cut.dedxMin;
      this.dedxMax = this.cut.dedxMax;
    }

    if (changes['disabled']) {
      this.pOptions = this.buildPOptions(this.disabled);
      this.dedxOptions = this.buildDedxOptions(this.disabled);
    }
  }

  onSliderChange(): void {
    this.sliderDragging = true;
    this.cutPreview.emit(this.currentCut());
  }

  onSliderChangeEnd(): void {
    this.sliderDragging = false;
    this.cutPreview.emit(this.currentCut());
  }

  onAcceptRange(): void {
    this.acceptRange.emit(this.currentCut());
  }

  openHowToSelectRange(): void {
    this.tutorial.openPidReferenceDialog();
  }

  private currentCut(): PidCut {
    return {
      pMin: this.clampP(Math.exp(this.logPMin)),
      pMax: this.clampP(Math.exp(this.logPMax)),
      dedxMin: this.dedxMin,
      dedxMax: this.dedxMax,
    };
  }

  private cutsMatch(a: PidCut, b: PidCut): boolean {
    return (
      a.pMin === b.pMin &&
      a.pMax === b.pMax &&
      a.dedxMin === b.dedxMin &&
      a.dedxMax === b.dedxMax
    );
  }

  private clampP(value: number): number {
    return Math.min(PID_P_MAX, Math.max(PID_P_MIN, value));
  }

  private buildPOptions(disabled: boolean): Options {
    return {
      floor: PID_LOG_P_MIN,
      ceil: PID_LOG_P_MAX,
      step: LOG_P_STEP,
      disabled,
      // Show physical momentum; the model value stays in log-space.
      translate: (logP: number) => Math.exp(logP).toFixed(1),
    };
  }

  private buildDedxOptions(disabled: boolean): Options {
    return {
      floor: PID_DEDX_MIN,
      ceil: PID_DEDX_MAX,
      step: 1,
      vertical: true,
      disabled,
      translate: (value: number) => value.toFixed(0),
    };
  }
}
