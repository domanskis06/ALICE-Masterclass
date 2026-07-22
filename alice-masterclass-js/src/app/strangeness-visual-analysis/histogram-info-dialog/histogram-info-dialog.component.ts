import { Component } from '@angular/core';
import { DragDropModule } from '@angular/cdk/drag-drop';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';

/** Short explanation shown once after the first mass lands in a histogram bar. */
@Component({
  selector: 'app-histogram-info-dialog',
  templateUrl: './histogram-info-dialog.component.html',
  styleUrls: ['./histogram-info-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, DragDropModule, TranslateModule],
})
export class HistogramInfoDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<HistogramInfoDialogComponent>) {}

  dismiss(): void {
    this.dialogRef.close();
  }
}
