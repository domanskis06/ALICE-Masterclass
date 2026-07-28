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

  @Input()
  get signalRange(): [number, number] { return [this.signal.options.floor, this.signal.options.ceil]; };
  set signalRange(range: [number, number]) {
    this.signal.start = range[0];
    this.signal.end = range[1];
    this.signal.options = {
      floor: range[0],
      ceil: range[1],
      step: (range[1] - range[0]) / 100,
      translate: (value, label) => this.label(value, label)
    };
  }

  @Input()
  get backgroundRange(): [number, number] { return [this.background.options.floor, this.background.options.ceil]; };
  set backgroundRange(range: [number, number]) {
    this.background.start = range[0];
    this.background.end = range[1];
    this.background.options = {
      floor: range[0],
      ceil: range[1],
      step: (range[1] - range[0]) / 100,
      translate: (value, label) => this.label(value, label)
    };
  }

  @Output()
  tryFitEvent: EventEmitter<FitHistogramEntry> = new EventEmitter<FitHistogramEntry>();

  @Output()
  addFitResultEvent: EventEmitter<any> = new EventEmitter<any>();

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

}
