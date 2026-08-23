import { Injectable } from '@angular/core';
import { forkJoin, map, Observable } from 'rxjs';

import {
  RaaCentralityPreset,
  RaaEventsAsset,
  RaaEventSample,
  RaaHeatmap,
  RaaHistogram,
  RaaOp,
  RaaPlotTarget,
  RaaPoint,
  RaaPpAsset,
  RaaProblem,
  RaaReadout,
  RaaReported,
  RaaRunResult,
  RaaSeries,
  RaaSpectrum,
  RaaStep,
  RaaStepKind,
  RaaTrackSample,
  RaaTracksFineAsset,
  RaaBinningId,
} from '../shared/models/raa/spectrum';
import {
  binAt,
  centersOf,
  cloneSpectrum,
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
} from '../shared/utils/raa-ops';
import { centralityColor, centralityLabel } from '../shared/utils/raa-centrality';
import { RAA_CURRENT_CENTRALITY } from '../nuclear-modification-spectrum-analysis/blockly-workspace/raa-blockly';
import { RaaDataService } from './raa-data.service';

/** The class R_CP divides by, as in the Münster notebook's extra task. */
export const RAA_PERIPHERAL_KEY = '70-80';

export const RAA_PRESET_CLASSES: Record<RaaCentralityPreset, string[]> = {
  three: ['0-5', '30-40', '70-80'],
  five: ['0-5', '10-20', '30-40', '50-60', '70-80'],
};

/**
 * Klasa, na której ma pracować krok: albo wpięty literał, albo — dla bloku
 * „current class" — klasa bieżącego obrotu pętli. Poza pętlą nie ma czego
 * podstawić i zwracamy null, żeby wywołujący zgłosił to jako problem.
 */
function resolveCentrality(value: string | undefined, ctx: ExecCtx): string | null {
  if (value === RAA_CURRENT_CENTRALITY) {
    return ctx.loopCentrality;
  }
  return value ?? '0-5';
}

interface RaaAssets {
  tracks: RaaTracksFineAsset;
  events: RaaEventsAsset;
  pp: RaaPpAsset;
}

/** Mutable interpreter state while walking the student's recipe. */
interface ExecCtx {
  /** Class the enclosing `For each centrality` is on, or null outside a loop. */
  loopCentrality: string | null;
  eventsLoaded: boolean;
  eventCentrality: string | null;
  eventSample: RaaEventSample | null;
  nEvt: number | null;
  tracksLoaded: boolean;
  trackCentrality: string | null;
  trackSample: RaaTrackSample | null;
  ptCut: number;
  pendingBinning: RaaBinningId | null;
  spectrum: RaaSpectrum | null;
  savedSpectrum: RaaSpectrum | null;
  nColl: number | null;
  nCollSource: string | null;
  ppLoaded: boolean;
  /** Sample for the R_CP denominator; normalised only when it is divided by. */
  peripheralSample: RaaTrackSample | null;
  drawLineAtOne: boolean;
  histogram: RaaHistogram | null;
  heatmap: RaaHeatmap | null;
  /** Scalings already applied to `spectrum`, reused when building the peripheral. */
  appliedScalings: RaaStepKind[];
}

interface Accumulators {
  pt: RaaSeries[];
  raa: RaaSeries[];
  rcp: RaaSeries[];
  readouts: RaaReadout[];
  /** Kept apart from `readouts`: a single read must not replace a whole series. */
  reported: RaaReported[];
  problems: RaaProblem[];
  /** Multiplicity histograms filled this run, by centrality class. */
  multiplicities: Map<string, RaaHistogram>;
  /** Centralities plotted as a p_T spectrum this run, for the end-of-run refresh below. */
  plottedPt: Set<string>;
}

/**
 * Runs the student's recipe on the real sample.
 *
 * Nothing is pre-computed: the recipe is executed step by step over the
 * 0.01 GeV/c track tally, and whatever comes out is what gets plotted,
 * including a wrong answer. Validation talks about physics — units, whether
 * the number of collisions matches the selected class — not block names.
 */
