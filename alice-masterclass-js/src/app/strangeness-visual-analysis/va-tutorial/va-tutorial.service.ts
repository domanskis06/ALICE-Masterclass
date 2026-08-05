import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import {
  VA_TUTORIAL_STEP_INDEX_CLICK_TRACKS,
  VA_TUTORIAL_STEP_INDEX_FINISH_DEMO,
  VA_TUTORIAL_STEP_INDEX_IDENTIFY,
} from './va-tutorial.constants';

export interface VaTutorialHostHooks {
  ensureRightSidebarOpen?: () => void;
  scrollToAnalysis?: () => void;
  scrollToDetector?: () => void;
  scrollToHistograms?: () => void;
  /** True when both V0 daughter tracks are selected in the calculator. */
  hasV0PairSelected?: () => boolean;
  /** Scroll container used to detect when smooth scrolling has finished. */
  getScrollContainer?: () => HTMLElement | Window | null;
}

/** Injected only in StrangenessVisualAnalysisModule. */
@Injectable()
export class VaTutorialService {
  private static readonly EXPANDING_STAGE_ID = 'va-tour-expanding-stage';
  private static readonly INTERACTIVE_CLASS = 'va-driver-range-interactive';

  private static readonly SELECTOR_VISIBILITY = '#va-tour-visibility';
  private static readonly SELECTOR_RENDER = '#render-area';
  private static readonly SELECTOR_DATASET_NAV = '#va-tour-dataset-nav';
  private static readonly SELECTOR_CALCULATOR = '#va-tour-calculator';
  private static readonly SELECTOR_PARTICLE_MASS = '#va-tour-particle-mass';
  private static readonly SELECTOR_PARTICLE_TYPE = '#va-tour-particle-type';
  private static readonly SELECTOR_HOW_TO_IDENTIFY = '#va-tour-how-to-identify';
  private static readonly SELECTOR_ADD = '#va-tour-add';
  private static readonly SELECTOR_UNDO = '#va-tour-undo';
  private static readonly SELECTOR_HISTOGRAMS = '#va-tour-histograms';
  private static readonly SELECTOR_UPLOAD = '#va-tour-upload';
  private static readonly SELECTOR_COMPLETE_NEXT = '#va-tour-complete-next';
  private static readonly SELECTOR_COMPLETE_PANEL = '#va-tour-event-complete';

  private readonly demo = inject(DemoConfig).enabled;

  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;

  private stepIndexClickTracks = VA_TUTORIAL_STEP_INDEX_CLICK_TRACKS;
  private stepIndexIdentify = VA_TUTORIAL_STEP_INDEX_IDENTIFY;
  private stepIndexFinish = VA_TUTORIAL_STEP_INDEX_FINISH_DEMO;

  private hostHooks: VaTutorialHostHooks = {};
  private awaitingTrackAdvance = false;
  private awaitingAddAdvance = false;
  private flightChromeHidden = false;

  private expandingSelectors: string[] = [];
  private readonly onWindowResizeForStage = (): void => {
    if (this.expandingSelectors.length === 0 || this.flightChromeHidden) {
      return;
    }
    this.layoutExpandingStage(this.expandingSelectors);
    this.driverInstance?.refresh();
  };

  constructor(private readonly translate: TranslateService) {}

  registerHostHooks(hooks: VaTutorialHostHooks): void {
    this.hostHooks = { ...hooks };
  }

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

  isActive(): boolean {
    return this.driverInstance?.isActive() ?? false;
  }

