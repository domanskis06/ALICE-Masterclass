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
  multVsCentrality: RaaHeatmap | null = null;
  ppReference: RaaSeries | null = null;
  readouts: RaaReadout[] = [];
  reported: RaaReported[] = [];

  resultsFullscreen = false;

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
        this.tutorial.notifyRunCompleted(this.raaStore.size);
      },
      error: () => {
        this.running = false;
        this.ok = false;
        this.problems = [{ key: 'RUN_FAILED', severity: 'error' }];
      },
    });
  }

  onClear(): void {
    this.blockly?.clearWorkspace();
    this.ok = null;
    this.problems = [];
    this.ptStore.clear();
    this.raaStore.clear();
    this.rcpStore.clear();
    this.readoutStore.clear();
    this.reportedStore.clear();
    this.ptSpectra = [];
    this.raa = [];
    this.rcp = [];
    this.readouts = [];
    this.reported = [];
    this.multiplicity = null;
    this.multVsCentrality = null;
    this.ppReference = null;
  }

  /** Centrality classes the accumulated results cover, for the reference table. */
  get usedClasses(): string[] {
    return [
      ...new Set(
        [...this.raa, ...this.rcp, ...this.ptSpectra]
          .map((entry) => entry.centrality)
          .filter((entry): entry is string => !!entry),
      ),
    ];
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
    this.tutorial.startPlotHelpTour();
  }

  replayTutorial(): void {
    this.tutorial.clearDismissFlag();
    this.tutorial.startMainTour();
  }

  private applyResult(result: RaaRunResult): void {
    this.ok = result.ok;
    this.problems = result.problems;

    // The event-level figures describe one class at a time, so the latest run wins.
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
function sortByCentrality(series: RaaSeries[]): RaaSeries[] {
  return series.sort(
    (a, b) => centralityMidpoint(a.centrality ?? '') - centralityMidpoint(b.centrality ?? ''),
  );
}