@Injectable({
  providedIn: 'root',
})
export class RaaAnalysisService {
  constructor(private readonly data: RaaDataService) {}

  run(recipe: RaaStep[]): Observable<RaaRunResult> {
    return forkJoin({
      tracks: this.data.getTracksFine(),
      events: this.data.getEvents(),
      pp: this.data.getPpReference(),
    }).pipe(map((assets) => this.execute(recipe, assets)));
  }

  private execute(recipe: RaaStep[], assets: RaaAssets): RaaRunResult {
    const empty = emptyResult();
    if (!recipe.length) {
      return { ...empty, problems: [{ key: 'EMPTY', severity: 'error' }] };
    }

    const acc: Accumulators = {
      pt: [],
      raa: [],
      rcp: [],
      readouts: [],
      reported: [],
      problems: [],
      multiplicities: new Map<string, RaaHistogram>(),
      plottedPt: new Set<string>(),
    };
    const ctx = freshCtx();
    this.runSteps(recipe, assets, ctx, acc);

    // A `Plot as pT spectrum` block snapshots ctx.spectrum the instant the
    // chain reaches it — usually early, to show the raw histogram's binning
    // kinks before they're fixed. Later `Divide by ...` blocks placed after
    // it then never touch what that tab shows, so the tour's own "fix it,
    // then the steps disappear" never actually happened on screen. Refresh
    // that same tab with the spectrum's final state, as long as it is still
    // a plain (non-ratio) spectrum for the class that was plotted.
    if (
      ctx.trackCentrality &&
      ctx.spectrum &&
      !ctx.spectrum.unit.ratio &&
      acc.plottedPt.has(ctx.trackCentrality)
    ) {
      const refreshed = seriesOf(ctx.spectrum, 'pt', ctx.trackCentrality, null);
      const index = acc.pt.findIndex((series) => series.id === refreshed.id);
      if (index >= 0) {
        acc.pt[index] = refreshed;
      } else {
        acc.pt.push(refreshed);
      }
    }

    if (
      !acc.pt.length &&
      !acc.raa.length &&
      !acc.rcp.length &&
      !ctx.histogram &&
      !ctx.heatmap &&
      ctx.spectrum
    ) {
      acc.problems.push({ key: 'NOTHING_PLOTTED', severity: 'warning' });
    }

    const ok =
      !acc.problems.some((problem) => problem.severity === 'error') &&
      (acc.raa.length > 0 || acc.rcp.length > 0);

    return {
      ok,
      problems: acc.problems,
      ptSpectra: acc.pt,
      raa: acc.raa,
      rcp: acc.rcp,
      multiplicity: ctx.histogram,
      multiplicities: [...acc.multiplicities.values()],
      multVsCentrality: ctx.heatmap,
      readouts: acc.readouts,
      reported: acc.reported,
      ppReference: ctx.ppLoaded ? ppReferenceSeries(assets.pp) : null,
      nEvents: ctx.nEvt,
      centrality: ctx.trackCentrality ?? ctx.eventCentrality,
    };
  }

  private runSteps(
    recipe: RaaStep[],
    assets: RaaAssets,
    ctx: ExecCtx,
    acc: Accumulators,
  ): void {
    for (const step of recipe) {
      this.runStep(step, assets, ctx, acc);
    }
  }

