import { Injectable } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import {
  NMF_EE_STEP_GO_NEXT_EVENT,
  NMF_EE_STEP_MARQUEE,
  NMF_EE_STEP_PICK_PRIMARIES,
  NMF_EE_STEP_SUBMIT_FILTER,
  NMF_TOUR_3D_SELECTOR,
} from './ee-tutorial.constants';

export interface NmfEeTutorialHostHooks {
  /** Open / close the white Blockly filter builder. */
  setFilterBuilderOpen: (open: boolean) => void;
  /** Enable Shift+drag marquee selection on the 3D view. */
  setMarqueeMode: (on: boolean) => void;
  /** Ensure Event Characteristics drawer is open. */
  ensureCharPanelOpen: () => void;
  /** Select Event Characteristics (0) or R_AA Analysis (1) in the results drawer. */
  setResultsTab: (tab: 'characteristics' | 'raa') => void;
  /** Force a host change-detection pass (e.g. after a side-help tour ends). */
  refreshHost: () => void;
  /** Start / stop the “click every primary on event 1” challenge. */
  setPrimaryPickChallenge: (active: boolean) => void;
  /** Lock the Next-event control until the pick challenge is finished. */
  setNextEventLocked: (locked: boolean) => void;
  /** Ensure the student is on the first event of the pack. */
  ensureFirstEvent: () => void;
  /** Show the magnet-off demonstration collision (index 0). */
  showDemonstrationEvent: () => void;
}

/** Wspólny przedrostek kluczy — pełne klucze siedzą w assets/i18n/*.json. */
const TUTORIAL_PREFIX = 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.TUTORIAL.';

/** Injected only in NuclearModificationEventExplorationModule. */
@Injectable()
export class NmfEeTutorialService {
  constructor(private readonly translate: TranslateService) {}

