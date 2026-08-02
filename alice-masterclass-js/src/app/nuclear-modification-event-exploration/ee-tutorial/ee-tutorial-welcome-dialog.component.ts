import { Component } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-nmf-ee-tutorial-welcome-dialog',
  templateUrl: './ee-tutorial-welcome-dialog.component.html',
  styleUrls: ['./ee-tutorial-welcome-dialog.component.scss'],
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
})
export class NmfEeTutorialWelcomeDialogComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<NmfEeTutorialWelcomeDialogComponent, boolean>,
  ) {}

  skip(): void {
    this.dialogRef.close(false);
  }

  start(): void {
    this.dialogRef.close(true);
  }
}
