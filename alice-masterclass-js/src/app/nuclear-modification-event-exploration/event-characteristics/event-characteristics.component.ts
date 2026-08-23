import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { Event, Track, TrackType } from '../../shared/models';
import { RaaEventRole } from '../../shared/models/raa/raa';
import {
  NmfHistogramDialogComponent,
  NmfHistogramDialogResult,
} from '../histogram-dialog/histogram-dialog.component';

export interface NmfHistogramSpec {
  key: string;
  data: number[];
  xDomain: [number, number];
  bins: number;
  /** When set, plot is a value-counts bar chart (OX ticks = these categories only). */
  discreteValues?: number[];
  /** Dashed mean line. Defaults to true; a plot of a discrete category opts out. */
  showMean?: boolean;
  /** Dashed median line. Defaults to true; a plot of a discrete category opts out. */
  showMedian?: boolean;
  barColor: string;
  expandDomainToData: boolean;
  titleKey: string;
  xAxisLabelKey: string;
  yAxisLabelKey: string;
}

/** Układ zderzeń, dla którego rysujemy komplet histogramów. */
export type NmfSystem = 'pp' | 'pbPb';

const PBPB_ROLES: RaaEventRole[] = ['pbPbPeripheral', 'pbPbSemiCentral', 'pbPbCentral'];

export function systemOfRole(role: RaaEventRole): NmfSystem {
  return PBPB_ROLES.includes(role) ? 'pbPb' : 'pp';
}

/** Sześć serii jednego układu. */
interface NmfSeriesBucket {
  multiplicity: number[];
  multiplicityMinPt: number[];
  secondaries: number[];
  pt: number[];
  charge: number[];
  phi: number[];
}

function emptyBucket(): NmfSeriesBucket {
  return { multiplicity: [], multiplicityMinPt: [], secondaries: [], pt: [], charge: [], phi: [] };
}

/** The three Pb–Pb centrality classes, in the order the pack presents them. */
export const NMF_PBPB_CLASSES = [
  'pbPbPeripheral',
  'pbPbSemiCentral',
  'pbPbCentral',
] as const;
export type NmfPbPbClass = (typeof NMF_PBPB_CLASSES)[number];

/**
 * One Pb–Pb class's counts. Multiplicity, multiplicity above 1 GeV/c and the
 * secondary count are single numbers per class — there is exactly one event of
 * each class in a pack, so a histogram of them would be three bars of height
 * one, saying nothing. Shown as a readout instead.
 */
export interface NmfClassReadout {
  key: NmfPbPbClass;
  titleKey: string;
  present: boolean;
  multiplicity: number;
  multiplicityMinPt: number;
  secondaries: number;
}

/**
 * Zakresy osi zależą od układu. W pp krotność to kilka–kilkadziesiąt torów,
 * w Pb–Pb rzędu tysiąca; jedna wspólna oś spycha całe pp w kilka procent
 * szerokości wykresu, dlatego każdy układ ma własną skalę i własny komplet serii.
 */
const AXES: Record<NmfSystem, Record<string, { xDomain: [number, number]; expand: boolean }>> = {
  pp: {
    multiplicity: { xDomain: [0, 30], expand: true },
    multiplicityMinPt: { xDomain: [0, 15], expand: true },
    secondaries: { xDomain: [0, 20], expand: false },
  },
  pbPb: {
    multiplicity: { xDomain: [0, 1500], expand: true },
    multiplicityMinPt: { xDomain: [0, 500], expand: true },
    secondaries: { xDomain: [0, 200], expand: true },
  },
};

/** Entries / Mean — the classic ROOT TH1 stats-box readout. */
export interface NmfHistogramStats {
  entries: number;
  mean: number;
}

function isPrimaryTrack(track: Track): boolean {
  if (track.isPrimary === true) {
    return true;
  }
  if (track.isPrimary === false) {
    return false;
  }
  return track.type === TrackType.STANDARD;
}

/**
 * Six histograms matching the desktop RAA Event Characteristics tab.
 * All series accumulate when the parent records an analysed event (session scope).
 */
@Component({
  selector: 'app-nmf-event-characteristics',
  templateUrl: './event-characteristics.component.html',
  styleUrls: ['./event-characteristics.component.scss'],
  standalone: false,
})
export class NmfEventCharacteristicsComponent {
  @Input() event: Event | null = null;

