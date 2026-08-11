import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { FitService } from '../../shared/services/fit.service';
import {
  createPbPbCentralityState,
  defaultFitRange,
  emptyFitSnapshot,
  FitSnapshot,
  PbPbCentralityId,
  PbPbCentralityState,
  PBPB_CENTRALITY_IDS,
  PbPbYieldRow,
  residualToLsaData,
} from '../models/pbpb-minv.models';
import { JpsiMinvDataService } from './jpsi-minv-data.service';

/**
 * Owns the analysis state of all eight published Pb-Pb centralities.
 *
 * Unlike `JpsiAnalysisStateService` (pp/p-Pb), in-progress work on a centrality is *not* kept
 * alive across dataset changes: with eight centralities on top of pp/p-Pb, silently piling up
 * eight independent fit sessions forever does not scale and mostly hides forgotten, half-done
 * work. Instead, every dataset change resets any centrality that was never accepted back to a
 * blank 'explore' view (see `leaveCurrentCentrality`). Once a fit is accepted, though, its row
 * — and the exact fit state behind it — is frozen and survives every future switch, because
 * accepted results are the baseline the student needs later for R_AA.
 *
 * `FitService` itself is a single shared instance, so whatever a centrality "remembers" lives
 * in its own `fitSnapshot`, restored into `FitService` whenever that centrality becomes active.
 */
@Injectable()
export class PbPbMinvStateService {
  private readonly states: Record<PbPbCentralityId, PbPbCentralityState> = Object.fromEntries(
    PBPB_CENTRALITY_IDS.map((id) => [id, createPbPbCentralityState(id)])
  ) as Record<PbPbCentralityId, PbPbCentralityState>;

  private _activeCentrality: PbPbCentralityId = PBPB_CENTRALITY_IDS[0];

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
    this.leaveCurrentCentrality();
    this._activeCentrality = id;
    this.ensureHistogramLoaded(id);
    this.restoreFitService(id);
    this.emit();
  }

  /**
   * Called by `JpsiAnalysisComponent.onDatasetChange` when the toolbar switches to a
   * track-based dataset (pp/p-Pb), which never calls `selectCentrality` itself. The Pb-Pb
   * centrality left behind still needs the same "reset unless accepted" treatment as any
   * other dataset change, otherwise it would keep its in-progress fit alive forever just
   * because the student briefly detoured through pp or p-Pb.
   */
  leavePublishedView(): void {
    this.leaveCurrentCentrality();
    this.restoreFitService(this._activeCentrality);
    this.emit();
  }

  /**
   * Every dataset change resets the departing centrality back to a blank 'explore' view —
   * unless it already has an accepted result, in which case its live fit state is snapshotted
   * first so any edits made after accepting are not lost, and the centrality is left exactly
   * as the student saw it.
   */
  private leaveCurrentCentrality(): void {
    const id = this._activeCentrality;
    const state = this.states[id];
    if (state.tableRow !== null) {
      this.snapshotFitService(id);
    } else {
      state.panelMode = 'explore';
      state.fitSnapshot = emptyFitSnapshot();
    }
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
