import { Injectable } from '@angular/core';
import { driver, type DriveStep, type Driver, type PopoverDOM } from 'driver.js';

import { RaaProblem, RaaStep, RaaStepKind } from '../../shared/models/raa/spectrum';
import {
  NMF_SA_CLASSES_TO_COLLECT,
  NMF_SA_GATES,
  NMF_SA_SELECTOR_PAGE,
  NMF_SA_SELECTOR_PLOTS,
  NMF_SA_SELECTOR_RESULTS,
  NMF_SA_SELECTOR_RUN,
  NMF_SA_SELECTOR_WORKSPACE,
  MISSION_GROUPS,
  NMF_SA_STEP_COLLECT,
  NMF_SA_TOUR_CENTRALITY,
  NmfSaGate,
  NmfSaMissionStep,
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

/** Left edge of the docked tour window, under the block-picker column. */
const NMF_SA_DOCKED_POPOVER_LEFT = 16;

/** Injected only in NuclearModificationSpectrumAnalysisModule. */
/** A figure the plot walkthrough can visit, in the order the tour visits them. */
export interface NmfSaPlotTourTarget {
  key: string;
  /** Bring this figure on screen — the panel shows one plot at a time. */
  show: () => void;
}

/**
 * Copy for the plot walkthrough. Keys match `NmfPlotCard.key`; a figure the
 * student has not produced yet is simply skipped, so the tour is as long as
 * their progress and never describes a plot that is not on screen.
 */
const PLOT_HELP_COPY: { key: string; title: string; description: string }[] = [
  {
    key: 'multiplicity',
    title: 'Multiplicity per class',
    description:
      'One entry per event: how many accepted charged tracks it contained. Central collisions produce far more particles than peripheral ones, which is exactly how centrality is measured in the first place.',
  },
  {
    key: 'mult-vs-centrality',
    title: 'Multiplicity vs centrality',
    description:
      'The two-dimensional map of all ~40 000 events. The colour is how many events fall in a cell, on a logarithmic scale. The band running from top left to bottom right shows that centrality and multiplicity are two views of the same thing.',
  },
  {
    key: 'pt-spectrum',
    title: 'The p<sub>T</sub> spectrum',
    description:
      'Both axes are logarithmic, because particle production falls by many orders of magnitude between 0.15 and 50 GeV/c. The y axis reads <strong>normalised yield</strong>, which is short for what your normalisation blocks actually did to the raw counts:<br><br><em>1 / (N<sub>evt</sub> · N<sub>coll</sub>) · dN / dp<sub>T</sub></em><br><br>Dividing by the bin width makes bins of different widths comparable; dividing by N<sub>evt</sub> turns a total into a per-collision yield; dividing by N<sub>coll</sub> puts Pb–Pb on the same footing as a stack of pp collisions. Error bars are the statistical uncertainty √N of the entries in that bin; empty bins are reported instead of drawn.',
  },
  {
    key: 'raa',
    title: 'R<sub>AA</sub> and the line at one',
    description:
      'The dashed line marks <strong>R<sub>AA</sub> = 1</strong>: Pb–Pb behaving like a simple stack of independent pp collisions. Suppression below that line at high p<sub>T</sub> is energy loss in the hot medium. Click any plot to enlarge it.',
  },
  {
    key: 'rcp',
    title: 'R<sub>CP</sub>: central over peripheral',
    description:
      'The same comparison without a pp measurement: the central spectrum divided by the peripheral one, each already normalised by its own N<sub>coll</sub>. Peripheral collisions stand in for the unmodified reference, so a dip below one again points at energy loss.',
  },
];

@Injectable()
export class NmfSaTutorialService {
  private driverInstance: Driver | null = null;
  private suppressDismissOnDestroy = false;
  /** In-memory only — resets on full page reload so the welcome dialog shows again. */
  private dismissedThisSession = false;
  private hooks: NmfSaTutorialHostHooks | null = null;
  /** Standalone ?-button walkthroughs; they must not dismiss the main tour. */
  private helpTourActive = false;

  /**
   * Main-tour popover position, `{left, top}` in viewport pixels, dragged by
   * the student via the title bar. `null` means "not dragged yet this tour" —
   * `applyPopoverPosition` then falls back to nudging driver.js's own
   * per-step placement toward the block picker instead of pinning one exact
   * spot, since a fixed spot would cover the picker or the canvas on some
   * steps. Once dragged, the same offset is re-applied on every following
   * step so the window stays where the student put it.
   */
  private popoverPosition: { left: number; top: number } | null = null;
  private popoverDragCleanup: (() => void) | null = null;

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
  /** `RaaProblem.key`s raised by the last Run — checked against gates' `forbidProblemKeys`. */
  private lastRunProblemKeys = new Set<string>();

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
    this.lastRunProblemKeys.clear();
    this.evaluateGate();
  }

  /** Run finished; `classes` counts the distinct centralities now on the R_AA plot. */
  notifyRunCompleted(classes: number, problems: RaaProblem[] = []): void {
    this.ranWithCurrentRecipe = true;
    this.classesCollected = classes;
    this.lastRunProblemKeys = new Set(problems.map((problem) => problem.key));
    this.updateCollectProgress();
    this.markMissionStepsDone();
    this.evaluateGate();
  }

  /* —— gating —— */

  /** The gate of the active step, or null when the step is free to skip. */
  private activeGate(): NmfSaGate | null {
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
    if (gate.forbidProblemKeys?.some((key) => this.lastRunProblemKeys.has(key))) {
      return;
    }
    this.advancePending = true;
    const from = this.driverInstance.getActiveIndex();
    setTimeout(() => {
      this.advancePending = false;
      this.driverInstance?.refresh();
      this.driverInstance?.moveNext();
      // The step just landed on may already be satisfied too — "Build it for
      // me" drops the whole recipe at once, so several gates come true
      // together. Re-check so the tour walks through them instead of stopping
      // after one. Only when the index actually moved: if `moveNext` could not
      // advance (last step, or a driver that refuses), re-evaluating the same
      // gate would spin. The cascade otherwise halts at the first unmet gate,
      // typically one waiting on a Run.
      if (this.driverInstance?.getActiveIndex() !== from) {
        this.evaluateGate();
      }
    }, 0);
  }

  /**
   * Mission steps ever satisfied by a completed Run — sticky by design: once
   * checked off, a step stays checked even if the student later removes or
   * changes the blocks that earned it, same as a paper checklist. Keyed by
   * `NmfSaMissionStep.labelKey`.
   */
  private readonly completedMissionSteps = new Set<string>();

  /**
   * Whether a mission-card step has ever been satisfied by a completed Run.
   * Backs the mission card's and the docked strip's per-step checkmark.
   */
  isMissionStepDone(step: NmfSaMissionStep): boolean {
    return this.completedMissionSteps.has(step.labelKey);
  }

  private markMissionStepsDone(): void {
    for (const group of MISSION_GROUPS) {
      for (const step of group.steps) {
        if (this.completedMissionSteps.has(step.labelKey)) {
          continue;
        }
        const haveKinds = step.gate.kinds.every((kind) => this.recipeKinds.has(kind));
        const blocked = step.gate.forbidProblemKeys?.some((key) =>
          this.lastRunProblemKeys.has(key),
        );
        if (haveKinds && !blocked && (!step.gate.requireRun || this.ranWithCurrentRecipe)) {
          this.completedMissionSteps.add(step.labelKey);
        }
      }
    }
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
          title: '1 / 5: Four block categories',
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
          title: '2 / 5: Load, select, fill',
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
          title: '3 / 5: Look up, then divide',
          description:
            '<strong>Count events → N<sub>evt</sub></strong> and <strong>Look up number of collisions → N<sub>coll</sub></strong> store variables. Then divide by bin width, by N<sub>evt</sub>, and by N<sub>coll</sub>.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: '4 / 5: References',
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
          title: '5 / 5: Run and read the notes',
          description:
            '<strong>Run</strong> executes your blocks on the real data. If the chain is incomplete or the units do not work out, notes appear under this header saying what is physically wrong. They never tell you which block to drag.',
          side: 'bottom',
          align: 'end',
        },
      },
    ];

    this.driveHelp(steps);
  }

  /**
   * ? above the plots: how to read each figure.
   *
   * One step per figure that actually exists, anchored to that figure's tab.
   * Two reasons for the tab rather than the plot itself: only one plot is
   * mounted at a time (the panel is a tabstrip), and anchoring every step to the
   * whole panel — as this tour used to — left the popover parked in one place,
   * so the walkthrough looked frozen even though the text was changing.
   */
  startPlotHelpTour(targets: NmfSaPlotTourTarget[] = []): void {
    this.destroyDriver(true);
    this.helpTourActive = true;

    const available = new Map(targets.map((target) => [target.key, target]));
    const visible = PLOT_HELP_COPY.filter((copy) => available.has(copy.key));

    const steps: DriveStep[] = visible.length
      ? visible.map((copy, index) => ({
          element: `[data-testid="nmf-sa-plot-tab-${copy.key}"]`,
          disableActiveInteraction: false,
          popover: {
            title: `${index + 1} / ${visible.length}: ${copy.title}`,
            description: copy.description,
            side: 'bottom' as const,
            align: 'start' as const,
          },
          // Bring the described figure on screen before talking about it.
          onHighlightStarted: () => available.get(copy.key)?.show(),
        }))
      : [
          {
            element: NMF_SA_SELECTOR_PLOTS,
            disableActiveInteraction: false,
            popover: {
              title: 'Nothing plotted yet',
              description:
                'Figures appear here once you build a chain of blocks and press <strong>Run</strong>. Come back to this button afterwards and it will walk you through every figure you have produced, one at a time.',
              side: 'left' as const,
              align: 'start' as const,
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
    this.popoverPosition = null;
    this.hooks?.clearWorkspace();

    const d = driver({
      showProgress: true,
      smoothScroll: true,
      allowClose: true,
      overlayClickBehavior: () => {
        /* overlay click must not close the tour */
      },
      // No dimming: this tour sits beside the blocks the student is actively
      // dragging, and a darkened page made it feel heavier than the shorter
      // ?-button tours right next to it, which never dim at all.
      overlayOpacity: 0,
      stagePadding: 2,
      stageRadius: 4,
      popoverClass: 'lsa-driver-popover nmf-sa-draggable-popover',
      nextBtnText: 'Next &rarr;',
      prevBtnText: '&larr; Previous',
      doneBtnText: 'Done',
      showButtons: ['next', 'previous', 'close'],
      steps: this.buildSteps(),
      // Fallback for steps with no `onHighlighted` of their own (e.g. the plots
      // panel steps): keeps every step's stage un-masked, so the student can
      // switch between plot tabs at any point in the tour, not just while a
      // workspace step happens to have already disarmed it.
      onHighlighted: () => this.disarmDriverStageDeferred(),
      onPopoverRender: (popover, opts) => {
        this.makePopoverDraggable(popover);
        // Belt-and-suspenders alongside the `onHighlighted` disarm above:
        // this hook is guaranteed to fire on every step (it also drives the
        // draggable popover), so re-disarm here too in case a given step's
        // own `onHighlighted` runs before driver.js has finished mounting
        // the overlay for this step.
        this.disarmDriverStageDeferred();
        const isBuildingStep = opts.state.activeStep?.element === NMF_SA_SELECTOR_WORKSPACE;
        // driver.js repositions the popover itself after this hook runs (it
        // measures and places it against the newly-highlighted element on the
        // same render pass), which clobbered a pin applied synchronously here.
        // Re-assert on the next frame, once driver.js's own layout is done.
        requestAnimationFrame(() => this.applyPopoverPosition(popover, isBuildingStep));
      },
      onDestroyed: () => {
        this.detachEnterAdvance();
        this.popoverDragCleanup?.();
        this.popoverDragCleanup = null;
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

  /**
   * Grab the title bar to move the whole popover; the position sticks for the
   * rest of the tour (`applyPopoverPosition` re-applies it on every step).
   */
  private makePopoverDraggable(popover: PopoverDOM): void {
    this.popoverDragCleanup?.();
    const handle = popover.title;
    handle.classList.add('nmf-sa-popover-drag-handle');

    let dragging = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;

    const onPointerDown = (event: PointerEvent) => {
      // Buttons live in the footer, not the title — only the title starts a drag.
      dragging = true;
      startX = event.clientX;
      startY = event.clientY;
      const rect = popover.wrapper.getBoundingClientRect();
      originLeft = rect.left;
      originTop = rect.top;
      handle.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) {
        return;
      }
      const left = originLeft + (event.clientX - startX);
      const top = originTop + (event.clientY - startY);
      this.popoverPosition = { left, top };
      this.pinPopoverAt(popover, left, top);
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      handle.releasePointerCapture(event.pointerId);
    };

    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    this.popoverDragCleanup = () => {
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerUp);
    };
  }

  /**
   * A drag always wins, on any step. Failing that: steps that ask the student
   * to build something (`element` is the workspace) dock the window at a
   * fixed spot under the block picker and *keep it there* while blocks are
   * being dragged in and out — the user's own instruction was that it must
   * not hop around mid-build. Steps that instead point at one specific
   * component (Run, the plots, a results panel…) are left to driver.js's own
   * per-element placement, since "showing a component" is exactly when moving
   * next to it is the point.
   */
  private applyPopoverPosition(popover: PopoverDOM, isBuildingStep: boolean): void {
    if (this.popoverPosition) {
      this.pinPopoverAt(popover, this.popoverPosition.left, this.popoverPosition.top);
      return;
    }
    if (isBuildingStep) {
      this.pinPopoverAt(popover, NMF_SA_DOCKED_POPOVER_LEFT, null);
    }
    // Otherwise: leave driver.js's own placement for this render alone.
  }

  /**
   * `top: null` docks to the bottom of the viewport instead of a `top` pixel
   * value — the fixed "under the blocks" spot for building steps, stable
   * regardless of how tall the popover's own content is for that step.
   */
  private pinPopoverAt(popover: PopoverDOM, left: number, top: number | null): void {
    const wrapper = popover.wrapper;
    const maxLeft = window.innerWidth - wrapper.offsetWidth - 8;
    wrapper.style.position = 'fixed';
    wrapper.style.left = `${Math.min(Math.max(8, left), Math.max(8, maxLeft))}px`;
    wrapper.style.right = 'auto';
    if (top === null) {
      wrapper.style.top = 'auto';
      wrapper.style.bottom = '4px';
    } else {
      const maxTop = window.innerHeight - wrapper.offsetHeight - 8;
      wrapper.style.top = `${Math.min(Math.max(8, top), Math.max(8, maxTop))}px`;
      wrapper.style.bottom = 'auto';
    }
    wrapper.style.margin = '0';
  }

  /** Blockly drags need a clear hit target, so the SVG mask must not eat events. */
  private disarmDriverStage(): void {
    const path = document.querySelector<SVGElement>('.driver-overlay path');
    if (path) {
      path.style.pointerEvents = 'none';
    }
  }

  private disarmDriverStageDeferred(): void {
    requestAnimationFrame(() => this.disarmDriverStage());
    setTimeout(() => this.disarmDriverStage(), 0);
    setTimeout(() => this.disarmDriverStage(), 50);
  }

  private prepareWorkspaceStep(category: NmfSaToolboxCategory): void {
    this.hooks?.openToolboxCategory(category);
    this.disarmDriverStageDeferred();
    // The gate only re-checks itself on the next workspace change. Landing on
    // a gated step whose blocks were already built earlier (replaying the
    // tour, or stepping back and forward) would otherwise sit there forever.
    this.evaluateGate();
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
            'On the left you build the analysis out of <strong>blocks</strong>: Events, Tracks, Normalise, References &amp; plot. On the right the plots appear, and they <strong>keep older results</strong> so you can compare centrality classes.',
          side: 'over',
        },
      },
      {
        element: NMF_SA_SELECTOR_RUN,
        disableActiveInteraction: false,
        popover: {
          title: 'Run, and honest feedback',
          description:
            '<strong>Run</strong> executes your blocks on the real data. <strong>Clear</strong> empties the workspace so you can start the next centrality class; your plots and the collected R<sub>AA</sub> sheet stay. Nothing is pre-assembled for you, and nothing is silently fixed: if a normalisation is missing, notes appear under this header explaining what is <em>physically</em> wrong with the result, not which block you forgot.',
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
            'Before touching momenta, ask how many collisions you actually have. Narrow the sample to a single centrality class and get its event count into a variable. Every yield you measure later has to be divided by it.',
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
            'Now build a histogram of what each of those collisions actually contained: one entry per event, counting its accepted charged tracks. Attach the block that fills it, then press Run.',
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
          title: 'See the whole sample at once',
          description:
            'Now put that count against centrality for the whole sample. Every one of the ~40 000 events becomes one point on a two-dimensional map. Watch how the band bends: more central (small percentage) means many more particles.',
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
            'Switch from counting events to counting tracks. You want the transverse-momentum distribution of the tracks in that same centrality class, binned the way ALICE bins it, then plot it from <strong>References &amp; plot</strong> so there is something to look at. Mind the class: it has to match the one you counted events for.',
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
            'See those <strong>steps</strong>, where the binning changes? A bin twice as wide collects twice as many tracks for free, no physics involved. That is bookkeeping, not signal, and it has to be removed before bins can be compared to each other at all.',
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
            'Fix it. Each bin has to become a density <strong>per GeV/c</strong> instead of a raw count. Then the steps disappear and what is left is the physical shape.',
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
        element: NMF_SA_SELECTOR_WORKSPACE,
        disableActiveInteraction: false,
        popover: {
          title: 'One nucleon–nucleon collision',
          description:
            'A central Pb–Pb collision contains hundreds of nucleon–nucleon collisions. Scale your yield down to a single one of them with the <strong>Look up number of collisions</strong> block. Read it for the wrong class and your R<sub>AA</sub> is off by a large factor.',
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
            'Every class you plot fills a line of this sheet with R<sub>AA</sub> at <strong>5.5 GeV/c</strong> and <strong>10 GeV/c</strong>, the two momenta the moderator collects.',
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
            'One class is not a measurement. Repeat the chain for other centralities, one at a time. Whatever you change, the class has to stay consistent across the whole chain. ' +
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
            'Two things left. Build R<sub>CP</sub> as well: the same ratio, but against a peripheral class instead of proton–proton, so it needs no pp measurement at all. And report your values at <strong>5.5</strong> and <strong>10 GeV/c</strong>.',
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