  private runStep(
    step: RaaStep,
    assets: RaaAssets,
    ctx: ExecCtx,
    acc: Accumulators,
  ): void {
    switch (step.kind) {
      case 'load_events':
        ctx.eventsLoaded = true;
        break;

      case 'if_centrality': {
        if (!ctx.eventsLoaded) {
          acc.problems.push({ key: 'EVENTS_NOT_LOADED', severity: 'error' });
          break;
        }
        const centrality = resolveCentrality(step.centrality, ctx);
        if (centrality === null) {
          acc.problems.push({ key: 'CURRENT_CLASS_OUTSIDE_LOOP', severity: 'error' });
          break;
        }
        ctx.eventCentrality = centrality;
        ctx.eventSample = eventSampleOf(assets.events, centrality);
        if (!ctx.eventSample.nEvents) {
          acc.problems.push({
            key: 'NO_EVENTS',
            severity: 'error',
            params: { centrality },
          });
        }
        break;
      }

      case 'count_events': {
        if (!ctx.eventSample) {
          acc.problems.push({ key: 'COUNT_WITHOUT_EVENTS', severity: 'error' });
          break;
        }
        ctx.nEvt = ctx.eventSample.nEvents;
        break;
      }

      case 'fill_multiplicity': {
        if (!ctx.eventSample || !ctx.eventCentrality) {
          acc.problems.push({ key: 'MULT_WITHOUT_EVENTS', severity: 'error' });
          break;
        }
        const filled = multiplicityHistogram(ctx.eventSample);
        const histogram: RaaHistogram = {
          edges: filled.edges,
          counts: filled.counts,
          label: centralityLabel(ctx.eventCentrality),
          color: centralityColor(ctx.eventCentrality),
          centrality: ctx.eventCentrality,
          entries: ctx.eventSample.nEvents,
        };
        ctx.histogram = histogram;
        // A for-each run fills one of these per class; keep them all so the
        // student can switch between the classes they have measured.
        acc.multiplicities.set(ctx.eventCentrality, histogram);
        break;
      }

      case 'plot_mult_vs_centrality':
        // This plot only means something across the whole sample — every
        // event is one point, and centrality itself is read off it. Filtering
        // to one class first (an `if_centrality` earlier in the same chain)
        // doesn't touch the data here (still all events, just highlighted
        // differently), but it teaches the wrong idea: that you need to pick a
        // class before you can see how classes are defined in the first place.
        if (ctx.eventCentrality) {
          acc.problems.push({ key: 'MULT_VS_CENTRALITY_NEEDS_ALL_EVENTS', severity: 'warning' });
        }
        ctx.heatmap = multiplicityVsCentrality(assets.events, {
          highlight: ctx.eventCentrality ?? undefined,
        });
        break;

      case 'load_tracks':
        ctx.tracksLoaded = true;
        break;

      case 'select_centrality': {
        if (!ctx.tracksLoaded) {
          acc.problems.push({ key: 'TRACKS_NOT_LOADED', severity: 'error' });
          break;
        }
        const centrality = resolveCentrality(step.centrality, ctx);
        if (centrality === null) {
          acc.problems.push({ key: 'CURRENT_CLASS_OUTSIDE_LOOP', severity: 'error' });
          break;
        }
        const sample = trackSampleOf(assets.tracks, centrality);
        if (!sample) {
          acc.problems.push({
            key: 'NO_TRACKS',
            severity: 'error',
            params: { centrality },
          });
          break;
        }
        ctx.trackCentrality = centrality;
        ctx.trackSample = sample;
        if (
          ctx.eventCentrality &&
          ctx.eventCentrality !== centrality
        ) {
          acc.problems.push({
            key: 'CENTRALITY_MISMATCH',
            severity: 'error',
            params: {
              events: centralityLabel(ctx.eventCentrality),
              tracks: centralityLabel(centrality),
            },
          });
        }
        break;
      }

      case 'cut_pt':
        ctx.ptCut = step.ptCut ?? 0.15;
        break;

      case 'create_hist':
        ctx.pendingBinning = step.binning ?? 'fixed';
        break;

      case 'fill_hist': {
        if (!ctx.trackSample || !ctx.trackCentrality) {
          acc.problems.push({ key: 'HIST_WITHOUT_TRACKS', severity: 'error' });
          break;
        }
        if (!ctx.pendingBinning) {
          acc.problems.push({ key: 'FILL_WITHOUT_HIST', severity: 'error' });
          break;
        }
        ctx.spectrum = histogramPt(ctx.trackSample, ctx.pendingBinning, ctx.ptCut);
        ctx.appliedScalings = [];
        break;
      }

      case 'lookup_ncoll': {
        const requested = step.nCollCentrality ?? step.centrality;
        const key =
          requested === undefined
            ? ctx.trackCentrality ?? '0-5'
            : resolveCentrality(requested, ctx) ?? '';
        if (!key) {
          acc.problems.push({ key: 'CURRENT_CLASS_OUTSIDE_LOOP', severity: 'error' });
          break;
        }
        const nColl = assets.tracks.classes[key]?.nColl ?? 0;
        if (!nColl) {
          acc.problems.push({
            key: 'NCOLL_UNKNOWN',
            severity: 'error',
            params: { centrality: key },
          });
          break;
        }
        ctx.nColl = nColl;
        ctx.nCollSource = key;
        if (ctx.trackCentrality && key !== ctx.trackCentrality) {
          acc.problems.push({
            key: 'NCOLL_MISMATCH',
            severity: 'error',
            params: {
              chosen: centralityLabel(key),
              tracks: centralityLabel(ctx.trackCentrality),
            },
          });
        }
        break;
      }

      case 'divide_bin_width':
        this.applyScaling(ctx, acc, 'divide_bin_width', (spectrum) =>
          divideByBinWidth(spectrum),
        );
        break;

      case 'divide_events': {
        if (ctx.nEvt === null) {
          acc.problems.push({ key: 'MISSING_NEVT_VAR', severity: 'error' });
          break;
        }
        const nEvt = ctx.nEvt;
        this.applyScaling(ctx, acc, 'divide_events', (spectrum) =>
          divideByEvents(spectrum, nEvt),
        );
        break;
      }

      case 'divide_ncoll': {
        if (ctx.nColl === null) {
          acc.problems.push({ key: 'MISSING_NCOLL_VAR', severity: 'error' });
          break;
        }
        const nColl = ctx.nColl;
        this.applyScaling(ctx, acc, 'divide_ncoll', (spectrum) =>
          divideByNColl(spectrum, nColl),
        );
        break;
      }

      case 'clone_spectrum':
        if (!ctx.spectrum) {
          acc.problems.push({ key: 'CLONE_WITHOUT_SPECTRUM', severity: 'error' });
          break;
        }
        ctx.savedSpectrum = cloneSpectrum(ctx.spectrum);
        break;

      case 'load_pp':
        ctx.ppLoaded = true;
        break;

      case 'load_peripheral': {
        if (!ctx.spectrum || !ctx.pendingBinning) {
          acc.problems.push({ key: 'PERIPHERAL_WITHOUT_SPECTRUM', severity: 'error' });
          break;
        }
        if (ctx.trackCentrality === RAA_PERIPHERAL_KEY) {
          acc.problems.push({ key: 'RCP_SELF_DIVISION', severity: 'error' });
          break;
        }
        const peripheralSample = trackSampleOf(assets.tracks, RAA_PERIPHERAL_KEY);
        if (!peripheralSample) {
          acc.problems.push({ key: 'NO_PERIPHERAL', severity: 'error' });
          break;
        }
        // Only remember the sample here. Normalising it now would freeze in
        // whatever scalings happened to be applied at this point in the chain,
        // so a student who dragged this block above the `Divide by …` blocks
        // got a raw-count denominator against a normalised numerator — wrong
        // by ~1e5, and with no problem reported. The denominator is built in
        // `divide_reference`, from the numerator's own ops, so the order of
        // this block cannot matter.
        ctx.peripheralSample = peripheralSample;
        break;
      }

      case 'divide_reference': {
        if (!ctx.spectrum) {
          acc.problems.push({ key: 'DIVIDE_WITHOUT_SPECTRUM', severity: 'error' });
          break;
        }
        const which = step.reference ?? 'pp';
        if (which === 'pp') {
          if (!ctx.ppLoaded) {
            acc.problems.push({ key: 'PP_NOT_LOADED', severity: 'error' });
            break;
          }
          if (ctx.spectrum.ops.includes('divide_pp') || ctx.spectrum.ops.includes('divide_peripheral')) {
            acc.problems.push({ key: 'TWO_REFERENCES', severity: 'error' });
            break;
          }
          ctx.spectrum = divideBySpectrum(
            ctx.spectrum,
            ppSpectrum(assets.pp),
            'divide_pp',
          );
        } else {
          if (!ctx.peripheralSample) {
            acc.problems.push({ key: 'PERIPHERAL_NOT_LOADED', severity: 'error' });
            break;
          }
          if (ctx.spectrum.ops.includes('divide_pp') || ctx.spectrum.ops.includes('divide_peripheral')) {
            acc.problems.push({ key: 'TWO_REFERENCES', severity: 'error' });
            break;
          }
          // Built here, not at load time, and normalised to match the
          // numerator exactly — see the comment in `load_peripheral`.
          ctx.spectrum = divideBySpectrum(
            ctx.spectrum,
            normalisedLike(
              histogramPt(ctx.peripheralSample, ctx.spectrum.binning, ctx.ptCut),
              ctx.peripheralSample,
              ctx.spectrum.ops,
            ),
            'divide_peripheral',
          );
        }
        this.reportChain(ctx.spectrum, acc.problems);
        break;
      }

      case 'for_each_centrality': {
        const classes = RAA_PRESET_CLASSES[step.centralityPreset ?? 'three'];
        const body = step.body ?? [];
        if (!body.length) {
          acc.problems.push({ key: 'FOR_EACH_EMPTY', severity: 'error' });
          break;
        }
        for (const centrality of classes) {
          const branch = branchCtx(ctx);
          branch.loopCentrality = centrality;
          branch.tracksLoaded = true;
          const sample = trackSampleOf(assets.tracks, centrality);
          if (!sample) {
            acc.problems.push({
              key: 'NO_TRACKS',
              severity: 'error',
              params: { centrality },
            });
            continue;
          }
          branch.trackCentrality = centrality;
          branch.trackSample = sample;
          if (branch.eventsLoaded) {
            branch.eventCentrality = centrality;
            branch.eventSample = eventSampleOf(assets.events, centrality);
            branch.nEvt = branch.eventSample.nEvents;
          }
          this.runSteps(body, assets, branch, acc);
          // Keep the last branch's histogram/heatmap/nEvt visible on the outer ctx.
          ctx.histogram = branch.histogram ?? ctx.histogram;
          ctx.heatmap = branch.heatmap ?? ctx.heatmap;
          ctx.nEvt = branch.nEvt ?? ctx.nEvt;
          ctx.trackCentrality = branch.trackCentrality;
          ctx.spectrum = branch.spectrum;
        }
        break;
      }

      case 'plot':
        this.plotSpectrum(ctx, acc, step.plotAs ?? 'raa');
        break;

      case 'draw_line_at_one':
        ctx.drawLineAtOne = true;
        break;

      case 'read_value': {
        if (!ctx.spectrum || !ctx.trackCentrality) {
          acc.problems.push({ key: 'READ_WITHOUT_SPECTRUM', severity: 'error' });
          break;
        }
        const pt = step.readAt ?? 5.5;
        const index = binAt(ctx.spectrum.edges, pt);
        if (index < 0 || ctx.spectrum.empty[index]) {
          acc.problems.push({
            key: 'READ_NO_BIN',
            severity: 'warning',
            params: { pt },
          });
          break;
        }
        acc.reported.push({
          centrality: ctx.trackCentrality,
          target: targetOf(ctx.spectrum),
          pt,
          value: ctx.spectrum.values[index],
          error:
            Math.abs(ctx.spectrum.values[index]) * ctx.spectrum.relErr[index],
        });
        break;
      }

      default:
        break;
    }
  }

