import {
  RAA_UNIT_COUNTS,
  RaaBinning,
  RaaBinningId,
  RaaEventSample,
  RaaEventsAsset,
  RaaHeatmap,
  RaaHeatmapCell,
  RaaOp,
  RaaPpAsset,
  RaaSpectrum,
  RaaTrackSample,
  RaaTracksFineAsset,
  RaaUnit,
} from '../models/raa/spectrum';

/** Fractional uncertainty assumed on the pp reference, as in the Münster notebook. */
export const PP_REL_ERR = 0.1;

/** The published ALICE p_T binning; the pp reference exists only on this grid. */
export const ALICE_EDGES: readonly number[] = [
  0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8,
  0.85, 0.9, 0.95, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2,
  2.4, 2.6, 2.8, 3.0, 3.2, 3.4, 3.6, 3.8, 4.0, 4.5, 5.0, 5.5, 6.0, 6.5, 7.0,
  8.0, 9.0, 10.0, 11.0, 12.0, 13.0, 14.0, 15.0,
];

const PT_MIN = 0.15;
const PT_MAX = 15.0;

/**
 * Equal-width edges starting at the first bin with data. The last bin is clipped
 * at 15 GeV/c, so it can end up narrower — which is exactly the situation
 * `divide by bin width` exists for.
 */
