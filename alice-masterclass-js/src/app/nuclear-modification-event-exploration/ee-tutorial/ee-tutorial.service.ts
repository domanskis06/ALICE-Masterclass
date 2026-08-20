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
      // No dimming: a red outline (global CSS, .driver-active-element) frames
      // the highlighted element exactly instead of darkening everything else.
      overlayOpacity: 0,
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
          title: '1 / 7 — Multiplicity distribution',
          description:
            'One entry per analysed event: the number of accepted charged primary tracks the detector sees in that event. The horizontal axis is multiplicity and the vertical axis is how many events had that multiplicity.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-multiplicity'),
      },
      {
        element: '[data-testid="nmf-hist-multiplicityMinPt"]',
        disableActiveInteraction: false,
        popover: {
          title: '2 / 7 — Multiplicity, p<sub>T</sub> &gt; 1 GeV/c',
          description:
            'This works just like the total multiplicity per event, but we only count primary particle tracks with a transverse momentum above <strong>p<sub>T</sub> &gt; 1&nbsp;GeV/c</strong>. High-momentum (“harder”) particles are rarer and much more sensitive to the hot medium because of jet quenching. This makes high-p<sub>T</sub> multiplicity a clearer, more detailed addition to the main multiplicity plot.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-multiplicityMinPt'),
      },
      {
        element: '[data-testid="nmf-hist-secondaries"]',
        disableActiveInteraction: false,
        popover: {
          title: '3 / 7 — Multiplicity of secondaries',
          description:
            'This shows the count of secondary tracks per event, like particle decays, interactions with detector material, or background collisions known as pile up. These tracks must be excluded because R<sub>AA</sub> measures only particles produced directly in the main collision. Including them would distort the final result and give a false signal. This histogram simply shows how much noise your primary filter is cleaning out.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-secondaries'),
      },
      {
        element: '[data-testid="nmf-hist-pt"]',
        disableActiveInteraction: false,
        popover: {
          title: '4 / 7 — p<sub>T</sub> distribution',
          description:
            'This histogram plots the transverse momentum (p<sub>T</sub>) of every accepted primary track. As expected, most particles stay at low p<sub>T</sub>, while high-p<sub>T</sub> particles are extremely rare. The Spectrum Analysis module will later use this distribution to build the R<sub>AA</sub>(p<sub>T</sub>) plot.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-pt'),
      },
      {
        element: '[data-testid="nmf-hist-charge"]',
        disableActiveInteraction: false,
        popover: {
          title: '5 / 7 — Charge distribution',
          description:
            'Electric charge of accepted tracks. Charged reconstructed tracks are only −1 or +1.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-charge'),
      },
      {
        element: '[data-testid="nmf-hist-phi"]',
        disableActiveInteraction: false,
        popover: {
          title: '6 / 7 — Normalized φ projection',
          description:
            'This histogram shows the direction (φ) in which particles fly around the beam line, covering the full 360-degree space. In an ideal setup, particles spread out equally in all directions, creating a flat line. Any unusual peaks or dips can reveal inactive detector zones or collective physical effects from the collision. “Normalized” simply means we are looking at the overall percentage shape rather than raw counts.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-hist-phi'),
      },
      {
        element: '.nmf-hist-grid',
        disableActiveInteraction: false,
        popover: {
          title: '7 / 7 — Enlarge a plot',
          description:
            'Want a closer look? <strong>Click any histogram</strong> to open it in a larger window.',
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
          title: '1 / 3 — Why Peripheral, SemiCentral and Central?',
          description:
            'Two lead nuclei do not always hit the same way. <strong>Peripheral</strong> means a glancing blow (they barely overlap). <strong>SemiCentral</strong> means a bigger overlap. <strong>Central</strong> means an almost head-on smash. A more central collision creates a hotter, denser “fireball” and involves more nucleon–nucleon collisions inside (a larger <strong>N<sub>coll</sub></strong>). We study all three so you can see how the nuclear effect changes with how central the crash was.',
          side: 'left',
          align: 'start',
        },
        onHighlighted: () => this.scrollHistIntoView('nmf-analysis-results'),
      },
      {
        element: '[data-testid="nmf-analysis-results"]',
        disableActiveInteraction: false,
        popover: {
          title: '2 / 3 — What is R<sub>AA</sub>? (quick reminder)',
          description:
            '<strong>R<sub>AA</sub></strong> is the <em>nuclear modification factor</em>. It asks: after a Pb–Pb collision, do we see as many particles as we would expect from <strong>N<sub>coll</sub></strong> separate proton–proton collisions?<br/><br/>' +
            '<code style="display:inline-block;margin:0.35rem 0;padding:0.35rem 0.55rem;background:#f1f5f9;border:1px solid rgba(15,23,42,0.12);border-radius:6px;">R<sub>AA</sub> = Y(Pb–Pb) / (N<sub>coll</sub> × Y(pp))</code><br/><br/>' +
            '<strong>Y</strong> means “how many charged primary tracks we counted”. <strong>Y(pp)</strong> is the average from the roughly 30 pp events you looked at. <strong>Y(Pb–Pb)</strong> is the count from that one Pb–Pb event. <strong>N<sub>coll</sub></strong> is given for each centrality class.<br/><br/>' +
            'If <strong>R<sub>AA</sub> ≈ 1</strong>, Pb–Pb looks like a simple pile-up of pp collisions. If it is clearly <strong>not 1</strong>, the nuclear medium changed particle production (for example by jet quenching).',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-testid="nmf-analysis-plots"]',
        disableActiveInteraction: false,
        popover: {
          title: '3 / 3 — Why Counts vs p<sub>T</sub>?',
          description:
            'These plots show <strong>Counts</strong> against transverse momentum <strong>p<sub>T</sub></strong> — how hard a particle was kicked <em>sideways</em> from the beam direction.<br/><br/>' +
            'Most particles are “soft” (low p<sub>T</sub>). High-p<sub>T</sub> particles are rare, but they feel the hot medium more strongly. Looking at the shape of Counts vs p<sub>T</sub> for each centrality class prepares you for <strong>Spectrum Analysis</strong>, where you build R<sub>AA</sub> as a function of p<sub>T</sub>.',
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
            'This drawer has two tabs, like a browser. <strong>Event Characteristics</strong> holds six summary histograms that fill as you analyse events. <strong>R<sub>AA</sub> Analysis</strong> shows the three centrality results. Click <strong>?</strong> anytime for a short walkthrough of the tab you are on.',
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
          title: 'R<sub>AA</sub> Analysis tab',
          description:
            'This tab shows your <strong>results</strong>. At the top you get three R<sub>AA</sub> numbers — <strong>Peripheral</strong>, <strong>SemiCentral</strong>, and <strong>Central</strong> — for how head-on the Pb–Pb smash was. Underneath are three plots of <strong>Counts vs p<sub>T</sub></strong> (how hard particles were kicked sideways).<br/><br/>' +
            'R<sub>AA</sub> compares each Pb–Pb multiplicity to the average from the roughly 30 pp events you looked at, scaled by <strong>N<sub>coll</sub></strong>. The numbers fill in as you analyse events. Press <strong>?</strong> here anytime for a short reminder.',
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
            'First read <strong>What is DCA?</strong> in the window — why we split <strong>DCA<sub>xy</sub></strong> (across the beam) and <strong>DCA<sub>z</sub></strong> (along the beam). Then build the filter: keep <strong>charged</strong> tracks with |DCA<sub>xy</sub>| and |DCA<sub>z</sub>| below the named primary cuts.',
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
            'When an event is analysed, a green <strong>done</strong> tick appears next to the event label, the same pattern as Visual Analysis. Analyse every event in the dataset, then open the <strong>R<sub>AA</sub> Analysis</strong> tab to see your results.',
          side: 'right',
          align: 'start',
        },
        onHighlighted: () => this.hooks?.setMarqueeMode(true),
      },
      {
        popover: {
          title: 'You are ready',
          description:
            'Explore events, watch the Event Characteristics histograms fill, and check <strong>R<sub>AA</sub> Analysis</strong> after Pb–Pb publishes. When every event is done, use <strong>Continue to Spectrum Analysis</strong> on that tab.',
          side: 'over',
        },
      },
    ];
  }
}
