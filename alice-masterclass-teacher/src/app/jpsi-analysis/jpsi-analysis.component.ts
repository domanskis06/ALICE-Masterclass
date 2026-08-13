import { Component, OnDestroy, OnInit, Type } from '@angular/core';

import { ApiService, EventAPI, ExerciseKind, JpsiAnalysisResultAPI } from '../shared/services/api.service';
import { InstructionsProvider } from '../shared/interfaces';
import { InstructionsComponent } from './instructions/instructions.component';
import { JpsiRaaService } from './jpsi-raa.service';
import { PBPB_NEVENTS } from './jpsi-raa.constants';
import {
  CollisionSystemId,
  JpsiRawSignal,
  JpsiRaaPlotEntry,
  JpsiResultRow,
  PBPB_CENTRALITY_IDS,
  isPbPbCentrality,
} from './jpsi-raa.models';

/** Every collision system shown in the table/plot, in display order - fixed regardless of
 * which systems have submissions yet, so the layout does not jump around as students submit. */
const ALL_SYSTEMS: readonly CollisionSystemId[] = ['pp', 'pPb', ...PBPB_CENTRALITY_IDS];

/** Average of a list of student-submitted numbers, 0 when nobody has submitted yet. */
function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

@Component({
    selector: 'app-jpsi-analysis',
    templateUrl: './jpsi-analysis.component.html',
    styleUrls: ['./jpsi-analysis.component.scss'],
    standalone: false
})
export class JpsiAnalysisComponent implements OnInit, OnDestroy, InstructionsProvider {

  instructionsComponent: Type<any> = InstructionsComponent;

  public eventID: number | null = null;
  public events: EventAPI[] = [];

  public rows: JpsiResultRow[] = [];
  public plotData: JpsiRaaPlotEntry[] = [];

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly apiService: ApiService,
    private readonly raaService: JpsiRaaService
  ) { }

  ngOnInit(): void {
    // Only J/psi events are relevant here - the three sub-masterclasses are independent
    // (Event.kind), so a strangeness/R_AA event would never have jpsi_analysis_results anyway.
    this.apiService.getEvents(ExerciseKind.JPSI).subscribe((events: EventAPI[]) => {
      this.events = events;
    });

    if (this.apiService.autoRefresh()) {
      this.refreshTimer = setInterval(() => {
        if (this.eventID !== null) {
          this.reload();
        }
      }, this.apiService.REFRESH_INTERVAL);
    }
  }

  ngOnDestroy(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  onEventChange(): void {
    this.reload();
  }

  onReload(): void {
    this.reload();
  }

  private reload(): void {
    if (this.eventID === null) {
      return;
    }

    this.apiService.getJpsiAnalysisResults(this.eventID).subscribe((results: JpsiAnalysisResultAPI[]) => {
      const signals = this.toRawSignals(results);
      const allRows = this.raaService.computeResults(signals);
      // Only the Pb-Pb centrality classes are shown to the teacher - pp/p-Pb signals are still
      // accepted and computed above, but R_AA always compares against the fixed reference
      // yield, never a student's own pp/p-Pb row - see "Why a fixed pp reference?" in
      // `ci/docs/jpsi-analysis-teacher.md`.
      this.rows = allRows.filter((row) => isPbPbCentrality(row.system));
      this.plotData = this.raaService.toPlotEntries(this.rows);
    });
  }

  /**
   * Turns the raw per-student arrays the API returns into one averaged signal per system,
   * filling in every system that has no submissions yet with a zero row (rather than omitting
   * it) so the table/plot layout stays stable as students submit over the course of a session.
   * Pb-Pb `nEvents` always comes from the fixed `PBPB_NEVENTS` constant, never from the
   * response - see the `JpsiAnalysisResultAPI` doc comment.
   */
  private toRawSignals(results: readonly JpsiAnalysisResultAPI[]): JpsiRawSignal[] {
    const bySystem = new Map(results.map((entry) => [entry.system, entry]));

    return ALL_SYSTEMS.map((system) => {
      const entry = bySystem.get(system);
      const signal = entry ? average(entry.signal) : 0;
      const signalError = entry ? average(entry.signalError) : 0;
      const nEvents = isPbPbCentrality(system)
        ? PBPB_NEVENTS[system]
        : entry
          ? average(entry.nEvents)
          : 0;

      return { system, signal, signalError, nEvents };
    });
  }
}