function equalEdges(width: number): number[] {
  const edges = [PT_MIN];
  let edge = PT_MIN + width;
  while (edge < PT_MAX - 1e-9) {
    edges.push(round2(edge));
    edge += width;
  }
  edges.push(PT_MAX);
  return edges;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function binning(id: RaaBinningId, edges: number[]): RaaBinning {
  return { id, edges, uniform: isUniform(edges) };
}

const BINNINGS: Record<RaaBinningId, RaaBinning> = {
  alice: binning('alice', [...ALICE_EDGES]),
  'equal-0.5': binning('equal-0.5', equalEdges(0.5)),
  'equal-1': binning('equal-1', equalEdges(1)),
  coarse: binning('coarse', [0.15, 1, 2, 4, 6, 10, 15]),
};

export function binningOf(id: RaaBinningId): RaaBinning {
  return BINNINGS[id] ?? BINNINGS.alice;
}

export function allBinnings(): RaaBinning[] {
  return Object.values(BINNINGS);
}

/** Bin widths of a spectrum, in GeV/c. */
export function widthsOf(edges: readonly number[]): number[] {
  const widths: number[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    widths.push(edges[i + 1] - edges[i]);
  }
  return widths;
}

export function centersOf(edges: readonly number[]): number[] {
  const centers: number[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    centers.push((edges[i] + edges[i + 1]) / 2);
  }
  return centers;
}

/** True when all bins are the same width to within a hundredth of a GeV/c. */
export function isUniform(edges: readonly number[]): boolean {
  const widths = widthsOf(edges);
  return widths.every((w) => Math.abs(w - widths[0]) < 1e-6);
}

/* —— reading the assets —— */

export function trackSampleOf(
  asset: RaaTracksFineAsset,
  centrality: string,
): RaaTrackSample | null {
  const entry = asset.classes[centrality];
  if (!entry) {
    return null;
  }
  return {
    centrality,
    ptMin: asset.ptMin,
    ptStep: asset.ptStep,
    counts: entry.counts,
    nEvents: entry.nEvents,
    nColl: entry.nColl,
    overflow: entry.overflow,
  };
}

/** Lower / upper edge of a centrality class key such as `10-20`. */
export function centralityRange(key: string): { from: number; to: number } {
  const [from, to] = key.split('-').map((part) => Number(part));
  return { from, to };
}

export function eventSampleOf(
  asset: RaaEventsAsset,
  centrality: string,
): RaaEventSample {
  const { from, to } = centralityRange(centrality);
  const multiplicities: number[] = [];
  for (let i = 0; i < asset.cent.length; i++) {
    const c = asset.cent[i];
    if (c >= from && c < to) {
      multiplicities.push(asset.mult[i]);
    }
  }
  return { centrality, multiplicities, nEvents: multiplicities.length };
}

/* —— the chain —— */

/**
 * Fill a p_T histogram from the fine tally. Real summing, not a lookup: the fine
 * grid is 0.01 GeV/c wide and every supported binning has edges on that grid.
 *
 * `ptCut` drops fine bins whose upper edge is at or below the cut, so a cut of
 * 1 GeV/c removes everything below 1 GeV/c before the ALICE (or other) bins
 * are filled.
 */
export function histogramPt(
  sample: RaaTrackSample,
  binningId: RaaBinningId,
  ptCut = 0.15,
): RaaSpectrum {
  const binning = binningOf(binningId);
  const edges = binning.edges;
  const counts: number[] = [];
  const cutIndex = fineIndex(ptCut, sample);

  for (let i = 0; i < edges.length - 1; i++) {
    const from = Math.max(fineIndex(edges[i], sample), cutIndex);
    const to = fineIndex(edges[i + 1], sample);
    let total = 0;
    for (let k = from; k < to; k++) {
      total += sample.counts[k] ?? 0;
    }
    counts.push(total);
  }

  return {
    edges: [...edges],
    values: [...counts],
    relErr: counts.map((n) => (n > 0 ? 1 / Math.sqrt(n) : 0)),
    counts: [...counts],
    empty: counts.map((n) => n === 0),
    centrality: sample.centrality,
    nEvents: sample.nEvents,
    nColl: sample.nColl,
    binning: binningId,
    unit: { ...RAA_UNIT_COUNTS },
    ops: ['histogram'],
  };
}

/** Deep-enough copy for the Clone spectrum block. */
export function cloneSpectrum(spectrum: RaaSpectrum): RaaSpectrum {
  return {
    ...spectrum,
    edges: [...spectrum.edges],
    values: [...spectrum.values],
    relErr: [...spectrum.relErr],
    counts: [...spectrum.counts],
    empty: [...spectrum.empty],
    unit: { ...spectrum.unit },
    ops: [...spectrum.ops],
  };
}

function fineIndex(edge: number, sample: RaaTrackSample): number {
  const index = Math.round((edge - sample.ptMin) / sample.ptStep);
  return Math.min(Math.max(index, 0), sample.counts.length);
}

function withOp(spectrum: RaaSpectrum, op: RaaOp, unit: Partial<RaaUnit>): RaaSpectrum {
  return {
    ...spectrum,
    unit: { ...spectrum.unit, ...unit },
    ops: [...spectrum.ops, op],
  };
}

/** Every division by a constant leaves the fractional uncertainty untouched. */
function scaled(spectrum: RaaSpectrum, factors: number[]): number[] {
  return spectrum.values.map((v, i) => v / factors[i]);
}

/** `ptHist->Scale(1, "WIDTH")` — the step this exercise is really about. */
export function divideByBinWidth(spectrum: RaaSpectrum): RaaSpectrum {
  const widths = widthsOf(spectrum.edges);
  return {
    ...withOp(spectrum, 'divide_bin_width', { perGeV: true }),
    values: scaled(spectrum, widths),
  };
}

export function divideByEvents(spectrum: RaaSpectrum, nEvents: number): RaaSpectrum {
  const divisor = Math.max(nEvents, 1);
  return {
    ...withOp(spectrum, 'divide_events', { perEvent: true }),
    values: spectrum.values.map((v) => v / divisor),
    nEvents,
  };
}

export function divideByNColl(spectrum: RaaSpectrum, nColl: number): RaaSpectrum {
  const divisor = nColl > 0 ? nColl : 1;
  return {
    ...withOp(spectrum, 'divide_ncoll', { perNColl: true }),
    values: spectrum.values.map((v) => v / divisor),
  };
}

/**
 * Divide two spectra bin by bin. Fractional uncertainties add in quadrature —
 * algebraically the same as `fehlerberechnung` in `ALICE_RAA_Tools.py`, but
 * without assuming what the two spectra are.
 */
export function divideBySpectrum(
  spectrum: RaaSpectrum,
  denominator: { values: number[]; relErr: number[]; empty?: boolean[] },
  op: RaaOp,
): RaaSpectrum {
  const values: number[] = [];
  const relErr: number[] = [];
  const empty: boolean[] = [];

  for (let i = 0; i < spectrum.values.length; i++) {
    const den = denominator.values[i];
    const denEmpty = denominator.empty?.[i] ?? !(den > 0);
    if (spectrum.empty[i] || denEmpty || !(den > 0)) {
      values.push(0);
      relErr.push(0);
      empty.push(true);
      continue;
    }
    values.push(spectrum.values[i] / den);
    relErr.push(Math.hypot(spectrum.relErr[i], denominator.relErr[i] ?? 0));
    empty.push(false);
  }

  return {
    ...withOp(spectrum, op, { ratio: true }),
    values,
    relErr,
    empty,
  };
}

/** The pp reference as a spectrum: already dN/dp_T per event, so never rescaled. */
export function ppSpectrum(asset: RaaPpAsset): RaaSpectrum {
  return {
    edges: [...asset.bins],
    values: [...asset.values],
    relErr: asset.values.map(() => PP_REL_ERR),
    counts: asset.values.map(() => 0),
    empty: asset.values.map((v) => !(v > 0)),
    centrality: 'pp',
    nEvents: 1,
    nColl: 1,
    binning: 'alice',
    unit: { perGeV: true, perEvent: true, perNColl: false, ratio: false },
    ops: [],
  };
}

/* —— the event part —— */

/** `multHist` from the first loop of `Analyse.C`; its entry count is N_evt. */
export function multiplicityHistogram(
  sample: RaaEventSample,
  binCount = 40,
): { edges: number[]; counts: number[] } {
  // Range follows the class: 80-90% tops out near 50 tracks, 0-5% near 2000,
  // and a shared range would squash one of them into a single bin.
  const upper = niceUpperBound(maxOf(sample.multiplicities));
  const width = upper / binCount;
  const edges = Array.from({ length: binCount + 1 }, (_, i) => i * width);
  const counts = new Array<number>(binCount).fill(0);

  for (const mult of sample.multiplicities) {
    const index = Math.min(Math.floor(mult / width), binCount - 1);
    if (index >= 0) {
      counts[index] += 1;
    }
  }
  return { edges, counts };
}

/** Spread would risk the argument limit on a hundred thousand events. */
function maxOf(values: readonly number[]): number {
  let max = 0;
  for (const value of values) {
    if (value > max) {
      max = value;
    }
  }
  return max;
}

function niceUpperBound(max: number): number {
  if (max <= 0) {
    return 1;
  }
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)));
  return Math.ceil(max / magnitude) * magnitude;
}

