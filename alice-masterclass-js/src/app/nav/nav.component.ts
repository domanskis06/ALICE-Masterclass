import { Component, Input, OnInit, Type, ViewChild, inject } from '@angular/core';
import { MatSidenavContainer } from '@angular/material/sidenav';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { TranslateService } from '@ngx-translate/core';
import { InstructionsDialogComponent } from '../instructions-dialog/instructions-dialog.component';
import { AuthDialogComponent } from '../auth-dialog/auth-dialog.component';
import { DemoInfoDialogComponent } from '../demo-info-dialog/demo-info-dialog.component';
import { InstructionsProvider } from '../shared/interfaces';
import { ApiService, AuthStatus } from '../shared/services/api.service';
import { DemoConfig } from '../shared/demo/demo-config.service';
import { AppConfig } from '../../environments/environment';

@Component({
    selector: 'app-nav',
    templateUrl: './nav.component.html',
    styleUrls: ['./nav.component.scss'],
    standalone: false
})
export class NavComponent implements OnInit {
  isHandset$: Observable<boolean>;

  @Input()
  languages: Array<string>;

  @ViewChild('drawer')
  drawerRef: MatSidenavContainer;

  instructionsComponent: Type<any> = null;

  protected readonly demo = inject(DemoConfig).enabled;

  /** Session badge on the primary toolbar — non-production builds only. */
  protected readonly showSessionBadge = !AppConfig.production;

  protected readonly authStatus$: Observable<AuthStatus>;

  constructor(
    private apiService: ApiService,
    private breakpointObserver: BreakpointObserver,
    public translate: TranslateService,
    private dialog: MatDialog
    ) {
      this.authStatus$ = this.apiService.authStatus$;
      this.isHandset$ = this.breakpointObserver.observe(Breakpoints.Handset)
        .pipe(
          map(result => result.matches),
          shareReplay()
          );
    }

  ngOnInit(): void {

  }

  onInstructionsButtonClicked(): void {
    const dialogConfig = new MatDialogConfig();

    dialogConfig.data = {
      component: this.instructionsComponent
    };

    const dialogRef = this.dialog.open(InstructionsDialogComponent, dialogConfig);
  }

  onLangButtonClicked(lang: string): void {
    this.translate.use(lang);
  }

  onPasswordButtonClicked(): void {
    if (this.demo) {
      this.dialog.open(DemoInfoDialogComponent, { width: '560px', autoFocus: true });
      return;
    }

    const dialogConfig = new MatDialogConfig();

    dialogConfig.data = {
      password: null,
      studentID: null
    };

    if (this.apiService.isAuthenticated) {
      dialogConfig.data.password = this.apiService.password;
      dialogConfig.data.studentID = this.apiService.studentID;
    }

    const dialogRef = this.dialog.open(AuthDialogComponent, dialogConfig);
  }

  onRouterActivate(event: InstructionsProvider): void {
    this.drawerRef.close();
    this.instructionsComponent = event.instructionsComponent;
  }

}
