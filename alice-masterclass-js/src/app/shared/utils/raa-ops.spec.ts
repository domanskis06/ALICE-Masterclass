import {
  ALICE_EDGES,
  allBinnings,
  binAt,
  binningOf,
  centersOf,
  divideByBinWidth,
  divideByEvents,
  divideByNColl,
  divideBySpectrum,
  eventSampleOf,
  histogramPt,
  multiplicityHistogram,
  multiplicityVsCentrality,
  ppSpectrum,
  trackSampleOf,
  unitLabel,
  widthsOf,
} from './raa-ops';
import {
  RaaEventsAsset,
  RaaTrackSample,
  RaaTracksFineAsset,
} from '../models/raa/spectrum';

/** Fine tally with one track per 0.01 GeV/c bin, so bin contents equal bin widths. */
function flatSample(overrides: Partial<RaaTrackSample> = {}): RaaTrackSample {
  const nFine = Math.round((15 - 0.15) / 0.01);
  return {
    centrality: '0-5',
    ptMin: 0.15,
    ptStep: 0.01,
    counts: new Array<number>(nFine).fill(1),
    nEvents: 100,
    nColl: 1500,
    overflow: 0,
    ...overrides,
  };
}

describe('raa-ops binnings', () => {
  it('the fixed binning spans 0.2 to 15 GeV/c', () => {
    for (const binning of allBinnings()) {
      expect(binning.edges[0]).toBeCloseTo(0.2, 6);
      expect(binning.edges[binning.edges.length - 1]).toBeCloseTo(15, 6);
    }
  });

  it('all edges sit on the 0.01 GeV/c fine grid, so histogramming loses nothing', () => {
    for (const binning of allBinnings()) {
      for (const edge of binning.edges) {
        expect(Math.abs(edge * 100 - Math.round(edge * 100))).toBeLessThan(1e-6);
      }
    }
  });

  it('is uniform: every bin is exactly 0.2 GeV/c wide', () => {
    const fixed = binningOf('fixed');
    expect(fixed.uniform).toBeTrue();
    expect(widthsOf(fixed.edges).every((w) => Math.abs(w - 0.2) < 1e-9)).toBeTrue();
  });

  it('bin centres lie inside their bins', () => {
    const centers = centersOf(ALICE_EDGES);
    centers.forEach((center, i) => {
      expect(center).toBeGreaterThan(ALICE_EDGES[i]);
      expect(center).toBeLessThan(ALICE_EDGES[i + 1]);
    });
  });

  it('binAt finds the bin of a reported momentum', () => {
    expect(binAt(ALICE_EDGES, 5.5)).toBe(ALICE_EDGES.indexOf(5.5));
    expect(binAt(ALICE_EDGES, 10)).toBe(ALICE_EDGES.indexOf(10));
    expect(binAt(ALICE_EDGES, 100)).toBe(-1);
  });
});

describe('raa-ops histogramming', () => {
  it('conserves every track at or above the first bin edge', () => {
    const sample = flatSample();
    // The fixed grid starts at 0.2 GeV/c, the fine tally at 0.15, so the five
    // fine bins below the first edge are outside every binning by design.
    const belowFirstEdge = 5;
    const total = sample.counts
      .slice(belowFirstEdge)
      .reduce((a, b) => a + b, 0);
    for (const binning of allBinnings()) {
      const spectrum = histogramPt(sample, binning.id);
      const filled = spectrum.counts.reduce((a, b) => a + b, 0);
      expect(filled).toBe(total);
    }
  });

  it('starts as raw counts with sqrt(N) uncertainties', () => {
    const spectrum = histogramPt(flatSample(), 'fixed');
    expect(spectrum.unit).toEqual({
      perGeV: false,
      perEvent: false,
      perNColl: false,
      ratio: false,
    });
    const index = 0;
    expect(spectrum.relErr[index]).toBeCloseTo(1 / Math.sqrt(spectrum.counts[index]), 12);
  });

  it('flags bins that never received a track instead of drawing a zero', () => {
    const counts = new Array<number>(1485).fill(1);
    // Empty everything above 10 GeV/c, where real data runs out of tracks.
    for (let i = Math.round((10 - 0.15) / 0.01); i < counts.length; i++) {
      counts[i] = 0;
    }
    const spectrum = histogramPt(flatSample({ counts }), 'fixed');
    const lastEmpty = spectrum.empty[spectrum.empty.length - 1];
    expect(lastEmpty).toBeTrue();
    expect(spectrum.empty[0]).toBeFalse();
  });

  it('a pT cut drops soft fine bins before the histogram is filled', () => {
    const spectrum = histogramPt(flatSample(), 'fixed', 1.0);
    const firstKept = spectrum.edges.findIndex((_, i) => i < spectrum.edges.length - 1 && spectrum.edges[i] >= 1.0);
    expect(spectrum.empty[0]).toBeTrue();
    expect(spectrum.values.some((v, i) => !spectrum.empty[i] && spectrum.edges[i] >= 1.0)).toBeTrue();
    expect(firstKept).toBeGreaterThan(0);
  });
});

