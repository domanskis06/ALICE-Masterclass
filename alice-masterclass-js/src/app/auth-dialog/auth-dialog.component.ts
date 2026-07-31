import { Component, Inject, OnInit } from '@angular/core';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { ApiService, Session } from '../shared/services/api.service';
import { LoginSuccessDialogComponent } from './login-success-dialog.component';

export interface AuthDialogResult {
  authenticated: boolean;
  studentID: number;
  sessionName: string;
}

@Component({
    selector: 'auth-dialog',
    templateUrl: './auth-dialog.component.html',
    styleUrls: ['./auth-dialog.component.scss'],
    standalone: false
})
export class AuthDialogComponent implements OnInit {

  hide: boolean = true;

  loading: boolean = false;

  tokenForm: FormGroup;

  /** Upper bound for student number (session.maxStudents). Null until password is validated. */
  maxStudents: number | null = null;

  /** Snapshot when dialog opens — shown if the student is already logged in. */
  alreadyAuthenticated = false;
  currentStudentID: number = null;
  currentSessionName: string = null;

  /** Which field currently shows a server-side auth error. */
  authErrorField: 'id' | 'password' | null = null;
  authErrorKey: string = 'PASSWORD.ERROR';

  constructor(
    @Inject(MAT_DIALOG_DATA) private data: any,
    private dialogRef: MatDialogRef<AuthDialogComponent, AuthDialogResult | undefined>,
    private dialog: MatDialog,
    private apiService: ApiService,
    private formBuilder: FormBuilder) {
  }

  ngOnInit(): void {
    let password = null, studentID = null;

    if (this.data !== null) {
      password = this.data.password;
      studentID = this.data.studentID;
    }

    this.alreadyAuthenticated = this.apiService.isAuthenticated;
    if (this.alreadyAuthenticated) {
      this.currentStudentID = this.apiService.studentID;
      this.currentSessionName = this.apiService.sessionName;
    }

    this.tokenForm = this.formBuilder.group({
      'id': [studentID, [Validators.required, Validators.min(0)]],
      'password': [password, Validators.required]
    });

    if (password) {
      this.refreshMaxStudents(password);
    }
  }

  onPasswordBlur(): void {
    const password = this.tokenForm.controls.password.value;
    if (password) {
      this.refreshMaxStudents(password);
    }
  }

  onProceedClick(): void {
    this.loading = true;
    this.clearAuthErrors();

    const studentID = this.tokenForm.controls.id.value;
    const password = this.tokenForm.controls.password.value;

    this.apiService.authenticate(password, studentID).subscribe(
      (data: Session) => {
        this.loading = false;

        if (data.maxStudents != null) {
          this.applyMaxStudents(data.maxStudents);
        }

        if (data.error) {
          this.applyAuthError(data.reason);
        } else {
          const sessionName = data.name || this.apiService.sessionName;
          this.dialog.open(LoginSuccessDialogComponent, {
            data: { studentID, sessionName },
            width: '24rem',
            maxWidth: '92vw',
            autoFocus: false,
            restoreFocus: true
          });
          this.dialogRef.close({
            authenticated: true,
            studentID,
            sessionName
          });
        }
      },
      (error: HttpErrorResponse) => {
        this.loading = false;
      });
  }

  private refreshMaxStudents(password: string): void {
    this.apiService.checkSessionPassword(password).subscribe(
      (data: Session) => {
        if (!data.error && data.maxStudents != null) {
          this.applyMaxStudents(data.maxStudents);
        }
      },
      () => { /* ignore network errors here; proceed still validates */ }
    );
  }

  private applyMaxStudents(maxStudents: number): void {
    this.maxStudents = maxStudents;
    this.tokenForm.controls.id.setValidators([
      Validators.required,
      Validators.min(0),
      Validators.max(maxStudents)
    ]);
    this.tokenForm.controls.id.updateValueAndValidity({ emitEvent: false });
  }

  private clearAuthErrors(): void {
    this.authErrorField = null;
    this.authErrorKey = 'PASSWORD.ERROR';
    const idErrors = this.tokenForm.controls.id.errors;
    if (idErrors) {
      delete idErrors['auth'];
      this.tokenForm.controls.id.setErrors(Object.keys(idErrors).length ? idErrors : null);
    }
    const passwordErrors = this.tokenForm.controls.password.errors;
    if (passwordErrors) {
      delete passwordErrors['auth'];
      this.tokenForm.controls.password.setErrors(Object.keys(passwordErrors).length ? passwordErrors : null);
    }
  }

  private applyAuthError(reason?: Session['reason']): void {
    if (reason === 'student_taken') {
      this.authErrorField = 'id';
      this.authErrorKey = 'PASSWORD.STUDENT_TAKEN';
      this.tokenForm.controls.id.setErrors({ ...(this.tokenForm.controls.id.errors || {}), auth: true });
      this.tokenForm.controls.id.markAsTouched();
      return;
    }

    if (reason === 'student_invalid') {
      this.authErrorField = 'id';
      this.authErrorKey = 'PASSWORD.STUDENT_INVALID';
      this.tokenForm.controls.id.setErrors({ ...(this.tokenForm.controls.id.errors || {}), auth: true });
      this.tokenForm.controls.id.markAsTouched();
      return;
    }

    this.authErrorField = 'password';
    this.authErrorKey = 'PASSWORD.ERROR';
    this.tokenForm.controls.password.setErrors({ ...(this.tokenForm.controls.password.errors || {}), auth: true });
    this.tokenForm.controls.password.markAsTouched();
  }

}
