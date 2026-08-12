import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import {
  CompactEvent,
  createDatasetState,
  createMassHistograms,
  DatasetAnalysisState,
  DatasetId,
  DEFAULT_PID_CUT,
  MASS_BINS,
  MASS_XMAX,
  MASS_XMIN,
  PID_DEDX_BINS,
  PID_DEDX_MAX,
  PID_DEDX_MIN,
  PID_P_BINS,
  PID_P_MAX,
  PID_P_MIN,
  PidCut,
  snapToBinEdge,
  SummaryRow,
} from '../models/jpsi.models';
import { JpsiPairingService } from './jpsi-pairing.service';
import { JpsiResidualFitService } from './jpsi-residual-fit.service';
import { JpsiSignalService } from './jpsi-signal.service';

const LOG_P_MIN = Math.log(PID_P_MIN);
const LOG_P_SPAN = Math.log(PID_P_MAX) - LOG_P_MIN;

/**
 * Owns the analysis state of both datasets.
 *
 * pp and p-Pb are analysed independently and both states live in memory at the same time,
 * so switching datasets mid-exercise never loses progress. Nothing is persisted: a reload
 * starts the exercise over.
 */
@Injectable()
export class JpsiAnalysisStateService {
  private readonly states: Record<DatasetId, DatasetAnalysisState> = {
    pp: createDatasetState('pp'),
    pPb: createDatasetState('pPb'),
  };

  private _activeDataset: DatasetId = 'pp';

  private readonly changesSubject = new Subject<void>();
  /** Fires whenever anything a chart draws has changed. */
  readonly changes$: Observable<void> = this.changesSubject.asObservable();

  constructor(
    private readonly pairing: JpsiPairingService,
    private readonly signal: JpsiSignalService,
    private readonly residualFit: JpsiResidualFitService
  ) {}

  get activeDataset(): DatasetId {
    return this._activeDataset;
  }

  get state(): DatasetAnalysisState {
    return this.states[this._activeDataset];
  }

  stateOf(datasetId: DatasetId): DatasetAnalysisState {
    return this.states[datasetId];
  }

  get rows(): SummaryRow[] {
    return (['pp', 'pPb'] as DatasetId[])
      .map((id) => this.states[id].tableRow)
      .filter((row): row is SummaryRow => row !== null);
  }

  get hasBothResults(): boolean {
    return this.states.pp.tableRow !== null && this.states.pPb.tableRow !== null;
  }

  selectDataset(datasetId: DatasetId): void {
    if (this._activeDataset === datasetId) {
      return;
    }
    this._activeDataset = datasetId;
    this.emit();
  }

  /**
   * Called when the student leaves the exercise entirely (a different route). This service is
   * provided at module scope, so — unlike the component — it survives that navigation and would
   * otherwise still hold stale processed events, cuts and fit ranges the moment the student
   * comes back, well after any component-local field has already re-initialized to its default.
   * That mismatch is exactly what made the PID sliders and the Pol1 line look "stuck" on return
   * (see the plan doc). Accepted rows are the one thing worth keeping — they are frozen
   * measurements the student may still want in view — so only those survive.
   */
  resetForNewSession(): void {
    for (const datasetId of ['pp', 'pPb'] as DatasetId[]) {
      const tableRow = this.states[datasetId].tableRow;
      this.states[datasetId] = { ...createDatasetState(datasetId), tableRow };
    }
    this._activeDataset = 'pp';
  }

  // --- Quick Analysis -------------------------------------------------------

  /**
   * Appends freshly loaded events: bins them into the PID heatmap. Mass histograms are
   * filled only once the student has accepted a PID range (and then only for new events,
   * under that applied cut).
   */
  appendEvents(events: CompactEvent[]): void {
    const state = this.state;

    for (const event of events) {
      state.processedEvents.push(event);
      this.binIntoHeatmap(state, event);
    }
    state.processedCount = state.processedEvents.length;
    state.nextEventIndex += events.length;

    const cut = state.appliedCut;
    if (cut !== null) {
      if (this.pairing.isSelectionTooWide(state.processedEvents, cut)) {
        state.tooWideSelection = true;
        state.mass = createMassHistograms();
      } else {
        state.tooWideSelection = false;
        this.pairing.fillMassHistograms(events, cut, state.mass);
      }
    }

    this.returnToExplore(state);
    this.emit();
  }

  resetHistograms(): void {
    const state = this.state;

    state.processedEvents = [];
    state.processedCount = 0;
    state.nextEventIndex = 0;
    state.pidBins = new Uint32Array(PID_P_BINS * PID_DEDX_BINS);
    state.pidMax = 0;
    // The PID range selection is meaningless once its histogram is gone — reset it too, so the
    // heatmap sliders don't keep showing a range that no longer corresponds to anything on screen.
    state.cut = { ...DEFAULT_PID_CUT };
    state.appliedCut = null;
    state.mass = createMassHistograms();
    state.tooWideSelection = false;

    // The table row is a frozen result with its own event count, so it survives.
    this.returnToExplore(state);
    this.emit();
  }

  // --- Cuts -----------------------------------------------------------------

  /** Stores the draft cut while sliders move; does not rebuild mass. */
  setDraftCut(cut: PidCut): void {
    this.state.cut = { ...cut };
  }

