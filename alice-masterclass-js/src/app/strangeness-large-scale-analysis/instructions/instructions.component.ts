import { Component, OnInit, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { LsaTutorialService } from '../lsa-tutorial/lsa-tutorial.service';

@Component({
    selector: 'app-instructions',
    templateUrl: './instructions.component.html',
    styleUrls: ['./instructions.component.scss'],
    standalone: false
})
export class InstructionsComponent implements OnInit {

  protected readonly demo = inject(DemoConfig).enabled;

  constructor(
    private readonly lsaTutorial: LsaTutorialService,
    private readonly dialogRef: MatDialogRef<any>,
  ) { }

  ngOnInit(): void {
  }

  replayTutorial(): void {
    if (!this.demo) {
      return;
    }
    // Close help dialog first so the tour overlay can highlight the underlying UI.
    this.dialogRef.close();
    setTimeout(() => this.lsaTutorial.startMainTour(), 0);
  }
}
