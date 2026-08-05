import { Component, OnInit, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { AuthDialogComponent } from '../auth-dialog/auth-dialog.component';
import { DEMO_INFO_SHOWN_STORAGE_KEY, DemoInfoDialogComponent } from '../demo-info-dialog/demo-info-dialog.component';
import { ApiService } from '../shared/services/api.service';
import { DemoConfig } from '../shared/demo/demo-config.service';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: false
})
export class HomeComponent implements OnInit {

  private passwordDialogDismissed: boolean;
  private readonly passwordDialogDismissedKey: string = 'passwordDialogDismissed';
  private readonly passwordUrlKey: string = 'password';

  private readonly demo = inject(DemoConfig);

  constructor(
    private apiService: ApiService,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router) {}

  ngOnInit(): void {
    // Demo has no session: show the one-time info dialog instead of the login form.
    if (this.demo.enabled) {
      this.maybeShowDemoInfoDialog();
      return;
    }

    const isDismissed = sessionStorage.getItem(this.passwordDialogDismissedKey);

    if (isDismissed === null) {
      this.passwordDialogDismissed = false;
    } else {
      this.passwordDialogDismissed = (isDismissed === 'true');
    }

    let password = null;

    if (this.route.snapshot.queryParams && this.route.snapshot.queryParamMap.get(this.passwordUrlKey)) {
      password = this.route.snapshot.queryParamMap.get(this.passwordUrlKey);
      this.passwordDialogDismissed = false;
    }
     
    if (!this.passwordDialogDismissed) {
      const dialogConfig = new MatDialogConfig();

      dialogConfig.data = {
        password: null,
        studentID: null
      };

      if (this.apiService.isAuthenticated) {
        dialogConfig.data.password = this.apiService.password;
        dialogConfig.data.studentID = this.apiService.studentID;
      }

      // If present, override the password with URL parameter
      if (password !== null) {
        dialogConfig.data.password = password;
      }

      this.router.navigate([], {relativeTo: this.route, queryParams: {}, replaceUrl: true});

      const dialogRef = this.dialog.open(AuthDialogComponent, dialogConfig);

      dialogRef.afterClosed().subscribe(() => {
        sessionStorage.setItem(this.passwordDialogDismissedKey, 'true');
      });
    }
  }

  /** Once per browser, not per tab — the demo is meant to be entered and explored. */
  private maybeShowDemoInfoDialog(): void {
    if (localStorage.getItem(DEMO_INFO_SHOWN_STORAGE_KEY) === 'true') {
      return;
    }

    this.dialog
      .open(DemoInfoDialogComponent, { width: '560px', autoFocus: true })
      .afterClosed()
      .subscribe(() => {
        localStorage.setItem(DEMO_INFO_SHOWN_STORAGE_KEY, 'true');
      });
  }

}
