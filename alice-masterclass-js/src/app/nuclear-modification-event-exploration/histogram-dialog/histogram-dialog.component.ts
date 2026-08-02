import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

import { NmfHistogramSpec, NmfHistogramStats } from '../event-characteristics/event-characteristics.component';

export interface NmfHistogramDialogData {
  spec: NmfHistogramSpec;
  stats: NmfHistogramStats;
}

/** Enlarged, single-histogram view opened by clicking a tile in Event Characteristics. */
@Component({
  selector: 'app-nmf-histogram-dialog',
  templateUrl: './histogram-dialog.component.html',
  styleUrls: ['./histogram-dialog.component.scss'],
  standalone: false,
})
export class NmfHistogramDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<NmfHistogramDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: NmfHistogramDialogData,
  ) {}

  close(event?: Event): void {
    event?.stopPropagation();
    event?.preventDefault();
    this.dialogRef.close();
  }
}