describe('raa-ops normalisations', () => {
  it('divide by bin width removes the binning from the shape', () => {
    // One track per 0.01 GeV/c means a bin holds 100 tracks per GeV/c everywhere,
    // so after the division every bin must agree — however uneven the binning.
    const spectrum = divideByBinWidth(histogramPt(flatSample(), 'fixed'));
    for (const value of spectrum.values) {
      expect(value).toBeCloseTo(100, 6);
    }
    expect(spectrum.unit.perGeV).toBeTrue();
    expect(spectrum.ops).toContain('divide_bin_width');
  });

  it('divisions by a constant leave the fractional uncertainty untouched', () => {
    const base = histogramPt(flatSample(), 'fixed');
    const scaled = divideByNColl(divideByEvents(divideByBinWidth(base), 100), 1500);
    expect(scaled.relErr).toEqual(base.relErr);
    expect(scaled.counts).toEqual(base.counts);
  });

  it('the three constant divisions commute', () => {
    const base = histogramPt(flatSample(), 'fixed');
    const a = divideByNColl(divideByEvents(divideByBinWidth(base), 100), 1500);
    const b = divideByBinWidth(divideByNColl(divideByEvents(base, 100), 1500));
    a.values.forEach((value, i) => expect(value).toBeCloseTo(b.values[i], 12));
  });

  it('dividing two spectra adds the fractional uncertainties in quadrature', () => {
    const base = histogramPt(flatSample(), 'fixed');
    const ratio = divideBySpectrum(
      base,
      { values: base.values.map(() => 2), relErr: base.values.map(() => 0.1) },
      'divide_pp',
    );
    expect(ratio.unit.ratio).toBeTrue();
    expect(ratio.values[0]).toBeCloseTo(base.values[0] / 2, 12);
    expect(ratio.relErr[0]).toBeCloseTo(Math.hypot(base.relErr[0], 0.1), 12);
  });

  it('a bin with an empty denominator becomes empty rather than infinite', () => {
    const base = histogramPt(flatSample(), 'fixed');
    const denominator = {
      values: base.values.map((_, i) => (i === 3 ? 0 : 1)),
      relErr: base.values.map(() => 0.1),
    };
    const ratio = divideBySpectrum(base, denominator, 'divide_pp');
    expect(ratio.empty[3]).toBeTrue();
    expect(Number.isFinite(ratio.values[3])).toBeTrue();
  });

  it('the pp reference is already per event and per GeV/c', () => {
    const pp = ppSpectrum({ bins: [...ALICE_EDGES], values: ALICE_EDGES.slice(1).map(() => 1) });
    expect(pp.unit.perGeV).toBeTrue();
    expect(pp.unit.perEvent).toBeTrue();
    expect(pp.unit.perNColl).toBeFalse();
  });

  it('names the unit generically once any normalisation was applied', () => {
    const base = histogramPt(flatSample(), 'fixed');
    expect(unitLabel(base.unit)).toBe('counts');
    expect(unitLabel(divideByBinWidth(base).unit)).toBe('normalised yield');
    const full = divideByNColl(divideByEvents(divideByBinWidth(base), 100), 1500);
    expect(unitLabel(full.unit)).toBe('normalised yield');
    expect(
      unitLabel(divideBySpectrum(full, { values: [1], relErr: [0] }, 'divide_pp').unit),
    ).toBe('ratio');
  });
});

describe('raa-ops event part', () => {
  const events: RaaEventsAsset = {
    mult: [10, 20, 900, 1200, 40],
    cent: [75.0, 72.5, 2.0, 1.0, 65.0],
  };

  it('selects a centrality class on a half-open interval', () => {
    const sample = eventSampleOf(events, '70-80');
    expect(sample.nEvents).toBe(2);
    expect(sample.multiplicities).toEqual([10, 20]);
  });

  it('the multiplicity histogram holds one entry per event of the class', () => {
    const sample = eventSampleOf(events, '0-5');
    const hist = multiplicityHistogram(sample);
    expect(hist.counts.reduce((a, b) => a + b, 0)).toBe(sample.nEvents);
  });

  it('the 2D map holds every event of the sample', () => {
    const heatmap = multiplicityVsCentrality(events);
    const total = heatmap.cells.reduce((sum, cell) => sum + cell.count, 0);
    expect(total).toBe(events.mult.length);
    expect(heatmap.highlight).toBeUndefined();
  });

  it('marks the selected class on the map', () => {
    const heatmap = multiplicityVsCentrality(events, { highlight: '10-20' });
    expect(heatmap.highlight).toEqual({ from: 10, to: 20, centrality: '10-20' });
  });

  it('restricts the map to the selected class once one is chosen', () => {
    // 75.0 and 72.5 fall in 70–80%; the other three (2.0, 1.0, 65.0) do not.
    const heatmap = multiplicityVsCentrality(events, { highlight: '70-80' });
    const total = heatmap.cells.reduce((sum, cell) => sum + cell.count, 0);
    expect(total).toBe(2);
  });
});

describe('raa-ops asset reading', () => {
  const asset: RaaTracksFineAsset = {
    ptMin: 0.15,
    ptStep: 0.01,
    nFine: 3,
    aliceBins: [...ALICE_EDGES],
    classes: {
      '0-5': { counts: [1, 2, 3], nEvents: 7, nColl: 1500, overflow: 1 },
    },
  };

  it('reads a class', () => {
    const sample = trackSampleOf(asset, '0-5');
    expect(sample?.nEvents).toBe(7);
    expect(sample?.nColl).toBe(1500);
  });

  it('returns null for a class that is not in the sample', () => {
    expect(trackSampleOf(asset, '90-100')).toBeNull();
  });
});
