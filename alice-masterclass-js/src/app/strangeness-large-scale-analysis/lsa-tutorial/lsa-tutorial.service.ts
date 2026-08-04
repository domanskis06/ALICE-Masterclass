import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { FitService } from '../../shared/services/fit.service';
import {
  LSA_TUTORIAL_STEP_INDEX_ACCEPT,
  LSA_TUTORIAL_STEP_INDEX_FIT,
  LSA_TUTORIAL_STEP_INDEX_OPEN_HISTOGRAM,
} from './lsa-tutorial.constants';

/** Injected only in StrangenessLargeScaleAnalysisModule (needs FitService). */
@Injectable()
export class LsaTutorialService {
  private static readonly EXPANDING_STAGE_ID = 'lsa-tour-expanding-stage';
  private static readonly INTERACTIVE_CLASS = 'lsa-driver-range-interactive';

  private static readonly SELECTOR_HISTOGRAM = '#lsa-tour-histogram-display';
  private static readonly SELECTOR_SIGNAL = '#lsa-tour-signal-group';
  private static readonly SELECTOR_BACKGROUND = '#lsa-tour-background-group';
  private static readonly SELECTOR_RESULTS = '#lsa-tour-results-table';
  /** Demo shows the enhancement summary instead of the per-fit results table. */
  private static readonly SELECTOR_RESULTS_DEMO = '#lsa-demo-results-table';

  private readonly demo = inject(DemoConfig).enabled;

  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  private awaitingHistogramAdvance = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;

  /** Selectors currently covered by the expanding stage (steps 5–6). */
  private expandingSelectors: string[] = [];
  private readonly onWindowResizeForStage = (): void => {
    if (this.expandingSelectors.length === 0) {
      return;
    }
    this.layoutExpandingStage(this.expandingSelectors);
    this.driverInstance?.refresh();
  };

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
    this.teardownExpandingStage();
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
        this.teardownExpandingStage();
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
    const steps: DriveStep[] = [
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
        element: LsaTutorialService.SELECTOR_HISTOGRAM,
        popover: {
          title: t('STEP_SPECTRUM_TITLE'),
          description: t('STEP_SPECTRUM_BODY'),
          side: 'right',
          align: 'start',
        },
      },
      // Step 5: stage from step 4 expands downward to include the signal slider.
      {
        element: () => this.getExpandingStage([
          LsaTutorialService.SELECTOR_HISTOGRAM,
          LsaTutorialService.SELECTOR_SIGNAL,
        ]),
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_SIGNAL_TITLE'),
          description: t('STEP_SIGNAL_BODY'),
          side: 'right',
          align: 'end',
        },
        onHighlighted: () => this.enableExpandingInteractions([
          LsaTutorialService.SELECTOR_HISTOGRAM,
          LsaTutorialService.SELECTOR_SIGNAL,
        ]),
        onDeselected: () => this.onExpandingStageDeselected(),
      },
      // Step 6: stage expands further to include the background slider.
      {
        element: () => this.getExpandingStage([
          LsaTutorialService.SELECTOR_HISTOGRAM,
          LsaTutorialService.SELECTOR_SIGNAL,
          LsaTutorialService.SELECTOR_BACKGROUND,
        ]),
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_BACKGROUND_TITLE'),
          description: t('STEP_BACKGROUND_BODY'),
          side: 'right',
          align: 'end',
        },
        onHighlighted: () => this.enableExpandingInteractions([
          LsaTutorialService.SELECTOR_HISTOGRAM,
          LsaTutorialService.SELECTOR_SIGNAL,
          LsaTutorialService.SELECTOR_BACKGROUND,
        ]),
        onDeselected: () => this.onExpandingStageDeselected(),
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
        element: LsaTutorialService.SELECTOR_HISTOGRAM,
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
        element: this.demo
          ? LsaTutorialService.SELECTOR_RESULTS_DEMO
          : LsaTutorialService.SELECTOR_RESULTS,
        popover: {
          title: t('STEP_RESULTS_TITLE'),
          description: this.demo ? t('STEP_RESULTS_SUMMARY_BODY') : t('STEP_RESULTS_BODY'),
          side: 'top',
        },
      },
    ];

    // Uploading to a teacher session exists in the workshop build only.
    if (!this.demo) {
      steps.push({
        element: '#lsa-tour-upload-button',
        popover: {
          title: t('STEP_UPLOAD_TITLE'),
          description: t('STEP_UPLOAD_BODY'),
          side: 'left',
        },
      });
    }

    return steps;
  }

  /**
   * Fixed proxy whose box is the AABB union of the given UI regions. driver.js
   * stages that single element, so the highlight grows as more selectors are
   * included (histogram → +signal → +background) without swallowing Results
   * (same left-column width as the histogram card).
   */
  private getExpandingStage(selectors: string[]): HTMLElement {
    this.expandingSelectors = [...selectors];
    const stage = this.layoutExpandingStage(selectors);
    window.removeEventListener('resize', this.onWindowResizeForStage);
    window.addEventListener('resize', this.onWindowResizeForStage);
    return stage;
  }

  private layoutExpandingStage(selectors: string[]): HTMLElement {
    let stage = document.getElementById(LsaTutorialService.EXPANDING_STAGE_ID);
    if (!stage) {
      stage = document.createElement('div');
      stage.id = LsaTutorialService.EXPANDING_STAGE_ID;
      stage.setAttribute('aria-hidden', 'true');
      stage.style.position = 'fixed';
      stage.style.pointerEvents = 'none';
      stage.style.margin = '0';
      stage.style.padding = '0';
      stage.style.border = '0';
      stage.style.background = 'transparent';
      document.body.appendChild(stage);
    }

    const rects = selectors
      .map((selector) => document.querySelector(selector)?.getBoundingClientRect())
      .filter((rect): rect is DOMRect => !!rect && rect.width > 0 && rect.height > 0);

    if (rects.length === 0) {
      stage.style.top = '0';
      stage.style.left = '0';
      stage.style.width = '0';
      stage.style.height = '0';
      return stage;
    }

    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    const right = Math.max(...rects.map((r) => r.right));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    stage.style.left = `${left}px`;
    stage.style.top = `${top}px`;
    stage.style.width = `${right - left}px`;
    stage.style.height = `${bottom - top}px`;
    return stage;
  }

  private enableExpandingInteractions(selectors: string[]): void {
    this.clearExpandingInteractions();
    for (const selector of selectors) {
      document.querySelector(selector)?.classList.add(LsaTutorialService.INTERACTIVE_CLASS);
    }
  }

  private clearExpandingInteractions(): void {
    document
      .querySelectorAll(`.${LsaTutorialService.INTERACTIVE_CLASS}`)
      .forEach((el) => el.classList.remove(LsaTutorialService.INTERACTIVE_CLASS));
  }

  /**
   * driver.js calls the next step's `element()` before the previous step's
   * `onDeselected`, so we must not remove the proxy synchronously when moving
   * between steps 5 and 6. Tear it down on the next tick only if the tour has
   * moved on to a different target.
   */
  private onExpandingStageDeselected(): void {
    this.clearExpandingInteractions();
    setTimeout(() => {
      if (this.driverInstance?.getActiveElement()?.id !== LsaTutorialService.EXPANDING_STAGE_ID) {
        this.teardownExpandingStage();
      }
    }, 0);
  }

  private teardownExpandingStage(): void {
    window.removeEventListener('resize', this.onWindowResizeForStage);
    this.clearExpandingInteractions();
    this.expandingSelectors = [];
    document.getElementById(LsaTutorialService.EXPANDING_STAGE_ID)?.remove();
  }
}
