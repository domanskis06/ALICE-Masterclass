export interface LSAData {
  xmin: number;
  xmax: number;
  bins: number;
  data: Array<number>;
}

/** Signal/background ranges chosen on a fit-selector slider pair, in histogram x units. */
export interface FitHistogramEntry {
  signalFitRange: [number, number];
  backgroundFitRange: [number, number];
}
