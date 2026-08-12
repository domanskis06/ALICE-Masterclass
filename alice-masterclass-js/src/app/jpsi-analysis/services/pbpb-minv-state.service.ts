import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import {
  createPbPbCentralityState,
  emptyFitSnapshot,
  PbPbCentralityId,
  PbPbCentralityState,
  PbPbFitSnapshot,
  PBPB_CENTRALITY_IDS,
  PbPbYieldRow,
  rawResidual,
} from '../models/pbpb-minv.models';
import { JpsiMinvDataService } from './jpsi-minv-data.service';
import { JpsiResidualFitService } from './jpsi-residual-fit.service';

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
 * The Pol1 fit is a stateless, closed-form call (`JpsiResidualFitService.fitPol1`), so unlike
 * the old FitService-backed version, there is nothing shared to snapshot/restore beyond the
 * two range sliders and the last fit result — both already live directly on `PbPbCentralityState`.
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
    private readonly residualFit: JpsiResidualFitService
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
    this.emit();
  }

  /**
   * Every dataset change resets the departing centrality back to a blank 'explore' view —
   * unless it already has an accepted result, in which case its fit state is left untouched so
   * any edits made after accepting are not lost, and the centrality is left exactly as the
   * student saw it.
   */
  private leaveCurrentCentrality(): void {
    const state = this.states[this._activeCentrality];
    if (state.tableRow === null) {
      state.panelMode = 'explore';
      // Ranges are meaningless in explore mode; subtractBackground() reseeds them with the
      // histogram's full axis the next time this centrality is subtracted.
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

  private get snapshot(): PbPbFitSnapshot {
    return this.state.fitSnapshot;
  }

  get canSubtract(): boolean {
    const state = this.state;
    return state.panelMode === 'explore' && !state.loading && state.histogram !== null;
  }

  /**
   * Student starts from the full axis on both sliders — same starting point as LSA — so a
   * centrality whose histogram has empty bins at the edges (several do, see the plan doc)
   * forces the student to notice and narrow the background fit range themselves.
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

    const fullRange: [number, number] = [histogram.xmin, histogram.xmax];
    state.fitSnapshot = emptyFitSnapshot(fullRange);
    state.panelMode = 'subtracted';
    this.emit();
  }

  /** Back to the raw U/L view. Keeps the fit result and accepted table row untouched. */
  showComponents(): void {
    this.state.panelMode = 'explore';
    this.emit();
  }

  setMassWindow(window: [number, number]): void {
    this.snapshot.massWindow = window;
    this.snapshot.fitResult = null;
    this.emit();
  }

  setBackgroundFitRange(range: [number, number]): void {
    this.snapshot.backgroundFitRange = range;
    this.snapshot.fitResult = null;
    this.emit();
  }

  runFit(): void {
    const state = this.state;
    const histogram = state.histogram;
    if (state.panelMode !== 'subtracted' || histogram === null) {
      return;
    }
    state.fitSnapshot.fitResult = this.residualFit.fitPol1(
      rawResidual(histogram),
      histogram.xmin,
      histogram.xmax,
      histogram.bins,
      state.fitSnapshot.backgroundFitRange,
      state.fitSnapshot.massWindow
    );
    this.emit();
  }

  get canAccept(): boolean {
    const state = this.state;
    return state.panelMode === 'subtracted' && (state.fitSnapshot.fitResult?.signal ?? 0) > 0;
  }

  acceptResult(): void {
    if (!this.canAccept) {
      return;
    }
    const state = this.state;
    const histogram = state.histogram;
    const result = state.fitSnapshot.fitResult;
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
