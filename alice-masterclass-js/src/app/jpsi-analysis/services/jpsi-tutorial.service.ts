import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

const SELECTOR_QUICK_ANALYSIS = '#jpsi-tour-quick-analysis';
const SELECTOR_HEATMAP = '#jpsi-tour-heatmap';
const SELECTOR_CUTS = '#jpsi-tour-cuts';
const SELECTOR_SERIES_TOGGLES = '#jpsi-tour-series-toggles';
const SELECTOR_SUBTRACT = '#jpsi-tour-subtract-button';
const SELECTOR_MASS_WINDOW = '#jpsi-tour-mass-window';
const SELECTOR_ACCEPT = '#jpsi-tour-accept-button';
const SELECTOR_DATASET = '#jpsi-tour-dataset';
const SELECTOR_COMPARE = '#jpsi-tour-compare';

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
  private stepIndexDataset = -1;

  constructor(private readonly translate: TranslateService) {}

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

  notifyRunFinished(): void {
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
    this.advanceFrom(this.stepIndexDataset);
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

  private buildSteps(): DriveStep[] {
    const t = (key: string) => this.t(key);

    const steps: DriveStep[] = [
      {
        element: SELECTOR_QUICK_ANALYSIS,
        popover: {
          title: t('STEP_RUN_TITLE'),
          description: t('STEP_RUN_BODY'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: SELECTOR_HEATMAP,
        popover: {
          title: t('STEP_HEATMAP_TITLE'),
          description: t('STEP_HEATMAP_BODY'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: SELECTOR_CUTS,
        popover: {
          title: t('STEP_CUTS_TITLE'),
          description: t('STEP_CUTS_BODY'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: SELECTOR_SERIES_TOGGLES,
        popover: {
          title: t('STEP_SERIES_TITLE'),
          description: t('STEP_SERIES_BODY'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: SELECTOR_SUBTRACT,
        popover: {
          title: t('STEP_SUBTRACT_TITLE'),
          description: t('STEP_SUBTRACT_BODY'),
          side: 'top',
          align: 'start',
        },
      },
      {
        element: SELECTOR_MASS_WINDOW,
        popover: {
          title: t('STEP_WINDOW_TITLE'),
          description: t('STEP_WINDOW_BODY'),
          side: 'top',
          align: 'start',
        },
      },
      {
        element: SELECTOR_ACCEPT,
        popover: {
          title: t('STEP_ACCEPT_TITLE'),
          description: t('STEP_ACCEPT_BODY'),
          side: 'top',
          align: 'start',
        },
      },
      {
        element: SELECTOR_DATASET,
        popover: {
          title: t('STEP_DATASET_TITLE'),
          description: t('STEP_DATASET_BODY'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: SELECTOR_COMPARE,
        popover: {
          title: t('STEP_COMPARE_TITLE'),
          description: t('STEP_COMPARE_BODY'),
          side: 'top',
          align: 'start',
        },
      },
    ];

    this.stepIndexQuickAnalysis = this.indexOf(steps, SELECTOR_QUICK_ANALYSIS);
    this.stepIndexCuts = this.indexOf(steps, SELECTOR_CUTS);
    this.stepIndexSubtract = this.indexOf(steps, SELECTOR_SUBTRACT);
    this.stepIndexAccept = this.indexOf(steps, SELECTOR_ACCEPT);
    this.stepIndexDataset = this.indexOf(steps, SELECTOR_DATASET);

    return steps;
  }

  private indexOf(steps: DriveStep[], selector: string): number {
    return steps.findIndex((step) => step.element === selector);
  }
}
