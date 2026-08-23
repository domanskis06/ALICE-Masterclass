import { of } from 'rxjs';

import { ALICE_EDGES, binningOf } from '../shared/utils/raa-ops';
import {
  RaaEventsAsset,
  RaaPpAsset,
  RaaStep,
  RaaTracksFineAsset,
} from '../shared/models/raa/spectrum';
import { RaaAnalysisService } from './raa-analysis.service';

/**
 * A sample built so that the correct chain has to return exactly one.
 *
 * The fine tally is flat at `FINE_COUNT` tracks per 0.01 GeV/c bin, so a bin of
 * width w holds 100·w·FINE_COUNT tracks. Dividing by w, by N_evt and by the
 * number of collisions leaves 100·FINE_COUNT / (N_evt·N_coll) in every bin, and
 * the pp reference is set to that value — R_AA = 1 across the whole spectrum.
 */
const FINE_COUNT = 1000;
const N_EVENTS = 100;
const N_COLL = 10;
const PP_VALUE = (100 * FINE_COUNT) / (N_EVENTS * N_COLL);
const N_FINE = Math.round((15 - 0.15) / 0.01);

function syntheticTracks(): RaaTracksFineAsset {
  const counts = new Array(N_FINE).fill(FINE_COUNT);
  return {
    ptMin: 0.15,
    ptStep: 0.01,
    nFine: N_FINE,
    aliceBins: [...ALICE_EDGES],
    classes: {
      '0-5': { counts: [...counts], nEvents: N_EVENTS, nColl: N_COLL, overflow: 0 },
      '70-80': {
        counts: counts.map((c) => c / 2),
        nEvents: N_EVENTS,
        nColl: 1,
        overflow: 0,
      },
      '30-40': { counts: [...counts], nEvents: N_EVENTS, nColl: N_COLL, overflow: 0 },
      '10-20': { counts: [...counts], nEvents: N_EVENTS, nColl: N_COLL, overflow: 0 },
      '50-60': { counts: [...counts], nEvents: N_EVENTS, nColl: N_COLL, overflow: 0 },
    },
  };
}

function syntheticEvents(): RaaEventsAsset {
  const mult: number[] = [];
  const cent: number[] = [];
  // One centrality inside each class the five-class preset loops over, so a
  // for-each run does not trip NO_EVENTS on classes the fixture forgot.
  const classes: [number, number][] = [
    [2, 100],
    [15, 80],
    [35, 60],
    [55, 40],
    [75, 20],
  ];
  for (const [centrality, multiplicity] of classes) {
    for (let i = 0; i < N_EVENTS; i++) {
      mult.push(multiplicity);
      cent.push(centrality);
    }
  }
  return { mult, cent };
}

function syntheticPp(): RaaPpAsset {
  return {
    bins: [...ALICE_EDGES],
    values: ALICE_EDGES.slice(1).map(() => PP_VALUE),
  };
}

const FULL_CHAIN: RaaStep[] = [
  { kind: 'load_events' },
  { kind: 'if_centrality', centrality: '0-5' },
  { kind: 'count_events' },
  { kind: 'load_tracks' },
  { kind: 'select_centrality', centrality: '0-5' },
  { kind: 'create_hist', binning: 'fixed' },
  { kind: 'fill_hist' },
  { kind: 'lookup_ncoll', nCollCentrality: '0-5', centrality: '0-5' },
  { kind: 'divide_bin_width' },
  { kind: 'divide_events' },
  { kind: 'divide_ncoll' },
  { kind: 'load_pp' },
  { kind: 'divide_reference', reference: 'pp' },
  { kind: 'draw_line_at_one' },
  { kind: 'plot', plotAs: 'raa' },
];

