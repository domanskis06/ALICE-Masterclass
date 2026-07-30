import { Component, Input, Type, ViewChild } from '@angular/core';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { MatDialog, MatDialogConfig } from '@angular/material/dialog';
import { MatSidenavContainer } from '@angular/material/sidenav';
import { TranslateService } from '@ngx-translate/core';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { InstructionsDialogComponent } from '../instructions-dialog/instructions-dialog.component';

@Component({
    selector: 'app-nav',
    templateUrl: './nav.component.html',
    styleUrls: ['./nav.component.scss'],
    standalone: false
})
export class NavComponent {

  @Input()
  languages: string[] = ['en', 'pl', 'de', 'fr'];

  @ViewChild('drawer')
  drawerRef!: MatSidenavContainer;

  instructionsComponent: Type<any> | null = null;

  isHandset$: Observable<boolean> = this.breakpointObserver.observe(Breakpoints.Handset)
    .pipe(
      map(result => result.matches),
      shareReplay()
    );

  constructor(
    private breakpointObserver: BreakpointObserver,
    private dialog: MatDialog,
    public translate: TranslateService
  ) {}

  onInstructionsButtonClicked(): void {
    const dialogConfig = new MatDialogConfig();
    dialogConfig.data = {
      component: this.instructionsComponent
    };
    this.dialog.open(InstructionsDialogComponent, dialogConfig);
  }

  onLangButtonClicked(lang: string): void {
    this.translate.use(lang);
  }

  public onRouterActivate(event: { instructionsComponent?: Type<any> }): void {
    this.drawerRef.close();
    this.instructionsComponent = event.instructionsComponent ?? null;
  }

}
