import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-va-tutorial-welcome-dialog',
  templateUrl: './va-tutorial-welcome-dialog.component.html',
  styleUrls: ['./va-tutorial-welcome-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule, TranslateModule],
})
export class VaTutorialWelcomeDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<VaTutorialWelcomeDialogComponent, boolean>,
  ) {}

  skip(): void {
    this.dialogRef.close(false);
  }

  start(): void {
    this.dialogRef.close(true);
  }
}
