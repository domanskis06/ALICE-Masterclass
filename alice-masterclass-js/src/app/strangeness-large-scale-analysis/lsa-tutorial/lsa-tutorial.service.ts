import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import { FitService } from '../../shared/services/fit.service';
import {
  LSA_TUTORIAL_STEP_INDEX_ACCEPT,
  LSA_TUTORIAL_STEP_INDEX_FIT,
  LSA_TUTORIAL_STEP_INDEX_OPEN_HISTOGRAM,
} from './lsa-tutorial.constants';

/** Injected only in StrangenessLargeScaleAnalysisModule (needs FitService). */
@Injectable()
export class LsaTutorialService {
  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  private awaitingHistogramAdvance = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;

  constructor(
    private readonly fitService: FitService,
    private readonly translate: TranslateService,
  ) {}

  shouldShow(): boolean {
    return !this.dismissedThisSession;
  }

  dismiss(): void {
    this.dismissedThisSession = true;
  }

  /** For unit tests only. */
  clearDismissFlag(): void {
    this.dismissedThisSession = false;
  }

  /**
   * Call when histogram JSON has finished loading successfully while the tour
   * may be waiting on the "Open histogram" step.
   */
  notifyHistogramReady(): void {
    if (!this.awaitingHistogramAdvance || !this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== LSA_TUTORIAL_STEP_INDEX_OPEN_HISTOGRAM) {
      return;
    }
    this.awaitingHistogramAdvance = false;
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /** Call after the user runs a fit while the tour is on the Fit step. */
  notifyFitClicked(): void {
    if (!this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== LSA_TUTORIAL_STEP_INDEX_FIT) {
      return;
    }
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /** Call after the user accepts a result while the tour is on the Accept step. */
  notifyAcceptClicked(): void {
    if (!this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== LSA_TUTORIAL_STEP_INDEX_ACCEPT) {
      return;
    }
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /**
   * @param suppressDismissOnDestroy pass true when the host route is destroyed
   * so the user can see the tutorial again on a later visit.
   */
  destroyDriver(suppressDismissOnDestroy = false): void {
    this.suppressDismissOnDestroy = suppressDismissOnDestroy;
    this.awaitingHistogramAdvance = false;
    this.driverInstance?.destroy();
    this.driverInstance = null;
  }

  isActive(): boolean {
    return this.driverInstance?.isActive() ?? false;
  }

  startMainTour(): void {
    this.destroyDriver(true);
    const steps = this.buildSteps();
    const t = (key: string) => this.translate.instant(`STRANGENESS.LSA_TUTORIAL.${key}`);

    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => { /* intentionally no-op: overlay click must not close the tour */ },
      overlayOpacity: 0.72,
      overlayColor: '#1a1a1a',
      stagePadding: 8,
      popoverClass: 'lsa-driver-popover',
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
        this.awaitingHistogramAdvance = false;
      },
    });

    this.driverInstance = d;
    setTimeout(() => d.drive(0), 0);
  }

  private buildSteps(): DriveStep[] {
    const t = (key: string) => this.translate.instant(`STRANGENESS.LSA_TUTORIAL.${key}`);
    return [
      {
        element: '#lsa-tour-particle-field',
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_PARTICLE_TITLE'),
          description: t('STEP_PARTICLE_BODY'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#lsa-tour-collision-field',
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_COLLISION_TITLE'),
          description: t('STEP_COLLISION_BODY'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: '#lsa-tour-open-histogram',
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_OPEN_TITLE'),
          description: t('STEP_OPEN_BODY'),
          side: 'left',
          showButtons: ['next', 'previous', 'close'],
        },
        onHighlighted: () => {
          this.awaitingHistogramAdvance = true;
        },
        onDeselected: () => {
          this.awaitingHistogramAdvance = false;
        },
      },
      {
        element: '#lsa-tour-histogram-display',
        popover: {
          title: t('STEP_SPECTRUM_TITLE'),
          description: t('STEP_SPECTRUM_BODY'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '#lsa-tour-signal-group',
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_SIGNAL_TITLE'),
          description: t('STEP_SIGNAL_BODY'),
          side: 'bottom',
        },
      },
      {
        element: '#lsa-tour-background-group',
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_BACKGROUND_TITLE'),
          description: t('STEP_BACKGROUND_BODY'),
          side: 'bottom',
        },
      },
      {
        element: '#lsa-tour-fit-button',
        popover: {
          title: t('STEP_FIT_TITLE'),
          description: t('STEP_FIT_BODY'),
          side: 'left',
        },
      },
      {
        element: '#lsa-tour-histogram-display',
        popover: {
          title: t('STEP_CHECK_TITLE'),
          description: t('STEP_CHECK_BODY'),
          side: 'right',
        },
      },
      {
        element: '#lsa-tour-accept-button',
        popover: {
          title: t('STEP_ACCEPT_TITLE'),
          description: t('STEP_ACCEPT_BODY'),
          side: 'left',
        },
      },
      {
        element: '#lsa-tour-results-table',
        popover: {
          title: t('STEP_RESULTS_TITLE'),
          description: t('STEP_RESULTS_BODY'),
          side: 'top',
        },
      },
      {
        element: '#lsa-tour-upload-button',
        popover: {
          title: t('STEP_UPLOAD_TITLE'),
          description: t('STEP_UPLOAD_BODY'),
          side: 'left',
        },
      },
    ];
  }
}
