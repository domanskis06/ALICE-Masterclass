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

import { InstructionsProvider } from '../shared/interfaces';
import { FitService } from '../shared/services/fit.service';
import { InstructionsComponent } from './instructions/instructions.component';
import {
  DatasetDescriptor,
  DatasetId,
  DEFAULT_PID_CUT,
  MASS_BINS,
  PidCut,
  SummaryRow,
} from './models/jpsi.models';
import {
  CollisionSystemId,
  isPbPbCentralityId,
  PbPbCentralityDescriptor,
  PbPbCentralityId,
  PbPbYieldRow,
  PBPB_CENTRALITY_DESCRIPTORS,
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

const WELCOME_SEEN_STORAGE_KEY = 'alice_mc_jpsi_welcomeSeen_v1';
const SNACKBAR_DURATION_MS = 3000;

@Component({
  selector: 'app-jpsi-analysis',
  templateUrl: './jpsi-analysis.component.html',
  styleUrls: ['./jpsi-analysis.component.scss'],
  standalone: false,
  // Own FitService instance: both StrangenessLargeScaleAnalysisModule and JpsiAnalysisModule
  // are eagerly loaded into AppModule, so a module-level FitService provider would collapse
  // into one app-wide singleton shared with LSA. Component-level providers avoid that.
  providers: [FitService, PbPbMinvStateService],
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

  private readonly destroyRef = inject(DestroyRef);

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
    private readonly changeDetector: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
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

    this.maybeShowWelcome();
  }

  ngOnDestroy(): void {
    this.quickAnalysis.cancel();
    this.tutorial.destroyDriver(true);
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

  get ppRow(): SummaryRow | null {
    return this.state.stateOf('pp').tableRow;
  }

  get pPbRow(): SummaryRow | null {
    return this.state.stateOf('pPb').tableRow;
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

  // --- Toolbar --------------------------------------------------------------

  onDatasetChange(id: CollisionSystemId): void {
    if (this.quickAnalysis.isRunning) {
      return;
    }
    this.activeCollisionSystem = id;
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

  onToggleSeries(series: 'unlike' | 'posPos' | 'negNeg'): void {
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

  onAcceptResult(): void {
    this.state.acceptResult();
    this.tutorial.notifyAccepted();
  }

  // --- Pb-Pb Minv panel -------------------------------------------------------

  onSubtractPbPb(): void {
    this.pbPbState.subtractBackground();
  }

  onShowComponentsPbPb(): void {
    this.pbPbState.showComponents();
  }

  onAcceptPbPbResult(): void {
    this.pbPbState.acceptResult();
  }

  onRemovePbPbResult(id: PbPbCentralityId): void {
    this.pbPbState.removeResult(id);
  }

  // --- Upload ---------------------------------------------------------------

  /**
   * The J/psi backend does not exist yet, so this deliberately performs no request. The
   * button still follows the workshop pattern and stays disabled without a session.
   */
  onUploadResults(): void {
    this.notify('JPSI.RESULTS.UPLOAD_SOON');
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
    if (sessionStorage.getItem(WELCOME_SEEN_STORAGE_KEY) === '1') {
      return;
    }
    sessionStorage.setItem(WELCOME_SEEN_STORAGE_KEY, '1');

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
        }
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
