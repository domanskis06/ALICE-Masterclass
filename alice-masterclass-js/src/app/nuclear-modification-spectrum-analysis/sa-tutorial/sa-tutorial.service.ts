import { Injectable } from '@angular/core';
import { driver, type DriveStep, type Driver } from 'driver.js';

import { RaaStep, RaaStepKind } from '../../shared/models/raa/spectrum';
import {
  NMF_SA_CLASSES_TO_COLLECT,
  NMF_SA_GATES,
  NMF_SA_SELECTOR_CLASSES,
  NMF_SA_SELECTOR_EXTRACT,
  NMF_SA_SELECTOR_PAGE,
  NMF_SA_SELECTOR_PLOTS,
  NMF_SA_SELECTOR_RESULTS,
  NMF_SA_SELECTOR_RUN,
  NMF_SA_SELECTOR_WORKSPACE,
  NMF_SA_STEP_COLLECT,
  NMF_SA_TOUR_CENTRALITY,
  NmfSaToolboxCategory,
  flattenRecipeKinds,
} from './sa-tutorial.constants';

export interface NmfSaTutorialHostHooks {
  /** Empty the workspace and the accumulated plots. */
  clearWorkspace: () => void;
  /** Open a toolbox category so the student sees the blocks it holds. */
  openToolboxCategory: (name: NmfSaToolboxCategory) => void;
  /** Keep Run disabled until the step that asks for it. */
  setRunLocked: (locked: boolean) => void;
  /** Force a host change-detection pass (e.g. after a side-help tour ends). */
  refreshHost: () => void;
}

/** Injected only in NuclearModificationSpectrumAnalysisModule. */
@Injectable()
export class NmfSaTutorialService {
  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;
  private hooks: NmfSaTutorialHostHooks | null = null;
  /** Standalone ?-button walkthroughs; they must not dismiss the main tour. */
  private helpTourActive = false;

  /* —— gate state —— */

  private recipeKinds = new Set<RaaStepKind>();
  /**
   * Guards against advancing more than one step per gate resolution. Blockly
   * fires several change events for a single drag (create, move, select…), and
   * `notifyRecipeChanged` re-evaluates the gate on every one of them. Without
   * this flag, each of those redundant calls queued its own
   * `setTimeout(moveNext)`, and `moveNext()` does not re-check the gate before
   * executing — so a single drag that satisfied a gate could fire moveNext
   * three or four times in a row, blowing straight through the next one or two
   * *gated* steps without their requirements ever being met.
   */
  private advancePending = false;
  /** Run was pressed and the recipe has not changed since. */
  private ranWithCurrentRecipe = false;
  private classesCollected = 0;

