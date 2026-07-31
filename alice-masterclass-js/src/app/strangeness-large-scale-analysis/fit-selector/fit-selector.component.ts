import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';

import { LabelType, Options } from '@angular-slider/ngx-slider';

import { FitHistogramEntry } from '../strangeness-large-scale-analysis.component';
import { FitService } from '../../shared/services/fit.service';

export interface Slider {
  start: number;
  end: number;
  options: Options;
}

@Component({
    selector: 'app-fit-selector',
    templateUrl: './fit-selector.component.html',
    styleUrls: ['./fit-selector.component.scss'],
    standalone: false
})
export class FitSelectorComponent implements OnInit {

  /**
   * Visible axis domain (full histogram or zoom window).
   * Updates slider floors/ceils and clamps existing start/end — does not reset
   * the selection to the full span (except on the first assignment / domain reset).
   */
  @Input()
  get axisRange(): [number, number] {
    return [this.signal.options.floor ?? 0, this.signal.options.ceil ?? 1];
  }
  set axisRange(range: [number, number]) {
    this.applyAxisRange(range, false);
  }

  /**
   * Bumped when a new histogram is opened so selections re-initialize to the
   * full domain instead of being clamped from a previous particle/range.
   */
  @Input()
  set domainResetToken(token: number) {
    if (token === this._domainResetToken) {
      return;
    }
    this._domainResetToken = token;
    this._selectionsInitialized = false;
  }
  private _domainResetToken = 0;

  private _selectionsInitialized = false;

  @Output()
  tryFitEvent: EventEmitter<FitHistogramEntry> = new EventEmitter<FitHistogramEntry>();

  @Output()
  addFitResultEvent: EventEmitter<any> = new EventEmitter<any>();

  @Output()
  clearFitEvent: EventEmitter<void> = new EventEmitter<void>();

  @Output()
  selectionChangeEvent: EventEmitter<FitHistogramEntry> = new EventEmitter<FitHistogramEntry>();

  signal: Slider = {
    start: 0,
    end: 1,
    options: {
      floor: 0,
      ceil: 100,
      translate: (value, label) => this.label(value, label)
    }
  };

  background: Slider = {
    start: 0,
    end: 1,
    options: {
      floor: 0,
      ceil: 100,
      translate: (value, label) => this.label(value, label)
    }
  };

  private label(value: number, label: LabelType): string {
    //Display values up to max 3 decimal places
    const decimal = 1e3;

    const v = Math.round (value * decimal) / decimal;

    return String(v);
  }

  constructor(public fitService: FitService) {}

  ngOnInit(): void {
  }

  private sliderOptions(range: [number, number]): Options {
    return {
      floor: range[0],
      ceil: range[1],
      step: (range[1] - range[0]) / 100,
      // Show floor/ceil at the ends and live values above the thumbs.
      translate: (value, label) => this.label(value, label)
    };
  }

  private applyAxisRange(range: [number, number], forceReset: boolean): void {
    if (!range || !(range[1] > range[0])) {
      return;
    }

    if (!this._selectionsInitialized || forceReset) {
      this.signal.start = range[0];
      this.signal.end = range[1];
      this.background.start = range[0];
      this.background.end = range[1];
      this._selectionsInitialized = true;
    } else {
      const signalClamped = FitService.clampRangeToView(
        [this.signal.start, this.signal.end],
        range
      );
      const backgroundClamped = FitService.clampRangeToView(
        [this.background.start, this.background.end],
        range
      );
      this.signal.start = signalClamped[0];
      this.signal.end = signalClamped[1];
      this.background.start = backgroundClamped[0];
      this.background.end = backgroundClamped[1];
    }

    this.signal.options = this.sliderOptions(range);
    this.background.options = this.sliderOptions(range);

    this.emitSelectionChange();
  }

  onSliderUserChange(): void {
    this.emitSelectionChange();
  }

  private emitSelectionChange(): void {
    const entry: FitHistogramEntry = {
      signalFitRange: [this.signal.start, this.signal.end],
      backgroundFitRange: [this.background.start, this.background.end]
    };
    this.fitService.signalFitRange = entry.signalFitRange;
    this.fitService.backgroundFitRange = entry.backgroundFitRange;
    this.selectionChangeEvent.emit(entry);
  }

  onFitButtonClicked(): void {
    const event: FitHistogramEntry = {
      signalFitRange: [this.signal.start, this.signal.end],
      backgroundFitRange: [this.background.start, this.background.end]
    };

    this.tryFitEvent.emit(event);
  }

  onAcceptButtonClicked(): void {
    this.addFitResultEvent.emit();
  }

  onClearFitButtonClicked(): void {
    this.clearFitEvent.emit();
  }

  /**
   * Reset both sliders to the extremes of the current X axis
   * (full domain when unzoomed — e.g. 0.2–1.2 for kaons, 1–2 for lambdas).
   */
  resetRangesToAxisExtremes(): void {
    const floor = this.signal.options.floor ?? this.fitService.data.xmin;
    const ceil = this.signal.options.ceil ?? this.fitService.data.xmax;
    if (!(ceil > floor)) {
      return;
    }

    this.signal.start = floor;
    this.signal.end = ceil;
    this.background.start = floor;
    this.background.end = ceil;
    this.emitSelectionChange();
  }

}
