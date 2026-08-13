import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { NmfEeTutorialService } from '../ee-tutorial/ee-tutorial.service';

@Component({
  selector: 'app-nmf-ee-instructions',
  templateUrl: './instructions.component.html',
  styleUrls: ['./instructions.component.scss'],
  standalone: false,
})
export class InstructionsComponent {
  constructor(
    private readonly eeTutorial: NmfEeTutorialService,
    private readonly dialogRef: MatDialogRef<any>,
  ) {}

  replayTutorial(): void {
    this.dialogRef.close();
    setTimeout(() => this.eeTutorial.startMainTour(), 0);
  }
}