  private readonly onEnterAdvance = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== 'NumpadEnter') {
      return;
    }
    if (!this.driverInstance?.isActive()) {
      return;
    }
    // Action-gated steps: the student must actually build the step.
    if (this.activeGate()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (NmfSaTutorialService.isTypingTarget(event.target)) {
      return;
    }
    event.preventDefault();
    this.driverInstance.moveNext();
  };

  shouldShow(): boolean {
    return !this.dismissedThisSession;
  }

  dismiss(): void {
    this.dismissedThisSession = true;
  }

  clearDismissFlag(): void {
    this.dismissedThisSession = false;
  }

  registerHost(hooks: NmfSaTutorialHostHooks): void {
    this.hooks = hooks;
  }

  isActive(): boolean {
    return this.driverInstance?.isActive() ?? false;
  }

  destroyDriver(suppressDismissOnDestroy = false): void {
    this.suppressDismissOnDestroy = suppressDismissOnDestroy;
    this.helpTourActive = false;
    this.hooks?.setRunLocked(false);
    this.detachEnterAdvance();
    this.driverInstance?.destroy();
    this.driverInstance = null;
  }

  /* —— notifications from the host —— */

  /** The workspace changed: remember which steps exist and invalidate the last run. */
  notifyRecipeChanged(steps: RaaStep[]): void {
    this.recipeKinds = new Set(flattenRecipeKinds(steps));
    this.ranWithCurrentRecipe = false;
    this.evaluateGate();
  }

  /** Run finished; `classes` counts the distinct centralities now on the R_AA plot. */
  notifyRunCompleted(classes: number): void {
    this.ranWithCurrentRecipe = true;
    this.classesCollected = classes;
    this.updateCollectProgress();
    this.evaluateGate();
  }

  /* —— gating —— */

  /** The gate of the active step, or null when the step is free to skip. */
  private activeGate(): { kinds: RaaStepKind[]; requireRun?: boolean; classes?: number } | null {
    const index = this.driverInstance?.getActiveIndex();
    if (index === undefined) {
      return null;
    }
    return NMF_SA_GATES[index] ?? null;
  }

  private evaluateGate(): void {
    if (!this.driverInstance?.isActive() || this.advancePending) {
      return;
    }
    const gate = this.activeGate();
    if (!gate) {
      return;
    }
    const haveKinds = gate.kinds.every((kind) => this.recipeKinds.has(kind));
    if (!haveKinds) {
      return;
    }
    if (gate.requireRun && !this.ranWithCurrentRecipe) {
      return;
    }
    if (gate.classes !== undefined && this.classesCollected < gate.classes) {
      return;
    }
    this.advancePending = true;
    setTimeout(() => {
      this.advancePending = false;
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
    }, 0);
  }

  private updateCollectProgress(): void {
    const label = document.getElementById('nmf-sa-tour-collect-progress');
    if (label) {
      label.textContent = `${Math.min(this.classesCollected, NMF_SA_CLASSES_TO_COLLECT)} / ${NMF_SA_CLASSES_TO_COLLECT}`;
    }
  }

  /* —— help tours —— */

  /** ? above the workspace: what each block category is for. */
  startBlockHelpTour(): void {
    this.destroyDriver(true);
    this.helpTourActive = true;

    const steps: DriveStep[] = [
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: '1 / 5 — Four block categories',
          description:
            '<strong>Events</strong> load and count collisions. <strong>Tracks</strong> build the p<sub>T</sub> histogram. <strong>Normalise</strong> divides by bin width, N<sub>evt</sub> and the number of collisions. <strong>References &amp; plot</strong> loads pp or peripheral, divides, and draws.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: '2 / 5 — Load, select, fill',
          description:
            '<strong>Load tracks</strong>, <strong>Select centrality</strong>, <strong>Create empty pT histogram</strong>, then <strong>Fill</strong>. Optional: <strong>Cut pT above</strong> before filling.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: '3 / 5 — Look up, then divide',
          description:
            '<strong>Count events → N_evt</strong> and <strong>Look up number of collisions → N_coll</strong> store variables. Then divide by bin width, by N<sub>evt</sub>, and by N<sub>coll</sub>.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: '4 / 5 — References',
          description:
            '<strong>Load pp reference</strong> or <strong>Load peripheral</strong>, then <strong>Divide by loaded reference</strong>. <strong>Draw line at 1</strong> before plotting R<sub>AA</sub> or R<sub>CP</sub>.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_RUN,
        disableActiveInteraction: false,
        popover: {
          title: '5 / 5 — Run and read the notes',
          description:
            '<strong>Run</strong> executes your blocks on the real data. If the chain is incomplete or the units do not work out, notes appear under this header saying what is physically wrong — they never tell you which block to drag.',
          side: 'bottom',
          align: 'end',
        },
      },
    ];

    this.driveHelp(steps);
  }

  /** ? above the plots: how to read each figure. */
  startPlotHelpTour(): void {
    this.destroyDriver(true);
    this.helpTourActive = true;

    const steps: DriveStep[] = [
      {
        element: NMF_SA_SELECTOR_PLOTS,
        disableActiveInteraction: false,
        popover: {
          title: '1 / 4 — Multiplicity per class',
          description:
            'One entry per event: how many accepted charged tracks it contained. Central collisions produce far more particles than peripheral ones, which is exactly how centrality is measured in the first place.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_PLOTS,
        disableActiveInteraction: false,
        popover: {
          title: '2 / 4 — Multiplicity vs centrality',
          description:
            'The two-dimensional map of all ~40 000 events. The colour is how many events fall in a cell, on a logarithmic scale. The band running from top left to bottom right shows that centrality and multiplicity are two views of the same thing.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_PLOTS,
        disableActiveInteraction: false,
        popover: {
          title: '3 / 4 — The p<sub>T</sub> spectrum',
          description:
            'Both axes are logarithmic, because particle production falls by many orders of magnitude between 0.15 and 50 GeV/c. Error bars are the statistical uncertainty √N of the entries in that bin; empty bins are reported instead of drawn.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_PLOTS,
        disableActiveInteraction: false,
        popover: {
          title: '4 / 4 — R<sub>AA</sub> and the line at one',
          description:
            'The dashed line marks <strong>R<sub>AA</sub> = 1</strong>: Pb–Pb behaving like a simple stack of independent pp collisions. Suppression below that line at high p<sub>T</sub> is energy loss in the hot medium. Click any plot to enlarge it.',
          side: 'left',
          align: 'start',
        },
      },
    ];

    this.driveHelp(steps);
  }

  private driveHelp(steps: DriveStep[]): void {
    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => {
        /* keep the walkthrough until Next / Done / Close */
      },
      overlayOpacity: 0.72,
      overlayColor: '#1a1a1a',
      stagePadding: 6,
      stageRadius: 8,
      popoverClass: 'lsa-driver-popover',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Previous',
      doneBtnText: 'Got it',
      showButtons: ['next', 'previous', 'close'],
      steps,
      onDestroyed: () => {
        this.helpTourActive = false;
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

  isHelpTourActive(): boolean {
    return this.helpTourActive;
  }

  /* —— main tour —— */

  startMainTour(): void {
    this.destroyDriver(true);
    this.recipeKinds.clear();
    this.ranWithCurrentRecipe = false;
    this.classesCollected = 0;
    this.advancePending = false;
    this.hooks?.clearWorkspace();

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
      steps: this.buildSteps(),
      onDestroyed: () => {
        this.detachEnterAdvance();
        if (!this.suppressDismissOnDestroy) {
          this.dismiss();
        }
        this.suppressDismissOnDestroy = false;
        this.driverInstance = null;
        this.hooks?.setRunLocked(false);
        this.hooks?.refreshHost();
      },
    });

    this.driverInstance = d;
    this.attachEnterAdvance();
    this.hooks?.refreshHost();
    setTimeout(() => d.drive(0), 0);
  }

  /** Blockly drags need a clear hit target, so the SVG mask must not eat events. */
  private disarmDriverStage(): void {
    const path = document.querySelector<SVGElement>('.driver-overlay path');
    if (path) {
      path.style.pointerEvents = 'none';
    }
  }

  private prepareWorkspaceStep(category: NmfSaToolboxCategory): void {
    this.hooks?.openToolboxCategory(category);
    requestAnimationFrame(() => this.disarmDriverStage());
    setTimeout(() => this.disarmDriverStage(), 0);
    setTimeout(() => this.disarmDriverStage(), 50);
  }

  private buildSteps(): DriveStep[] {
    // Popover buttons of gated steps: no Next, so the step cannot be skipped.
    const gated: DriveStep['popover'] = { showButtons: ['previous', 'close'] };

    return [
      {
        element: NMF_SA_SELECTOR_PAGE,
        popover: {
          title: 'The whole data sample',
          description:
            'Exercise 1 was one collision at a time. Here you have <strong>every</strong> event ALICE recorded for this Masterclass: ~40 000 Pb–Pb collisions sorted into ten centrality classes, plus the published proton–proton reference.<br/><br/>' +
            'On the left you build the analysis out of <strong>blocks</strong> — Events, Tracks, Normalise, References &amp; plot. On the right the plots appear, and they <strong>keep older results</strong> so you can compare centrality classes.',
          side: 'over',
        },
      },
      {
        element: NMF_SA_SELECTOR_RUN,
        disableActiveInteraction: false,
        popover: {
          title: 'Run, and honest feedback',
          description:
            '<strong>Run</strong> executes your blocks on the real data; <strong>Clear</strong> empties the workspace so you can start the next centrality class — your plots and the collected R_AA sheet stay. Nothing is pre-assembled for you, and nothing is silently fixed: if a normalisation is missing, notes appear under this header explaining what is <em>physically</em> wrong with the result — not which block you forgot.',
          side: 'bottom',
          align: 'end',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'Start with the events',
          description:
            'Before touching momenta, ask how many collisions you actually have. Narrow the sample to a single centrality class and get its event count into a variable — every yield you measure later has to be divided by it.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () =>
          this.prepareWorkspaceStep('events'),
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'Count what is inside them',
          description:
            'Now ask what came out of those collisions: one entry per event, counting the accepted charged tracks. Run when the chain looks right.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () => this.prepareWorkspaceStep('events'),
      },
      {
        popover: {
          title: 'That is a real measurement',
          description:
            'Centrality is not read off a label in the data — it is <em>defined</em> by how many particles come out. Your histogram is the distribution physicists cut into percentiles to build the ten classes in the first place.',
          side: 'over',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'See the whole sample at once',
          description:
            'Now put that count against centrality for the whole sample. Every one of the ~40 000 events becomes one point on a two-dimensional map — watch how the band bends: more central (small percentage) means many more particles.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () => this.prepareWorkspaceStep('events'),
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'Now the momenta',
          description:
            'Switch from counting events to counting tracks. You want the transverse-momentum distribution of the tracks in that same centrality class, binned the way ALICE bins it — then plot it, from <strong>References &amp; plot</strong>, so there is something to look at. Mind the class — it has to match the one you counted events for.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () =>
          this.prepareWorkspaceStep('tracks'),
      },
      {
        element: NMF_SA_SELECTOR_PLOTS,
        disableActiveInteraction: false,
        popover: {
          title: 'Something is wrong with this spectrum',
          description:
            'Look at the plot: it has <strong>steps</strong> where the binning changes. That is not physics, it is bookkeeping — a bin twice as wide collects twice as many tracks. Raw counts in unequal bins simply cannot be compared.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'Divide by bin width',
          description:
            'Fix it. Each bin has to become a density <strong>per GeV/c</strong> instead of a raw count — then the steps disappear and what is left is the physical shape.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () => this.prepareWorkspaceStep('normalise'),
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'Per event, not per sample',
          description:
            'Bring in the event count from the very beginning. Without it your spectrum only says how long ALICE was running, not what a single collision produces.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () => this.prepareWorkspaceStep('normalise'),
      },
      {
        element: NMF_SA_SELECTOR_CLASSES,
        disableActiveInteraction: false,
        popover: {
          title: 'Where N_coll comes from',
          description:
            'This table is <strong>input</strong>, not a measurement: a Glauber model turns the centrality of a collision into the average number of nucleon–nucleon collisions inside it. A 0–5% collision contains a few hundred times more of them than an 80–90% one — the factor R<sub>AA</sub> exists to divide out.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'One nucleon–nucleon collision',
          description:
            'A central Pb–Pb collision contains hundreds of nucleon–nucleon collisions. Scale your yield down to a single one of them, taking N<sub>coll</sub> from the table you just saw. Read it for the wrong class and your R<sub>AA</sub> is off by a large factor.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () =>
          this.prepareWorkspaceStep('normalise'),
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'Compare with proton–proton',
          description:
            'Everything so far describes Pb–Pb on its own. Compare it against the published proton–proton spectrum, mark where the ratio would be 1, and plot what comes out as R<sub>AA</sub>.',
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () =>
          this.prepareWorkspaceStep('plot'),
      },
      {
        element: NMF_SA_SELECTOR_RESULTS,
        disableActiveInteraction: false,
        popover: {
          title: 'Your numbers',
          description:
            'Every class you plot fills a line of this sheet with R<sub>AA</sub> at <strong>5.5 GeV/c</strong> and <strong>10 GeV/c</strong> — the two momenta the moderator collects. <strong>Copy</strong> hands the whole table over at once.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_EXTRACT,
        disableActiveInteraction: false,
        popover: {
          title: 'Any other bin',
          description:
            'For a momentum that is not one of those two, read it off here — or with the <strong>Read value at</strong> block, which marks the number in the sheet above as read on purpose.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: `Now do it for ${NMF_SA_CLASSES_TO_COLLECT} classes`,
          description:
            'One class is not a measurement. Repeat the chain for other centralities — one at a time, or by making it loop over several at once. Whatever you change, the class has to stay consistent across the whole chain. ' +
            `Collect <strong>${NMF_SA_CLASSES_TO_COLLECT}</strong> different classes: <strong id="nmf-sa-tour-collect-progress">0 / ${NMF_SA_CLASSES_TO_COLLECT}</strong>`,
          side: 'right',
          align: 'start',
          ...gated,
        },
        onHighlighted: () => {
          this.prepareWorkspaceStep('plot');
          this.updateCollectProgress();
        },
      },
      {
        popover: {
          title: 'You measured jet quenching',
          description:
            'Compare your classes: peripheral collisions sit near 1, central ones are suppressed by a factor of several.<br/><br/>' +
            'Two things left. Build R<sub>CP</sub> as well — the same ratio, but against a peripheral class instead of proton–proton, so it needs no pp measurement at all. And report your values at <strong>5.5</strong> and <strong>10 GeV/c</strong>.',
          side: 'over',
        },
      },
    ];
  }

  /* —— keyboard —— */

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

  /** Exposed for the host: the tour asks for this class in its example. */
  get tourCentrality(): string {
    return NMF_SA_TOUR_CENTRALITY;
  }

  /** Exposed for tests: the collect step is the only one counting classes. */
  get collectStepIndex(): number {
    return NMF_SA_STEP_COLLECT;
  }
}
