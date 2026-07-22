import { Component, OnInit, Input, Output, EventEmitter, ViewChild } from '@angular/core';
import { ApiService } from '../../shared/services/api.service';
import { ParticleType, VisualAnalysisResultsEntry } from '../../shared/services/api.service';
import { HistogramBinTarget, HistogramComponent } from '../../shared/components/histogram/histogram.component';
import {
  antiLambdaHistogramColor,
  kaonHistogramColor,
  lambdaHistogramColor,
  xiHistogramColor,
} from '../../shared/globals';

@Component({
    selector: 'app-mass-histograms',
    templateUrl: './mass-histograms.component.html',
    styleUrls: ['./mass-histograms.component.scss'],
    standalone: false
})
export class MassHistogramsComponent implements OnInit {
  readonly ParticleType = ParticleType;

  readonly kaonBarColor = kaonHistogramColor;
  readonly lambdaBarColor = lambdaHistogramColor;
  readonly antiLambdaBarColor = antiLambdaHistogramColor;
  readonly xiBarColor = xiHistogramColor;

  readonly binMin = 1;
  readonly binMax = 25;
  readonly defaultBins = 10;

  bins = this.defaultBins;

  get binFillPercent(): string {
    const span = this.binMax - this.binMin;
    if (span <= 0) {
      return '0%';
    }
    const ratio = (this.bins - this.binMin) / span;
    return `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  kaonMasses: Array<number> = [];
  lambdaMasses: Array<number> = [];
  antiLambdaMasses: Array<number> = [];
  xiMasses: Array<number> = [];

  @ViewChild('kaonHistogram') private kaonHistogram?: HistogramComponent;
  @ViewChild('lambdaHistogram') private lambdaHistogram?: HistogramComponent;
  @ViewChild('antiLambdaHistogram') private antiLambdaHistogram?: HistogramComponent;
  @ViewChild('xiHistogram') private xiHistogram?: HistogramComponent;

  @Input()
  uploadDisabled: boolean = false;

  @Input()
  get results(): Map<string, VisualAnalysisResultsEntry[]> { return this._results; }
  set results(results: Map<string, VisualAnalysisResultsEntry[]>) {
    this._results = results;

    const newKaonMasses: Array<number> = [];
    const newLambdaMasses: Array<number> = [];
    const newAntiLambdaMasses: Array<number> = [];
    const newXiMasses: Array<number> = [];

    for (const entries of Array.from(this._results.values())) {
      for (const value of entries) {
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
    }

    this.kaonMasses = newKaonMasses;
    this.lambdaMasses = newLambdaMasses;
    this.antiLambdaMasses = newAntiLambdaMasses;
    this.xiMasses = newXiMasses;
  }
  private _results: Map<string, VisualAnalysisResultsEntry[]> = new Map<string, VisualAnalysisResultsEntry[]>();

  @Output()
  uploadResultsEvent: EventEmitter<any> = new EventEmitter();

  constructor(public apiService: ApiService) { }

  ngOnInit(): void {
  }

  onUploadButtonClicked(): void {
    this.uploadResultsEvent.emit();
  }

  onBinsInput(value: number | string | null): void {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.bins = Math.round(parsed);
    this.clampBins();
  }

  clampBins(): void {
    this.bins = Math.min(this.binMax, Math.max(this.binMin, Math.round(this.bins) || this.binMin));
  }

  /** Where a newly added mass would land in the matching particle histogram. */
  previewBinTarget(particle: ParticleType, mass: number): HistogramBinTarget | null {
    return this.histogramFor(particle)?.previewBinTarget(mass) ?? null;
  }

  scrollHistogramIntoView(particle: ParticleType): void {
    this.histogramFor(particle)?.scrollPlotIntoView();
  }

  /** Highlight the bar after the flying particle has landed and data is committed. */
  pulseBin(particle: ParticleType, binIndex: number): void {
    this.histogramFor(particle)?.pulseBin(binIndex);
  }

  private histogramFor(particle: ParticleType): HistogramComponent | undefined {
    switch (particle) {
      case ParticleType.KAON:
        return this.kaonHistogram;
      case ParticleType.LAMBDA:
        return this.lambdaHistogram;
      case ParticleType.ANTI_LAMBDA:
        return this.antiLambdaHistogram;
      case ParticleType.XI:
        return this.xiHistogram;
      default:
        return undefined;
    }
  }

}