  /**
   * Call after a track is selected. Advances only on the click-tracks step once
   * both V0 daughters are present, after the analysis scroll has settled.
   * Hides the dimming overlay during the scroll, then restores it on step 5.
   */
  notifyTrackSelected(): void {
    if (!this.driverInstance?.isActive() || this.awaitingTrackAdvance) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== this.stepIndexClickTracks) {
      return;
    }
    if (!this.hostHooks.hasV0PairSelected?.()) {
      return;
    }
    this.awaitingTrackAdvance = true;
    this.setFlightChromeHidden(true);
    this.hostHooks.scrollToAnalysis?.();
    void this.waitForScrollSettle().then(() => {
      if (!this.driverInstance?.isActive()) {
        this.setFlightChromeHidden(false);
        this.awaitingTrackAdvance = false;
        return;
      }
      if (this.driverInstance.getActiveIndex() !== this.stepIndexClickTracks) {
        this.setFlightChromeHidden(false);
        this.awaitingTrackAdvance = false;
        return;
      }
      this.setFlightChromeHidden(false);
      this.driverInstance.moveNext();
      this.awaitingTrackAdvance = false;
    });
  }

  /**
   * Call when an animated Add flight starts on the identify step.
   * Hides the dimming overlay until the particle lands.
   */
  notifyAddFlightStarted(): void {
    if (!this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== this.stepIndexIdentify) {
      return;
    }
    this.awaitingAddAdvance = true;
    this.setFlightChromeHidden(true);
  }

  /**
   * Call after an Add lands / commits while the tour is on the identify step.
   * Waits for scroll settle and the bin pulse, then shows the histograms step.
   */
  notifyAddLanded(): void {
    if (!this.driverInstance?.isActive()) {
      this.setFlightChromeHidden(false);
      this.awaitingAddAdvance = false;
      return;
    }
    if (this.driverInstance.getActiveIndex() !== this.stepIndexIdentify) {
      this.setFlightChromeHidden(false);
      this.awaitingAddAdvance = false;
      return;
    }
    this.awaitingAddAdvance = true;
    this.hostHooks.scrollToHistograms?.();
    void this.waitForScrollSettle().then(() => {
      // Let the histogram bar pulse settle before restoring the highlight.
      window.setTimeout(() => {
        if (!this.driverInstance?.isActive()) {
          this.setFlightChromeHidden(false);
          this.awaitingAddAdvance = false;
          return;
        }
        if (this.driverInstance.getActiveIndex() !== this.stepIndexIdentify) {
          this.setFlightChromeHidden(false);
          this.awaitingAddAdvance = false;
          return;
        }
        this.setFlightChromeHidden(false);
        this.driverInstance.moveNext();
        this.awaitingAddAdvance = false;
      }, 280);
    });
  }

  /** Call when the calculator / sidebar Next event is used on the finish step. */
  notifyFinishNextEvent(): void {
    if (!this.driverInstance?.isActive()) {
      return;
    }
    if (this.driverInstance.getActiveIndex() !== this.stepIndexFinish) {
      return;
    }
    // Dismiss for this session and tear the tour down.
    this.destroyDriver(false);
  }

  /**
   * @param suppressDismissOnDestroy pass true when the host route is destroyed
   * so the user can see the tutorial again on a later visit.
   */
  destroyDriver(suppressDismissOnDestroy = false): void {
    this.suppressDismissOnDestroy = suppressDismissOnDestroy;
    this.awaitingTrackAdvance = false;
    this.awaitingAddAdvance = false;
    this.setFlightChromeHidden(false);
    this.teardownExpandingStage();
    this.driverInstance?.destroy();
    this.driverInstance = null;
  }

  startMainTour(): void {
    this.destroyDriver(true);
    this.hostHooks.ensureRightSidebarOpen?.();
    this.hostHooks.scrollToDetector?.();

    const steps = this.buildSteps();
    const t = (key: string) => this.translate.instant(`STRANGENESS.VA_TUTORIAL.${key}`);

    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => { /* intentionally no-op: overlay click must not close the tour */ },
      overlayOpacity: 0.72,
      overlayColor: '#1a1a1a',
      stagePadding: 10,
      popoverClass: 'va-driver-popover',
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
      },
    });

    this.driverInstance = d;
    setTimeout(() => d.drive(0), 0);
  }

  private buildSteps(): DriveStep[] {
    const steps = this.demo ? this.buildDemoSteps() : this.buildWorkshopSteps();
    // Scene and click-tracks both target #render-area; auto-advance uses the second one.
    this.stepIndexClickTracks = this.indexOfNthElement(steps, VaTutorialService.SELECTOR_RENDER, 2);
    this.stepIndexIdentify = this.indexOfStepWithPopoverKey(steps, 'STEP_IDENTIFY_TITLE');
    if (this.stepIndexIdentify < 0) {
      this.stepIndexIdentify = VA_TUTORIAL_STEP_INDEX_IDENTIFY;
    }
    this.stepIndexFinish = this.indexOfStepWithPopoverKey(steps, 'STEP_FINISH_TITLE');
    if (this.stepIndexFinish < 0) {
      this.stepIndexFinish = this.demo
        ? VA_TUTORIAL_STEP_INDEX_FINISH_DEMO
        : VA_TUTORIAL_STEP_INDEX_FINISH_DEMO + 1;
    }
    return steps;
  }

  /** Resolve when the page scroll container stops moving for a short idle window. */
  private waitForScrollSettle(idleMs = 150, maxWaitMs = 2500): Promise<void> {
    return new Promise((resolve) => {
      const container = this.hostHooks.getScrollContainer?.() ?? window;
      const target: HTMLElement | Window =
        container instanceof HTMLElement ? container : window;
      let idleTimer: number | null = null;
      let noScrollTimer: number | null = null;
      let sawScroll = false;
      let settled = false;
      const finish = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        target.removeEventListener('scroll', onScroll);
        if (idleTimer != null) {
          window.clearTimeout(idleTimer);
        }
        if (noScrollTimer != null) {
          window.clearTimeout(noScrollTimer);
        }
        window.clearTimeout(maxTimer);
        resolve();
      };
      const onScroll = (): void => {
        sawScroll = true;
        if (noScrollTimer != null) {
          window.clearTimeout(noScrollTimer);
          noScrollTimer = null;
        }
        if (idleTimer != null) {
          window.clearTimeout(idleTimer);
        }
        idleTimer = window.setTimeout(finish, idleMs);
      };
      target.addEventListener('scroll', onScroll, { passive: true });
      const maxTimer = window.setTimeout(finish, maxWaitMs);
      // If smooth-scroll never starts, advance after a short grace period.
      noScrollTimer = window.setTimeout(() => {
        if (!sawScroll) {
          finish();
        }
      }, 400);
    });
  }

  private setFlightChromeHidden(hidden: boolean): void {
    this.flightChromeHidden = hidden;
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('va-driver-flight-hide', hidden);
  }

  /** 1-based n: first match is n=1. */
  private indexOfNthElement(steps: DriveStep[], selector: string, n: number): number {
    let seen = 0;
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].element === selector) {
        seen += 1;
        if (seen === n) {
          return i;
        }
      }
    }
    return -1;
  }

  private indexOfStepWithPopoverKey(steps: DriveStep[], titleKey: string): number {
    const title = this.t(titleKey);
    return steps.findIndex((step) => step.popover?.title === title);
  }

  private t(key: string): string {
    return this.translate.instant(`STRANGENESS.VA_TUTORIAL.${key}`);
  }

  private openSidebarAndRefresh(): void {
    this.hostHooks.ensureRightSidebarOpen?.();
    setTimeout(() => this.driverInstance?.refresh(), 0);
  }

  private scrollAnalysisAndRefresh(delayMs = 280): void {
    this.hostHooks.scrollToAnalysis?.();
    setTimeout(() => {
      if (this.expandingSelectors.length > 0) {
        this.layoutExpandingStage(this.expandingSelectors);
      }
      this.driverInstance?.refresh();
    }, delayMs);
  }

  private scrollHistogramsAndRefresh(delayMs = 320): void {
    this.hostHooks.scrollToHistograms?.();
    setTimeout(() => {
      if (this.expandingSelectors.length > 0) {
        this.layoutExpandingStage(this.expandingSelectors);
      }
      this.driverInstance?.refresh();
    }, delayMs);
  }

  private buildDemoSteps(): DriveStep[] {
    return this.buildSharedSteps(false);
  }

  private buildWorkshopSteps(): DriveStep[] {
    return this.buildSharedSteps(true);
  }

  private buildSharedSteps(includeUpload: boolean): DriveStep[] {
    const t = (key: string) => this.t(key);
    const steps: DriveStep[] = [
      {
        element: VaTutorialService.SELECTOR_RENDER,
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_SCENE_TITLE'),
          description: t('STEP_SCENE_BODY'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.hostHooks.scrollToDetector?.(),
      },
      {
        element: () => {
          this.hostHooks.ensureRightSidebarOpen?.();
          return document.querySelector(VaTutorialService.SELECTOR_VISIBILITY)!;
        },
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_VISIBILITY_TITLE'),
          description: t('STEP_VISIBILITY_BODY'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.openSidebarAndRefresh(),
      },
      {
        element: () => {
          this.hostHooks.ensureRightSidebarOpen?.();
          return document.querySelector(VaTutorialService.SELECTOR_DATASET_NAV)!;
        },
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_DATASET_NAV_TITLE'),
          description: t('STEP_DATASET_NAV_BODY'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.openSidebarAndRefresh(),
      },
      {
        element: VaTutorialService.SELECTOR_RENDER,
        disableActiveInteraction: false,
        popover: {
          title: t('STEP_CLICK_TRACKS_TITLE'),
          description: t('STEP_CLICK_TRACKS_BODY'),
          side: 'left',
          align: 'start',
          showButtons: ['previous', 'close'],
          disableButtons: ['next'],
        },
        onHighlighted: () => this.hostHooks.scrollToDetector?.(),
      },
      {
        element: () => this.getExpandingStage([VaTutorialService.SELECTOR_CALCULATOR]),
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_CALCULATOR_TITLE'),
          description: t('STEP_CALCULATOR_BODY'),
          side: 'top',
          align: 'center',
        },
        onHighlighted: () => {
          // Scroll already finished in notifyTrackSelected — only re-layout the stage.
          this.layoutExpandingStage([VaTutorialService.SELECTOR_CALCULATOR]);
          this.enableExpandingInteractions([VaTutorialService.SELECTOR_CALCULATOR]);
          setTimeout(() => this.driverInstance?.refresh(), 0);
        },
        onDeselected: () => this.onExpandingStageDeselected(),
      },
      {
        element: () => this.getExpandingStage([
          VaTutorialService.SELECTOR_PARTICLE_MASS,
          VaTutorialService.SELECTOR_PARTICLE_TYPE,
          VaTutorialService.SELECTOR_HOW_TO_IDENTIFY,
          VaTutorialService.SELECTOR_ADD,
          VaTutorialService.SELECTOR_UNDO,
        ]),
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_IDENTIFY_TITLE'),
          description: t('STEP_IDENTIFY_BODY'),
          side: 'top',
          align: 'start',
          showButtons: ['previous', 'close'],
          disableButtons: ['next'],
        },
        onHighlighted: () => {
          this.scrollAnalysisAndRefresh(320);
          this.enableExpandingInteractions([
            VaTutorialService.SELECTOR_PARTICLE_MASS,
            VaTutorialService.SELECTOR_PARTICLE_TYPE,
            VaTutorialService.SELECTOR_HOW_TO_IDENTIFY,
            VaTutorialService.SELECTOR_ADD,
            VaTutorialService.SELECTOR_UNDO,
          ]);
        },
        onDeselected: () => this.onExpandingStageDeselected(),
      },
      {
        element: () => this.getExpandingStage([VaTutorialService.SELECTOR_HISTOGRAMS]),
        disableActiveInteraction: true,
        popover: {
          title: t('STEP_HISTOGRAMS_TITLE'),
          description: t('STEP_HISTOGRAMS_BODY'),
          side: 'top',
          align: 'center',
        },
        onHighlighted: () => {
          // Scroll already finished in notifyAddLanded — only re-layout the stage.
          this.layoutExpandingStage([VaTutorialService.SELECTOR_HISTOGRAMS]);
          this.enableExpandingInteractions([VaTutorialService.SELECTOR_HISTOGRAMS]);
          setTimeout(() => this.driverInstance?.refresh(), 0);
        },
        onDeselected: () => this.onExpandingStageDeselected(),
      },
    ];

    if (includeUpload) {
      steps.push({
        element: VaTutorialService.SELECTOR_UPLOAD,
        popover: {
          title: t('STEP_UPLOAD_TITLE'),
          description: t('STEP_UPLOAD_BODY'),
          side: 'left',
        },
        onHighlighted: () => this.scrollHistogramsAndRefresh(280),
      });
    }

    steps.push({
      element: () => {
        this.hostHooks.scrollToAnalysis?.();
        const completeNext = document.querySelector(VaTutorialService.SELECTOR_COMPLETE_NEXT);
        if (completeNext) {
          return completeNext;
        }
        const completePanel = document.querySelector(VaTutorialService.SELECTOR_COMPLETE_PANEL);
        if (completePanel) {
          return completePanel;
        }
        return this.getExpandingStage([
          VaTutorialService.SELECTOR_PARTICLE_TYPE,
          VaTutorialService.SELECTOR_ADD,
        ]);
      },
      disableActiveInteraction: false,
      popover: {
        title: t('STEP_FINISH_TITLE'),
        description: t('STEP_FINISH_BODY'),
        side: 'left',
        align: 'start',
        showButtons: ['previous', 'close'],
        disableButtons: ['next'],
      },
      onHighlighted: () => {
        this.scrollAnalysisAndRefresh(320);
        if (document.querySelector(VaTutorialService.SELECTOR_COMPLETE_NEXT)) {
          this.enableExpandingInteractions([VaTutorialService.SELECTOR_COMPLETE_NEXT]);
        } else if (!document.querySelector(VaTutorialService.SELECTOR_COMPLETE_PANEL)) {
          this.enableExpandingInteractions([
            VaTutorialService.SELECTOR_PARTICLE_TYPE,
            VaTutorialService.SELECTOR_ADD,
          ]);
        }
      },
      onDeselected: () => this.onExpandingStageDeselected(),
    });

    return steps;
  }

  private getExpandingStage(selectors: string[]): HTMLElement {
    this.expandingSelectors = [...selectors];
    const stage = this.layoutExpandingStage(selectors);
    window.removeEventListener('resize', this.onWindowResizeForStage);
    window.addEventListener('resize', this.onWindowResizeForStage);
    return stage;
  }

  private layoutExpandingStage(selectors: string[]): HTMLElement {
    let stage = document.getElementById(VaTutorialService.EXPANDING_STAGE_ID);
    if (!stage) {
      stage = document.createElement('div');
      stage.id = VaTutorialService.EXPANDING_STAGE_ID;
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

    const pad = 6;
    const left = Math.min(...rects.map((r) => r.left)) - pad;
    const top = Math.min(...rects.map((r) => r.top)) - pad;
    const right = Math.max(...rects.map((r) => r.right)) + pad;
    const bottom = Math.max(...rects.map((r) => r.bottom)) + pad;

    stage.style.left = `${left}px`;
    stage.style.top = `${top}px`;
    stage.style.width = `${Math.max(0, right - left)}px`;
    stage.style.height = `${Math.max(0, bottom - top)}px`;
    return stage;
  }

  private enableExpandingInteractions(selectors: string[]): void {
    this.clearExpandingInteractions();
    for (const selector of selectors) {
      document.querySelector(selector)?.classList.add(VaTutorialService.INTERACTIVE_CLASS);
    }
  }

  private clearExpandingInteractions(): void {
    document
      .querySelectorAll(`.${VaTutorialService.INTERACTIVE_CLASS}`)
      .forEach((el) => el.classList.remove(VaTutorialService.INTERACTIVE_CLASS));
  }

  private onExpandingStageDeselected(): void {
    this.clearExpandingInteractions();
    setTimeout(() => {
      if (this.driverInstance?.getActiveElement()?.id !== VaTutorialService.EXPANDING_STAGE_ID) {
        this.teardownExpandingStage();
      }
    }, 0);
  }

  private teardownExpandingStage(): void {
    window.removeEventListener('resize', this.onWindowResizeForStage);
    this.clearExpandingInteractions();
    this.expandingSelectors = [];
    document.getElementById(VaTutorialService.EXPANDING_STAGE_ID)?.remove();
  }
}
