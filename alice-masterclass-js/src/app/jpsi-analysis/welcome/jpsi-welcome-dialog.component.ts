import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule } from '@ngx-translate/core';

/** Shown once per session, demo build only (see `JpsiTutorialService.shouldShow`). */
@Component({
  selector: 'app-jpsi-welcome-dialog',
  templateUrl: './jpsi-welcome-dialog.component.html',
  styleUrls: ['./jpsi-welcome-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslateModule],
})
export class JpsiWelcomeDialogComponent {
  constructor(private readonly dialogRef: MatDialogRef<JpsiWelcomeDialogComponent, boolean>) {}

  skip(): void {
    this.dialogRef.close(false);
  }

  start(): void {
    this.dialogRef.close(true);
  }
}