describe('RaaAnalysisService', () => {
  let service: RaaAnalysisService;

  beforeEach(() => {
    const data = {
      getTracksFine: () => of(syntheticTracks()),
      getEvents: () => of(syntheticEvents()),
      getPpReference: () => of(syntheticPp()),
    };
    service = new RaaAnalysisService(data as never);
  });

  function run(recipe: RaaStep[]) {
    let result!: ReturnType<RaaAnalysisService['run']> extends import('rxjs').Observable<infer R>
      ? R
      : never;
    service.run(recipe).subscribe((value) => (result = value));
    return result;
  }

  function keys(result: { problems: { key: string }[] }): string[] {
    return result.problems.map((problem) => problem.key);
  }

  it('an empty recipe says so', () => {
    const result = run([]);
    expect(keys(result)).toEqual(['EMPTY']);
    expect(result.raa).toEqual([]);
  });

  it('the complete chain returns R_AA = 1 in every bin of a sample built to give one', () => {
    const result = run(FULL_CHAIN);

    expect(keys(result).filter((k) => k !== 'EMPTY_BINS')).toEqual([]);
    expect(result.ok).toBeTrue();
    expect(result.raa.length).toBe(1);
    expect(result.raa[0].referenceLine).toBe(1);

    const points = result.raa[0].points;
    expect(points.length).toBe(binningOf('fixed').edges.length - 1);
    for (const point of points) {
      expect(point.y).toBeCloseTo(1, 10);
    }
  });

  it('without counting N_evt the division by events is refused', () => {
    const recipe = FULL_CHAIN.filter((step) => step.kind !== 'count_events');
    const result = run(recipe);
    expect(keys(result)).toContain('MISSING_NEVT_VAR');
  });

  it('without looking up the number of collisions the division is refused', () => {
    const recipe = FULL_CHAIN.filter((step) => step.kind !== 'lookup_ncoll');
    const result = run(recipe);
    expect(keys(result)).toContain('MISSING_NCOLL_VAR');
  });

  it('without the bin width the result is wrong and the reason is about bins', () => {
    const result = run(FULL_CHAIN.filter((step) => step.kind !== 'divide_bin_width'));
    expect(keys(result)).toContain('MISSING_BIN_WIDTH');
    expect(result.ok).toBeFalse();
    // Every bin is 0.2 GeV/c wide now, so skipping the division scales the
    // whole spectrum by that one factor instead of tilting it bin by bin.
    const points = result.raa[0].points;
    expect(points[0].y).toBeCloseTo(0.2, 10);
    expect(points[points.length - 1].y).toBeCloseTo(0.2, 10);
  });

  it('⟨N_coll⟩ of the wrong class is reported', () => {
    const recipe = FULL_CHAIN.map((step) =>
      step.kind === 'lookup_ncoll'
        ? { ...step, nCollCentrality: '70-80', centrality: '70-80' }
        : step,
    );
    const result = run(recipe);
    expect(keys(result)).toContain('NCOLL_MISMATCH');
  });

  it('a pT cut removes soft tracks before filling', () => {
    const recipe: RaaStep[] = [
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'count_events' },
      { kind: 'load_tracks' },
      { kind: 'select_centrality', centrality: '0-5' },
      { kind: 'cut_pt', ptCut: 1.0 },
      { kind: 'create_hist', binning: 'fixed' },
      { kind: 'fill_hist' },
      { kind: 'plot', plotAs: 'pt' },
    ];
    const result = run(recipe);
    const low = result.ptSpectra[0].points.find((p) => p.xHigh <= 1.0);
    expect(low).toBeUndefined();
    expect(result.ptSpectra[0].points.some((p) => p.xLow >= 1.0)).toBeTrue();
  });

  it('for-each produces one R_AA series per class in the preset', () => {
    const adaptiveBody: RaaStep[] = [
      { kind: 'create_hist', binning: 'fixed' },
      { kind: 'fill_hist' },
      { kind: 'lookup_ncoll' },
      { kind: 'divide_bin_width' },
      { kind: 'divide_events' },
      { kind: 'divide_ncoll' },
      { kind: 'load_pp' },
      { kind: 'divide_reference', reference: 'pp' },
      { kind: 'plot', plotAs: 'raa' },
    ];
    const result = run([
      { kind: 'load_events' },
      { kind: 'load_tracks' },
      {
        kind: 'for_each_centrality',
        centralityPreset: 'three',
        body: adaptiveBody,
      },
    ]);
    expect(result.raa.length).toBe(3);
  });

  it('R_CP divides two normalised yields', () => {
    const result = run([
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'count_events' },
      { kind: 'load_tracks' },
      { kind: 'select_centrality', centrality: '0-5' },
      { kind: 'create_hist', binning: 'fixed' },
      { kind: 'fill_hist' },
      { kind: 'lookup_ncoll', nCollCentrality: '0-5', centrality: '0-5' },
      { kind: 'divide_bin_width' },
      { kind: 'divide_events' },
      { kind: 'divide_ncoll' },
      { kind: 'load_peripheral' },
      { kind: 'divide_reference', reference: 'peripheral' },
      { kind: 'plot', plotAs: 'rcp' },
    ]);
    expect(keys(result).filter((k) => k !== 'EMPTY_BINS')).toEqual([]);
    expect(result.rcp[0].points[0].y).toBeCloseTo(0.2, 10);
  });

  it('the multiplicity histogram measures the event count', () => {
    const result = run([
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'count_events' },
      { kind: 'fill_multiplicity' },
    ]);
    expect(result.nEvents).toBe(N_EVENTS);
    expect(result.multiplicity?.counts.reduce((a, b) => a + b, 0)).toBe(N_EVENTS);
  });

  it('warns when multiplicity vs centrality is built after selecting one centrality class', () => {
    const result = run([
      { kind: 'load_events' },
      { kind: 'if_centrality', centrality: '0-5' },
      { kind: 'count_events' },
      { kind: 'fill_multiplicity' },
      { kind: 'plot_mult_vs_centrality' },
    ]);
    expect(keys(result)).toContain('MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS');
    // The plot itself still covers every event — only the highlighted point differs.
    expect(result.multVsCentrality?.highlight?.centrality).toBe('0-5');
  });

  it('does not warn when multiplicity vs centrality is built with no centrality filter', () => {
    const result = run([
      { kind: 'load_events' },
      { kind: 'plot_mult_vs_centrality' },
    ]);
    expect(keys(result)).not.toContain('MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS');
  });

  it('tracks that are never filled produce no spectrum', () => {
    expect(
      keys(
        run([
          { kind: 'load_tracks' },
          { kind: 'select_centrality', centrality: '0-5' },
        ]),
      ),
    ).not.toContain('TRACKS_NOT_HISTOGRAMMED');
    // Without create/fill, plotting fails instead:
    expect(
      keys(
        run([
          { kind: 'load_tracks' },
          { kind: 'select_centrality', centrality: '0-5' },
          { kind: 'plot', plotAs: 'pt' },
        ]),
      ),
    ).toContain('PLOT_WITHOUT_SPECTRUM');
  });

  it('the auto-built solution runs clean and produces all five classes', () => {
    // Mirrors what "Build it for me" places: the whole-sample stack first, then
    // the measurement looped over the five-class preset.
    const result = run([
      { kind: 'load_events' },
      { kind: 'plot_mult_vs_centrality' },
      { kind: 'load_events' },
      { kind: 'load_tracks' },
      {
        kind: 'for_each_centrality',
        centralityPreset: 'five',
        body: [
          { kind: 'if_centrality', centrality: '@current' },
          { kind: 'count_events' },
          { kind: 'fill_multiplicity' },
          { kind: 'select_centrality', centrality: '@current' },
          { kind: 'create_hist', binning: 'fixed' },
          { kind: 'fill_hist' },
          { kind: 'lookup_ncoll', nCollCentrality: '@current' },
          { kind: 'divide_bin_width' },
          { kind: 'divide_events' },
          { kind: 'divide_ncoll' },
          { kind: 'load_pp' },
          { kind: 'divide_reference', reference: 'pp' },
          { kind: 'draw_line_at_one' },
          { kind: 'plot', plotAs: 'raa' },
        ],
      },
    ]);

    // The multiplicity-vs-centrality plot must not trip its own warning: it
    // sits in its own stack, above any centrality filter.
    expect(keys(result)).not.toContain('MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS');
    expect(result.multVsCentrality).toBeTruthy();
    expect(result.raa.length).toBe(5);
    expect(result.ok).toBeTrue();
  });
});