import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  Type,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { InstructionsProvider } from '../shared/interfaces';
import {
  RaaHeatmap,
  RaaHistogram,
  RaaProblem,
  RaaReadout,
  RaaReported,
  RaaRunResult,
  RaaSeries,
  RaaStep,
} from '../shared/models/raa/spectrum';
import { RaaAnalysisService } from '../services/raa-analysis.service';
import { centralityMidpoint } from '../shared/utils/raa-centrality';
import { InstructionsComponent } from './instructions/instructions.component';
import { NmfBlocklyWorkspaceComponent } from './blockly-workspace/blockly-workspace.component';
import { NmfRaaPlotsComponent } from './raa-plots/raa-plots.component';
import { NmfSaTutorialService } from './sa-tutorial/sa-tutorial.service';
import { NmfSaTutorialWelcomeDialogComponent } from './sa-tutorial/sa-tutorial-welcome-dialog.component';

@Component({
  selector: 'app-nuclear-modification-spectrum-analysis',
  templateUrl: './nuclear-modification-spectrum-analysis.component.html',
  styleUrls: ['./nuclear-modification-spectrum-analysis.component.scss'],
  standalone: false,
})
export class NuclearModificationSpectrumAnalysisComponent
  implements AfterViewInit, OnDestroy, InstructionsProvider
{
  instructionsComponent: Type<any> = InstructionsComponent;

  @ViewChild(NmfRaaPlotsComponent)
  private plotsPanel?: NmfRaaPlotsComponent;

  @ViewChild(NmfBlocklyWorkspaceComponent)
  blockly?: NmfBlocklyWorkspaceComponent;

  recipe: RaaStep[] = [];
  running = false;
  runLocked = false;
  ok: boolean | null = null;
  problems: RaaProblem[] = [];

  ptSpectra: RaaSeries[] = [];
  raa: RaaSeries[] = [];
  rcp: RaaSeries[] = [];
  multiplicity: RaaHistogram | null = null;
  /** Every class measured so far, so the plot can switch between them. */
  multiplicities: RaaHistogram[] = [];
  private readonly multiplicityStore = new Map<string, RaaHistogram>();
  multVsCentrality: RaaHeatmap | null = null;
  ppReference: RaaSeries | null = null;
  readouts: RaaReadout[] = [];
  reported: RaaReported[] = [];

  resultsFullscreen = false;

  /** True once any plot exists — same condition `app-nmf-raa-plots` uses to
   *  swap its own full mission card for the tab strip. Docks the compact
   *  mission progress strip beside the block picker from that point on. */
  get hasAnyResult(): boolean {
    return (
      this.multiplicity != null ||
      this.multVsCentrality != null ||
      this.ptSpectra.length > 0 ||
      this.raa.length > 0 ||
      this.rcp.length > 0
    );
  }

  /**
   * Results survive between runs, keyed by series id, so changing the centrality
   * in the blocks and pressing Run again stacks the classes on one plot the way
   * the published figure shows them. Re-running the same class replaces it.
   */
  private readonly ptStore = new Map<string, RaaSeries>();
  private readonly raaStore = new Map<string, RaaSeries>();
  private readonly rcpStore = new Map<string, RaaSeries>();
  private readonly readoutStore = new Map<string, RaaReadout>();
  private readonly reportedStore = new Map<string, RaaReported>();
  private welcomeDialogOpened = false;

  constructor(
    private readonly analysis: RaaAnalysisService,
    private readonly tutorial: NmfSaTutorialService,
    private readonly dialog: MatDialog,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngAfterViewInit(): void {
    this.tutorial.registerHost({
      clearWorkspace: () => this.onClear(),
      openToolboxCategory: (name) => this.blockly?.openCategory(name),
      setRunLocked: (locked) => {
        this.runLocked = locked;
        this.refresh();
      },
      refreshHost: () => this.refresh(),
    });

    if (this.tutorial.shouldShow()) {
      setTimeout(() => this.openWelcomeDialog(), 0);
    }
  }

  ngOnDestroy(): void {
    this.tutorial.destroyDriver(true);
  }

  onRecipeChange(steps: RaaStep[]): void {
    this.recipe = steps;
    this.tutorial.notifyRecipeChanged(steps);
  }

  onRun(): void {
    const recipe = this.blockly?.getRecipe() ?? this.recipe;
    this.running = true;
    this.analysis.run(recipe).subscribe({
      next: (result) => {
        this.applyResult(result);
        this.running = false;
        this.tutorial.notifyRunCompleted(this.raaStore.size, result.problems);
      },
      error: () => {
        this.running = false;
        this.ok = false;
        this.problems = [{ key: 'RUN_FAILED', severity: 'error' }];
      },
    });
  }

  /**
   * Empties the Blockly canvas so the next centrality class can be built —
   * nothing else. Plots and the collected R_AA sheet accumulate across runs by
   * design (see the *Store fields below); Clear used to wipe them too, which
   * threw away every class already plotted the moment a student started the
   * next one.
   */
  onClear(): void {
    this.blockly?.clearWorkspace();
    this.ok = null;
    this.problems = [];
  }

  /** Escape hatch: put the whole correct chain on the canvas, ready to Run. */
  onAutoBuild(): void {
    this.blockly?.buildFullRecipe();
  }

  onToggleResultsFullscreen(): void {
    this.resultsFullscreen = !this.resultsFullscreen;
  }

  /** ? above the workspace. */
  openBlockHelp(): void {
    this.tutorial.startBlockHelpTour();
  }

  /**
   * ? above the results. There are no tabs any more — the whole screen is
   * figures and the numbers read off them, so it is always the figure walkthrough.
   */
  openResultsHelp(): void {
    // Kroki budujemy z kart, które faktycznie są na ekranie — bez uruchomionego
    // przepisu poradnik nadal się otwiera, tylko mówi, co się tu pojawi.
    const targets = (this.plotsPanel?.cards ?? []).map((card) => ({
      key: card.key,
      show: () => {
        this.plotsPanel?.selectCard(card.key);
        this.cdr.detectChanges();
      },
    }));
    this.tutorial.startPlotHelpTour(targets);
  }

  replayTutorial(): void {
    this.tutorial.clearDismissFlag();
    this.tutorial.startMainTour();
  }

  private applyResult(result: RaaRunResult): void {
    this.ok = result.ok;
    this.problems = result.problems;

    for (const histogram of result.multiplicities) {
      this.multiplicityStore.set(histogram.centrality, histogram);
    }
    if (result.multiplicities.length) {
      this.multiplicities = sortByCentrality([...this.multiplicityStore.values()]);
    }
    if (result.multiplicity) {
      this.multiplicity = result.multiplicity;
    }
    if (result.multVsCentrality) {
      this.multVsCentrality = result.multVsCentrality;
    }
    if (result.ppReference) {
      this.ppReference = result.ppReference;
    }

    merge(this.ptStore, result.ptSpectra);
    merge(this.raaStore, result.raa);
    merge(this.rcpStore, result.rcp);
    for (const readout of result.readouts) {
      this.readoutStore.set(`${readout.target}|${readout.centrality}`, readout);
    }
    for (const entry of result.reported) {
      this.reportedStore.set(
        `${entry.target}|${entry.centrality}|${entry.pt}`,
        entry,
      );
    }

    this.ptSpectra = sortByCentrality([...this.ptStore.values()]);
    this.raa = sortByCentrality([...this.raaStore.values()]);
    this.rcp = sortByCentrality([...this.rcpStore.values()]);
    this.readouts = [...this.readoutStore.values()];
    this.reported = [...this.reportedStore.values()];
  }

  /** Start / Skip chooser, shown once per page load exactly as in exercise 1. */
  private openWelcomeDialog(): void {
    if (this.welcomeDialogOpened) {
      return;
    }
    this.welcomeDialogOpened = true;
    this.dialog
      .open(NmfSaTutorialWelcomeDialogComponent, {
        width: '560px',
        autoFocus: true,
        disableClose: true,
        hasBackdrop: true,
      })
      .afterClosed()
      .subscribe((start) => {
        if (start === true) {
          this.tutorial.startMainTour();
        } else if (start === false) {
          this.tutorial.dismiss();
        }
      });
  }

  private refresh(): void {
    this.cdr.detectChanges();
  }
}

function merge(store: Map<string, RaaSeries>, series: RaaSeries[]): void {
  for (const entry of series) {
    store.set(entry.id, entry);
  }
}

/** Most central first, matching the legend order of the published R_AA figure. */
/** Central first, peripheral last — the order the published figure uses. */
function sortByCentrality<T extends { centrality?: string }>(items: T[]): T[] {
  return items.sort(
    (a, b) => centralityMidpoint(a.centrality ?? '') - centralityMidpoint(b.centrality ?? ''),
  );
}
