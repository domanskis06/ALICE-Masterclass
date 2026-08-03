import { Component, Input, OnInit } from '@angular/core';
import {
  antiLambdaHistogramColor,
  antiXiHistogramColor,
  kaonHistogramColor,
  lambdaHistogramColor,
  xiHistogramColor,
} from '../../shared/globals';

/** PDG rest masses (GeV/c²) — same values as student VA. */
export const KAON_MASS_GEV = 0.4976;
export const LAMBDA_MASS_GEV = 1.1157;
export const XI_MASS_GEV = 1.3217;

/**
 * Default half-widths (GeV/c²) for VA histogram X windows.
 * Span = 0.3 so the default 30 bins have width 0.01 and edges at *.xx0.
 */
export const KAON_MASS_HALF_WIDTH = 0.15;
export const LAMBDA_MASS_HALF_WIDTH = 0.15;
export const XI_MASS_HALF_WIDTH = 0.15;

/**
 * Visible X domain centered on a nominal particle mass.
 * Edges are snapped to 2 decimals (*.xx0) so 30 equal bins land on 0.01 steps.
 */
export function massCenteredXDomain(center: number, halfWidth: number): [number, number] {
  const round2 = (value: number) => Math.round(value * 100) / 100;
  return [round2(center - halfWidth), round2(center + halfWidth)];
}

@Component({
    selector: 'app-mass-histograms',
    templateUrl: './mass-histograms.component.html',
    styleUrls: ['./mass-histograms.component.scss'],
    standalone: false
})
export class MassHistogramsComponent implements OnInit {

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
  readonly binMax = 50;
  readonly defaultBins = 30;

  bins = this.defaultBins;

  get binFillPercent(): string {
    const span = this.binMax - this.binMin;
    if (span <= 0) {
      return '0%';
    }
    const ratio = (this.bins - this.binMin) / span;
    return `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  @Input()
  kaonMasses: number[] = [];

  @Input()
  lambdaMasses: number[] = [];

  @Input()
  antiLambdaMasses: number[] = [];

  @Input()
  xiMasses: number[] = [];

  @Input()
  antiXiMasses: number[] = [];

  constructor() { }

  ngOnInit(): void {
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

}