  private applyScaling(
    ctx: ExecCtx,
    acc: Accumulators,
    kind: RaaStepKind & RaaOp,
    apply: (spectrum: RaaSpectrum) => RaaSpectrum,
  ): void {
    if (!ctx.spectrum) {
      acc.problems.push({ key: 'DIVIDE_WITHOUT_SPECTRUM', severity: 'error' });
      return;
    }
    if (ctx.spectrum.ops.includes(kind)) {
      acc.problems.push({
        key: 'DUPLICATE_DIVISION',
        severity: 'error',
        params: { op: kind },
      });
      return;
    }
    ctx.spectrum = apply(ctx.spectrum);
    ctx.appliedScalings.push(kind);
  }

  private reportChain(spectrum: RaaSpectrum, problems: RaaProblem[]): void {
    if (spectrum.unit.ratio) {
      if (!spectrum.ops.includes('divide_bin_width')) {
        problems.push({ key: 'MISSING_BIN_WIDTH', severity: 'error' });
      }
      if (!spectrum.ops.includes('divide_events')) {
        problems.push({ key: 'MISSING_EVENTS', severity: 'error' });
      }
      if (!spectrum.ops.includes('divide_ncoll')) {
        problems.push({ key: 'MISSING_NCOLL', severity: 'error' });
      }
    } else {
      problems.push({ key: 'NO_REFERENCE', severity: 'error' });
    }

    const emptyBins = spectrum.empty.filter(Boolean).length;
    if (emptyBins) {
      problems.push({
        key: 'EMPTY_BINS',
        severity: 'warning',
        params: { count: emptyBins },
      });
    }
  }

