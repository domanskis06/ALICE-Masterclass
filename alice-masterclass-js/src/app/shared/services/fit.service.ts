import { Injectable } from '@angular/core';
import * as d3 from 'd3';
import * as optimjs from 'optimization-js';
import * as fmin from '@nwaltham/fmin';

import { LSAData } from '../models';

export interface FitResult {
  total: number,
  signal: number,
  signalError: number,
  background: number,
  p1Gauss: [number, number, number],
  p1Polynomial: [number, number, number]
}

@Injectable()
export class FitService {
  // Doesn't seem to even work, but I left it as an option
  private readonly USE_OPTIMJS: boolean = false;

  private readonly ERRORS_MAX_ITERATIONS: number = 20;

  backgroundFitRange: [number, number] = [0, 1];
  signalFitRange: [number, number] = [0, 1];

  aGaussHint: [number, number, number] = [0, 0, 0];
  aPolyHint: [number, number, number] = [0, 0, 0];

  signalFunction: (arg0: number) => number = (x: number) => 0;
  backgroundFunction: (arg0: number) => number = (x: number) => 0;

  result: FitResult = null;

  /**
   * Keep a fit interval after zoom: clip to the visible axis, or shift it into
   * view (preserving width when possible) when it lies entirely outside.
   */
  static clampRangeToView(range: [number, number], view: [number, number]): [number, number] {
    const [v0, v1] = view;
    if (!(v1 > v0)) {
      return range;
    }

    let [a, b] = range;
    if (!(b > a)) {
      const mid = 0.5 * (v0 + v1);
      const half = Math.max((v1 - v0) * 0.01, Number.EPSILON);
      return [Math.max(v0, mid - half), Math.min(v1, mid + half)];
    }

    const width = b - a;
    if (b < v0) {
      return [v0, Math.min(v1, v0 + width)];
    }
    if (a > v1) {
      return [Math.max(v0, v1 - width), v1];
    }
    return [Math.max(a, v0), Math.min(b, v1)];
  }

  /** Drop the current fit curves/result without touching histogram data or accepted results. */
  clearFit(): void {
    this.result = null;
    this.signalFunction = (x: number) => 0;
    this.backgroundFunction = (x: number) => 0;
  }

  get data(): LSAData { return this._data; }
  set data(data: LSAData) {
    this._data = data;

    this.result = null;

    this.binGenerator.domain([this.data.xmin, this.data.xmax]).thresholds(this.data.bins);

    this.bins = this.binGenerator(this.data.data);

    this.signalFunction = (x: number) => 0;
    this.backgroundFunction = (x: number) => 0;
  }
  private _data: LSAData = {xmin: 0, xmax: 1, bins: 400, data: []};

  private binGenerator: d3.HistogramGeneratorNumber<number, number> = d3.bin<number, number>();
  private bins: d3.Bin<number, number>[] = [];

  constructor() { }

  private modelPolynomial(a: Array<number>, x: Array<number>): Array<number> {
    const results = [];

    for(let i = 0; i < x.length; i++) {
      for(let j = 0; j < a.length; j++) {
        if(j === 0) {
          results.push(a[j]);
        } else {
          results[i] += a[j] * Math.pow(x[i], j);
        }
      }
    }

    return results;
  }

  private modelGauss(a: [number, number, number], x: Array<number>): Array<number> {
    const results = [];

    const alpha = a[0];
    const mu = a[1];
    const sigma = a[2];

    const norm = alpha / (Math.sqrt(2 * Math.PI) * sigma);

    for(let i = 0; i < x.length; i++) {
      const diff = (x[i] - mu) / sigma;

      results.push(norm * Math.exp(-0.5 * diff * diff));
    }

    return results;
  }

  private modelGaussPolynomial(aGauss: [number, number, number], aPoly: Array<number>, x: Array<number>): Array<number> {
    const rGauss = this.modelGauss(aGauss, x);
    const rPoly = this.modelPolynomial(aPoly, x);

    const results = [];

    for (let i = 0; i < rGauss.length; i++) {
      results.push(rGauss[i] + rPoly[i]);
    }

    return results;
  }

