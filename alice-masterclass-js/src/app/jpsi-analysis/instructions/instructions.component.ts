import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { InstructionsDialogComponent } from '../../instructions-dialog/instructions-dialog.component';
import { JpsiTutorialService } from '../services/jpsi-tutorial.service';

@Component({
  selector: 'app-jpsi-instructions',
  templateUrl: './instructions.component.html',
  styleUrls: ['./instructions.component.scss'],
  standalone: false,
})
export class InstructionsComponent {
  constructor(
    private readonly dialogRef: MatDialogRef<InstructionsDialogComponent>,
    private readonly tutorial: JpsiTutorialService
  ) {}

  startTutorial(): void {
    this.dialogRef.close();
    // Let the dialog finish closing so driver.js measures the real layout.
    setTimeout(() => this.tutorial.startMainTour(), 0);
  }
}
