import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { NmfHistogramSpec, NmfHistogramStats } from '../event-characteristics/event-characteristics.component';

export interface NmfHistogramDialogData {
  spec: NmfHistogramSpec;
  stats: NmfHistogramStats;
}

export interface NmfHistogramDialogResult {
  bins: number;
}

/** Enlarged single-histogram view with per-plot bin count control. */
@Component({
  selector: 'app-nmf-histogram-dialog',
  templateUrl: './histogram-dialog.component.html',
  styleUrls: ['./histogram-dialog.component.scss'],
  standalone: false,
})
export class NmfHistogramDialogComponent {
  readonly binMin = 1;
  readonly binMax = 20;

  /** Live bin count for the enlarged plot (written back on close). */
  bins: number;

  /** Continuous histograms only — discrete category plots keep fixed bins. */
  readonly allowBinControl: boolean;

  constructor(
    private readonly dialogRef: MatDialogRef<NmfHistogramDialogComponent, NmfHistogramDialogResult>,
    @Inject(MAT_DIALOG_DATA) public data: NmfHistogramDialogData,
  ) {
    this.allowBinControl = data.spec.discreteValues == null;
    this.bins = this.clampBinsValue(data.spec.bins);
  }

  get binFillPercent(): string {
    const span = this.binMax - this.binMin;
    if (span <= 0) {
      return '0%';
    }
    const ratio = (this.bins - this.binMin) / span;
    return `${Math.min(100, Math.max(0, ratio * 100))}%`;
  }

  onBinsInput(raw: string | number): void {
    const parsed = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(parsed)) {
      return;
    }
    this.bins = Math.round(parsed);
  }

  clampBins(): void {
    this.bins = this.clampBinsValue(this.bins);
  }

  close(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.dialogRef.close(
      this.allowBinControl ? { bins: this.clampBinsValue(this.bins) } : undefined,
    );
  }

  private clampBinsValue(value: number): number {
    const n = Math.round(value) || this.binMin;
    return Math.min(this.binMax, Math.max(this.binMin, n));
  }
}
