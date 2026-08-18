import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  OnDestroy,
  OnInit,
  Type,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';

import { DemoConfig } from '../shared/demo/demo-config.service';
import { ApiService, JpsiSignalEntry } from '../shared/services/api.service';
import { InstructionsProvider } from '../shared/interfaces';
import { JpsiRaaPlotEntry, JpsiRaaResultRow, JpsiRaaService } from '../services/jpsi-raa.service';
import { SeriesEntry, SERIES_COLOURS } from './components/mass-panel/mass-panel.component';
import { InstructionsComponent } from './instructions/instructions.component';
import {
  DatasetDescriptor,
  DatasetId,
  DEFAULT_PID_CUT,
  DEFAULT_SIGNAL_WINDOW,
  MASS_BINS,
  PidCut,
  SeriesVisibility,
  SIGNAL_WINDOW_WIDTH,
  SummaryRow,
} from './models/jpsi.models';
import {
  clampedResidual,
  CollisionSystemId,
  defaultPbPbSignalWindow,
  isPbPbCentralityId,
  PbPbCentralityDescriptor,
  PbPbCentralityId,
  PbPbYieldRow,
  PBPB_CENTRALITY_DESCRIPTORS,
  PBPB_SIGNAL_WINDOW_WIDTH,
} from './models/pbpb-minv.models';
import { JpsiAnalysisStateService } from './services/jpsi-analysis-state.service';
import { JpsiDataService } from './services/jpsi-data.service';
import {
  JpsiQuickAnalysisService,
  QuickAnalysisPreset,
} from './services/jpsi-quick-analysis.service';
import { JpsiSignalService } from './services/jpsi-signal.service';
import { JpsiTutorialService } from './services/jpsi-tutorial.service';
import { PbPbMinvStateService } from './services/pbpb-minv-state.service';
import { JpsiWelcomeDialogComponent } from './welcome/jpsi-welcome-dialog.component';

const SNACKBAR_DURATION_MS = 3000;

@Component({
  selector: 'app-jpsi-analysis',
  templateUrl: './jpsi-analysis.component.html',
  styleUrls: ['./jpsi-analysis.component.scss'],
  standalone: false,
})
export class JpsiAnalysisComponent implements OnInit, OnDestroy, InstructionsProvider {
  instructionsComponent: Type<unknown> = InstructionsComponent;

  datasets: DatasetDescriptor[] = [];

  /** Bumped on every state change so the chart children know they must redraw. */
  revision = 0;

  residual: Float64Array = new Float64Array(MASS_BINS);
  background: Float64Array = new Float64Array(MASS_BINS);

  /** Live PID cut while sliders move; mass rebuilds only after Accept selected range. */
  previewCut: PidCut = { ...DEFAULT_PID_CUT };

  /** Which branch of the layout is shown; independent of (and persists across) both sub-states. */
  activeCollisionSystem: CollisionSystemId = 'pp';

  readonly pbPbCentralityDescriptors: readonly PbPbCentralityDescriptor[] = PBPB_CENTRALITY_DESCRIPTORS;

  /** Purely local display preference for the Pb-Pb panel; never persisted per centrality. */
  pbPbVisibility: SeriesVisibility = { unlike: true, like: true };

  /**
   * Fixed signal-window widths/default positions the mass panel locks its slider to — see
   * `SIGNAL_WINDOW_WIDTH`/`PBPB_SIGNAL_WINDOW_WIDTH` for why the width is fixed at all.
   */
  readonly signalWindowWidth = SIGNAL_WINDOW_WIDTH;
  readonly defaultSignalWindow = DEFAULT_SIGNAL_WINDOW;
  readonly pbPbSignalWindowWidth = PBPB_SIGNAL_WINDOW_WIDTH;

  get pbPbDefaultSignalWindow(): [number, number] {
    return defaultPbPbSignalWindow(this.pbPbState.state.histogram?.xmin ?? 0);
  }

  private readonly destroyRef = inject(DestroyRef);

  /** Demo build only: gates the ported Results table / R_AA plot in place of the upload flow. */
  readonly demo = inject(DemoConfig).enabled;
  private readonly raaService = inject(JpsiRaaService);

  raaRows: JpsiRaaResultRow[] = [];
  raaPlotData: JpsiRaaPlotEntry[] = [];
  readonly raaParticipantsDomain: [number, number] = this.raaService.participantsDomain();

  constructor(
    private readonly data: JpsiDataService,
    public readonly state: JpsiAnalysisStateService,
    public readonly pbPbState: PbPbMinvStateService,
    public readonly quickAnalysis: JpsiQuickAnalysisService,
    private readonly signal: JpsiSignalService,
    private readonly tutorial: JpsiTutorialService,
    private readonly translate: TranslateService,
    private readonly snackBar: MatSnackBar,
    private readonly dialog: MatDialog,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly apiService: ApiService
  ) {}

  ngOnInit(): void {
    this.tutorial.registerViewSwitcher(() => this.onDatasetChange('pp'));

    this.state.changes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onStateChanged());

