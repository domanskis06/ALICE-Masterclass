import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-instructions-dialog',
    templateUrl: './instructions-dialog.component.html',
    styleUrls: ['./instructions-dialog.component.scss'],
    standalone: false
})
export class InstructionsDialogComponent {

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: any,
    private dialogRef: MatDialogRef<InstructionsDialogComponent>) {
  }

}
