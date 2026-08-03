import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { AuthDialogComponent } from '../auth-dialog/auth-dialog.component';
import { ApiService } from '../shared/services/api.service';

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
  
  constructor(
    private apiService: ApiService,
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router) {}

  ngOnInit(): void {
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

}
