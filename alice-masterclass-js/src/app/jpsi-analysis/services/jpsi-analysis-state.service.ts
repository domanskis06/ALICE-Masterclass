import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import {
  CompactEvent,
  createDatasetState,
  createMassHistograms,
  DatasetAnalysisState,
  DatasetId,
  DEFAULT_PID_CUT,
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
    private readonly signal: JpsiSignalService
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

  toggleSeries(series: 'unlike' | 'posPos' | 'negNeg'): void {
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
    this.recomputeLiveResult(state);
    this.emit();
  }

  showComponents(): void {
    const state = this.state;
    state.panelMode = 'explore';
    state.liveResult = null;
    this.emit();
  }

  setMassWindow(window: [number, number]): void {
    const state = this.state;
    state.massWindow = [snapToBinEdge(window[0]), snapToBinEdge(window[1])];
    this.recomputeLiveResult(state);
    this.emit();
  }

  get canAccept(): boolean {
    const state = this.state;
    return state.panelMode === 'subtracted' && (state.liveResult?.signal ?? 0) > 0;
  }

  acceptResult(): void {
    if (!this.canAccept) {
      return;
    }
    const state = this.state;
    state.tableRow = {
      ...(state.liveResult as NonNullable<typeof state.liveResult>),
      datasetId: state.datasetId,
      nEvents: state.processedCount,
    };
    this.emit();
  }

  private recomputeLiveResult(state: DatasetAnalysisState): void {
    state.liveResult =
      state.panelMode === 'subtracted'
        ? this.signal.compute(state.mass, state.massWindow)
        : null;
  }

  /**
   * Anything that changes what the histograms contain drops the panel back to explore.
   * A residual on screen must always match the pairs it was computed from, otherwise the
   * student would be subtracting a background from a different set of events.
   */
  private returnToExplore(state: DatasetAnalysisState): void {
    state.panelMode = 'explore';
    state.liveResult = null;
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