  /** 'sidebar': compact 2×3 grid for the 1/3-width drawer. 'fullscreen': roomy 3×2 grid. */
  @Input() layout: 'sidebar' | 'fullscreen' = 'sidebar';

  /** When embedded under a mat-tab label, hide the duplicate page title. */
  @Input() showTitle = true;

  private readonly PREFIX = 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.';

  /** Per-plot bin overrides from the enlarged dialog (survive rebuild / new events). */
  private readonly binOverrides = new Map<string, number>();

  /** Serie osobno dla każdego układu — pp i Pb–Pb nigdy nie trafiają na tę samą oś. */
  private readonly buckets: Record<NmfSystem, NmfSeriesBucket> = {
    pp: emptyBucket(),
    pbPb: emptyBucket(),
  };

  /** Pb–Pb split by class, so each can be shown and toggled on its own. */
  private readonly pbPbByClass: Record<NmfPbPbClass, NmfSeriesBucket> = {
    pbPbPeripheral: emptyBucket(),
    pbPbSemiCentral: emptyBucket(),
    pbPbCentral: emptyBucket(),
  };

  /**
   * Classes currently drawn on the Pb–Pb p_T / charge / φ plots. A class can
   * only be ticked once its event has been analysed, so the boxes appear as
   * the student works through the pack.
   */
  readonly selectedClasses = new Set<NmfPbPbClass>(NMF_PBPB_CLASSES);

  /** Układ pokazywany w tej chwili; przełącza go pasek nad panelem. */
  @Input()
  get system(): NmfSystem { return this._system; }
  set system(system: NmfSystem) {
    if (system === this._system) {
      return;
    }
    this._system = system;
    this.histograms = this.buildSpecs();
  }
  private _system: NmfSystem = 'pp';

  /** Wybór ucznia wraca do strony, żeby jej `charSystem` nie rozjechał się z panelem. */
  @Output() systemChange = new EventEmitter<NmfSystem>();

  selectSystem(system: NmfSystem): void {
    if (system === this._system) {
      return;
    }
    this.system = system;
    this.systemChange.emit(system);
  }

  histograms: NmfHistogramSpec[] = [];

  constructor(private readonly dialog: MatDialog) {
    this.histograms = this.buildSpecs();
  }

  /** Czy dany układ ma już cokolwiek do pokazania (pasek wygasza pustą kartę). */
  hasData(system: NmfSystem): boolean {
    return this.buckets[system].multiplicity.length > 0;
  }

  /**
   * Append accepted (filtered) tracks from an analysed event into the histograms.
   * New array refs so `app-histogram` setters / change detection pick up the update.
   *
   * Zderzenie trafia do serii swojego układu. W pp krotność to kilkanaście torów,
   * w Pb–Pb rzędu tysiąca — na wspólnej osi liniowej całe pp ląduje w pierwszych
   * kilku procentach szerokości wykresu, więc każdy układ dostaje własny komplet.
   */
  recordAnalyzedEvent(
    fullEvent: Event,
    acceptedTracks: Track[],
    role: RaaEventRole = 'pp276TeV',
  ): void {
    const primaries = acceptedTracks.filter((t) => isPrimaryTrack(t) && t.sign !== 0);
    const secondaryCount = (fullEvent.tracks ?? []).filter((t) => !isPrimaryTrack(t)).length;
    const pts = primaries.map((t) => Math.hypot(t.px, t.py));
    const charges = primaries.map((t) => t.sign);
    // Desktop fPhiDist uses atan2 range [-π, π] (72 bins).
    const phis = primaries.map((t) => Math.atan2(t.py, t.px));

    if (NMF_PBPB_CLASSES.includes(role as NmfPbPbClass)) {
      const per = this.pbPbByClass[role as NmfPbPbClass];
      per.pt = [...per.pt, ...pts];
      per.charge = [...per.charge, ...charges];
      per.phi = [...per.phi, ...phis];
      per.multiplicity = [...per.multiplicity, primaries.length];
      per.multiplicityMinPt = [...per.multiplicityMinPt, pts.filter((pt) => pt > 1).length];
      per.secondaries = [...per.secondaries, secondaryCount];
    }

    const bucket = this.buckets[systemOfRole(role)];
    bucket.pt = [...bucket.pt, ...pts];
    bucket.charge = [...bucket.charge, ...charges];
    bucket.phi = [...bucket.phi, ...phis];
    bucket.multiplicity = [...bucket.multiplicity, primaries.length];
    bucket.multiplicityMinPt = [...bucket.multiplicityMinPt, pts.filter((pt) => pt > 1).length];
    bucket.secondaries = [...bucket.secondaries, secondaryCount];

    this.histograms = this.buildSpecs();
  }

