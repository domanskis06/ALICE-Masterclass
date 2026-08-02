import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

/** Short guide to the six Event Characteristics histograms. */
@Component({
  selector: 'app-nmf-histogram-help-dialog',
  templateUrl: './histogram-help-dialog.component.html',
  styleUrls: ['./histogram-help-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
})
export class NmfHistogramHelpDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<NmfHistogramHelpDialogComponent, void>,
  ) {}

  close(): void {
    this.dialogRef.close();
  }
}
