import { Component, OnInit, Input, Output, EventEmitter, ViewChild, inject } from '@angular/core';
import { ApiService, ExerciseKind } from '../../shared/services/api.service';
import { DemoConfig } from '../../shared/demo/demo-config.service';
import { ParticleType, VisualAnalysisResultsEntry } from '../../shared/services/api.service';
import { HistogramBinTarget, HistogramComponent } from '../../shared/components/histogram/histogram.component';
import {
  antiLambdaHistogramColor,
  antiXiHistogramColor,
  kaonHistogramColor,
  lambdaHistogramColor,
  xiHistogramColor,
} from '../../shared/globals';

/** PDG rest masses (GeV/c²) — same values as the VA particle-mass table. */
export const KAON_MASS_GEV = 0.4976;
export const LAMBDA_MASS_GEV = 1.1157;
export const XI_MASS_GEV = 1.3217;

/**
 * Default half-widths (GeV/c²) for VA histogram X windows.
 * Keep spans close to the previous hard-coded domains so bin width stays readable.
 */
export const KAON_MASS_HALF_WIDTH = 0.1;
export const LAMBDA_MASS_HALF_WIDTH = 0.2;
export const XI_MASS_HALF_WIDTH = 0.2;

/** Visible X domain centered on a nominal particle mass: `[center − halfWidth, center + halfWidth]`. */
export function massCenteredXDomain(center: number, halfWidth: number): [number, number] {
  return [center - halfWidth, center + halfWidth];
}

@Component({
    selector: 'app-mass-histograms',
    templateUrl: './mass-histograms.component.html',
    styleUrls: ['./mass-histograms.component.scss'],
    standalone: false
})
export class MassHistogramsComponent implements OnInit {
  readonly ParticleType = ParticleType;

  /** Demo build has no session to upload to — results are kept in the browser. */
  protected readonly demo = inject(DemoConfig).enabled;

  readonly kaonBarColor = kaonHistogramColor;
  readonly lambdaBarColor = lambdaHistogramColor;
  readonly antiLambdaBarColor = antiLambdaHistogramColor;
  readonly xiBarColor = xiHistogramColor;
  readonly antiXiBarColor = antiXiHistogramColor;

  /** Default X windows centered on each particle’s nominal mass. */
  readonly kaonXDomain = massCenteredXDomain(KAON_MASS_GEV, KAON_MASS_HALF_WIDTH);
  readonly lambdaXDomain = massCenteredXDomain(LAMBDA_MASS_GEV, LAMBDA_MASS_HALF_WIDTH);
  readonly antiLambdaXDomain = massCenteredXDomain(LAMBDA_MASS_GEV, LAMBDA_MASS_HALF_WIDTH);
  readonly xiXDomain = massCenteredXDomain(XI_MASS_GEV, XI_MASS_HALF_WIDTH);
  readonly antiXiXDomain = massCenteredXDomain(XI_MASS_GEV, XI_MASS_HALF_WIDTH);

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
  antiXiMasses: Array<number> = [];

  @ViewChild('kaonHistogram') private kaonHistogram?: HistogramComponent;
  @ViewChild('lambdaHistogram') private lambdaHistogram?: HistogramComponent;
  @ViewChild('antiLambdaHistogram') private antiLambdaHistogram?: HistogramComponent;
  @ViewChild('xiHistogram') private xiHistogram?: HistogramComponent;
  @ViewChild('antiXiHistogram') private antiXiHistogram?: HistogramComponent;

  @Input()
  uploadDisabled: boolean = false;

  /** Translation key explaining why the currently selected dataset can't be submitted, when `uploadDisabled` is true. */
  @Input()
  uploadDisabledTooltipKey: string | null = null;

  /** True once the student is logged into a session whose event is not `strangeness` - VA
   * submissions to it would be rejected server-side anyway (`Event.kind` guard). */
  get wrongExerciseKind(): boolean {
    return !this.apiService.matchesSessionKind(ExerciseKind.STRANGENESS);
  }

  get uploadButtonDisabled(): boolean {
    return !this.apiService.isAuthenticated || this.uploadDisabled || this.wrongExerciseKind;
  }

  /** Translation key for the disabled-upload tooltip, or `null` when the button needs none. */
  get uploadTooltipKey(): string | null {
    if (!this.apiService.isAuthenticated) {
      return 'PASSWORD.NO_TOKEN_TOOLTIP';
    }
    if (this.wrongExerciseKind) {
      return 'PASSWORD.WRONG_EXERCISE_TOOLTIP';
    }
    if (this.uploadDisabled) {
      return this.uploadDisabledTooltipKey ?? 'PASSWORD.DEMO_DATASET_TOOLTIP';
    }
    return null;
  }

  @Input()
  get results(): Map<string, VisualAnalysisResultsEntry[]> { return this._results; }
  set results(results: Map<string, VisualAnalysisResultsEntry[]>) {
    this._results = results;

    const newKaonMasses: Array<number> = [];
    const newLambdaMasses: Array<number> = [];
    const newAntiLambdaMasses: Array<number> = [];
    const newXiMasses: Array<number> = [];
    const newAntiXiMasses: Array<number> = [];

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
          case ParticleType.ANTI_XI:
            newAntiXiMasses.push(value.mass);
            break;
        }
      }
    }

    this.kaonMasses = newKaonMasses;
    this.lambdaMasses = newLambdaMasses;
    this.antiLambdaMasses = newAntiLambdaMasses;
    this.xiMasses = newXiMasses;
    this.antiXiMasses = newAntiXiMasses;
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
      case ParticleType.ANTI_XI:
        return this.antiXiHistogram;
      default:
        return undefined;
    }
  }

}