  private binIndexesFromRange(range: [number, number]): [number, number] {
    const bisectorLow = d3.bisector((d: d3.Bin<number, number>) => d.x0);
    const bisectorHigh = d3.bisector((d: d3.Bin<number, number>) => d.x1);

    const minIndex = bisectorLow.left(this.bins, range[0]);
    const maxIndex = bisectorHigh.right(this.bins, range[1]);

    return [minIndex, maxIndex];
  }

  private binCenter(bin: d3.Bin<number, number>) {
    return (bin.x1 - bin.x0) / 2 + bin.x0;
  }

  private findMinimum(lossFunction: any, args: any) {
    if (this.USE_OPTIMJS) {
      return optimjs.minimize_Powell(lossFunction, args).argument;
    } else {
      return fmin.nelderMead(lossFunction, args).x;
    }
  }

  private findMinimumLossResult(lossFunction: any, args: any) {
    if (this.USE_OPTIMJS) {
      return optimjs.minimize_Powell(lossFunction, args).fncvalue;
    } else {
      return fmin.nelderMead(lossFunction, args).fx;
    }
  }

  fit() {
    const backgroundBinIndexes = this.binIndexesFromRange(this.backgroundFitRange);
    const signalBinIndexes = this.binIndexesFromRange(this.signalFitRange);

    const backgroundBinCount = backgroundBinIndexes[1] - backgroundBinIndexes[0];

    const chiSqLossBg = (a: [number, number, number]) => {
      let result = 0;

      for (let i = 0; i < backgroundBinCount; i++) {
        const index = backgroundBinIndexes[0] + i;

        // Skip bins inside signal range
        if (index >= signalBinIndexes[0] && index < signalBinIndexes[1]) {
          continue;
        }

        const observed = this.bins[index].length;
        const expected = this.modelPolynomial(a, [this.binCenter(this.bins[index])])[0];
        const diff = observed - expected;

        result += (diff * diff) / Math.max(1, observed);
      }

      return result;
    };

    const p1Polynomial: [number, number, number] = this.findMinimum(chiSqLossBg, [...this.aPolyHint]);

    const modelGaussPolyFixed = (aGauss: [number, number, number], x: Array<number>) => {
      return this.modelGaussPolynomial(aGauss, p1Polynomial, x);
    };

    const chiSqLossSg = (a: [number, number, number]) => {
      let result = 0;

      const mu = a[1];
      const sigma = a[2];
      
      if (Math.abs(sigma) > (this.backgroundFitRange[1] - this.backgroundFitRange[0]) || mu > this.backgroundFitRange[1] || mu < this.backgroundFitRange[0]) {
        return 1e10 * (backgroundBinIndexes[1] - backgroundBinIndexes[0]);
      }

      for (let i = 0; i < backgroundBinCount; i++) {
        const index = backgroundBinIndexes[0] + i;

        const observed = this.bins[index].length;
        const expected = modelGaussPolyFixed(a, [this.binCenter(this.bins[index])])[0];
        const diff = observed - expected;

        result += (diff * diff) / Math.max(1, observed);
      }
      
      return result;
    };

    const p1Gauss: [number, number, number] = this.findMinimum(chiSqLossSg, [...this.aGaussHint]);

    this.signalFunction = (x: number) => this.modelGaussPolynomial(p1Gauss, p1Polynomial, [x])[0];
    this.backgroundFunction = (x: number) => this.modelPolynomial(p1Polynomial, [x])[0];

    let countTotal = 0, countSignal = 0, countBackground = 0;

    for(let i = signalBinIndexes[0]; i < signalBinIndexes[1]; i++) {
      countTotal += this.bins[i].length;
      countBackground += Math.floor(this.modelPolynomial(p1Polynomial, [this.binCenter(this.bins[i])])[0]);
    }

    countSignal = countTotal - countBackground;

    this.result = {
      total: countTotal,
      signal: countSignal,
      signalError: 0,
      background: countBackground,
      p1Gauss: p1Gauss,
      p1Polynomial: p1Polynomial
    };

    this.calculateErrors(p1Gauss, p1Polynomial);
  }

