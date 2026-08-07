import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { Options } from '@angular-slider/ngx-slider';

import {
  PID_DEDX_MAX,
  PID_DEDX_MIN,
  PID_P_MAX,
  PID_P_MIN,
  PidCut,
} from '../../models/jpsi.models';

/** Debounce for slider dragging; long enough to avoid rebuilding on every pixel. */
const CHANGE_DEBOUNCE_MS = 150;

@Component({
  selector: 'app-jpsi-pid-cut-controls',
  templateUrl: './pid-cut-controls.component.html',
  styleUrls: ['./pid-cut-controls.component.scss'],
  standalone: false,
})
export class PidCutControlsComponent implements OnChanges {
  @Input() cut!: PidCut;
  @Input() disabled = false;

  @Output() cutChange = new EventEmitter<PidCut>();
  @Output() resetCuts = new EventEmitter<void>();

  pMin = PID_P_MIN;
  pMax = PID_P_MAX;
  dedxMin = PID_DEDX_MIN;
  dedxMax = PID_DEDX_MAX;

  readonly pOptions: Options = {
    floor: PID_P_MIN,
    ceil: PID_P_MAX,
    step: 0.1,
    translate: (value: number) => value.toFixed(1),
  };

  readonly dedxOptions: Options = {
    floor: PID_DEDX_MIN,
    ceil: PID_DEDX_MAX,
    step: 1,
    translate: (value: number) => value.toFixed(0),
  };

  readonly limits = {
    pMin: PID_P_MIN,
    pMax: PID_P_MAX,
    dedxMin: PID_DEDX_MIN,
    dedxMax: PID_DEDX_MAX,
  };

  private emitTimeout: number | null = null;

  ngOnChanges(): void {
    if (this.cut === undefined) {
      return;
    }
    this.pMin = this.cut.pMin;
    this.pMax = this.cut.pMax;
    this.dedxMin = this.cut.dedxMin;
    this.dedxMax = this.cut.dedxMax;
  }

  onSliderChange(): void {
    this.scheduleEmit();
  }

  /** Number inputs are authoritative but must stay inside the axis and stay ordered. */
  onNumberChange(): void {
    this.pMin = this.clamp(this.pMin, PID_P_MIN, PID_P_MAX);
    this.pMax = this.clamp(this.pMax, PID_P_MIN, PID_P_MAX);
    this.dedxMin = this.clamp(this.dedxMin, PID_DEDX_MIN, PID_DEDX_MAX);
    this.dedxMax = this.clamp(this.dedxMax, PID_DEDX_MIN, PID_DEDX_MAX);

    if (this.pMin > this.pMax) {
      [this.pMin, this.pMax] = [this.pMax, this.pMin];
    }
    if (this.dedxMin > this.dedxMax) {
      [this.dedxMin, this.dedxMax] = [this.dedxMax, this.dedxMin];
    }

    this.scheduleEmit();
  }

  private clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  }

  private scheduleEmit(): void {
    if (this.emitTimeout !== null) {
      window.clearTimeout(this.emitTimeout);
    }
    this.emitTimeout = window.setTimeout(() => {
      this.emitTimeout = null;
      this.cutChange.emit({
        pMin: this.pMin,
        pMax: this.pMax,
        dedxMin: this.dedxMin,
        dedxMax: this.dedxMax,
      });
    }, CHANGE_DEBOUNCE_MS);
  }
}
