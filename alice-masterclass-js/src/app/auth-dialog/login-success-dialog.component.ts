import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

export interface LoginSuccessDialogData {
  studentID: number;
  sessionName: string | null;
}

@Component({
    selector: 'app-login-success-dialog',
    templateUrl: './login-success-dialog.component.html',
    styleUrls: ['./login-success-dialog.component.scss'],
    standalone: false
})
export class LoginSuccessDialogComponent {

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: LoginSuccessDialogData,
    private dialogRef: MatDialogRef<LoginSuccessDialogComponent>
  ) {}

  onClose(): void {
    this.dialogRef.close();
  }

}
