import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';

/** Full-size PID reference plot opened from "How to select a range?". */
export const PID_ELECTRON_BANDS_IMG = 'assets/exercises/jpsi/pid-electron-bands.png';

@Component({
  selector: 'app-jpsi-pid-reference-dialog',
  templateUrl: './pid-reference-dialog.component.html',
  styleUrls: ['./pid-reference-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslateModule],
})
export class PidReferenceDialogComponent {
  readonly imageSrc = PID_ELECTRON_BANDS_IMG;

  constructor(private readonly dialogRef: MatDialogRef<PidReferenceDialogComponent>) {}

  close(): void {
    this.dialogRef.close();
  }
}
