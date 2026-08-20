import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';

import { RaaHeatmap, RaaHistogram, RaaSeries } from '../../shared/models/raa/spectrum';
import { centralityColor, centralityImpactOffset } from '../../shared/utils/raa-centrality';
import { HUE_DATA, HUE_FILL, HUE_NORM, HUE_OUTPUT } from '../blockly-workspace/raa-blockly';
import { NmfPlotDialogComponent } from '../plot-dialog/plot-dialog.component';
import { histogramAsSeries, NmfSeriesMode } from '../series-plot/series-plot.component';

/** Everything a plot card needs; the enlarged dialog renders the same object. */
export interface NmfPlotCard {
  key: string;
  kind: 'series' | 'heatmap';
  titleKey: string;
  xLabel: string;
  yLabel: string;
  xLog: boolean;
  yLog: boolean;
  mode: NmfSeriesMode;
  series: RaaSeries[];
  heatmap: RaaHeatmap | null;
  referenceLine: number | null;
  yDomain: [number, number] | null;
  /** Drives the accent colour and the collision icon, as in exercise 1. */
  centrality: string | null;
  meta: { labelKey: string; value: string }[];
  /** ROOT-style statistics, shown inside the enlarged plot. */
  stats: { label: string; value: string }[];
  /**
   * One line under the plot saying what it means. The desktop exercise leaves
   * this to the moderator; a group working on its own needs it written down.
   */
  footerKey: string | null;
}

@Component({
  selector: 'app-nmf-raa-plots',
  templateUrl: './raa-plots.component.html',
  styleUrls: ['./raa-plots.component.scss'],
  standalone: false,
})
export class NmfRaaPlotsComponent implements OnInit, OnChanges, OnDestroy {
  @Input() ptSpectra: RaaSeries[] = [];
  @Input() raa: RaaSeries[] = [];
  @Input() rcp: RaaSeries[] = [];
  @Input() multiplicity: RaaHistogram | null = null;
  @Input() multVsCentrality: RaaHeatmap | null = null;
  /** Drawn beside the measured spectrum once the recipe has loaded it. */
  @Input() ppReference: RaaSeries | null = null;

  @Output() startTutorial = new EventEmitter<void>();
  @Output() openHelp = new EventEmitter<void>();

  cards: NmfPlotCard[] = [];

  /**
   * One plot showing at a time, tab strip above it, instead of a grid of every
   * card at once. As soon as a new card exists (the student's chain produced a
   * figure that was not there before — e.g. the p_T spectrum appearing once a
   * Plot block runs), its tab is added and it becomes the active one, so the
   * result the student just produced is what they land on, not whatever was
   * showing before.
   */
  activeCardKey: string | null = null;

  /**
   * Cards that appeared but were not the one auto-selected — e.g. a student
   * who builds both `Fill multiplicity histogram` and `Plot multiplicity vs
   * centrality` before ever pressing Run gets both cards from one Run, and
   * only the more advanced one is landed on. Marked here so their tab can
   * carry a "new" dot instead of the other result going unnoticed; cleared
   * the moment the student actually looks at that tab.
   */
  unseenCardKeys = new Set<string>();

  /**
   * Empty-state brief, grouped under the four toolbox categories instead of a
   * flat 1–10 list — the same categories and colours as the build column, so
   * the two halves of the page read as one plan rather than a wall of text
   * next to an unrelated block palette.
   */
  readonly missionGroups: { name: string; accent: string; steps: string[] }[] = [
    {
      name: 'Events',
      accent: HUE_DATA,
      steps: [
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_1',
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_2',
      ],
    },
    {
      name: 'Tracks',
      accent: HUE_FILL,
      steps: [
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_3',
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_4',
      ],
    },
    {
      name: 'Normalise',
      accent: HUE_NORM,
      steps: [
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_5',
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_6',
      ],
    },
    {
      name: 'References & plot',
      accent: HUE_OUTPUT,
      steps: [
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_7',
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_8',
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_9',
        'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.MISSION_STEP_10',
      ],
    },
  ];

  constructor(
    private readonly dialog: MatDialog,
    private readonly translate: TranslateService,
  ) {}

  private langChange?: Subscription;