  private plotSpectrum(
    ctx: ExecCtx,
    acc: Accumulators,
    target: RaaPlotTarget,
  ): void {
    if (!ctx.spectrum || !ctx.trackCentrality) {
      acc.problems.push({ key: 'PLOT_WITHOUT_SPECTRUM', severity: 'error' });
      return;
    }
    const spectrum = ctx.spectrum;
    const centrality = ctx.trackCentrality;
    const isRatio = target !== 'pt';

    if (isRatio && !spectrum.unit.ratio) {
      acc.problems.push({
        key: target === 'raa' ? 'RAA_NOT_A_RATIO' : 'RCP_NOT_A_RATIO',
        severity: 'error',
      });
      return;
    }
    if (target === 'raa' && !spectrum.ops.includes('divide_pp')) {
      acc.problems.push({ key: 'RAA_NEEDS_PP', severity: 'error' });
      return;
    }
    if (target === 'rcp' && !spectrum.ops.includes('divide_peripheral')) {
      acc.problems.push({ key: 'RCP_NEEDS_PERIPHERAL', severity: 'error' });
      return;
    }
    if (target === 'pt' && spectrum.unit.ratio) {
      acc.problems.push({ key: 'PT_IS_A_RATIO', severity: 'warning' });
    }

    const series = seriesOf(
      spectrum,
      target,
      centrality,
      isRatio && ctx.drawLineAtOne ? 1 : null,
    );
    if (target === 'pt') {
      acc.pt.push(series);
      acc.plottedPt.add(centrality);
    } else if (target === 'raa') {
      acc.raa.push(series);
    } else {
      acc.rcp.push(series);
    }
    acc.readouts.push({ centrality, target, points: series.points });
  }
}

