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
  private static readonly SELECTOR_FIT_SELECTOR = '#lsa-tour-fit-selector';
  private static readonly SELECTOR_RESULTS = '#lsa-tour-results-table';
  private static readonly SELECTOR_RESULTS_DEMO = '#lsa-demo-results-table';
  private static readonly SELECTOR_ENHANCEMENT_PLOT = '#lsa-demo-enhancement-plot';
  private static readonly SELECTOR_HISTOGRAM_ACTIONS = '#lsa-tour-histogram-actions';
  private static readonly SELECTOR_FIT = '#lsa-tour-fit-button';
  private static readonly SELECTOR_ACCEPT = '#lsa-tour-accept-button';
  private static readonly SELECTOR_CLEAR_FIT = '#lsa-tour-clear-fit-button';
  private static readonly SELECTOR_UNDO = '#lsa-demo-undo-button';
  private static readonly SELECTOR_UPLOAD = '#lsa-tour-upload-button';
  private readonly demo = inject(DemoConfig).enabled;

  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  private awaitingHistogramAdvance = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;

  /** Live indices for auto-advance (workshop constants or demo offsets). */
  private stepIndexOpenHistogram = LSA_TUTORIAL_STEP_INDEX_OPEN_HISTOGRAM;
  private stepIndexFit = LSA_TUTORIAL_STEP_INDEX_FIT;
  private stepIndexAccept = LSA_TUTORIAL_STEP_INDEX_ACCEPT;

  /** Selectors currently covered by the expanding stage (signal / background steps). */
  private expandingSelectors: string[] = [];
  /** Extra pixels below the union AABB (demo signal step). */
  private expandingBottomPad = 0;
  /** When set, stage bottom reaches at least this element's bottom (demo background step). */
  private expandingBottomAlignSelector: string | null = null;
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
    if (this.driverInstance.getActiveIndex() !== this.stepIndexOpenHistogram) {
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
    if (this.driverInstance.getActiveIndex() !== this.stepIndexFit) {
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
    if (this.driverInstance.getActiveIndex() !== this.stepIndexAccept) {
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
    const steps = this.demo ? this.buildDemoSteps() : this.buildWorkshopSteps();
    this.stepIndexOpenHistogram = this.indexOfElement(steps, '#lsa-tour-open-histogram');
    this.stepIndexFit = this.indexOfElement(steps, LsaTutorialService.SELECTOR_FIT);
    this.stepIndexAccept = this.indexOfElement(steps, LsaTutorialService.SELECTOR_ACCEPT);
    return steps;
  }

  private indexOfElement(steps: DriveStep[], selector: string): number {
    const index = steps.findIndex((step) => step.element === selector);
    return index >= 0 ? index : -1;
  }

  private t(key: string): string {
    return this.translate.instant(`STRANGENESS.LSA_TUTORIAL.${key}`);
  }

  /** Prefer the outlined control box so stage padding does not cover the card title. */
  private resolveFormFieldControl(fieldId: string): Element {
    const preferred = document.querySelector(`${fieldId} .mat-mdc-text-field-wrapper`);
    return preferred ?? document.querySelector(fieldId)!;
  }

  /** Workshop layout: spectrum | results side by side, then fit selector. */
  private buildWorkshopSteps(): DriveStep[] {
    const t = (key: string) => this.t(key);
    return [
      {
        element: () => this.resolveFormFieldControl('#lsa-tour-particle-field'),
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_PARTICLE_TITLE'),
          description: t('STEP_PARTICLE_BODY'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: () => this.resolveFormFieldControl('#lsa-tour-collision-field'),
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
        element: LsaTutorialService.SELECTOR_FIT,
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
        element: LsaTutorialService.SELECTOR_ACCEPT,
        popover: {
          title: t('STEP_ACCEPT_TITLE'),
          description: t('STEP_ACCEPT_BODY'),
          side: 'left',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_CLEAR_FIT,
        popover: {
          title: t('STEP_CLEAR_FIT_TITLE'),
          description: t('STEP_CLEAR_FIT_BODY'),
          side: 'left',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_RESULTS,
        popover: {
          title: t('STEP_RESULTS_TITLE'),
          description: t('STEP_RESULTS_BODY'),
          side: 'top',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_UPLOAD,
        popover: {
          title: t('STEP_UPLOAD_TITLE'),
          description: t('STEP_UPLOAD_BODY'),
          side: 'left',
        },
      },
    ];
  }

  /**
   * Demo layout: spectrum | enhancement plot, fit selector full width, results below.
   * Covers every interactive control, including Undo / Clear fit.
   */
  private buildDemoSteps(): DriveStep[] {
    const t = (key: string) => this.t(key);
    return [
      {
        element: () => this.resolveFormFieldControl('#lsa-tour-particle-field'),
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_PARTICLE_TITLE'),
          description: t('STEP_PARTICLE_BODY'),
          side: 'bottom',
          align: 'start',
        },
      },
      {
        element: () => this.resolveFormFieldControl('#lsa-tour-collision-field'),
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
          side: 'left',
          align: 'start',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_HISTOGRAM_ACTIONS,
        popover: {
          title: t('STEP_HISTOGRAM_TOOLS_TITLE'),
          description: t('STEP_HISTOGRAM_TOOLS_BODY'),
          side: 'bottom',
          align: 'end',
        },
      },
      {
        // Step 6: spectrum + signal; nudge bottom a few px past the slider group.
        element: () => this.getExpandingStage(
          [
            LsaTutorialService.SELECTOR_HISTOGRAM,
            LsaTutorialService.SELECTOR_SIGNAL,
          ],
          { bottomPad: 10 },
        ),
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_SIGNAL_TITLE'),
          description: t('STEP_SIGNAL_BODY'),
          side: 'left',
          align: 'end',
        },
        onHighlighted: () => this.enableExpandingInteractions([
          LsaTutorialService.SELECTOR_HISTOGRAM,
          LsaTutorialService.SELECTOR_SIGNAL,
        ]),
        onDeselected: () => this.onExpandingStageDeselected(),
      },
      {
        // Step 7: include background and stretch to the Fit Selector card bottom.
        element: () => this.getExpandingStage(
          [
            LsaTutorialService.SELECTOR_HISTOGRAM,
            LsaTutorialService.SELECTOR_SIGNAL,
            LsaTutorialService.SELECTOR_BACKGROUND,
          ],
          { bottomAlignSelector: LsaTutorialService.SELECTOR_FIT_SELECTOR },
        ),
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_BACKGROUND_TITLE'),
          description: t('STEP_BACKGROUND_BODY'),
          side: 'left',
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
        element: LsaTutorialService.SELECTOR_FIT,
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
          side: 'left',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_ACCEPT,
        popover: {
          title: t('STEP_ACCEPT_TITLE'),
          description: t('STEP_ACCEPT_BODY'),
          side: 'left',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_UNDO,
        popover: {
          title: t('STEP_UNDO_TITLE'),
          description: t('STEP_UNDO_BODY'),
          side: 'left',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_CLEAR_FIT,
        popover: {
          title: t('STEP_CLEAR_FIT_TITLE'),
          description: t('STEP_CLEAR_FIT_BODY'),
          side: 'left',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_ENHANCEMENT_PLOT,
        popover: {
          title: t('STEP_ENHANCEMENT_PLOT_TITLE'),
          description: t('STEP_ENHANCEMENT_PLOT_BODY'),
          side: 'left',
          align: 'start',
        },
      },
      {
        element: LsaTutorialService.SELECTOR_RESULTS_DEMO,
        popover: {
          title: t('STEP_RESULTS_SUMMARY_TITLE'),
          description: t('STEP_RESULTS_SUMMARY_BODY'),
          side: 'top',
          align: 'center',
        },
      },
    ];
  }

  /**
   * Fixed proxy whose box is the AABB union of the given UI regions. driver.js
   * stages that single element, so the highlight grows as more selectors are
   * included (histogram → +signal → +background) without swallowing Results
   * (same left-column width as the histogram card).
   */
  private getExpandingStage(
    selectors: string[],
    options?: { bottomPad?: number; bottomAlignSelector?: string },
  ): HTMLElement {
    this.expandingSelectors = [...selectors];
    this.expandingBottomPad = options?.bottomPad ?? 0;
    this.expandingBottomAlignSelector = options?.bottomAlignSelector ?? null;
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

    let left = Math.min(...rects.map((r) => r.left));
    let top = Math.min(...rects.map((r) => r.top));
    let right = Math.max(...rects.map((r) => r.right));
    let bottom = Math.max(...rects.map((r) => r.bottom));

    /*
     * Demo: charts are 50/50. Keep the expanding highlight in the histogram
     * column (do not swallow the enhancement plot) and always span the full
     * Histogram Display card height when the stage reaches the background slider.
     */
    if (this.demo && selectors.includes(LsaTutorialService.SELECTOR_HISTOGRAM)) {
      const hist = document
        .querySelector(LsaTutorialService.SELECTOR_HISTOGRAM)
        ?.getBoundingClientRect();
      if (hist && hist.width > 0 && hist.height > 0) {
        left = hist.left;
        right = hist.right;
        top = hist.top;
        bottom = Math.max(bottom, hist.bottom);
      }
    }

    bottom += this.expandingBottomPad;

    if (this.expandingBottomAlignSelector) {
      const alignRect = document
        .querySelector(this.expandingBottomAlignSelector)
        ?.getBoundingClientRect();
      if (alignRect && alignRect.height > 0) {
        bottom = Math.max(bottom, alignRect.bottom);
      }
    }

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
   * between expanding steps. Tear it down on the next tick only if the tour has
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
    this.expandingBottomPad = 0;
    this.expandingBottomAlignSelector = null;
    document.getElementById(LsaTutorialService.EXPANDING_STAGE_ID)?.remove();
  }
}