  resetSession(): void {
    this.buckets.pp = emptyBucket();
    this.buckets.pbPb = emptyBucket();
    for (const key of NMF_PBPB_CLASSES) {
      this.pbPbByClass[key] = emptyBucket();
    }
    this.selectedClasses.clear();
    for (const key of NMF_PBPB_CLASSES) {
      this.selectedClasses.add(key);
    }
    this.binOverrides.clear();
    this.histograms = this.buildSpecs();
  }

  stats(h: NmfHistogramSpec): NmfHistogramStats {
    const entries = h.data.length;
    const mean = entries > 0 ? h.data.reduce((a, b) => a + b, 0) / entries : 0;
    return { entries, mean };
  }

  openHistogram(h: NmfHistogramSpec): void {
    this.dialog
      .open(NmfHistogramDialogComponent, {
        data: { spec: h, stats: this.stats(h) },
        panelClass: 'nmf-histogram-dialog-panel',
        autoFocus: false,
        hasBackdrop: true,
        disableClose: false,
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((result: NmfHistogramDialogResult | undefined) => {
        if (result?.bins == null || h.discreteValues != null) {
          return;
        }
        this.binOverrides.set(`${this._system}:${h.key}`, result.bins);
        this.histograms = this.buildSpecs();
      });
  }

  /* —— Pb–Pb per-class readouts and plot selection —— */

  /** True while the Pb–Pb card is showing; drives the readouts + checkboxes. */
  get isPbPb(): boolean {
    return this._system === 'pbPb';
  }

  /** One row per centrality class; `present` false until its event is analysed. */
  get classReadouts(): NmfClassReadout[] {
    return NMF_PBPB_CLASSES.map((key) => {
      const b = this.pbPbByClass[key];
      const present = b.multiplicity.length > 0;
      return {
        key,
        titleKey: `${this.PREFIX}TYPE_${key === 'pbPbPeripheral' ? 'PBPB_PERIPHERAL'
          : key === 'pbPbSemiCentral' ? 'PBPB_SEMI_CENTRAL' : 'PBPB_CENTRAL'}`,
        present,
        multiplicity: present ? b.multiplicity[b.multiplicity.length - 1] : 0,
        multiplicityMinPt: present ? b.multiplicityMinPt[b.multiplicityMinPt.length - 1] : 0,
        secondaries: present ? b.secondaries[b.secondaries.length - 1] : 0,
      };
    });
  }

  /** Only analysed classes get a checkbox — nothing to include before that. */
  get selectableClasses(): NmfClassReadout[] {
    return this.classReadouts.filter((c) => c.present);
  }

  isClassSelected(key: NmfPbPbClass): boolean {
    return this.selectedClasses.has(key);
  }

  toggleClass(key: NmfPbPbClass): void {
    if (this.selectedClasses.has(key)) {
      this.selectedClasses.delete(key);
    } else {
      this.selectedClasses.add(key);
    }
    this.histograms = this.buildSpecs();
  }

  /**
   * Vertical offset of the two beams in the collision icon (impact parameter):
   * 0 = head-on (central), larger = glancing (peripheral). Same figure as the
   * R_AA Analysis tab, so the two panels read as one exercise.
   */
  impactOffset(key: NmfPbPbClass): number {
    switch (key) {
      case 'pbPbCentral':
        return 0;
      case 'pbPbSemiCentral':
        return 5;
      case 'pbPbPeripheral':
        return 14;
    }
  }

  private buildPbPbSpecs(): NmfHistogramSpec[] {
    return [
      {
        key: 'pt',
        data: this.pbPbSelected((b) => b.pt),
        xDomain: [0, 20],
        bins: this.binsFor('pt', 20),
        barColor: '#16a34a',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_PT_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_PT',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'charge',
        data: this.pbPbSelected((b) => b.charge),
        xDomain: [-2, 2],
        bins: 2,
        discreteValues: [-1, 1],
        showMean: false,
        showMedian: false,
        barColor: '#db2777',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_CHARGE_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_CHARGE',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'phi',
        data: this.pbPbSelected((b) => b.phi),
        xDomain: [-Math.PI, Math.PI],
        bins: this.binsFor('phi', 20),
        barColor: '#d97706',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_PHI_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_PHI',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
    ];
  }

  /** Pb–Pb series merged over the ticked classes only. */
  private pbPbSelected(pick: (b: NmfSeriesBucket) => number[]): number[] {
    const out: number[] = [];
    for (const key of NMF_PBPB_CLASSES) {
      if (this.selectedClasses.has(key)) {
        out.push(...pick(this.pbPbByClass[key]));
      }
    }
    return out;
  }

  private binsFor(key: string, fallback: number): number {
    return this.binOverrides.get(`${this._system}:${key}`) ?? fallback;
  }

  private buildSpecs(): NmfHistogramSpec[] {
    // Pb–Pb: a pack holds one event per class, so multiplicity / multiplicity
    // above 1 GeV/c / secondaries are three single numbers — shown as readouts
    // (see `classReadouts`), not as histograms of three entries. What is left
    // are the per-track distributions, fed by whichever classes are ticked.
    if (this._system === 'pbPb') {
      return this.buildPbPbSpecs();
    }
    const bucket = this.buckets[this._system];
    const axes = AXES[this._system];
    // Binning / OX ranges match desktop Raa::TRaaStatistics (libRaa.dylib ctor).
    // Bar colours are the 600-weight hues of the light theme — keep in sync with
    // the `--nmf-hist-tint` tile tints in event-characteristics.component.scss.
    return [
      {
        // Base domain sized to typical pp events (the bulk of the pack: 31 of 34);
        // Pb-Pb semi-central/central events run into the hundreds-to-low-thousands,
        // so expandDomainToData grows past this base instead of clipping/breaking
        // the plot the moment one of those events gets analysed.
        key: 'multiplicity',
        data: bucket.multiplicity,
        xDomain: axes['multiplicity'].xDomain,
        bins: this.binsFor('multiplicity', 10),
        barColor: '#0284c7',
        expandDomainToData: axes['multiplicity'].expand,
        titleKey: this.PREFIX + 'HIST_MULTIPLICITY_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_MULTIPLICITY',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'multiplicityMinPt',
        data: bucket.multiplicityMinPt,
        xDomain: axes['multiplicityMinPt'].xDomain,
        bins: this.binsFor('multiplicityMinPt', 10),
        barColor: '#ea580c',
        expandDomainToData: axes['multiplicityMinPt'].expand,
        titleKey: this.PREFIX + 'HIST_MULTIPLICITY_MIN_PT_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_TPC_TRACKS',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'secondaries',
        data: bucket.secondaries,
        xDomain: axes['secondaries'].xDomain,
        bins: this.binsFor('secondaries', 20),
        barColor: '#7c3aed',
        expandDomainToData: axes['secondaries'].expand,
        titleKey: this.PREFIX + 'HIST_SECONDARIES_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_TPC_TRACKS',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'pt',
        data: bucket.pt,
        xDomain: [0, 20],
        bins: this.binsFor('pt', 20),
        barColor: '#16a34a',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_PT_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_PT',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        // Charged tracks are only ±1 — value counts, not continuous bins.
        // The domain spans exactly two category widths, so the -1 and +1 bars fill
        // the plot and meet in the middle instead of floating apart.
        // No mean line: the average of a charge sign is a number nobody can read,
        // and it would only clutter what is meant to be a plain left/right split.
        key: 'charge',
        data: bucket.charge,
        xDomain: [-2, 2],
        bins: 2,
        discreteValues: [-1, 1],
        showMean: false,
        showMedian: false,
        barColor: '#db2777',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_CHARGE_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_CHARGE',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'phi',
        data: bucket.phi,
        xDomain: [-Math.PI, Math.PI],
        bins: this.binsFor('phi', 20),
        barColor: '#d97706',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_PHI_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_PHI',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
    ];
  }
}