/**
 * `multCentHist` from `Analyse.C` — the plot that shows where centrality classes
 * come from. Filled from every event, not only the selected class, with the
 * selected range marked so the student can place their own choice on the map.
 */
export function multiplicityVsCentrality(
  asset: RaaEventsAsset,
  options: { xBins?: number; yBins?: number; highlight?: string } = {},
): RaaHeatmap {
  const xBins = options.xBins ?? 60;
  const yBins = options.yBins ?? 50;
  const xUpper = niceUpperBound(maxOf(asset.mult));
  const xEdges = Array.from({ length: xBins + 1 }, (_, i) => (i * xUpper) / xBins);
  const yEdges = Array.from({ length: yBins + 1 }, (_, i) => (i * 100) / yBins);

  const grid = new Map<number, number>();
  let maxCount = 0;
  for (let i = 0; i < asset.mult.length; i++) {
    const ix = Math.min(Math.floor((asset.mult[i] / xUpper) * xBins), xBins - 1);
    const iy = Math.min(Math.floor((asset.cent[i] / 100) * yBins), yBins - 1);
    if (ix < 0 || iy < 0) {
      continue;
    }
    const key = iy * xBins + ix;
    const next = (grid.get(key) ?? 0) + 1;
    grid.set(key, next);
    maxCount = Math.max(maxCount, next);
  }

  const cells: RaaHeatmapCell[] = [];
  grid.forEach((count, key) => {
    cells.push({ ix: key % xBins, iy: Math.floor(key / xBins), count });
  });

  const highlight = options.highlight
    ? { ...centralityRange(options.highlight), centrality: options.highlight }
    : undefined;

  return { xEdges, yEdges, cells, maxCount, highlight };
}

/* —— reading the chain back —— */

export function unitLabel(unit: RaaUnit): string {
  if (unit.ratio) {
    return 'ratio';
  }
  const denominators: string[] = [];
  if (unit.perEvent) {
    denominators.push('event');
  }
  if (unit.perGeV) {
    denominators.push('GeV/c');
  }
  if (unit.perNColl) {
    // The symbol, not the words: this string is an axis caption, and the plot
    // renderer draws `N_coll` with a real subscript.
    denominators.push('N_coll');
  }
  return denominators.length ? `counts / ${denominators.join(' / ')}` : 'counts';
}

/** Bin index containing a p_T value, or -1 when it is outside the spectrum. */
export function binAt(edges: readonly number[], pt: number): number {
  for (let i = 0; i < edges.length - 1; i++) {
    if (pt >= edges[i] && pt < edges[i + 1]) {
      return i;
    }
  }
  return pt === edges[edges.length - 1] ? edges.length - 2 : -1;
}
