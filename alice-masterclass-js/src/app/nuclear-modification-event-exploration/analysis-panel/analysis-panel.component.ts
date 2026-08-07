import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { RaaEventRole } from '../../shared/models/raa/raa';
import { calcRaa, meanOf, rmsOf, RaaValue } from '../../shared/utils/raa-calc';
import { NmfHistogramSpec } from '../event-characteristics/event-characteristics.component';
import {
  NmfHistogramDialogComponent,
  NmfHistogramDialogResult,
} from '../histogram-dialog/histogram-dialog.component';

/** One analysed event’s contribution to the part-1 R_AA Analysis tab. */
export interface NmfAnalysisEventRecord {
  role: RaaEventRole;
  /** Charged primaries (desktop automatic counter). */
  autoMultiplicity: number;
  /** Filter-accepted charged primaries (desktop manual / publish path). */
  manualMultiplicity: number;
  autoPts: number[];
  manualPts: number[];
}

interface NmfRaaClassBlock {
  key: 'pbPbPeripheral' | 'pbPbSemiCentral' | 'pbPbCentral';
  titleKey: string;
  auto: RaaValue;
  manual: RaaValue;
  ptSpec: NmfHistogramSpec;
}

/** Desktop-style p_T spectra; bin count is student-adjustable (1–20). */
const PT_BINS = 20;
const PT_X_MAX = 6;

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
    const ppManual = records.filter((r) => r.role === 'pp276TeV').map((r) => r.manualMultiplicity);
    const ppAuto = records.filter((r) => r.role === 'pp276TeV').map((r) => r.autoMultiplicity);

    const meanPpManual = meanOf(ppManual);
    const meanPpAuto = meanOf(ppAuto);
    const rmsPpManual = rmsOf(ppManual);
    const rmsPpAuto = rmsOf(ppAuto);

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
      const autoMult = rec?.autoMultiplicity ?? 0;
      const manualMult = rec?.manualMultiplicity ?? 0;
      const pts = rec?.manualPts ?? [];
      const specKey = `pt-${d.key}`;

      return {
        key: d.key,
        titleKey: d.titleKey,
        auto: calcRaa(autoMult, meanPpAuto, nColl, Math.sqrt(Math.max(autoMult, 0)), rmsPpAuto),
        manual: calcRaa(
          manualMult,
          meanPpManual,
          nColl,
          Math.sqrt(Math.max(manualMult, 0)),
          rmsPpManual,
        ),
        ptSpec: {
          key: specKey,
          data: pts,
          xDomain: [0, PT_X_MAX],
          bins: this.binOverrides.get(specKey) ?? PT_BINS,
          barColor: '#4ade80',
          expandDomainToData: false,
          titleKey: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.HIST_PT_TITLE',
          xAxisLabelKey: 'NUCLEAR_MODIFICATION.EVENT_EXPLORATION.AXIS_PT',
          yAxisLabelKey: 'STRANGENESS.HISTOGRAMS.COUNTS',
        },
      };
    });
  }
}
