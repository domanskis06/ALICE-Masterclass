import { Component, OnInit, inject } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { DemoConfig } from '../../shared/demo/demo-config.service';
import { VaTutorialService } from '../va-tutorial/va-tutorial.service';

@Component({
    selector: 'app-instructions',
    templateUrl: './instructions.component.html',
    styleUrls: ['./instructions.component.scss'],
    standalone: false
})
export class InstructionsComponent implements OnInit {

  protected readonly demo = inject(DemoConfig).enabled;

  constructor(
    private readonly vaTutorial: VaTutorialService,
    private readonly dialogRef: MatDialogRef<any>,
  ) { }

  ngOnInit(): void {
  }

  get replayDisabled(): boolean {
    return this.vaTutorial.isActive();
  }

  replayTutorial(): void {
    if (!this.demo || this.vaTutorial.isActive()) {
      return;
    }
    // Close help dialog first so the tour overlay can highlight the underlying UI.
    this.dialogRef.close();
    setTimeout(() => this.vaTutorial.startMainTour(), 0);
  }
}