/**
 * Apply to `spectrum` exactly the normalisations `ops` records, using `sample`
 * for its own N_evt / N_coll. Used to build the R_CP denominator so it always
 * carries the same units as the numerator, whatever order the student's blocks
 * were in.
 */
function normalisedLike(
  spectrum: RaaSpectrum,
  sample: RaaTrackSample,
  ops: readonly RaaOp[],
): RaaSpectrum {
  let out = spectrum;
  if (ops.includes('divide_bin_width')) {
    out = divideByBinWidth(out);
  }
  if (ops.includes('divide_events')) {
    out = divideByEvents(out, sample.nEvents);
  }
  if (ops.includes('divide_ncoll')) {
    out = divideByNColl(out, sample.nColl);
  }
  return out;
}

function freshCtx(): ExecCtx {
  return {
    loopCentrality: null,
    eventsLoaded: false,
    eventCentrality: null,
    eventSample: null,
    nEvt: null,
    tracksLoaded: false,
    trackCentrality: null,
    trackSample: null,
    ptCut: 0.15,
    pendingBinning: null,
    spectrum: null,
    savedSpectrum: null,
    nColl: null,
    nCollSource: null,
    ppLoaded: false,
    peripheralSample: null,
    drawLineAtOne: false,
    histogram: null,
    heatmap: null,
    appliedScalings: [],
  };
}