  /**
   * Commits the PID selection and rebuilds mass histograms from all processed events.
   * Safe to call repeatedly after the student adjusts the band.
   */
  acceptSelectedRange(cut: PidCut): void {
    const state = this.state;
    state.cut = { ...cut };
    state.appliedCut = { ...cut };
    this.rebuildMass(state);
    this.emit();
  }

  resetCuts(): void {
    const state = this.state;
    state.cut = { ...DEFAULT_PID_CUT };
    state.appliedCut = null;
    state.mass = createMassHistograms();
    state.tooWideSelection = false;
    this.returnToExplore(state);
    this.emit();
  }

  private rebuildMass(state: DatasetAnalysisState): void {
    state.mass = createMassHistograms();
    const cut = state.appliedCut;
    if (cut === null) {
      state.tooWideSelection = false;
      this.returnToExplore(state);
      return;
    }

    if (this.pairing.isSelectionTooWide(state.processedEvents, cut)) {
      state.tooWideSelection = true;
    } else {
      state.tooWideSelection = false;
      this.pairing.fillMassHistograms(state.processedEvents, cut, state.mass);
    }

    this.returnToExplore(state);
  }

  // --- Mass panel -----------------------------------------------------------

  toggleSeries(series: string): void {
    const state = this.state;
    state.visibility[series] = !state.visibility[series];
    this.emit();
  }

  setShowBackgroundSum(show: boolean): void {
    this.state.showBackgroundSum = show;
    this.emit();
  }

  get canSubtract(): boolean {
    const state = this.state;
    return (
      state.panelMode === 'explore' &&
      state.processedCount > 0 &&
      state.appliedCut !== null &&
      !state.tooWideSelection
    );
  }

  subtractBackground(): void {
    if (!this.canSubtract) {
      return;
    }
    const state = this.state;
    state.panelMode = 'subtracted';
    state.fitResult = null;
    this.emit();
  }

  showComponents(): void {
    const state = this.state;
    state.panelMode = 'explore';
    state.fitResult = null;
    this.emit();
  }

  setMassWindow(window: [number, number]): void {
    const state = this.state;
    state.massWindow = [snapToBinEdge(window[0]), snapToBinEdge(window[1])];
    state.fitResult = null;
    this.emit();
  }

  setBackgroundFitRange(range: [number, number]): void {
    const state = this.state;
    state.backgroundFitRange = [snapToBinEdge(range[0]), snapToBinEdge(range[1])];
    state.fitResult = null;
    this.emit();
  }

  /**
   * Fits the Pol1 residual background to the sidebands (excluding the signal window) and
   * counts the excess inside the window. Pol1 is a closed-form fit — see
   * `JpsiResidualFitService` — so this never fails to converge.
   */
  runFit(): void {
    const state = this.state;
    if (state.panelMode !== 'subtracted') {
      return;
    }
    state.fitResult = this.residualFit.fitPol1(
      this.signal.rawResidualSeries(state.mass),
      MASS_XMIN,
      MASS_XMAX,
      MASS_BINS,
      state.backgroundFitRange,
      state.massWindow,
      this.signal.backgroundSeries(state.mass)
    );
    this.emit();
  }

  get canAccept(): boolean {
    const state = this.state;
    return state.panelMode === 'subtracted' && (state.fitResult?.signal ?? 0) > 0;
  }

  acceptResult(): void {
    if (!this.canAccept) {
      return;
    }
    const state = this.state;
    state.tableRow = {
      ...(state.fitResult as NonNullable<typeof state.fitResult>),
      datasetId: state.datasetId,
      nEvents: state.processedCount,
    };
    this.emit();
  }

  /** Drops the current fit curve/result without touching the histogram or accepted rows. */
  clearFit(): void {
    this.state.fitResult = null;
    this.emit();
  }

  removeResult(datasetId: DatasetId): void {
    this.states[datasetId].tableRow = null;
    this.emit();
  }

  /**
   * Anything that changes what the histograms contain drops the panel back to explore.
   * A residual on screen must always match the pairs it was computed from, otherwise the
   * student would be subtracting a background from a different set of events.
   */
  private returnToExplore(state: DatasetAnalysisState): void {
    state.panelMode = 'explore';
    state.fitResult = null;
  }

  // --- PID heatmap ----------------------------------------------------------

  private binIntoHeatmap(state: DatasetAnalysisState, event: CompactEvent): void {
    for (let i = 0; i < event.p.length; i++) {
      const p = event.p[i];
      const dedx = event.dedx[i];

      if (p < PID_P_MIN || p > PID_P_MAX || dedx < PID_DEDX_MIN || dedx > PID_DEDX_MAX) {
        continue;
      }

      const pBin = Math.min(
        PID_P_BINS - 1,
        Math.floor(((Math.log(p) - LOG_P_MIN) / LOG_P_SPAN) * PID_P_BINS)
      );
      const dedxBin = Math.min(
        PID_DEDX_BINS - 1,
        Math.floor(((dedx - PID_DEDX_MIN) / (PID_DEDX_MAX - PID_DEDX_MIN)) * PID_DEDX_BINS)
      );

      const index = dedxBin * PID_P_BINS + pBin;
      const next = state.pidBins[index] + 1;
      state.pidBins[index] = next;
      if (next > state.pidMax) {
        state.pidMax = next;
      }
    }
  }

  private emit(): void {
    this.changesSubject.next();
  }
}
