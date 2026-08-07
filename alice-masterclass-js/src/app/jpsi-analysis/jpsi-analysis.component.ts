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
import { InstructionsComponent } from './instructions/instructions.component';
import {
  DatasetDescriptor,
  DatasetId,
  MASS_BINS,
  PidCut,
  SummaryRow,
} from './models/jpsi.models';
import { JpsiAnalysisStateService } from './services/jpsi-analysis-state.service';
import { JpsiDataService } from './services/jpsi-data.service';
import {
  JpsiQuickAnalysisService,
  QuickAnalysisPreset,
} from './services/jpsi-quick-analysis.service';
import { JpsiSignalService } from './services/jpsi-signal.service';
import { JpsiTutorialService } from './services/jpsi-tutorial.service';
import { JpsiWelcomeDialogComponent } from './welcome/jpsi-welcome-dialog.component';

const WELCOME_SEEN_STORAGE_KEY = 'alice_mc_jpsi_welcomeSeen_v1';
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

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly data: JpsiDataService,
    public readonly state: JpsiAnalysisStateService,
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

  // --- Toolbar --------------------------------------------------------------

  onDatasetChange(datasetId: DatasetId): void {
    if (this.quickAnalysis.isRunning) {
      return;
    }
    this.state.selectDataset(datasetId);
    this.tutorial.notifyDatasetSwitched();
  }

  async onRunAnalysis(preset: QuickAnalysisPreset): Promise<void> {
    try {
      await this.quickAnalysis.run(preset, this.totalEvents);
      this.tutorial.notifyRunFinished();
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

  onCutChange(cut: PidCut): void {
    this.state.setCut(cut);
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
