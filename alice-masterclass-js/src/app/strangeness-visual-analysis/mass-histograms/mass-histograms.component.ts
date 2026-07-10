import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { ApiService } from '../../shared/services/api.service';
import { ParticleType, VisualAnalysisResultsEntry } from '../../shared/services/api.service';
import { HistogramBinIncrementedEvent } from '../../shared/components/histogram/histogram.component';

export interface MassHistogramBinIncrementedEvent extends HistogramBinIncrementedEvent {
  particle: ParticleType;
}

@Component({
    selector: 'app-mass-histograms',
    templateUrl: './mass-histograms.component.html',
    styleUrls: ['./mass-histograms.component.scss'],
    standalone: false
})
export class MassHistogramsComponent implements OnInit {
  readonly ParticleType = ParticleType;

  kaonMasses: Array<number> = [];
  lambdaMasses: Array<number> = [];
  antiLambdaMasses: Array<number> = [];
  xiMasses: Array<number> = [];

  @Input()
  uploadDisabled: boolean = false;

  @Input()
  get results(): Map<string, VisualAnalysisResultsEntry> { return this._results; }
  set results(results: Map<string, VisualAnalysisResultsEntry>) {
    this._results = results;

    const newKaonMasses: Array<number> = [];
    const newLambdaMasses: Array<number> = [];
    const newAntiLambdaMasses: Array<number> = [];
    const newXiMasses: Array<number> = [];

    for (let entry of Array.from(this._results.entries())) {
      const value: VisualAnalysisResultsEntry = entry[1];

      switch (value.particle) {
        case ParticleType.KAON:
          newKaonMasses.push(value.mass);
          break;
        case ParticleType.LAMBDA:
          newLambdaMasses.push(value.mass);
          break;
        case ParticleType.ANTI_LAMBDA:
          newAntiLambdaMasses.push(value.mass);
          break;
        case ParticleType.XI:
          newXiMasses.push(value.mass);
          break;
      }

    }

    this.kaonMasses = newKaonMasses;
    this.lambdaMasses = newLambdaMasses;
    this.antiLambdaMasses = newAntiLambdaMasses;
    this.xiMasses = newXiMasses;
  }
  private _results: Map<string, VisualAnalysisResultsEntry> = new Map<string, VisualAnalysisResultsEntry>();

  @Output()
  uploadResultsEvent: EventEmitter<any> = new EventEmitter();

  @Output()
  binIncremented: EventEmitter<MassHistogramBinIncrementedEvent> = new EventEmitter<MassHistogramBinIncrementedEvent>();

  constructor(public apiService: ApiService) { }

  ngOnInit(): void {
  }

  onUploadButtonClicked(): void {
    this.uploadResultsEvent.emit();
  }

  onHistogramBinIncremented(particle: ParticleType, event: HistogramBinIncrementedEvent): void {
    this.binIncremented.emit({particle, targetX: event.targetX, targetY: event.targetY});
  }

}