  private calculateErrors(aGauss: [number, number, number], aPoly: [number, number, number]) {
    const backgroundBinIndexes = this.binIndexesFromRange(this.backgroundFitRange);

    const backgroundBinCount = backgroundBinIndexes[1] - backgroundBinIndexes[0];

    this.result.signalError = Math.round(Math.sqrt(this.result.signal));

    const invBinWidth = 1 / (this.bins[0].x1 - this.bins[0].x0);

    const alpha = aGauss[0];
    const mu = aGauss[1];
    const sigma = aGauss[2];

    let alphaTest = alpha;
    let alphaMin = alpha;
    let alphaMax = alpha;

    const modelGaussAlphaPolyFixed = (aGaussNoAlpha: [number, number], x: Array<number>) => {
      return this.modelGaussPolynomial([alphaTest, ...aGaussNoAlpha], aPoly, x);
    };

    const chiSqLoss = (a: [number, number]) => {
      let result = 0;

      for (let i = 0; i < backgroundBinCount; i++) {
        const index = backgroundBinIndexes[0] + i;

        const observed = this.bins[index].length;
        const expected = modelGaussAlphaPolyFixed(a, [this.binCenter(this.bins[index])])[0];
        const diff = observed - expected;

        result += (diff * diff) / Math.max(1, observed);
      }
      
      return result;
    };

    const p0GaussNoAlpha: [number, number] = [mu, sigma];

    const chiSqMin = chiSqLoss(p0GaussNoAlpha);

    // First guess
    const alphaDiff = Math.sqrt(invBinWidth * alpha) / invBinWidth;
    alphaTest = alpha + alphaDiff;
    let chiSqTest = this.findMinimumLossResult(chiSqLoss, p0GaussNoAlpha);

    // Find upper bound on alpha
    for (let i = 0; i < this.ERRORS_MAX_ITERATIONS; i++) {
      if (chiSqTest >= chiSqMin + 1) {
        break;
      }

      alphaMin = alphaTest;
      alphaTest = alpha + 2 * (alphaTest - alpha);

      chiSqTest = this.findMinimumLossResult(chiSqLoss, p0GaussNoAlpha);
    }

    // Iterate
    for (let i = 0; i < this.ERRORS_MAX_ITERATIONS; i++) {
      if ((alphaMax - alphaMin) * invBinWidth <= 0.5) {
        break;
      }

      alphaTest = 0.5 * (alphaMax + alphaMin);
      chiSqTest = this.findMinimumLossResult(chiSqLoss, p0GaussNoAlpha);

      if (chiSqTest < chiSqMin + 1) {
        alphaMin = alphaTest;
      } else {
        alphaMax = alphaTest;
      }
    }

    const alphaUp = 0.5 * (alphaMax + alphaMin);

    // Downward direction

    // First guess
    alphaMin = alpha;
    alphaTest = 2 * alpha - alphaUp;
    chiSqTest = this.findMinimumLossResult(chiSqLoss, p0GaussNoAlpha);

    // Find upper bound on alpha
    for (let i = 0; i < this.ERRORS_MAX_ITERATIONS; i++) {
      if (chiSqTest >= chiSqMin + 1) {
        break;
      }

      alphaMin = alphaTest;
      alphaTest = alpha + 2 * (alphaTest - alpha);

      chiSqTest = this.findMinimumLossResult(chiSqLoss, p0GaussNoAlpha);
    }

    // Iterate
    for (let i = 0; i < this.ERRORS_MAX_ITERATIONS; i++) {
      if ((alphaMax - alphaMin) * invBinWidth <= 0.5) {
        break;
      }

      alphaTest = 0.5 * (alphaMax + alphaMin);
      chiSqTest = this.findMinimumLossResult(chiSqLoss, p0GaussNoAlpha);

      if (chiSqTest < chiSqMin + 1) {
        alphaMin = alphaTest;
      } else {
        alphaMax = alphaTest;
      }
    }

    const alphaLow = 0.5 * (alphaMax + alphaMin);
    this.result.signalError = Math.round(0.5 * (alphaUp - alphaLow) * invBinWidth);
  }
}
