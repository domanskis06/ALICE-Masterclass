import {
  AfterViewInit,
  Component,
  DestroyRef,
  inject,
  OnDestroy,
  OnInit,
  Type,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslateService } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';

import { LSAData } from '../shared/models';

import { InstructionsProvider } from '../shared/interfaces';
import { InstructionsComponent } from './instructions/instructions.component';

import { StrangenessDataService } from '../services/strangeness-data.service';
import { ParticleType, CollisionType, CentralityType, LargeScaleAnalysisResultsEntry } from '../shared/services/api.service';
import { FitService } from '../shared/services/fit.service';
import { LsaTutorialService } from './lsa-tutorial/lsa-tutorial.service';
import { LsaTutorialWelcomeDialogComponent } from './lsa-tutorial/lsa-tutorial-welcome-dialog.component';

export interface OpenHistogramEntry {
  particle: ParticleType;
  collision: CollisionType;
  centrality: CentralityType;
}

export interface FitHistogramEntry {
  signalFitRange: [number, number]
  backgroundFitRange: [number, number]
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

  loading: boolean = false;

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
          // Only permanently dismiss when the user explicitly clicks Skip.
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
        this.range = [data.xmin, data.xmax];

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

  onAddFitResult(): void {
    let key;

    if (this.collision == 'pp') {
      key = `${this.particle}_${this.collision}`;
    } else {
      key = `${this.particle}_${this.collision}_${this.centrality}`;
    }

    const value: LargeScaleAnalysisResultsEntry = {particle: this.particle, collision: this.collision, centrality: this.centrality, signal: this.fitService.result.signal};

    this.dataService.addLargeScaleAnalysisResult(key, value);
    this.lsaTutorial.notifyAcceptClicked();
  }

  onRangeChange(event: [number, number]): void {
    this.range = event;
  }

  onUploadResults() {
    let uploadingTranslation = '', completedTranslation = '';

    forkJoin([ this.translateService.get('PASSWORD.UPLOADING'), this.translateService.get('PASSWORD.COMPLETED') ])
      .subscribe((res) => {
        uploadingTranslation = res[0];
        completedTranslation = res[1];

        this.snackBar.open(uploadingTranslation, null, {duration: this.dataService.DATA_UPLOAD_COMPLETED_DURATION});

        this.dataService.submitLargeScaleAnalysisResults().subscribe(() => {
          this.snackBar.open(completedTranslation, null, {duration: this.dataService.DATA_UPLOAD_COMPLETED_DURATION});
        });
    });
  }

}