  /**
   * Treść kroku w bieżącym języku.
   *
   * `instant` zamiast strumienia, bo driver.js dostaje gotowe napisy przy budowie
   * kroków, a samouczek i tak powstaje na żądanie — przełączenie języka w trakcie
   * zwiedzania nie jest scenariuszem, który obsługujemy.
   */
  private t(key: string): string {
    return this.translate.instant(TUTORIAL_PREFIX + key) as string;
  }

  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;
  private hooks: NmfEeTutorialHostHooks | null = null;
  private awaitingFilterSubmit = false;
  private awaitingMarquee = false;
  private awaitingPrimaryPicks = false;
  private awaitingNextEvent = false;
  /** One step highlight on the dataset picker before the main tour. */
  private datasetPromptActive = false;
  /** Standalone ?-button walkthrough of the Event Characteristics plots. */
  private histHelpTourActive = false;
  private readonly onEnterAdvance = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== 'NumpadEnter') {
      return;
    }
    if (!this.driverInstance?.isActive() || this.datasetPromptActive) {
      return;
    }
    // Action-gated steps: student must complete the task (no Enter / Next skip).
    if (this.isActionGatedStep()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (NmfEeTutorialService.isTypingTarget(event.target)) {
      return;
    }
    // Prevent focused popover/buttons from consuming Enter as a click.
    event.preventDefault();
    this.driverInstance.moveNext();
  };

  /** Steps that require a real student action before the tour may advance. */
  private isActionGatedStep(): boolean {
    if (
      this.awaitingPrimaryPicks ||
      this.awaitingNextEvent ||
      this.awaitingFilterSubmit ||
      this.awaitingMarquee
    ) {
      return true;
    }
    const idx = this.driverInstance?.getActiveIndex();
    return (
      idx === NMF_EE_STEP_PICK_PRIMARIES ||
      idx === NMF_EE_STEP_GO_NEXT_EVENT ||
      idx === NMF_EE_STEP_SUBMIT_FILTER ||
      idx === NMF_EE_STEP_MARQUEE
    );
  }

  shouldShow(): boolean {
    return !this.dismissedThisSession;
  }

  dismiss(): void {
    this.dismissedThisSession = true;
  }

  clearDismissFlag(): void {
    this.dismissedThisSession = false;
  }

  registerHost(hooks: NmfEeTutorialHostHooks): void {
    this.hooks = hooks;
  }

  isActive(): boolean {
    return this.driverInstance?.isActive() ?? false;
  }

  isAwaitingPrimaryPicks(): boolean {
    return this.awaitingPrimaryPicks;
  }

  destroyDriver(suppressDismissOnDestroy = false): void {
    this.suppressDismissOnDestroy = suppressDismissOnDestroy;
    this.awaitingFilterSubmit = false;
    this.awaitingMarquee = false;
    this.awaitingPrimaryPicks = false;
    this.awaitingNextEvent = false;
    this.datasetPromptActive = false;
    this.histHelpTourActive = false;
    this.hooks?.setFilterBuilderOpen(false);
    this.hooks?.setMarqueeMode(false);
    this.hooks?.setPrimaryPickChallenge(false);
    this.hooks?.setNextEventLocked(false);
    this.detachEnterAdvance();
    this.detachDatasetPromptEnterBlock();
    this.driverInstance?.destroy();
    this.driverInstance = null;
  }

  /**
   * The dataset prompt has no buttons (`showButtons: []`) so there is nothing
   * for driver.js's own Enter handling to act on, but it still treats Enter
   * as "advance/dismiss the only step" and tears the popover down anyway —
   * leaving `datasetID` null and the event display empty. Capture Enter
   * ourselves, ahead of driver.js's own listener, and swallow it — unless the
   * student is actually driving the mat-select (opening it or confirming a
   * highlighted option), which must keep working via the keyboard.
   */
  private readonly blockEnterDuringDatasetPrompt = (event: KeyboardEvent): void => {
    if ((event.key !== 'Enter' && event.key !== 'NumpadEnter') || !this.datasetPromptActive) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('#nmf-tour-dataset') || target?.closest('.cdk-overlay-container')) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };

  private attachDatasetPromptEnterBlock(): void {
    window.addEventListener('keydown', this.blockEnterDuringDatasetPrompt, true);
  }

  private detachDatasetPromptEnterBlock(): void {
    window.removeEventListener('keydown', this.blockEnterDuringDatasetPrompt, true);
  }

  isDatasetPromptActive(): boolean {
    return this.datasetPromptActive;
  }

  /**
   * Highlight the dataset select and ask the student to pick the pack their
   * instructor assigned. Cleared by {@link endDatasetPrompt} once they choose.
   */
  startDatasetPrompt(): void {
    this.destroyDriver(true);
    this.datasetPromptActive = true;

    const d = driver({
      showProgress: false,
      smoothScroll: true,
      allowClose: false,
      overlayClickBehavior: () => {
        /* keep the highlight until they pick a dataset */
      },
      // No dimming: a red outline (global CSS, .driver-active-element) frames
      // the highlighted element exactly instead of darkening everything else.
      overlayOpacity: 0,
      stagePadding: 2,
      stageRadius: 4,
      popoverClass: 'lsa-driver-popover',
      showButtons: [],
      // Belt-and-suspenders on top of `showButtons: []`: force the footer
      // (progress + button row) out of the DOM outright, so there is no
      // "Got it"/next affordance to click past this prompt without picking
      // a dataset, regardless of driver.js's own default-button fallback.
      onPopoverRender: (popover) => {
        popover.footer.style.display = 'none';
      },
      steps: [
        {
          element: '#nmf-tour-dataset',
          disableActiveInteraction: false,
          popover: {
            title: this.t('DATASET_01_TITLE'),
            description: this.t('DATASET_01_DESCRIPTION'),
            side: 'right',
            align: 'start',
          },
          // Mat select panel mounts outside the highlight; keep the SVG mask from eating clicks.
          onHighlighted: () => {
            requestAnimationFrame(() => this.disarmDriverStage());
            setTimeout(() => this.disarmDriverStage(), 0);
            setTimeout(() => this.disarmDriverStage(), 50);
          },
        },
      ],
      onDestroyed: () => {
        this.datasetPromptActive = false;
        this.detachEnterAdvance();
        this.detachDatasetPromptEnterBlock();
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
      },
    });

    this.driverInstance = d;
    this.attachDatasetPromptEnterBlock();
    setTimeout(() => d.drive(0), 0);
  }

  /** Close the dataset picker highlight without dismissing the main tutorial. */
  endDatasetPrompt(): void {
    if (!this.datasetPromptActive) {
      return;
    }
    this.destroyDriver(true);
  }

  /**
   * Seven-step popover tour of the Event Characteristics histograms (toolbar ?).
   * Does not dismiss the main tutorial session flag.
   */
  startHistogramHelpTour(): void {
    this.destroyDriver(true);
    this.histHelpTourActive = true;
    this.hooks?.ensureCharPanelOpen();
    this.hooks?.setResultsTab('characteristics');

    const steps: DriveStep[] = [
      {
        element: '[data-testid="nmf-hist-multiplicity"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('HIST_HELP_01_TITLE'),
          description: this.t('HIST_HELP_01_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-multiplicity'),
      },
      {
        element: '[data-testid="nmf-hist-multiplicityMinPt"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('HIST_HELP_02_TITLE'),
          description: this.t('HIST_HELP_02_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-multiplicityMinPt'),
      },
      {
        element: '[data-testid="nmf-hist-secondaries"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('HIST_HELP_03_TITLE'),
          description: this.t('HIST_HELP_03_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-secondaries'),
      },
      {
        element: '[data-testid="nmf-hist-pt"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('HIST_HELP_04_TITLE'),
          description: this.t('HIST_HELP_04_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-pt'),
      },
      {
        element: '[data-testid="nmf-hist-charge"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('HIST_HELP_05_TITLE'),
          description: this.t('HIST_HELP_05_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-charge'),
      },
      {
        element: '[data-testid="nmf-hist-phi"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('HIST_HELP_06_TITLE'),
          description: this.t('HIST_HELP_06_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-phi'),
      },
      {
        element: '.nmf-hist-grid',
        disableActiveInteraction: false,
        popover: {
          title: this.t('HIST_HELP_07_TITLE'),
          description: this.t('HIST_HELP_07_DESCRIPTION'),
          side: 'left',
          align: 'center',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-multiplicity'),
      },
    ];

    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => {
        /* keep the walkthrough until Next / Done / Close */
      },
      // No dimming: a red outline (global CSS, .driver-active-element) frames
      // the highlighted element exactly instead of darkening everything else.
      overlayOpacity: 0,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'lsa-driver-popover',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Previous',
      doneBtnText: 'Got it',
      showButtons: ['next', 'previous', 'close'],
      steps,
      onDestroyed: () => {
        this.histHelpTourActive = false;
        this.detachEnterAdvance();
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
        this.hooks?.refreshHost();
      },
    });

    this.driverInstance = d;
    this.attachEnterAdvance();
    setTimeout(() => d.drive(0), 0);
  }

  /**
   * Three-step walkthrough of the R_AA Analysis tab (toolbar ? while that tab
   * is open). Written for high-school students; does not dismiss the main tour.
   */
  startRaaAnalysisHelpTour(): void {
    this.destroyDriver(true);
    this.histHelpTourActive = true;
    this.hooks?.ensureCharPanelOpen();
    this.hooks?.setResultsTab('raa');

    const steps: DriveStep[] = [
      {
        element: '[data-testid="nmf-analysis-results"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('RAA_HELP_01_TITLE'),
          description: this.t('RAA_HELP_01_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-analysis-results'),
      },
      {
        element: '[data-testid="nmf-analysis-results"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('RAA_HELP_02_TITLE'),
          description: this.t('RAA_HELP_02_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-testid="nmf-analysis-plots"]',
        disableActiveInteraction: false,
        popover: {
          title: this.t('RAA_HELP_03_TITLE'),
          description: this.t('RAA_HELP_03_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-analysis-plots'),
      },
    ];

    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => {
        /* keep the walkthrough until Next / Done / Close */
      },
      // No dimming: a red outline (global CSS, .driver-active-element) frames
      // the highlighted element exactly instead of darkening everything else.
      overlayOpacity: 0,
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'lsa-driver-popover',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Previous',
      doneBtnText: 'Got it',
      showButtons: ['next', 'previous', 'close'],
      steps,
      onDestroyed: () => {
        this.histHelpTourActive = false;
        this.detachEnterAdvance();
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
        this.hooks?.refreshHost();
      },
    });

    this.driverInstance = d;
    this.attachEnterAdvance();
    setTimeout(() => d.drive(0), 0);
  }

  private scrollHistIntoView(testId: string): void {
    const el = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
  }

  /** True when Enter should type into the focused control, not advance the tour. */
  private static isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }
    return target.isContentEditable;
  }

  private attachEnterAdvance(): void {
    this.detachEnterAdvance();
    window.addEventListener('keydown', this.onEnterAdvance);
  }

  private detachEnterAdvance(): void {
    window.removeEventListener('keydown', this.onEnterAdvance);
  }

  /**
   * Update the pick-progress label; advances when every primary on event 1 is clicked.
   */
  notifyPrimaryPickProgress(selected: number, total: number): void {
    if (!this.awaitingPrimaryPicks || !this.driverInstance?.isActive()) {
      return;
    }
    const progress = document.getElementById('nmf-tour-primary-progress');
    if (progress) {
      progress.textContent = `${selected} / ${total}`;
    }
    if (total <= 0 || selected < total) {
      return;
    }
    this.awaitingPrimaryPicks = false;
    this.hooks?.setPrimaryPickChallenge(false);
    this.hooks?.setNextEventLocked(false);
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /** Advance past the “go to next event” step once the student presses Next. */
  notifyNextEventNavigated(): void {
    if (!this.awaitingNextEvent || !this.driverInstance?.isActive()) {
      return;
    }
    this.awaitingNextEvent = false;
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /** Advance past the Blockly Submit function step once the filter validates. */
  notifyFilterSubmitted(): void {
    if (!this.awaitingFilterSubmit || !this.driverInstance?.isActive()) {
      return;
    }
    this.awaitingFilterSubmit = false;
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  /** Advance past the marquee step once the student analyses an event. */
  notifyEventAnalyzed(): void {
    if (!this.awaitingMarquee || !this.driverInstance?.isActive()) {
      return;
    }
    this.awaitingMarquee = false;
    setTimeout(() => {
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  startMainTour(): void {
    this.destroyDriver(true);
    const steps = this.buildSteps();

    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => {
        /* overlay click must not close the tour */
      },
      // No dimming: a red outline (global CSS, .driver-active-element) frames
      // the highlighted element exactly instead of darkening everything else.
      overlayOpacity: 0,
      stagePadding: 2,
      stageRadius: 4,
      popoverClass: 'lsa-driver-popover',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Previous',
      doneBtnText: 'Done',
      showButtons: ['next', 'previous', 'close'],
      steps,
      onDestroyed: () => {
        this.detachEnterAdvance();
        if (!this.suppressDismissOnDestroy) {
          this.dismiss();
        }
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
        this.awaitingFilterSubmit = false;
        this.awaitingMarquee = false;
        this.awaitingPrimaryPicks = false;
        this.awaitingNextEvent = false;
        this.hooks?.setFilterBuilderOpen(false);
        this.hooks?.setMarqueeMode(false);
        this.hooks?.setPrimaryPickChallenge(false);
        this.hooks?.setNextEventLocked(false);
      },
    });

    this.driverInstance = d;
    this.attachEnterAdvance();
    this.hooks?.refreshHost();
    setTimeout(() => d.drive(0), 0);
  }

  /** Open Blockly overlay and flush host CD before the next highlight. */
  private prepareFilterBuilder(): void {
    this.hooks?.setFilterBuilderOpen(true);
  }

  /**
   * Open the filter panel and stop the driver.js SVG mask from eating Blockly
   * pointer events (drag from flyout needs a clear hit target on the panel).
   */
  private prepareFilterInteraction(): void {
    this.prepareFilterBuilder();
    // Path uses inline pointer-events:auto; clear it after the stage paints /
    // after refresh(), otherwise the SVG mask can still steal Blockly drags.
    requestAnimationFrame(() => this.disarmDriverStage());
    setTimeout(() => this.disarmDriverStage(), 0);
    setTimeout(() => this.disarmDriverStage(), 50);
  }

  private disarmDriverStageDeferred(): void {
    requestAnimationFrame(() => this.disarmDriverStage());
    setTimeout(() => this.disarmDriverStage(), 0);
    setTimeout(() => this.disarmDriverStage(), 50);
  }

  private disarmDriverStage(): void {
    const path = document.querySelector<SVGElement>('.driver-overlay path');
    if (path) {
      path.style.pointerEvents = 'none';
    }
  }

  /** Resolve a tour target after mounting tour-only UI (Blockly / tabs). */
  private requireElement(id: string): Element {
    const el = document.getElementById(id);
    if (!el) {
      return document.createElement('div');
    }
    return el;
  }


  /**
   * Click every primary → move on → why we do not do that forever → build the
   * filter. Shared by the guided tour and by the workshop path, which runs
   * exactly these four steps and stops once the builder is up: the point is to
   * feel how slow hand-picking is, and an instructor covers the rest.
   */
  private handPickingSteps(): DriveStep[] {
    return [
      {
        element: NMF_TOUR_3D_SELECTOR,
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_07_TITLE'),
          description: this.t('MAIN_07_DESCRIPTION'),
          side: 'left',
          align: 'center',
          // Must click every primary — no skipping ahead.
          showButtons: ['previous', 'close'],
        },
        onHighlighted: () => {
          this.awaitingPrimaryPicks = true;
          this.hooks?.ensureFirstEvent();
          this.hooks?.setNextEventLocked(true);
          this.hooks?.setPrimaryPickChallenge(true);
          requestAnimationFrame(() => this.disarmDriverStage());
          setTimeout(() => this.disarmDriverStage(), 0);
          setTimeout(() => this.disarmDriverStage(), 50);
        },
        onDeselected: () => {
          this.awaitingPrimaryPicks = false;
          this.hooks?.setPrimaryPickChallenge(false);
        },
      },
      {
        element: '#event-display-next-event',
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_08_TITLE'),
          description: this.t('MAIN_08_DESCRIPTION'),
          side: 'left',
          align: 'center',
          showButtons: ['close'],
        },
        onHighlighted: () => {
          this.awaitingNextEvent = true;
          this.hooks?.setNextEventLocked(false);
          requestAnimationFrame(() => this.disarmDriverStage());
          setTimeout(() => this.disarmDriverStage(), 0);
        },
        onDeselected: () => {
          this.awaitingNextEvent = false;
        },
      },
      {
        popover: {
          title: this.t('MAIN_09_TITLE'),
          description: this.t('MAIN_09_DESCRIPTION'),
          side: 'over',
        },
        onDeselected: () => this.prepareFilterBuilder(),
      },
      {
        // Highlight the whole panel (not a tiny child) so Blockly stays draggable.
        element: () => {
          this.prepareFilterBuilder();
          return this.requireElement('nmf-tour-filter-builder');
        },
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_10_TITLE'),
          description: this.t('MAIN_10_DESCRIPTION'),
          side: 'top',
          align: 'center',
        },
        onHighlighted: () => {
          this.prepareFilterInteraction();
          // Recalculate the stage once the overlay has its final size.
          setTimeout(() => {
            this.driverInstance?.refresh();
            this.disarmDriverStage();
          }, 0);
        },
      },
    ];
  }

  /**
   * Workshop path: run the hand-picking steps on their own. Ends by itself at
   * the filter builder, which the host then keeps open until a filter is
   * submitted.
   */
  startHandPickingSequence(): void {
    if (this.driverInstance?.isActive()) {
      return;
    }
    this.destroyDriver(true);
    const d = driver({
      showProgress: false,
      smoothScroll: true,
      allowClose: false,
      overlayClickBehavior: () => {
        /* the sequence ends on its own once the builder is open */
      },
      overlayOpacity: 0,
      stagePadding: 2,
      stageRadius: 4,
      popoverClass: 'lsa-driver-popover',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Previous',
      doneBtnText: 'Got it',
      showButtons: ['next'],
      steps: this.handPickingSteps(),
      onHighlighted: () => this.disarmDriverStageDeferred(),
      onDestroyed: () => {
        this.awaitingPrimaryPicks = false;
        this.awaitingNextEvent = false;
        this.awaitingFilterSubmit = false;
        this.hooks?.setPrimaryPickChallenge(false);
        this.hooks?.setNextEventLocked(false);
        this.detachEnterAdvance();
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
        this.hooks?.refreshHost();
      },
    });
    this.driverInstance = d;
    this.attachEnterAdvance();
    this.hooks?.refreshHost();
    setTimeout(() => d.drive(0), 0);
  }

  private buildSteps(): DriveStep[] {
    return [
      {
        element: '#nmf-tour-event-nav',
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_01_TITLE'),
          description: this.t('MAIN_01_DESCRIPTION'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: NMF_TOUR_3D_SELECTOR,
        popover: {
          title: this.t('MAIN_02_TITLE'),
          description: this.t('MAIN_02_DESCRIPTION'),
          side: 'left',
          align: 'center',
        },
      },
      {
        element: '#nmf-tour-visibility',
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_03_TITLE'),
          description: this.t('MAIN_03_DESCRIPTION'),
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '#nmf-tour-hist-help',
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_04_TITLE'),
          description: this.t('MAIN_04_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => {
          this.hooks?.ensureCharPanelOpen();
          this.hooks?.setResultsTab('characteristics');
        },
      },
      {
        element: () => {
          this.hooks?.ensureCharPanelOpen();
          this.hooks?.setResultsTab('raa');
          return this.requireElement('nmf-tour-raa-analysis');
        },
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_05_TITLE'),
          description: this.t('MAIN_05_DESCRIPTION'),
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => {
          this.hooks?.ensureCharPanelOpen();
          this.hooks?.setResultsTab('raa');
          setTimeout(() => this.driverInstance?.refresh(), 0);
        },
        onDeselected: () => {
          this.hooks?.setResultsTab('characteristics');
        },
      },
      {
        popover: {
          title: this.t('MAIN_06_TITLE'),
          description: this.t('MAIN_06_DESCRIPTION'),
          side: 'over',
        },
        onDeselected: () => {
          this.hooks?.showDemonstrationEvent();
        },
      },
      {
        // The magnet-off collision. Straight tracks are the whole point, so the
        // student is shown it and told why before the bent ones arrive.
        element: NMF_TOUR_3D_SELECTOR,
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_MAGNET_TITLE'),
          description: this.t('MAIN_MAGNET_DESCRIPTION'),
          side: 'left',
          align: 'center',
        },
        onHighlighted: () => {
          this.hooks?.showDemonstrationEvent();
          requestAnimationFrame(() => this.disarmDriverStage());
          setTimeout(() => this.disarmDriverStage(), 0);
        },
        onDeselected: () => {
          this.hooks?.ensureFirstEvent();
          this.hooks?.setNextEventLocked(true);
        },
      },
      ...this.handPickingSteps(),
      {
        // Keep the whole builder highlighted so students can still edit blocks here.
        element: () => {
          this.prepareFilterBuilder();
          return this.requireElement('nmf-tour-filter-builder');
        },
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_11_TITLE'),
          description: this.t('MAIN_11_DESCRIPTION'),
          side: 'top',
          align: 'center',
          showButtons: ['previous', 'close'],
        },
        onHighlighted: () => {
          this.awaitingFilterSubmit = true;
          this.prepareFilterInteraction();
          setTimeout(() => {
            this.driverInstance?.refresh();
            this.disarmDriverStage();
          }, 0);
        },
        onDeselected: () => {
          this.awaitingFilterSubmit = false;
        },
      },
      {
        popover: {
          title: this.t('MAIN_12_TITLE'),
          description: this.t('MAIN_12_DESCRIPTION'),
          side: 'over',
        },
        onHighlighted: () => this.hooks?.setFilterBuilderOpen(false),
      },
      {
        element: NMF_TOUR_3D_SELECTOR,
        disableActiveInteraction: false,
        popover: {
          title: this.t('MAIN_13_TITLE'),
          description: this.t('MAIN_13_DESCRIPTION'),
          side: 'left',
          showButtons: ['previous', 'close'],
        },
        onHighlighted: () => {
          this.awaitingMarquee = true;
          this.hooks?.setMarqueeMode(true);
        },
        onDeselected: () => {
          this.awaitingMarquee = false;
        },
      },
      {
        element: '#nmf-tour-event-nav',
        popover: {
          title: this.t('MAIN_14_TITLE'),
          description: this.t('MAIN_14_DESCRIPTION'),
          side: 'right',
          align: 'start',
        },
        onHighlighted: () => this.hooks?.setMarqueeMode(true),
      },
      {
        popover: {
          title: this.t('MAIN_15_TITLE'),
          description: this.t('MAIN_15_DESCRIPTION'),
          side: 'over',
        },
      },
    ];
  }
}
