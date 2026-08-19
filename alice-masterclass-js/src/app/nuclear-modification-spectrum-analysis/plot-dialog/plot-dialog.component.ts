import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { NmfPlotCard } from '../raa-plots/raa-plots.component';

export interface NmfPlotDialogData {
  card: NmfPlotCard;
}

/** Enlarged view of one plot — the same click-to-zoom gesture as exercise 1. */
@Component({
  selector: 'app-nmf-plot-dialog',
  templateUrl: './plot-dialog.component.html',
  styleUrls: ['./plot-dialog.component.scss'],
  standalone: false,
})
export class NmfPlotDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<NmfPlotDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NmfPlotDialogData,
  ) {}

  close(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.dialogRef.close();
  }
}
