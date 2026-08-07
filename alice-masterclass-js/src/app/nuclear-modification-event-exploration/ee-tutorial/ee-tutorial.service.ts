import { Injectable } from '@angular/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import {
  NMF_EE_STEP_GO_NEXT_EVENT,
  NMF_EE_STEP_MARQUEE,
  NMF_EE_STEP_PICK_PRIMARIES,
  NMF_EE_STEP_SUBMIT_FILTER,
  NMF_TOUR_3D_SELECTOR,
} from './ee-tutorial.constants';

export interface NmfEeTutorialHostHooks {
  /** Force the bottom ANALYZE bar visible for the tour highlight. */
  setTourShowAnalyze: (show: boolean) => void;
  /** Open / close the white Blockly filter builder. */
  setFilterBuilderOpen: (open: boolean) => void;
  /** Enable Shift+drag marquee selection on the 3D view. */
  setMarqueeMode: (on: boolean) => void;
  /** Ensure Event Characteristics drawer is open. */
  ensureCharPanelOpen: () => void;
  /** Select Event Characteristics (0) or R_AA Analysis (1) in the results drawer. */
  setResultsTab: (tab: 'characteristics' | 'raa') => void;
  /** Start / stop the “click every primary on event 1” challenge. */
  setPrimaryPickChallenge: (active: boolean) => void;
  /** Lock the Next-event control until the pick challenge is finished. */
  setNextEventLocked: (locked: boolean) => void;
  /** Ensure the student is on the first event of the pack. */
  ensureFirstEvent: () => void;
}

/** Injected only in NuclearModificationEventExplorationModule. */
@Injectable()
export class NmfEeTutorialService {
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
    this.hooks?.setTourShowAnalyze(false);
    this.hooks?.setFilterBuilderOpen(false);
    this.hooks?.setMarqueeMode(false);
    this.hooks?.setPrimaryPickChallenge(false);
    this.hooks?.setNextEventLocked(false);
    this.detachEnterAdvance();
    this.driverInstance?.destroy();
    this.driverInstance = null;
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
      allowClose: true,
      overlayClickBehavior: () => {
        /* keep the highlight until they pick a dataset or close */
      },
      overlayOpacity: 0.72,
      overlayColor: '#1a1a1a',
      stagePadding: 2,
      stageRadius: 4,
      popoverClass: 'lsa-driver-popover',
      doneBtnText: 'Got it',
      showButtons: ['close'],
      steps: [
        {
          element: '#nmf-tour-dataset',
          disableActiveInteraction: false,
          popover: {
            title: 'Choose your dataset',
            description:
              'Select the <strong>dataset</strong> your instructor assigned to you from this menu. Each dataset is a full exercise pack: one special pp event, thirty pp events at 2.76 TeV, then three PbPb events (peripheral, semi central, central).',
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
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
      },
    });