  ngOnInit(): void {
    // Axis captions and units are resolved eagerly (they end up inside an SVG),
    // so switching the language has to rebuild the cards rather than wait for
    // the next run.
    this.langChange = this.translate.onLangChange.subscribe(() => {
      const keys = new Set(this.cards.map((c) => c.key));
      this.cards = this.buildCards();
      this.selectNewestOrFallback(keys);
    });
  }

  ngOnChanges(): void {
    const previousKeys = new Set(this.cards.map((c) => c.key));
    this.cards = this.buildCards();
    this.selectNewestOrFallback(previousKeys);
  }

  ngOnDestroy(): void {
    this.langChange?.unsubscribe();
  }

  get activeCard(): NmfPlotCard | null {
    return this.cards.find((c) => c.key === this.activeCardKey) ?? null;
  }

  selectCard(key: string): void {
    this.activeCardKey = key;
    this.unseenCardKeys.delete(key);
  }

  /**
   * Jump to whichever card is new since the last change. Cards never disappear
   * on their own (Clear resets the workspace, not the results — see the host's
   * onClear), so "new" always means "just appeared", never "replaced" — a plain
   * set difference is enough, no need to track order or content.
   */
  private selectNewestOrFallback(previousKeys: Set<string>): void {
    // `buildCards()` always inserts in the same pipeline order — multiplicity,
    // mult-vs-centrality, p_T, R_AA, R_CP — which happens to be the order the
    // exercise itself progresses in. A student who builds several blocks before
    // ever pressing Run (skipping the tour's one-gate-at-a-time pacing) can make
    // more than one card appear from a single run; picking the FIRST of those
    // (the old behaviour) landed on the earliest, least-advanced one — e.g. on
    // "Multiplicity per event" right after the student had just finished adding
    // Plot multiplicity vs centrality, the thing they actually wanted to look
    // at. The LAST newly-added card is the better guess: it is the most
    // advanced result the chain just unlocked.
    const added = this.cards.filter((c) => !previousKeys.has(c.key));
    if (added.length) {
      for (const card of added) {
        this.unseenCardKeys.add(card.key);
      }
      this.activeCardKey = added[added.length - 1].key;
      this.unseenCardKeys.delete(this.activeCardKey);
      return;
    }
    if (!this.cards.some((c) => c.key === this.activeCardKey)) {
      this.activeCardKey = this.cards[0]?.key ?? null;
    }
  }

  accent(card: NmfPlotCard): string {
    return card.centrality ? centralityColor(card.centrality) : '#b71c1c';
  }

  impactOffset(card: NmfPlotCard): number {
    return card.centrality ? centralityImpactOffset(card.centrality) : 0;
  }

  openPlot(card: NmfPlotCard, event?: Event): void {
    event?.stopPropagation();
    this.dialog.open(NmfPlotDialogComponent, {
      data: { card },
      panelClass: 'nmf-histogram-dialog-panel',
      autoFocus: false,
      hasBackdrop: true,
      maxWidth: '95vw',
    });
  }