/** Copy outer context for a for-each branch without sharing mutable spectrum state. */
function branchCtx(outer: ExecCtx): ExecCtx {
  return {
    ...outer,
    spectrum: null,
    savedSpectrum: null,
    peripheralSample: null,
    pendingBinning: null,
    nColl: null,
    nCollSource: null,
    ppLoaded: false,
    drawLineAtOne: outer.drawLineAtOne,
    appliedScalings: [],
    histogram: null,
    heatmap: null,
  };
}

function emptyResult(): RaaRunResult {
  return {
    ok: false,
    problems: [],
    ptSpectra: [],
    raa: [],
    rcp: [],
    multiplicity: null,
    multiplicities: [],
    multVsCentrality: null,
    readouts: [],
    reported: [],
    ppReference: null,
    nEvents: null,
    centrality: null,
  };
}

function seriesOf(
  spectrum: RaaSpectrum,
  target: RaaPlotTarget,
  centrality: string,
  referenceLine: number | null,
): RaaSeries {
  const centers = centersOf(spectrum.edges);
  const points: RaaPoint[] = [];
  for (let i = 0; i < spectrum.values.length; i++) {
    if (spectrum.empty[i]) {
      continue;
    }
    points.push({
      x: centers[i],
      xLow: spectrum.edges[i],
      xHigh: spectrum.edges[i + 1],
      y: spectrum.values[i],
      yErr: Math.abs(spectrum.values[i]) * spectrum.relErr[i],
    });
  }
  return {
    id: `${target}_${centrality}`,
    label: centralityLabel(centrality),
    centrality,
    color: centralityColor(centrality),
    points,
    unit: unitLabel(spectrum.unit),
    referenceLine,
  };
}

function targetOf(spectrum: RaaSpectrum): RaaPlotTarget {
  if (spectrum.ops.includes('divide_pp')) {
    return 'raa';
  }
  if (spectrum.ops.includes('divide_peripheral')) {
    return 'rcp';
  }
  return 'pt';
}

/**
 * The published pp spectrum as a drawable series.
 *
 * The desktop app puts Pb–Pb and pp on the same canvas before dividing them, and
 * that picture is the whole argument for R_AA: two spectra of the same shape,
 * one sitting below the other. Dashed, because the student did not measure it.
 */
function ppReferenceSeries(asset: RaaPpAsset): RaaSeries {
  const spectrum = ppSpectrum(asset);
  const centers = centersOf(spectrum.edges);
  const points: RaaPoint[] = [];
  for (let i = 0; i < spectrum.values.length; i++) {
    if (spectrum.empty[i]) {
      continue;
    }
    points.push({
      x: centers[i],
      xLow: spectrum.edges[i],
      xHigh: spectrum.edges[i + 1],
      y: spectrum.values[i],
      yErr: spectrum.values[i] * spectrum.relErr[i],
    });
  }
  return {
    id: 'pp_reference',
    label: 'pp',
    color: '#cbd5e1',
    points,
    unit: unitLabel(spectrum.unit),
    render: 'steps',
    dashed: true,
  };
}
