import { Component, OnInit, Type } from '@angular/core';

import { ApiService, EventAPI } from '../shared/services/api.service';
import { InstructionsProvider } from '../shared/interfaces';
import { InstructionsComponent } from './instructions/instructions.component';
import { JPSI_REFERENCE_MASS_WINDOW } from './jpsi-raa.constants';
import { JpsiRaaService } from './jpsi-raa.service';
import { JpsiRawSignal, JpsiRaaPlotEntry, JpsiResultRow, isPbPbCentrality } from './jpsi-raa.models';

/**
 * Sample J/psi signals standing in for the student submissions this page will eventually load
 * from `GET /api/v1/jpsi_analysis_results/{eventID}/` (endpoint not implemented yet - see
 * `ci/docs/jpsi-analysis-teacher.md`). Pb-Pb numbers reuse the published yields/event counts
 * already bundled with the student exercise (`assets/exercises/jpsi/minv/pbPb_*.json`); pp/p-Pb
 * reuse the cross-checked example from the student module's README ("pp, 1000 events... N=59").
 * Every row uses `JPSI_REFERENCE_MASS_WINDOW` - they are digitized/published numbers already
 * calibrated to that window, so the mass-window safety net (`windowEfficiencyFactor`) is inert
 * for this sample data and only activates once real, variable-window student submissions exist.
 *
 * pp and p-Pb signals are kept here because students do analyse and submit both systems as part
 * of the exercise - but per the physics supervisors' confirmed decision, only the eight Pb-Pb
 * centrality rows are ever shown to the teacher (see `recalculate()` below and "Why a fixed pp
 * reference?" in `ci/docs/jpsi-analysis-teacher.md`).
 */
const SAMPLE_SIGNALS: readonly JpsiRawSignal[] = [
  { system: 'pp', signal: 59, signalError: 8, nEvents: 1000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pPb', signal: 34, signalError: 6, nEvents: 800, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_0_5', signal: 34662, signalError: 186, nEvents: 40090000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_5_10', signal: 33443, signalError: 183, nEvents: 40070000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_10_20', signal: 7858, signalError: 89, nEvents: 18140000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_20_30', signal: 5961, signalError: 77, nEvents: 18180000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_30_40', signal: 7181, signalError: 85, nEvents: 39760000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_40_50', signal: 3425, signalError: 59, nEvents: 39830000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_50_70', signal: 1478, signalError: 38, nEvents: 36480000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
  { system: 'pbPb_70_90', signal: 310, signalError: 18, nEvents: 36380000, massWindow: [...JPSI_REFERENCE_MASS_WINDOW] },
];

/** Deterministic pseudo-random number in [0, 1) - mulberry32, seeded per event/row. */
function seededRandom(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

@Component({
    selector: 'app-jpsi-analysis',
    templateUrl: './jpsi-analysis.component.html',
    styleUrls: ['./jpsi-analysis.component.scss'],
    standalone: false
})
export class JpsiAnalysisComponent implements OnInit, InstructionsProvider {

  instructionsComponent: Type<any> = InstructionsComponent;

  public eventID: number | null = null;
  public events: EventAPI[] = [];

  public rows: JpsiResultRow[] = [];
  public plotData: JpsiRaaPlotEntry[] = [];

  constructor(
    private readonly apiService: ApiService,
    private readonly raaService: JpsiRaaService
  ) { }

  ngOnInit(): void {
    this.apiService.getEvents().subscribe((events: EventAPI[]) => {
      this.events = events;
    });

    this.recalculate();
  }

  onEventChange(): void {
    // No jpsi results endpoint exists yet (see class doc comment): switching events only
    // reshuffles the sample data, within a small, seeded margin, so the page visibly reacts
    // the way it will once real per-event submissions are wired in.
    this.recalculate();
  }

  onReload(): void {
    this.recalculate();
  }

  private recalculate(): void {
    const signals = this.jitteredSignals();
    const allRows = this.raaService.computeResults(signals);
    // Only the Pb-Pb centrality classes are shown to the teacher - pp/p-Pb signals are still
    // accepted and computed above (so nothing breaks once real submissions include them), but
    // R_AA always compares against the fixed reference yield, never a student's own pp/p-Pb row,
    // so displaying that row here would be misleading. See "Why a fixed pp reference?" in
    // `ci/docs/jpsi-analysis-teacher.md`.
    this.rows = allRows.filter((row) => isPbPbCentrality(row.system));
    this.plotData = this.raaService.toPlotEntries(this.rows);
  }

  private jitteredSignals(): JpsiRawSignal[] {
    if (this.eventID === null) {
      return SAMPLE_SIGNALS.slice();
    }

    return SAMPLE_SIGNALS.map((base, index) => {
      const jitter = 0.85 + 0.3 * seededRandom(this.eventID! * 1000 + index);
      const signal = Math.max(0, Math.round(base.signal * jitter));
      return {
        ...base,
        signal,
        signalError: Math.round(Math.sqrt(signal)),
      };
    });
  }
}