    this.driverInstance = d;
    setTimeout(() => d.drive(0), 0);
  }

  /** Close the dataset picker highlight without dismissing the main tutorial. */
  endDatasetPrompt(): void {
    if (!this.datasetPromptActive) {
      return;
    }
    this.destroyDriver(true);
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
    if (this.driverInstance.getActiveIndex() !== NMF_EE_STEP_PICK_PRIMARIES) {
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
    if (this.driverInstance.getActiveIndex() !== NMF_EE_STEP_GO_NEXT_EVENT) {
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
    if (this.driverInstance.getActiveIndex() !== NMF_EE_STEP_SUBMIT_FILTER) {
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
    if (this.driverInstance.getActiveIndex() !== NMF_EE_STEP_MARQUEE) {
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
      overlayOpacity: 0.72,
      overlayColor: '#1a1a1a',
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
        this.hooks?.setTourShowAnalyze(false);
        this.hooks?.setFilterBuilderOpen(false);
        this.hooks?.setMarqueeMode(false);
        this.hooks?.setPrimaryPickChallenge(false);
        this.hooks?.setNextEventLocked(false);
      },
    });

    this.driverInstance = d;
    this.attachEnterAdvance();
    setTimeout(() => d.drive(0), 0);
  }

  /** Show ANALYZE footer and flush host CD before the next highlight. */
  private prepareAnalyzeFooter(): void {
    this.hooks?.setTourShowAnalyze(true);
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

  private disarmDriverStage(): void {
    const path = document.querySelector<SVGElement>('.driver-overlay path');
    if (path) {
      path.style.pointerEvents = 'none';
    }
  }

  /** Resolve a tour target after mounting tour-only UI (ANALYZE / Blockly). */
  private requireElement(id: string): Element {
    const el = document.getElementById(id);
    if (!el) {
      return document.createElement('div');
    }
    return el;
  }

  private buildSteps(): DriveStep[] {
    return [
      {
        element: '#nmf-tour-event-nav',
        disableActiveInteraction: false,
        popover: {
          title: 'Event navigation',
          description:
            'Here you see <strong>which event</strong> you are on (for example 1 / 34) and the <strong>collision type</strong>. Use the Previous / Next buttons on the 3D view to move through the pack.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: NMF_TOUR_3D_SELECTOR,
        popover: {
          title: 'The ALICE event display',
          description:
            'This is the reconstructed collision: detector geometry and charged particle <strong>tracks</strong>. Most tracks should come from the <strong>primary vertex</strong> near the centre (X≈0, Y≈0, Z≈0). Tracks from other vertices are pile up or secondaries; we will learn to leave them out.',
          side: 'left',
          align: 'center',
        },
      },
      {
        element: '#nmf-tour-visibility',
        disableActiveInteraction: false,
        popover: {
          title: 'Visibility controls',
          description:
            'Toggle the detector, tracks, axes, side views, and when present <strong>Secondary tracks</strong>. Turning secondaries off is a quick preview of primary tracks only.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '#nmf-tour-hist-help',
        disableActiveInteraction: false,
        popover: {
          title: 'Event Characteristics',
          description:
            'This drawer has two tabs, like a browser. <strong>Event Characteristics</strong> holds six summary histograms that fill as you analyse events. Click the <strong>?</strong> button anytime for a short guide to each plot.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => {
          this.hooks?.ensureCharPanelOpen();
          this.hooks?.setResultsTab('characteristics');
        },
        // Mount the ANALYZE footer and open R_AA before the next step queries it.
        onDeselected: () => this.prepareAnalyzeFooter(),
      },
      {
        // Mount footer + R_AA tab synchronously before driver.js queries the target.
        element: () => {
          this.prepareAnalyzeFooter();
          this.hooks?.setResultsTab('raa');
          return this.requireElement('nmf-tour-raa-analysis');
        },
        disableActiveInteraction: false,
        popover: {
          title: 'R<sub>AA</sub> Analysis tab',
          description:
            'The second tab is <strong>R<sub>AA</sub> Analysis</strong> — the classic Analysis view. After you publish Pb–Pb events it shows Peripheral / SemiCentral / Central <strong>Auto</strong> and <strong>Manual</strong> R<sub>AA</sub> values plus three p<sub>T</sub> spectra. When every event is analysed, the red <strong>Analyze</strong> bar at the bottom jumps you here (and you can continue to Spectrum Analysis). For this tour we open the tab early so you know where it lives.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => {
          this.prepareAnalyzeFooter();
          this.hooks?.setResultsTab('raa');
          setTimeout(() => this.driverInstance?.refresh(), 0);
        },
        onDeselected: () => {
          this.hooks?.setTourShowAnalyze(false);
          this.hooks?.setResultsTab('characteristics');
        },
      },
      {
        popover: {
          title: 'Only primary tracks for R<sub>AA</sub>',
          description:
            'From the workshops you already know that for R<sub>AA</sub> we need <strong>primary tracks</strong>, not secondaries.',
          side: 'over',
        },
        onDeselected: () => {
          this.hooks?.ensureFirstEvent();
          this.hooks?.setNextEventLocked(true);
        },
      },
      {
        element: NMF_TOUR_3D_SELECTOR,
        disableActiveInteraction: false,
        popover: {
          title: 'Select the primary tracks',
          description:
            'Please select the tracks that are <strong>primary tracks</strong>: click each one that comes from the primary vertex near the centre. Leave secondaries alone. Progress: <strong id="nmf-tour-primary-progress">0 / ?</strong>',
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
          title: 'Event complete — go further',
          description:
            'You found every primary track in this event. Now click the <strong>Next</strong> button on the event display to continue to the following event.',
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
          title: 'Why we do not click forever',
          description:
            'Imagine physicists had to pick every primary track by hand in every collision — LHC analyses would take forever. That is why they write <strong>selection algorithms</strong>: clear rules a computer can apply to millions of tracks. Next you will build one that a physicist would not be ashamed of.',
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
          title: 'Build your track filter',
          description:
            'Build a filter we will use to analyse our events, one no physicist would be ashamed of. Keep <strong>charged</strong> tracks whose <strong>DCA</strong> to the primary vertex passes the analysis cuts (|DCA<sub>xy</sub>| and |DCA<sub>z</sub>| below the named primary cuts).',
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
      {
        // Keep the whole builder highlighted so students can still edit blocks here.
        element: () => {
          this.prepareFilterBuilder();
          return this.requireElement('nmf-tour-filter-builder');
        },
        disableActiveInteraction: false,
        popover: {
          title: 'Submit your filter',
          description:
            'When the selection looks right, click <strong>Submit function</strong>. The tour advances only after a valid filter — you cannot skip this step.',
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
          title: 'Filter accepted',
          description:
            'You built a selection just like the one the physicists use. Now apply it on the event display.',
          side: 'over',
        },
        onHighlighted: () => this.hooks?.setFilterBuilderOpen(false),
      },
      {
        element: NMF_TOUR_3D_SELECTOR,
        disableActiveInteraction: false,
        popover: {
          title: 'Select tracks with Shift',
          description:
            'Hold <strong>Shift</strong>, then press and drag a <strong>rectangle</strong> on the display, and release. Without Shift you can still orbit the detector as usual. That gesture marks the event <strong>analysed</strong>: your filter keeps charged <strong>primary</strong> tracks for the whole event, secondary tracks leave the view, and the histograms update. Try it now — the tour moves on only after you analyse an event.',
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
          title: 'Analysed checkmark',
          description:
            'When an event is analysed, a green <strong>done</strong> tick appears next to the event label, the same pattern as Visual Analysis. Analyse every event in the dataset, then use <strong>Analyze</strong> at the bottom to open the <strong>R<sub>AA</sub> Analysis</strong> tab.',
          side: 'right',
          align: 'start',
        },
        onHighlighted: () => this.hooks?.setMarqueeMode(true),
      },
      {
        popover: {
          title: 'You are ready',
          description:
            'Explore events, watch the Event Characteristics histograms fill, and check R<sub>AA</sub> Analysis after Pb–Pb publishes. When the red Analyze bar appears, open that tab and continue to Spectrum Analysis.',
          side: 'over',
        },
      },
    ];
  }
}