  private buildCards(): NmfPlotCard[] {
    const cards: NmfPlotCard[] = [];
    const t = (key: string) => this.translate.instant(key) as string;
    const prefix = 'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.';

    if (this.multiplicity) {
      const histogram = histogramAsSeries(this.multiplicity);
      cards.push({
        key: 'multiplicity',
        kind: 'series',
        titleKey: `${prefix}PLOT_MULTIPLICITY`,
        xLabel: t(`${prefix}AXIS_MULTIPLICITY`),
        yLabel: t(`${prefix}AXIS_EVENTS`),
        xLog: false,
        yLog: true,
        mode: 'steps',
        series: [histogram],
        heatmap: null,
        referenceLine: null,
        yDomain: null,
        centrality: this.multiplicity.centrality,
        meta: [
          { labelKey: `${prefix}META_EVENTS`, value: String(this.multiplicity.entries) },
          {
            labelKey: `${prefix}META_MEAN`,
            value: meanOf(histogram).toFixed(0),
          },
        ],
        stats: [
          { label: t(`${prefix}META_EVENTS`), value: String(this.multiplicity.entries) },
          { label: t(`${prefix}META_MEAN`), value: meanOf(histogram).toFixed(1) },
        ],
        footerKey: `${prefix}FOOTER_MULTIPLICITY`,
      });
    }

    if (this.multVsCentrality) {
      cards.push({
        key: 'mult-vs-centrality',
        kind: 'heatmap',
        titleKey: `${prefix}PLOT_MULT_VS_CENTRALITY`,
        xLabel: t(`${prefix}AXIS_MULTIPLICITY`),
        yLabel: t(`${prefix}AXIS_CENTRALITY`),
        xLog: false,
        yLog: false,
        mode: 'points',
        series: [],
        heatmap: this.multVsCentrality,
        referenceLine: null,
        yDomain: null,
        centrality: this.multVsCentrality.highlight?.centrality ?? null,
        meta: [],
        stats: [],
        footerKey: `${prefix}FOOTER_MULT_VS_CENTRALITY`,
      });
    }

    if (this.ptSpectra.length) {
      // Pb–Pb and pp on one canvas, as the desktop app draws them before the
      // division: same shape, one an order of magnitude below the other.
      const series = this.ppReference
        ? [...this.ptSpectra, this.ppReference]
        : [...this.ptSpectra];
      cards.push({
        key: 'pt-spectrum',
        kind: 'series',
        titleKey: `${prefix}PLOT_PT_SPECTRUM`,
        xLabel: t(`${prefix}AXIS_PT`),
        // The unit follows the chain the student built, so it changes as they add
        // divisions — that is the point of showing it on the axis.
        yLabel: this.ptSpectra[0].unit ?? t(`${prefix}AXIS_YIELD`),
        xLog: true,
        yLog: true,
        mode: 'points',
        series,
        heatmap: null,
        referenceLine: null,
        yDomain: null,
        centrality: this.ptSpectra[this.ptSpectra.length - 1].centrality ?? null,
        meta: this.seriesMeta(this.ptSpectra),
        stats: [],
        footerKey: this.ppReference
          ? `${prefix}FOOTER_PT_WITH_PP`
          : `${prefix}FOOTER_PT_SPECTRUM`,
      });
    }

    if (this.raa.length) {
      cards.push({
        key: 'raa',
        kind: 'series',
        titleKey: `${prefix}PLOT_RAA`,
        xLabel: t(`${prefix}AXIS_PT`),
        yLabel: t(`${prefix}AXIS_RAA`),
        xLog: true,
        yLog: false,
        mode: 'points',
        series: this.raa,
        heatmap: null,
        referenceLine: this.raa.some((s) => s.referenceLine != null)
          ? (this.raa.find((s) => s.referenceLine != null)?.referenceLine ?? 1)
          : null,
        yDomain: [0, 1.6],
        centrality: this.raa[this.raa.length - 1].centrality ?? null,
        meta: this.seriesMeta(this.raa),
        stats: [],
        footerKey: `${prefix}FOOTER_RAA`,
      });
    }

    if (this.rcp.length) {
      cards.push({
        key: 'rcp',
        kind: 'series',
        titleKey: `${prefix}PLOT_RCP`,
        xLabel: t(`${prefix}AXIS_PT`),
        yLabel: t(`${prefix}AXIS_RCP`),
        xLog: true,
        yLog: false,
        mode: 'points',
        series: this.rcp,
        heatmap: null,
        referenceLine: this.rcp.some((s) => s.referenceLine != null)
          ? (this.rcp.find((s) => s.referenceLine != null)?.referenceLine ?? 1)
          : null,
        yDomain: [0, 2],
        centrality: this.rcp[this.rcp.length - 1].centrality ?? null,
        meta: this.seriesMeta(this.rcp),
        stats: [],
        footerKey: `${prefix}FOOTER_RCP`,
      });
    }

    return cards;
  }

  private seriesMeta(series: RaaSeries[]): { labelKey: string; value: string }[] {
    const prefix = 'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.';
    return [{ labelKey: `${prefix}META_CLASSES`, value: String(series.length) }];
  }
}

/** Entry-weighted mean of a binned series, the `Mean` of a ROOT stat box. */
function meanOf(series: RaaSeries): number {
  let sum = 0;
  let weight = 0;
  for (const point of series.points) {
    sum += point.x * point.y;
    weight += point.y;
  }
  return weight ? sum / weight : 0;
}
