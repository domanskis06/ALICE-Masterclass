import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { RaaEventRole } from '../../shared/models/raa/raa';
import { calcRaa, meanOf } from '../../shared/utils/raa-calc';
import { NmfHistogramSpec } from '../event-characteristics/event-characteristics.component';
import {
  NmfHistogramDialogComponent,
  NmfHistogramDialogResult,
} from '../histogram-dialog/histogram-dialog.component';

/** One analysed event’s contribution to the part-1 R_AA Analysis tab. */
export interface NmfAnalysisEventRecord {
  role: RaaEventRole;
  /** Filter-accepted charged primaries. */
  multiplicity: number;
  pts: number[];
}

interface NmfRaaClassBlock {
  key: 'pbPbPeripheral' | 'pbPbSemiCentral' | 'pbPbCentral';
  titleKey: string;
  raa: number;
  /** True when pp baseline + this Pb–Pb event are available. */
  ready: boolean;
  /** Bar color matched to the centrality accent. */
  barColor: string;
  ptSpec: NmfHistogramSpec;
}

/** Desktop-style p_T spectra; bin count is student-adjustable (1–20). */
const PT_BINS = 20;
const PT_X_MAX = 6;

/**
 * 600-weight hues of the light theme — keep in sync with the `--nmf-raa-accent` /
 * `--nmf-plot-accent` values in analysis-panel.component.scss. The pastel dark-theme
 * colours they replaced were unreadable as bars on a white plot.
 */
const CLASS_BAR_COLORS: Record<NmfRaaClassBlock['key'], string> = {
  pbPbPeripheral: '#0284c7',
  pbPbSemiCentral: '#d97706',
  pbPbCentral: '#db2777',
};

/**
 * Part-1 R_AA Analysis view (classic `TAnalysisWidget`): R_AA readouts + three
 * p_T spectra for peripheral / semi-central / central Pb–Pb.
 */
@Component({
  selector: 'app-nmf-analysis-panel',
  templateUrl: './analysis-panel.component.html',
  styleUrls: ['./analysis-panel.component.scss'],
  standalone: false,
})
export class NmfAnalysisPanelComponent implements OnChanges {
  @Input() records: NmfAnalysisEventRecord[] = [];
  /** Desktop `EventDisplay` N_coll corrections (peripheral / semi / central). */
  @Input() nCollPart1: Record<string, number> = {};
  @Input() layout: 'sidebar' | 'fullscreen' = 'sidebar';
  @Input() showGoSpectrum = true;

  @Output() readonly goSpectrum = new EventEmitter<void>();

  classes: NmfRaaClassBlock[] = [];

  /** Per-plot bin overrides from the enlarged dialog. */
  private readonly binOverrides = new Map<string, number>();

  constructor(private readonly dialog: MatDialog) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['records'] || changes['nCollPart1'] || !this.classes.length) {
      this.classes = this.buildClasses(this.records ?? [], this.nCollPart1 ?? {});
    }
  }

  stats(data: number[]): { entries: number; mean: number } {
    return { entries: data.length, mean: meanOf(data) };
  }

  /**
   * Vertical offset of the two approaching beams in the collision icon
   * (impact parameter): 0 = head-on (central), larger = glancing (peripheral).
   */
  impactOffset(key: NmfRaaClassBlock['key']): number {
    switch (key) {
      case 'pbPbCentral':
        return 0;
      case 'pbPbSemiCentral':
        return 5;
      case 'pbPbPeripheral':
        return 14;
    }
  }

  onGoSpectrum(): void {
    this.goSpectrum.emit();
  }

  openPlot(c: NmfRaaClassBlock, event?: Event): void {
    event?.stopPropagation();
    const stats = this.stats(c.ptSpec.data);
    this.dialog
      .open(NmfHistogramDialogComponent, {
        data: { spec: c.ptSpec, stats },
        panelClass: 'nmf-histogram-dialog-panel',
        autoFocus: false,
        hasBackdrop: true,
        disableClose: false,
        maxWidth: '95vw',
      })
      .afterClosed()
      .subscribe((result: NmfHistogramDialogResult | undefined) => {
        if (result?.bins == null) {
          return;
        }
        this.binOverrides.set(c.ptSpec.key, result.bins);
        this.classes = this.buildClasses(this.records ?? [], this.nCollPart1 ?? {});
      });
  }

  private buildClasses(
    records: NmfAnalysisEventRecord[],
    nCollPart1: Record<string, number>,
  ): NmfRaaClassBlock[] {
    const ppMults = records.filter((r) => r.role === 'pp276TeV').map((r) => r.multiplicity);
    const meanPp = meanOf(ppMults);

    const defs: Array<{
      key: NmfRaaClassBlock['key'];
      titleKey: string;
      nCollKey: string;
    }> = [
      {
        key: 'pbPbPeripheral',
        titleKey: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.ANALYSIS_PERIPHERAL',
        nCollKey: 'pbPbPeripheral',
      },
      {
        key: 'pbPbSemiCentral',
        titleKey: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.ANALYSIS_SEMI_CENTRAL',
        nCollKey: 'pbPbSemiCentral',
      },
      {
        key: 'pbPbCentral',
        titleKey: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.ANALYSIS_CENTRAL',
        nCollKey: 'pbPbCentral',
      },
    ];

    return defs.map((d) => {
      const nColl = nCollPart1[d.nCollKey] ?? 0;
      const rec = records.find((r) => r.role === d.key);
      const mult = rec?.multiplicity ?? 0;
      const pts = rec?.pts ?? [];
      const specKey = `pt-${d.key}`;

      return {
        key: d.key,
        titleKey: d.titleKey,
        raa: calcRaa(mult, meanPp, nColl),
        ready: meanPp > 0 && mult > 0 && nColl > 0,
        barColor: CLASS_BAR_COLORS[d.key],
        ptSpec: {
          key: specKey,
          data: pts,
          xDomain: [0, PT_X_MAX],
          bins: this.binOverrides.get(specKey) ?? PT_BINS,
          barColor: CLASS_BAR_COLORS[d.key],
          expandDomainToData: false,
          titleKey: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.HIST_PT_TITLE',
          xAxisLabelKey: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.AXIS_PT',
          yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
        },
      };
    });
  }
}
