import { Injectable } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import { InstructionsDialogComponent } from '../../instructions-dialog/instructions-dialog.component';
import { InstructionsComponent } from '../instructions/instructions.component';

const SELECTOR_DATASET = '#jpsi-tour-dataset';
const SELECTOR_QUICK_ANALYSIS = '#jpsi-tour-quick-analysis';
const SELECTOR_HEATMAP = '#jpsi-tour-heatmap';
const SELECTOR_SERIES_TOGGLES = '#jpsi-tour-series-toggles';
const SELECTOR_SUBTRACT = '#jpsi-tour-subtract-button';
/** Chart + signal-window slider together (wider than the slider alone). */
const SELECTOR_MASS_SIGNAL = '#jpsi-tour-mass-signal';
const SELECTOR_ACCEPT = '#jpsi-tour-accept-button';
const SELECTOR_COMPARE = '#jpsi-tour-compare';

const PID_ELECTRON_BANDS_IMG = 'assets/exercises/jpsi/pid-electron-bands.png';

/**
 * Guided tour of the J/psi exercise, built on driver.js like the strangeness tutorials.
 *
 * Steps that depend on an element which only exists in one panel mode are advanced by the
 * host through the notify* hooks, so the tour follows what the student actually does
 * rather than assuming they pressed Next.
 */
@Injectable()
export class JpsiTutorialService {
  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  private dismissedThisSession = false;

  private stepIndexQuickAnalysis = -1;
  private stepIndexCuts = -1;
  private stepIndexSubtract = -1;
  private stepIndexAccept = -1;
  /** Second collision-system step (switch to p-Pb), not the intro pick. */
  private stepIndexDatasetSwitch = -1;

  constructor(
    private readonly translate: TranslateService,
    private readonly dialog: MatDialog
  ) {}

  isActive(): boolean {
    return this.driverInstance?.isActive() ?? false;
  }

  dismiss(): void {
    this.dismissedThisSession = true;
  }

  get dismissed(): boolean {
    return this.dismissedThisSession;
  }

  clearDismissFlag(): void {
    this.dismissedThisSession = false;
  }

  /** Same help dialog as the top-bar question mark (`NavComponent`). */
  openInstructionsDialog(): void {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.data = { component: InstructionsComponent };

    document.body.classList.add('jpsi-tour-instructions-open');
    const dialogRef = this.dialog.open(InstructionsDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(() => {
      document.body.classList.remove('jpsi-tour-instructions-open');
    });
  }

  startMainTour(): void {
    this.destroyDriver(true);

    const steps = this.buildSteps();
    const t = (key: string) => this.t(key);

    const instance = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => {
        // Clicking the overlay must not close the tour by accident.
      },
      overlayOpacity: 0.72,
      overlayColor: '#1a1a1a',
      stagePadding: 8,
      popoverClass: 'jpsi-driver-popover',
      nextBtnText: t('NEXT'),
      prevBtnText: t('PREVIOUS'),
      doneBtnText: t('DONE'),
      showButtons: ['next', 'previous', 'close'],
      steps,
      onDestroyed: () => {
        if (!this.suppressDismissOnDestroy) {
          this.dismiss();
        }
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
      },
    });

    this.driverInstance = instance;
    setTimeout(() => instance.drive(0), 0);
  }

  /** @param suppressDismiss pass true on route teardown so the tour can be replayed. */
  destroyDriver(suppressDismiss = false): void {
    this.suppressDismissOnDestroy = suppressDismiss;
    this.driverInstance?.destroy();
    this.driverInstance = null;
  }

  /** Advances as soon as Analyse is pressed, without waiting for the run to finish. */
  notifyRunStarted(): void {
    this.advanceFrom(this.stepIndexQuickAnalysis);
  }

  notifyCutsChanged(): void {
    this.advanceFrom(this.stepIndexCuts);
  }

  notifySubtracted(): void {
    this.advanceFrom(this.stepIndexSubtract);
  }

  notifyAccepted(): void {
    this.advanceFrom(this.stepIndexAccept);
  }

  notifyDatasetSwitched(): void {
    this.advanceFrom(this.stepIndexDatasetSwitch);
  }

  private advanceFrom(stepIndex: number): void {
    if (stepIndex < 0 || !this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== stepIndex) {
      return;
    }
    // The DOM often changes with the action itself, so refresh before moving on.
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  private t(key: string): string {
    return this.translate.instant(`JPSI.TUTORIAL.${key}`);
  }

  private buildCutsDescription(): string {
    const body = this.t('STEP_CUTS_BODY');
    const alt = this.escapeHtml(this.translate.instant('JPSI.INSTRUCTIONS.PID_IMG_ALT'));
    return `${body}<img class="jpsi-tutorial-pid-img" src="${PID_ELECTRON_BANDS_IMG}" alt="${alt}" />`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  private buildSteps(): DriveStep[] {
    const t = (key: string) => this.t(key);
    const steps: DriveStep[] = [];

    const push = (step: DriveStep): number => {
      steps.push(step);
      return steps.length - 1;
    };

    push({
      element: SELECTOR_DATASET,
      popover: {
        title: t('STEP_START_DATASET_TITLE'),
        description: t('STEP_START_DATASET_BODY'),
        side: 'bottom',
        align: 'start',
      },
    });

    this.stepIndexQuickAnalysis = push({
      element: SELECTOR_QUICK_ANALYSIS,
      popover: {
        title: t('STEP_RUN_TITLE'),
        description: t('STEP_RUN_BODY'),
        side: 'bottom',
        align: 'start',
      },
    });

    // Same highlight target as the cuts step so the stage does not shrink between them.
    push({
      element: SELECTOR_HEATMAP,
      popover: {
        title: t('STEP_HEATMAP_TITLE'),
        description: t('STEP_HEATMAP_BODY'),
        side: 'right',
        align: 'start',
      },
    });

    this.stepIndexCuts = push({
      element: SELECTOR_HEATMAP,
      popover: {
        title: t('STEP_CUTS_TITLE'),
        description: this.buildCutsDescription(),
        side: 'right',
        align: 'start',
      },
    });

    push({
      element: SELECTOR_SERIES_TOGGLES,
      popover: {
        title: t('STEP_SERIES_TITLE'),
        description: t('STEP_SERIES_BODY'),
        side: 'bottom',
        align: 'start',
      },
    });

    this.stepIndexSubtract = push({
      element: SELECTOR_SUBTRACT,
      popover: {
        title: t('STEP_SUBTRACT_TITLE'),
        description: t('STEP_SUBTRACT_BODY'),
        side: 'top',
        align: 'start',
      },
    });

    push({
      element: SELECTOR_MASS_SIGNAL,
      popover: {
        title: t('STEP_WINDOW_TITLE'),
        description: t('STEP_WINDOW_BODY'),
        side: 'left',
        align: 'start',
      },
    });

    this.stepIndexAccept = push({
      element: SELECTOR_ACCEPT,
      popover: {
        title: t('STEP_ACCEPT_TITLE'),
        description: t('STEP_ACCEPT_BODY'),
        side: 'top',
        align: 'start',
      },
    });

    this.stepIndexDatasetSwitch = push({
      element: SELECTOR_DATASET,
      popover: {
        title: t('STEP_DATASET_TITLE'),
        description: t('STEP_DATASET_BODY'),
        side: 'bottom',
        align: 'start',
      },
    });

    push({
      element: SELECTOR_COMPARE,
      popover: {
        title: t('STEP_COMPARE_TITLE'),
        description: t('STEP_COMPARE_BODY'),
        side: 'top',
        align: 'start',
      },
    });

    return steps;
  }
}
