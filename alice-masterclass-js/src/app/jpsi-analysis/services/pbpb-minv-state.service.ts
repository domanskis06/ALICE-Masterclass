import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { FitService } from '../../shared/services/fit.service';
import {
  createPbPbCentralityState,
  defaultFitRange,
  FitSnapshot,
  PbPbCentralityId,
  PbPbCentralityState,
  PBPB_CENTRALITY_IDS,
  PbPbYieldRow,
  residualToLsaData,
} from '../models/pbpb-minv.models';
import { JpsiMinvDataService } from './jpsi-minv-data.service';

/**
 * Owns the analysis state of the two published Pb-Pb centralities.
 *
 * Both centralities are analysed independently and both states live in memory at the same
 * time (mirrors `JpsiAnalysisStateService` for pp/p-Pb), so switching between them mid-fit
 * never loses progress. `FitService` itself is a single shared instance — the only thing
 * that actually "switches" on `selectCentrality` — so its data/ranges/hints/result are
 * snapshotted into `states[...].fitSnapshot` on every switch and restored on return.
 */
@Injectable()
export class PbPbMinvStateService {
  private readonly states: Record<PbPbCentralityId, PbPbCentralityState> = {
    pbPb_50_70: createPbPbCentralityState('pbPb_50_70'),
    pbPb_70_90: createPbPbCentralityState('pbPb_70_90'),
  };

  private _activeCentrality: PbPbCentralityId = 'pbPb_50_70';

  private readonly changesSubject = new Subject<void>();
  readonly changes$: Observable<void> = this.changesSubject.asObservable();

  constructor(
    private readonly data: JpsiMinvDataService,
    private readonly fitService: FitService
  ) {
    // Both files are tiny (a few KB) — load both up front so the dropdown never blocks.
    this.preload();
  }

  get activeCentrality(): PbPbCentralityId {
    return this._activeCentrality;
  }

  get state(): PbPbCentralityState {
    return this.states[this._activeCentrality];
  }

  stateOf(id: PbPbCentralityId): PbPbCentralityState {
    return this.states[id];
  }

  get rows(): PbPbYieldRow[] {
    return PBPB_CENTRALITY_IDS.map((id) => this.states[id].tableRow).filter(
      (row): row is PbPbYieldRow => row !== null
    );
  }

  /** Loads both histograms up front so the toolbar dropdown never blocks on first switch. */
  preload(): void {
    for (const id of PBPB_CENTRALITY_IDS) {
      this.ensureHistogramLoaded(id);
    }
  }

  selectCentrality(id: PbPbCentralityId): void {
    if (id === this._activeCentrality) {
      return;
    }
    this.snapshotFitService(this._activeCentrality);
    this._activeCentrality = id;
    this.ensureHistogramLoaded(id);
    this.restoreFitService(id);
    this.emit();
  }

  private ensureHistogramLoaded(id: PbPbCentralityId): void {
    const state = this.states[id];
    if (state.histogram !== null || state.loading) {
      return;
    }
    state.loading = true;
    this.data.getHistogram(id).subscribe({
      next: (histogram) => {
        state.histogram = histogram;
        state.loading = false;
        this.emit();
      },
      error: () => {
        state.loading = false;
        this.emit();
      },
    });
  }

  private snapshotFitService(id: PbPbCentralityId): void {
    this.states[id].fitSnapshot = {
      data: this.fitService.data,
      signalFitRange: this.fitService.signalFitRange,
      backgroundFitRange: this.fitService.backgroundFitRange,
      aGaussHint: this.fitService.aGaussHint,
      aPolyHint: this.fitService.aPolyHint,
      result: this.fitService.result,
      signalFunction: this.fitService.signalFunction,
      backgroundFunction: this.fitService.backgroundFunction,
    };
  }

  private restoreFitService(id: PbPbCentralityId): void {
    const snapshot: FitSnapshot = this.states[id].fitSnapshot;
    this.fitService.data = snapshot.data;
    this.fitService.signalFitRange = snapshot.signalFitRange;
    this.fitService.backgroundFitRange = snapshot.backgroundFitRange;
    this.fitService.aGaussHint = snapshot.aGaussHint;
    this.fitService.aPolyHint = snapshot.aPolyHint;
    this.fitService.result = snapshot.result;
    this.fitService.signalFunction = snapshot.signalFunction;
    this.fitService.backgroundFunction = snapshot.backgroundFunction;
  }

  get canSubtract(): boolean {
    const state = this.state;
    return state.panelMode === 'explore' && !state.loading && state.histogram !== null;
  }

  /**
   * Builds the pseudo-unbinned residual and hands it to `FitService`. The signal/background
   * *range sliders* are never pre-set from `fitHint` by design — the student starts from the
   * full range, exactly like in LSA.
   *
   * `aGaussHint`, however, is not a slider default: it is the Nelder-Mead starting point for
   * the Gaussian fit, the same role LSA fills with a hardcoded per-particle guess (e.g.
   * `[10.730, 0.498, 0.004]` for kaons — see `StrangenessLargeScaleAnalysisComponent`). Left at
   * `[0, 0, 0]`, mu=0 sits far outside any realistic J/psi mass window, so the optimiser's chi²
   * penalty for "mu outside range" is the same constant everywhere near the start and it can
   * never climb out towards the real peak — the Gaussian stays at zero and the signal curve
   * never appears. `histogram.fitHint.aGaussHint` gives it a physically sensible seed instead.
   */
  subtractBackground(): void {
    if (!this.canSubtract) {
      return;
    }
    const state = this.state;
    const histogram = state.histogram;
    if (histogram === null) {
      return;
    }

    this.fitService.data = residualToLsaData(histogram);
    const range = defaultFitRange(histogram);
    this.fitService.signalFitRange = range;
    this.fitService.backgroundFitRange = range;
    this.fitService.aGaussHint = [...histogram.fitHint.aGaussHint];
    this.fitService.aPolyHint = [0, 0, 0];

    state.panelMode = 'subtracted';
    this.snapshotFitService(this._activeCentrality);
    this.emit();
  }

  /** Back to the raw U/L view. Keeps the fit result and accepted table row untouched. */
  showComponents(): void {
    this.state.panelMode = 'explore';
    this.emit();
  }

  get canAccept(): boolean {
    return this.state.panelMode === 'subtracted' && this.fitService.result !== null;
  }

  acceptResult(): void {
    if (!this.canAccept) {
      return;
    }
    const state = this.state;
    const histogram = state.histogram;
    const result = this.fitService.result;
    if (histogram === null || result === null) {
      return;
    }

    state.tableRow = {
      centralityId: state.centralityId,
      centralityLabel: histogram.centralityLabel,
      fit: result,
      published: histogram.published,
      acceptedAt: Date.now(),
    };
    this.emit();
  }

  removeResult(id: PbPbCentralityId): void {
    this.states[id].tableRow = null;
    this.emit();
  }

  private emit(): void {
    this.changesSubject.next();
  }
}
