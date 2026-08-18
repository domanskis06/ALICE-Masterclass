import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { InstructionsDialogComponent } from '../../instructions-dialog/instructions-dialog.component';
import {
  PID_ELECTRON_BANDS_IMG,
  PidReferenceDialogComponent,
} from '../components/pid-reference-dialog/pid-reference-dialog.component';
import { InstructionsComponent } from '../instructions/instructions.component';
import { CollisionSystemId, isPbPbCentralityId } from '../models/pbpb-minv.models';

const SELECTOR_DATASET = '#jpsi-tour-dataset';
const SELECTOR_QUICK_ANALYSIS = '#jpsi-tour-quick-analysis';
const SELECTOR_HEATMAP = '#jpsi-tour-heatmap';
/**
 * Whole invariant-mass card: chart, series toggles / sliders, and the action
 * row (Subtract / Fit / Accept). Consecutive mass steps share this target so
 * the driver.js stage does not jump between a tiny button and the chart, and
 * so Fit / Subtract stay clickable inside the highlight.
 */
const SELECTOR_MASS_PANEL = '#jpsi-tour-mass-panel';
const SELECTOR_RESULTS = '#jpsi-tour-results';
/** Demo build only — replaces `SELECTOR_RESULTS` as the tour's last stop(s). */
const SELECTOR_RESULTS_DEMO = '#jpsi-demo-results-table';
const SELECTOR_RAA_PLOT = '#jpsi-demo-raa-plot';

/**
 * Guided tour of the J/psi exercise, built on driver.js like the strangeness tutorials.
 *
 * Steps that depend on an element which only exists in one panel mode are advanced by the
 * host through the notify* hooks, so the tour follows what the student actually does
 * rather than assuming they pressed Next.
 */
@Injectable()
export class JpsiTutorialService {
  private readonly demo = inject(DemoConfig).enabled;

  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;

  private stepIndexQuickAnalysis = -1;
  private stepIndexCuts = -1;
  private stepIndexSubtract = -1;
  private stepIndexAccept = -1;
  /** Second collision-system step (switch to p-Pb), not the intro pick. */
  private stepIndexDatasetSwitch = -1;

  /**
   * Every step's target element (PID heatmap, quick analysis, series toggles...) only exists
   * in the pp/p-Pb layout — Pb-Pb's own view is a single Minv panel with no heatmap or cuts —
   * so the tour cannot run while a Pb-Pb centrality is on screen. Mirrored here by the host
   * (`JpsiAnalysisComponent.onDatasetChange`) so `startMainTour` knows whether it must hop back
   * to pp first; Pb-Pb's analysis is a subset of pp's anyway (same fit, no PID step), so replaying
   * the pp tour there loses nothing.
   */
  private activeCollisionSystem: CollisionSystemId = 'pp';
  private viewSwitcher: (() => void) | null = null;

  constructor(
    private readonly translate: TranslateService,
    private readonly dialog: MatDialog
  ) {}

  isActive(): boolean {
    return this.driverInstance?.isActive() ?? false;
  }

