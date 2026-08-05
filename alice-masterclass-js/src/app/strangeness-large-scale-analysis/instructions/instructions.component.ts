import { Component, OnInit } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { LsaTutorialService } from '../lsa-tutorial/lsa-tutorial.service';

@Component({
    selector: 'app-instructions',
    templateUrl: './instructions.component.html',
    styleUrls: ['./instructions.component.scss'],
    standalone: false
})
export class InstructionsComponent implements OnInit {

  constructor(
    private readonly lsaTutorial: LsaTutorialService,
    private readonly dialogRef: MatDialogRef<any>,
  ) { }

  ngOnInit(): void {
  }

  startTutorial(): void {
    // Close help dialog first so the tour overlay can highlight the underlying UI.
    this.dialogRef.close();
    setTimeout(() => this.lsaTutorial.startMainTour(), 0);
  }
}