    this.pbPbState.changes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.changeDetector.markForCheck());

    this.data
      .getManifest()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (manifest) => {
          this.datasets = manifest.datasets;
          this.changeDetector.markForCheck();
        },
        error: () => this.notify('JPSI.ERRORS.MANIFEST'),
      });

    if (this.demo) {
      // Picks up anything PbPbMinvStateService already restored from DemoResultsStore.
      this.refreshRaa();
    }

    this.maybeShowWelcome();
  }

  ngOnDestroy(): void {
    this.quickAnalysis.cancel();
    this.tutorial.destroyDriver(true);

    // Both state services live at module scope and therefore survive navigating away from this
    // route — reset their in-progress work now (accepted rows excepted) so returning to the
    // exercise starts from a clean, consistent slate instead of stale ranges/fit lines from
    // last time (see resetForNewSession() docs).
    this.state.resetForNewSession();
    this.pbPbState.resetForNewSession();
  }

  // --- Derived view state ---------------------------------------------------

  get activeDataset(): DatasetId {
    return this.state.activeDataset;
  }

  get totalEvents(): number {
    return this.datasets.find((d) => d.id === this.activeDataset)?.nEvents ?? 0;
  }

  get eventsLeft(): number {
    return Math.max(0, this.totalEvents - this.state.state.nextEventIndex);
  }

  get rows(): SummaryRow[] {
    return this.state.rows;
  }

  get hasData(): boolean {
    return this.state.state.processedCount > 0;
  }

  /** Mass panel is empty until the student accepts a PID range at least once. */
  get hasMassData(): boolean {
    return this.hasData && this.state.state.appliedCut !== null && !this.state.state.tooWideSelection;
  }

  isPublished(id: CollisionSystemId): boolean {
    return isPbPbCentralityId(id);
  }

  get pbPbRows(): PbPbYieldRow[] {
    return this.pbPbState.rows;
  }

  // --- Mass panel series (shared by the pp/p-Pb and Pb-Pb templates) --------

  get trackPrimarySeries(): SeriesEntry {
    return {
      key: 'unlike',
      colour: SERIES_COLOURS.unlike,
      values: this.state.state.mass.unlike,
      labelKey: 'JPSI.MASS.SERIES.UNLIKE',
    };
  }

  get trackSecondarySeries(): SeriesEntry[] {
    return [
      {
        key: 'posPos',
        colour: SERIES_COLOURS.posPos,
        values: this.state.state.mass.posPos,
        labelKey: 'JPSI.MASS.SERIES.POSPOS',
      },
      {
        key: 'negNeg',
        colour: SERIES_COLOURS.negNeg,
        values: this.state.state.mass.negNeg,
        labelKey: 'JPSI.MASS.SERIES.NEGNEG',
      },
    ];
  }

  get trackMergedSeries(): SeriesEntry {
    return {
      key: 'background',
      colour: SERIES_COLOURS.background,
      values: this.background,
      labelKey: 'JPSI.MASS.SERIES.BACKGROUND',
    };
  }

  get pbPbPrimarySeries(): SeriesEntry | null {
    const histogram = this.pbPbState.state.histogram;
    return histogram === null
      ? null
      : {
          key: 'unlike',
          colour: SERIES_COLOURS.unlike,
          values: histogram.unlike,
          labelKey: 'JPSI.PBPB.MINV.UNLIKE',
        };
  }

  get pbPbSecondarySeries(): SeriesEntry[] {
    const histogram = this.pbPbState.state.histogram;
    return histogram === null
      ? []
      : [
          {
            // Same "combinatorial background" yellow used in pp/p-Pb for the merged same-charge
            // series — like-sign pairs are the background here too.
            key: 'like',
            colour: SERIES_COLOURS.background,
            values: histogram.like,
            labelKey: 'JPSI.PBPB.MINV.LIKE',
          },
        ];
  }

  get pbPbResidual(): Float64Array {
    const histogram = this.pbPbState.state.histogram;
    return histogram === null ? new Float64Array(0) : clampedResidual(histogram);
  }

  onTogglePbPbSeries(key: string): void {
    this.pbPbVisibility = { ...this.pbPbVisibility, [key]: !this.pbPbVisibility[key] };
  }

  // --- Toolbar --------------------------------------------------------------

  onDatasetChange(id: CollisionSystemId): void {
    if (this.quickAnalysis.isRunning) {
      return;
    }
    this.activeCollisionSystem = id;
    this.tutorial.setActiveCollisionSystem(id);
    if (isPbPbCentralityId(id)) {
      this.pbPbState.selectCentrality(id);
    } else {
      this.pbPbState.leavePublishedView();
      this.state.selectDataset(id);
      this.tutorial.notifyDatasetSwitched();
    }
  }

  async onRunAnalysis(preset: QuickAnalysisPreset): Promise<void> {
    // Advance the tour immediately on click; do not wait for the run to finish.
    this.tutorial.notifyRunStarted();
    try {
      await this.quickAnalysis.run(preset, this.totalEvents);
    } catch {
      this.notify('JPSI.ERRORS.BATCH');
    } finally {
      this.changeDetector.markForCheck();
    }
  }

  onResetHistograms(): void {
    this.state.resetHistograms();
  }

  // --- Cuts -----------------------------------------------------------------

  onCutPreview(cut: PidCut): void {
    this.previewCut = cut;
    this.state.setDraftCut(cut);
  }

  onAcceptSelectedRange(cut: PidCut): void {
    this.previewCut = cut;
    this.state.acceptSelectedRange(cut);
    this.tutorial.notifyCutsChanged();
  }

  onResetCuts(): void {
    this.state.resetCuts();
  }

  // --- Mass panel -----------------------------------------------------------

  onToggleSeries(series: string): void {
    this.state.toggleSeries(series);
  }

  onShowBackgroundSum(show: boolean): void {
    this.state.setShowBackgroundSum(show);
  }

  onSubtract(): void {
    this.state.subtractBackground();
    this.tutorial.notifySubtracted();
  }

  onShowComponents(): void {
    this.state.showComponents();
  }

  onMassWindowChange(window: [number, number]): void {
    this.state.setMassWindow(window);
  }

  onBackgroundRangeChange(range: [number, number]): void {
    this.state.setBackgroundFitRange(range);
  }

  onFit(): void {
    this.state.runFit();
  }

  onAcceptResult(): void {
    this.state.acceptResult();
    this.tutorial.notifyAccepted();
  }

  onClearFit(): void {
    this.state.clearFit();
  }

  onRemoveResult(datasetId: DatasetId): void {
    this.state.removeResult(datasetId);
  }

  // --- Pb-Pb Minv panel -------------------------------------------------------

  onSubtractPbPb(): void {
    this.pbPbState.subtractBackground();
  }

  onShowComponentsPbPb(): void {
    this.pbPbState.showComponents();
  }

  onPbPbMassWindowChange(window: [number, number]): void {
    this.pbPbState.setMassWindow(window);
  }

  onPbPbBackgroundRangeChange(range: [number, number]): void {
    this.pbPbState.setBackgroundFitRange(range);
  }

  onPbPbFit(): void {
    this.pbPbState.runFit();
  }

  onAcceptPbPbResult(): void {
    this.pbPbState.acceptResult();
    if (this.demo) {
      this.refreshRaa();
    }
  }

  onRemovePbPbResult(id: PbPbCentralityId): void {
    this.pbPbState.removeResult(id);
    if (this.demo) {
      this.refreshRaa();
    }
  }

  /** Demo build only: rebuild the R_AA table/plot from the currently accepted Pb-Pb rows. */
  private refreshRaa(): void {
    const accepted = new Map(this.pbPbRows.map((row) => [row.centralityId, row]));
    this.raaRows = this.raaService.buildRows(accepted);
    this.raaPlotData = this.raaService.buildPlotEntries(this.raaRows);
  }

  onClearFitPbPb(): void {
    this.pbPbState.clearFit();
  }

  // --- Upload ---------------------------------------------------------------

  get hasPbPbResults(): boolean {
    return this.pbPbRows.length > 0;
  }

  /**
   * Uploads every accepted row - pp/p-Pb and Pb-Pb alike - as one submission. `nEvents` is only
   * attached for pp/p-Pb (`JpsiSignalEntry` doc comment): Pb-Pb event counts are a fixed,
   * published constant the teacher app already has (`PBPB_NEVENTS`), so nothing is lost by
   * omitting it here.
   */
  onUploadResults(): void {
    const entries: JpsiSignalEntry[] = [
      ...this.rows.map((row) => ({
        system: row.datasetId,
        signal: row.signal,
        signalError: row.signalError,
        nEvents: row.nEvents,
      })),
      ...this.pbPbRows.map((row) => ({
        system: row.centralityId,
        signal: row.fit.signal,
        signalError: row.fit.signalError,
      })),
    ];

    if (entries.length === 0) {
      return;
    }

    this.apiService.submitJpsiAnalysisResults(entries).subscribe({
      next: () => this.notify('JPSI.RESULTS.UPLOAD_SUCCESS'),
      error: () => this.notify('JPSI.RESULTS.UPLOAD_ERROR'),
    });
  }

  // --- Internals ------------------------------------------------------------

  private onStateChanged(): void {
    const state = this.state.state;
    this.previewCut = { ...state.cut };
    this.residual = this.signal.residualSeries(state.mass);
    this.background = this.signal.backgroundSeries(state.mass);
    this.revision++;
    this.changeDetector.markForCheck();
  }

  private maybeShowWelcome(): void {
    if (!this.tutorial.shouldShow()) {
      return;
    }

    this.dialog
      .open(JpsiWelcomeDialogComponent, {
        width: '560px',
        autoFocus: true,
        disableClose: true,
        hasBackdrop: true,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((startTour: boolean | undefined) => {
        if (startTour === true) {
          this.tutorial.startMainTour();
        } else if (startTour === false) {
          // Skip for this page load only (resets on refresh).
          this.tutorial.dismiss();
        }
        // undefined = dialog closed by some other means — do not dismiss.
      });
  }

  private notify(key: string): void {
    this.translate
      .get(key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message: string) => {
        this.snackBar.open(message, undefined, { duration: SNACKBAR_DURATION_MS });
      });
  }
}
