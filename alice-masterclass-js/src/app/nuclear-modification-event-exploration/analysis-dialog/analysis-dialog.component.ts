import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { RaaEventRole } from '../../shared/models/raa/raa';
import { calcRaa, meanOf, rmsOf, RaaValue } from '../../shared/utils/raa-calc';
import { NmfHistogramSpec } from '../event-characteristics/event-characteristics.component';

/** One analysed event’s contribution to the part-1 Analysis tab. */
export interface NmfAnalysisEventRecord {
  role: RaaEventRole;
  /** Charged primaries (desktop automatic counter). */
  autoMultiplicity: number;
  /** Filter-accepted charged primaries (desktop manual / publish path). */
  manualMultiplicity: number;
  autoPts: number[];
  manualPts: number[];
}

export interface NmfAnalysisDialogData {
  records: NmfAnalysisEventRecord[];
  /** Desktop `EventDisplay` N_coll corrections (peripheral / semi / central). */
  nCollPart1: Record<string, number>;
}

interface NmfRaaClassBlock {
  key: 'pbPbPeripheral' | 'pbPbSemiCentral' | 'pbPbCentral';
  titleKey: string;
  auto: RaaValue;
  manual: RaaValue;
  ptSpec: NmfHistogramSpec;
}

/** Desktop `TPtDistribution`: 50 bins, 0–6 GeV/c. */
const PT_BINS = 50;
const PT_X_MAX = 6;

/**
 * Part-1 Analysis view (classic `TAnalysisWidget`): R_AA readouts + three p_T
 * spectra for peripheral / semi-central / central Pb–Pb.
 */
@Component({
  selector: 'app-nmf-analysis-dialog',
  templateUrl: './analysis-dialog.component.html',
  styleUrls: ['./analysis-dialog.component.scss'],
  standalone: false,
})
export class NmfAnalysisDialogComponent {
  readonly classes: NmfRaaClassBlock[];

  constructor(
    private readonly dialogRef: MatDialogRef<NmfAnalysisDialogComponent, 'spectrum' | void>,
    @Inject(MAT_DIALOG_DATA) data: NmfAnalysisDialogData,
  ) {
    this.classes = this.buildClasses(data);
  }

  stats(data: number[]): { entries: number; mean: number } {
    return { entries: data.length, mean: meanOf(data) };
  }

  close(): void {
    this.dialogRef.close();
  }

  goSpectrum(): void {
    this.dialogRef.close('spectrum');
  }

  private buildClasses(data: NmfAnalysisDialogData): NmfRaaClassBlock[] {
    const ppManual = data.records
      .filter((r) => r.role === 'pp276TeV')
      .map((r) => r.manualMultiplicity);
    const ppAuto = data.records
      .filter((r) => r.role === 'pp276TeV')
      .map((r) => r.autoMultiplicity);

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
      const nColl = data.nCollPart1[d.nCollKey] ?? 0;
      const rec = data.records.find((r) => r.role === d.key);
      const autoMult = rec?.autoMultiplicity ?? 0;
      const manualMult = rec?.manualMultiplicity ?? 0;
      const pts = rec?.manualPts ?? [];

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
          key: `pt-${d.key}`,
          data: pts,
          xDomain: [0, PT_X_MAX],
          bins: PT_BINS,
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