  /**
   * Whether to auto-open the Skip / Start welcome dialog on module entry.
   * Only the standalone demo offers this; workshop apps start the tour from Help.
   */
  shouldShow(): boolean {
    return this.demo && !this.dismissedThisSession;
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

  /** Called by the host whenever the toolbar's collision-system selector changes. */
  setActiveCollisionSystem(id: CollisionSystemId): void {
    this.activeCollisionSystem = id;
  }

  /** Registered once by the host: switches the toolbar back to pp. */
  registerViewSwitcher(switchToPp: () => void): void {
    this.viewSwitcher = switchToPp;
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

  /** Full-size PID reference plot (from "How to select a range?"). */
  openPidReferenceDialog(): void {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.maxWidth = '95vw';
    dialogConfig.autoFocus = false;
    dialogConfig.panelClass = 'jpsi-pid-reference-dialog-panel';

    document.body.classList.add('jpsi-tour-instructions-open');
    const dialogRef = this.dialog.open(PidReferenceDialogComponent, dialogConfig);
    dialogRef.afterClosed().subscribe(() => {
      document.body.classList.remove('jpsi-tour-instructions-open');
    });
  }

  startMainTour(): void {
    this.destroyDriver(true);

    // The tour's steps only exist in the pp/p-Pb layout (see `activeCollisionSystem` doc);
    // hop back to pp first so `buildSteps()` below finds every element it targets. The switch
    // itself updates `activeCollisionSystem` synchronously, so by the time this returns the
    // pp view is already what the next change-detection pass will render.
    if (isPbPbCentralityId(this.activeCollisionSystem)) {
      this.viewSwitcher?.();
    }

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
    // Wait a tick for Angular to swap explore ↔ subtracted controls (or update
    // the results table) before remeasuring the shared mass-panel stage.
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 80);
  }

  /** Remeasure the active stage after layout settles (sliders, fit metrics, scroll). */
  private refreshStageSoon(): void {
    setTimeout(() => this.driverInstance?.refresh(), 80);
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

    // Steps 5–8 share the mass card so the spotlight stays put while the student
    // toggles series, subtracts, fits, and accepts — and the bottom buttons stay
    // inside the interactive stage.
    push({
      element: SELECTOR_MASS_PANEL,
      disableActiveInteraction: false,
      popover: {
        title: t('STEP_SERIES_TITLE'),
        description: t('STEP_SERIES_BODY'),
        side: 'left',
        align: 'start',
      },
    });

    this.stepIndexSubtract = push({
      element: SELECTOR_MASS_PANEL,
      disableActiveInteraction: false,
      popover: {
        title: t('STEP_SUBTRACT_TITLE'),
        description: t('STEP_SUBTRACT_BODY'),
        side: 'left',
        align: 'start',
      },
    });

    push({
      element: SELECTOR_MASS_PANEL,
      disableActiveInteraction: false,
      popover: {
        title: t('STEP_WINDOW_TITLE'),
        description: t('STEP_WINDOW_BODY'),
        side: 'left',
        align: 'start',
      },
      // After Subtract the card grows (sliders + Fit row); remeasure so the stage
      // still wraps the whole panel and Fit stays inside the interactive cutout.
      onHighlighted: () => this.refreshStageSoon(),
    });

    this.stepIndexAccept = push({
      element: SELECTOR_MASS_PANEL,
      disableActiveInteraction: false,
      popover: {
        title: t('STEP_ACCEPT_TITLE'),
        description: t('STEP_ACCEPT_BODY'),
        side: 'left',
        align: 'start',
      },
      onHighlighted: () => this.refreshStageSoon(),
    });

    if (this.demo) {
      // Demo build: the ported Results table / R_AA plot replace the workshop results table.
      push({
        element: SELECTOR_RESULTS_DEMO,
        popover: {
          title: t('STEP_RESULTS_TITLE'),
          description: t('STEP_RESULTS_BODY'),
          side: 'top',
          align: 'start',
        },
        onHighlighted: () => this.refreshStageSoon(),
      });
      push({
        element: SELECTOR_RAA_PLOT,
        popover: {
          title: t('STEP_RAA_PLOT_TITLE'),
          description: t('STEP_RAA_PLOT_BODY'),
          side: 'top',
          align: 'start',
        },
        onHighlighted: () => this.refreshStageSoon(),
      });
    } else {
      push({
        element: SELECTOR_RESULTS,
        popover: {
          title: t('STEP_RESULTS_TITLE'),
          description: t('STEP_RESULTS_BODY'),
          side: 'top',
          align: 'start',
        },
        onHighlighted: () => this.refreshStageSoon(),
      });
    }

    this.stepIndexDatasetSwitch = push({
      element: SELECTOR_DATASET,
      popover: {
        title: t('STEP_DATASET_TITLE'),
        description: t('STEP_DATASET_BODY'),
        side: 'bottom',
        align: 'start',
      },
    });

    return steps;
  }
}
