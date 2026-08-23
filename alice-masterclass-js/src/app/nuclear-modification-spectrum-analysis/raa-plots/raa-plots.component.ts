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
import { NmfPlotDialogComponent } from '../plot-dialog/plot-dialog.component';
import { MISSION_GROUPS, NmfSaMissionStep } from '../sa-tutorial/sa-tutorial.constants';
import { NmfSaTutorialService } from '../sa-tutorial/sa-tutorial.service';
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
  /** Dashed vertical line at this x, e.g. the mean of a histogram. */
  verticalLine: number | null;
  verticalLineLabel: string;
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
  /**
   * Every class whose multiplicity has been measured. The card shows one at a
   * time; `multiplicityClass` picks which, and the switcher above the plot only
   * appears once there is more than one to compare.
   */
  @Input() multiplicities: RaaHistogram[] = [];
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

  /** Centrality shown on the multiplicity card; null = whichever came last. */
  multiplicityClass: string | null = null;

  /** The histogram the multiplicity card should draw right now. */
  private get shownMultiplicity(): RaaHistogram | null {
    if (this.multiplicityClass) {
      const picked = this.multiplicities.find(
        (h) => h.centrality === this.multiplicityClass,
      );
      if (picked) {
        return picked;
      }
    }
    return this.multiplicity ?? this.multiplicities[this.multiplicities.length - 1] ?? null;
  }

  /** Classes offered by the switcher; empty until two exist to switch between. */
  get multiplicityClasses(): RaaHistogram[] {
    return this.multiplicities.length > 1 ? this.multiplicities : [];
  }

  selectMultiplicityClass(centrality: string): void {
    this.multiplicityClass = centrality;
    this.cards = this.buildCards();
  }

  isMultiplicityClassActive(centrality: string): boolean {
    return this.shownMultiplicity?.centrality === centrality;
  }

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
   * next to an unrelated block palette. Shared with the docked strip so both
   * views (and the checkmark) agree on what each step requires.
   */
  readonly missionGroups = MISSION_GROUPS;

  constructor(
    private readonly dialog: MatDialog,
    private readonly translate: TranslateService,
    private readonly tutorial: NmfSaTutorialService,
  ) {}

  stepDone(step: NmfSaMissionStep): boolean {
    return this.tutorial.isMissionStepDone(step);
  }

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

  /** Cards switched to a linear scale, by key — buildCards() runs fresh every change, so this can't live on the card itself. */
  private linearScaleKeys = new Set<string>();

  toggleScale(card: NmfPlotCard, event: Event): void {
    event.stopPropagation();
    if (this.linearScaleKeys.has(card.key)) {
      this.linearScaleKeys.delete(card.key);
    } else {
      this.linearScaleKeys.add(card.key);
    }
  }

  isLinearScale(card: NmfPlotCard): boolean {
    return this.linearScaleKeys.has(card.key);
  }

  effectiveXLog(card: NmfPlotCard): boolean {
    return card.xLog && !this.isLinearScale(card);
  }

  effectiveYLog(card: NmfPlotCard): boolean {
    return card.yLog && !this.isLinearScale(card);
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
    // During the guided tour, Run fires once per gated step and each one
    // typically unlocks exactly one new card — auto-jumping every time made
    // switching back to an earlier plot to compare it pointless, since the
    // very next Run yanked the view away again. The tour never depends on
    // which tab is showing, so it's safe to just flag new cards as unseen
    // and leave the student's own tab choice alone while it's running.
    if (added.length && !this.tutorial.isActive()) {
      for (const card of added) {
        this.unseenCardKeys.add(card.key);
      }
      this.activeCardKey = added[added.length - 1].key;
      this.unseenCardKeys.delete(this.activeCardKey);
      return;
    }
    for (const card of added) {
      this.unseenCardKeys.add(card.key);
    }
    if (!this.cards.some((c) => c.key === this.activeCardKey)) {
      this.activeCardKey = this.cards[0]?.key ?? null;
      this.unseenCardKeys.delete(this.activeCardKey ?? '');
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

    const multiplicity = this.shownMultiplicity;
    if (multiplicity) {
      const histogram = histogramAsSeries(multiplicity);
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
        verticalLine: meanOf(histogram),
        verticalLineLabel: t(`${prefix}META_MEAN`),
        yDomain: null,
        centrality: multiplicity.centrality,
        meta: [{ labelKey: `${prefix}META_EVENTS`, value: String(multiplicity.entries) }],
        stats: [{ label: t(`${prefix}META_EVENTS`), value: String(multiplicity.entries) }],
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
        verticalLine: null,
        verticalLineLabel: '',
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
        verticalLine: null,
        verticalLineLabel: '',
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
        verticalLine: null,
        verticalLineLabel: '',
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
        verticalLine: null,
        verticalLineLabel: '',
        yDomain: [0, 2],
        centrality: this.rcp[this.rcp.length - 1].centrality ?? null,
        meta: this.seriesMeta(this.rcp),
        stats: [],
        footerKey: `${prefix}FOOTER_RCP`,
      });
    }

    return cards;
  }

  /** "1 class" / "3 classes" (Polish also splits out a 2–4 form), not "Classes 1". */
  private seriesMeta(series: RaaSeries[]): { labelKey: string; value: string }[] {
    const prefix = 'NUCLEAR_MODIFICATION.SPECTRUM_ANALYSIS.';
    const count = series.length;
    const form = pluralForm(count, this.translate.currentLang || this.translate.defaultLang);
    const text = this.translate.instant(`${prefix}META_CLASSES_${form}`, { count });
    return [{ labelKey: '', value: text }];
  }
}

/** Polish needs its own 2–4 form; everything else here is a plain singular/plural split. */
function pluralForm(count: number, lang: string | undefined): 'ONE' | 'FEW' | 'OTHER' {
  if (count === 1) {
    return 'ONE';
  }
  if (lang === 'pl') {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
      return 'FEW';
    }
  }
  return 'OTHER';
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
