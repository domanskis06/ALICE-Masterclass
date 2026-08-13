import {
  AfterViewInit,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
  Type,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { FitHistogramEntry, LSAData } from '../shared/models';

import { InstructionsProvider } from '../shared/interfaces';
import { InstructionsComponent } from './instructions/instructions.component';

import { StrangenessDataService } from '../services/strangeness-data.service';
import {
  LsaEnhancementService,
  StrangenessEnhancementEntry,
  StrangenessEnhancementPlotEntry,
} from '../services/lsa-enhancement.service';
import { ParticleType, CollisionType, CentralityType, LargeScaleAnalysisResultsEntry } from '../shared/services/api.service';
import { DemoConfig } from '../shared/demo/demo-config.service';
import { FitService } from '../shared/services/fit.service';
import { LsaTutorialService } from './lsa-tutorial/lsa-tutorial.service';
import { LsaTutorialWelcomeDialogComponent } from './lsa-tutorial/lsa-tutorial-welcome-dialog.component';
import { FitSelectorComponent } from '../shared/components/fit-selector/fit-selector.component';

export interface OpenHistogramEntry {
  particle: ParticleType;
  collision: CollisionType;
  centrality: CentralityType;
}

export interface AddToHistogramEntry {
  signal: number;
}

@Component({
    selector: 'app-strangeness-large-scale-analysis',
    templateUrl: './strangeness-large-scale-analysis.component.html',
    styleUrls: ['./strangeness-large-scale-analysis.component.scss'],
    standalone: false
})
export class StrangenessLargeScaleAnalysisComponent implements OnInit, AfterViewInit, OnDestroy, InstructionsProvider {
  private readonly destroyRef = inject(DestroyRef);

  /** Ensures we only attach one welcome dialog per component instance. */
  private welcomeDialogOpened = false;
  private destroyed = false;

  instructionsComponent: Type<any> = InstructionsComponent;

  private particle: ParticleType = null;
  private collision: CollisionType = null;
  private centrality: CentralityType = null;

  range: [number, number] = [0, 1];

  /** Bumped on each successful histogram open so fit sliders re-init to the full domain. */
  domainResetToken = 0;

  loading: boolean = false;

  /** Demo shows the enhancement summary instead of the per-fit results table. */
  protected readonly demo = inject(DemoConfig).enabled;
  private readonly enhancementService = inject(LsaEnhancementService);

  enhancementRows: StrangenessEnhancementEntry[] = [];
  enhancementPlotData: StrangenessEnhancementPlotEntry[] = [];
  enhancementXDomain: [number, number] = [0, 1];

  get canUndoFitResult(): boolean {
    return this.dataService.canUndoLargeScaleAnalysisResult;
  }

  @ViewChild('fitSelector')
  private fitSelector: FitSelectorComponent | undefined;

  constructor(
    public dataService: StrangenessDataService,
    private fitService: FitService,
    private translateService: TranslateService,
    private snackBar: MatSnackBar,
    private readonly dialog: MatDialog,
    private readonly lsaTutorial: LsaTutorialService,
  ) {}

  ngOnInit(): void {
    this.fitService.result = null;
    this.fitService.data.data = [];

    if (this.demo) {
      this.enhancementXDomain = this.enhancementService.participantsDomain();
      // Results may already exist (restored from this browser).
      this.refreshEnhancement();
    }
  }

  ngAfterViewInit(): void {
    // Defer past the current CD cycle so MatDialog overlay attaches (first load / F5 / route enter).
    queueMicrotask(() => {
      if (!this.destroyed) {
        this.tryOpenTutorialWelcome();
      }
    });
  }

  private tryOpenTutorialWelcome(): void {
    if (this.destroyed || this.welcomeDialogOpened) {
      return;
    }
    if (!this.lsaTutorial.shouldShow()) {
      return;
    }
    this.welcomeDialogOpened = true;
    this.dialog
      .open(LsaTutorialWelcomeDialogComponent, {
        width: '560px',
        autoFocus: true,
        disableClose: true,
        hasBackdrop: true,
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((start: boolean | undefined) => {
        if (start === true) {
          this.lsaTutorial.startMainTour();
        } else if (start === false) {
          // Skip for this page load only (resets on refresh).
          this.lsaTutorial.dismiss();
        }
        // undefined = dialog closed by some other means — do not dismiss.
      });
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.lsaTutorial.destroyDriver(true);
  }

  private loadHistogram() {

    let elms: Array<string>;

    if (this.collision == 'pp') {
      elms = [this.collision, this.particle];
    } else {
      elms = [this.collision, this.centrality, this.particle];
    }

    const filename = elms.join('_');

    return this.dataService.getHistogram(filename);
  }

  onOpenHistogram(event: OpenHistogramEntry) {
    this.particle = event.particle;
    this.centrality = event.centrality;
    this.collision = event.collision;

    this.loading = true;

    this.loadHistogram().subscribe(
      (data: LSAData) => {
        this.fitService.data = data;
        this.domainResetToken += 1;
        this.range = [data.xmin, data.xmax];
        this.fitService.signalFitRange = [data.xmin, data.xmax];
        this.fitService.backgroundFitRange = [data.xmin, data.xmax];

        //Fitting Gauss function requires a sensible starting point
        if (this.particle == ParticleType.KAON) {
          this.fitService.aGaussHint = [10.730, 0.498, 0.004];
        } else {
          this.fitService.aGaussHint = [2.461, 1.116, 0.002];
        }

        this.loading = false;
        this.lsaTutorial.notifyHistogramReady();
      },
      (error: HttpErrorResponse) => {
      }
    );
  }

  onTryFit(event: FitHistogramEntry): void {
    this.fitService.backgroundFitRange = event.backgroundFitRange;
    this.fitService.signalFitRange = event.signalFitRange;

    this.fitService.fit();
    this.lsaTutorial.notifyFitClicked();
  }

  onClearFit(): void {
    this.fitService.clearFit();
  }

  onResetRange(): void {
    this.fitSelector?.resetRangesToAxisExtremes();
  }

  onAddFitResult(): void {
    const key = this.resultKey(this.particle, this.collision, this.centrality);

    const value: LargeScaleAnalysisResultsEntry = {particle: this.particle, collision: this.collision, centrality: this.centrality, signal: this.fitService.result.signal};

    this.dataService.addLargeScaleAnalysisResult(key, value);
    this.refreshEnhancement();
    this.lsaTutorial.notifyAcceptClicked();
  }

  /** Demo: revert the most recently accepted fit (last in, first out). */
  onUndoFitResult(): void {
    if (this.dataService.undoLastLargeScaleAnalysisResult()) {
      this.refreshEnhancement();
    }
  }

  onRemoveResult(entry: LargeScaleAnalysisResultsEntry): void {
    const key = this.resultKey(entry.particle, entry.collision, entry.centrality);
    this.dataService.removeLargeScaleAnalysisResult(key);
    this.refreshEnhancement();
  }

  /** Recompute yields and enhancement from the accepted fits (demo only). */
  private refreshEnhancement(): void {
    if (!this.demo) {
      return;
    }
    this.enhancementRows = this.enhancementService.buildRows(this.dataService.largeScaleAnalysisResults);
    this.enhancementPlotData = this.enhancementService.buildPlotData(this.enhancementRows);
  }

  private resultKey(particle: ParticleType, collision: CollisionType, centrality: CentralityType): string {
    if (collision == 'pp') {
      return `${particle}_${collision}`;
    }
    return `${particle}_${collision}_${centrality}`;
  }

  onRangeChange(event: [number, number]): void {
    // New tuple so the fit-selector @Input setter runs and clamps selections.
    this.range = [event[0], event[1]];
  }

  onUploadResults() {
    let uploadingTranslation = '', completedTranslation = '', errorTranslation = '';

    forkJoin([
      this.translateService.get('PASSWORD.UPLOADING'),
      this.translateService.get('PASSWORD.COMPLETED'),
      this.translateService.get('PASSWORD.UPLOAD_ERROR'),
    ])
      .subscribe((res) => {
        uploadingTranslation = res[0];
        completedTranslation = res[1];
        errorTranslation = res[2];

        this.snackBar.open(uploadingTranslation, null, {duration: this.dataService.DATA_UPLOAD_COMPLETED_DURATION});

        this.dataService.submitLargeScaleAnalysisResults().subscribe({
          next: () => this.snackBar.open(completedTranslation, null, {duration: this.dataService.DATA_UPLOAD_COMPLETED_DURATION}),
          // A 403 here means the session's event kind isn't `strangeness` (see uploadButtonDisabled
          // in ResultsComponent) - surface it instead of failing silently.
          error: () => this.snackBar.open(errorTranslation, null, {duration: this.dataService.DATA_UPLOAD_COMPLETED_DURATION}),
        });
    });
  }

}
