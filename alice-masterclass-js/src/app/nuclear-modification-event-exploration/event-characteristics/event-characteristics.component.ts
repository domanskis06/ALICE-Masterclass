import { Component, Input } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { Event, Track, TrackType } from '../../shared/models';
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
  barColor: string;
  expandDomainToData: boolean;
  titleKey: string;
  xAxisLabelKey: string;
  yAxisLabelKey: string;
}

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

  private ptData: number[] = [];
  private chargeData: number[] = [];
  private phiData: number[] = [];

  private multiplicityData: number[] = [];
  private multiplicityMinPtData: number[] = [];
  private secondariesData: number[] = [];

  histograms: NmfHistogramSpec[] = [];

  constructor(private readonly dialog: MatDialog) {
    this.histograms = this.buildSpecs();
  }

  /**
   * Append accepted (filtered) tracks from an analysed event into the histograms.
   * New array refs so `app-histogram` setters / change detection pick up the update.
   */
  recordAnalyzedEvent(fullEvent: Event, acceptedTracks: Track[]): void {
    const primaries = acceptedTracks.filter((t) => isPrimaryTrack(t) && t.sign !== 0);
    const secondaryCount = (fullEvent.tracks ?? []).filter((t) => !isPrimaryTrack(t)).length;
    const pts = primaries.map((t) => Math.hypot(t.px, t.py));
    const charges = primaries.map((t) => t.sign);
    // Desktop fPhiDist uses atan2 range [-π, π] (72 bins).
    const phis = primaries.map((t) => Math.atan2(t.py, t.px));

    this.ptData = [...this.ptData, ...pts];
    this.chargeData = [...this.chargeData, ...charges];
    this.phiData = [...this.phiData, ...phis];

    this.multiplicityData = [...this.multiplicityData, primaries.length];
    this.multiplicityMinPtData = [...this.multiplicityMinPtData, pts.filter((pt) => pt > 1).length];
    this.secondariesData = [...this.secondariesData, secondaryCount];

    this.histograms = this.buildSpecs();
  }

  resetSession(): void {
    this.ptData = [];
    this.chargeData = [];
    this.phiData = [];
    this.multiplicityData = [];
    this.multiplicityMinPtData = [];
    this.secondariesData = [];
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
        this.binOverrides.set(h.key, result.bins);
        this.histograms = this.buildSpecs();
      });
  }

  private binsFor(key: string, fallback: number): number {
    return this.binOverrides.get(key) ?? fallback;
  }

  private buildSpecs(): NmfHistogramSpec[] {
    // Binning / OX ranges match desktop Raa::TRaaStatistics (libRaa.dylib ctor).
    return [
      {
        key: 'multiplicity',
        data: this.multiplicityData,
        xDomain: [0, 50],
        bins: this.binsFor('multiplicity', 10),
        barColor: '#62d9ff',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_MULTIPLICITY_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_MULTIPLICITY',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'multiplicityMinPt',
        data: this.multiplicityMinPtData,
        xDomain: [0, 50],
        bins: this.binsFor('multiplicityMinPt', 10),
        barColor: '#ff9f43',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_MULTIPLICITY_MIN_PT_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_TPC_TRACKS',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'secondaries',
        data: this.secondariesData,
        xDomain: [0, 20],
        bins: this.binsFor('secondaries', 20),
        barColor: '#a78bfa',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_SECONDARIES_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_TPC_TRACKS',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'pt',
        data: this.ptData,
        xDomain: [0, 20],
        bins: this.binsFor('pt', 20),
        barColor: '#4ade80',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_PT_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_PT',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        // Charged tracks are only ±1 — value counts, not continuous bins.
        key: 'charge',
        data: this.chargeData,
        xDomain: [-1.5, 1.5],
        bins: 2,
        discreteValues: [-1, 1],
        barColor: '#f472b6',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_CHARGE_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_CHARGE',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
      {
        key: 'phi',
        data: this.phiData,
        xDomain: [-Math.PI, Math.PI],
        bins: this.binsFor('phi', 20),
        barColor: '#fbbf24',
        expandDomainToData: false,
        titleKey: this.PREFIX + 'HIST_PHI_TITLE',
        xAxisLabelKey: this.PREFIX + 'AXIS_PHI',
        yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
      },
    ];
  }
}
