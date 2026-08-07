import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';

/** Set after the dialog has been shown once in this browser. */
export const DEMO_INFO_SHOWN_STORAGE_KEY = 'demo:infoShown';

/** Opened only in the demo build: explains that results stay in the browser. */
@Component({
  selector: 'app-demo-info-dialog',
  templateUrl: './demo-info-dialog.component.html',
  styleUrls: ['./demo-info-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslateModule],
})
export class DemoInfoDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<DemoInfoDialogComponent>) {}

  close(): void {
    this.dialogRef.close();
  }
}
