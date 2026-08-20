import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-nmf-sa-tutorial-welcome-dialog',
  templateUrl: './sa-tutorial-welcome-dialog.component.html',
  styleUrls: ['./sa-tutorial-welcome-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
})
export class NmfSaTutorialWelcomeDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<NmfSaTutorialWelcomeDialogComponent, boolean>,
  ) {}

  skip(): void {
    this.dialogRef.close(false);
  }

  start(): void {
    this.dialogRef.close(true);
  }
}
