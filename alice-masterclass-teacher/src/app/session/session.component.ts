import { Component, AfterViewInit, Pipe, PipeTransform } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { HttpErrorResponse } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';

import { EventAPI, SessionAPI, ApiService } from '../shared/services/api.service';

import { environment } from '../../environments/environment';
import { AddSessionDialogComponent } from './add-session-dialog/add-session-dialog.component';
import { ConfirmDialogComponent } from './confirm-dialog/confirm-dialog.component';
import { AddEventDialogComponent } from './add-event-dialog/add-event-dialog.component';

export interface EventWithSessions {
  event: EventAPI;
  sessions: SessionAPI[];
}

@Pipe({
    name: 'sessionUrl',
    standalone: false
})
export class SessionUrlPipe implements PipeTransform {
  transform(password: string): string {
    return `${environment.masterclassHost}?password=${encodeURIComponent(password)}`;
  }
}

@Component({
    selector: 'app-session',
    templateUrl: './session.component.html',
    styleUrls: ['./session.component.scss'],
    standalone: false
})
export class SessionComponent implements AfterViewInit {

  private readonly URL_COPIED_DURATION = 500;

  public readonly displayedSessionColumns: string[] = ['name', 'password', 'maxStudents', 'url', 'created', 'delete'];

  public eventsWithSessions: EventWithSessions[] = [];

  public host!: string;

  constructor(
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private clipboard: Clipboard,
    private apiService: ApiService,
    private urlPipe: SessionUrlPipe,
    private translate: TranslateService) { }

  ngAfterViewInit(): void {
    this.host = environment.masterclassHost;

    this.reload();

    if (this.apiService.autoRefresh()) {
      setInterval(()=> { this.reload(); }, this.apiService.REFRESH_INTERVAL);
    }
  }

  reload(): void {
    forkJoin({
      events: this.apiService.getEvents(),
      sessions: this.apiService.getSessions()
    }).subscribe(
      ({ events, sessions }) => {
        // Newest events on top, so the ones teachers are actively running/setting up don't get
        // buried under years of past masterclasses.
        const sortedEvents = [...events].sort(
          (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime()
        );
        this.eventsWithSessions = sortedEvents.map(event => ({
          event,
          sessions: sessions.filter(s => s.event === event.name)
        }));
      },
      (error: HttpErrorResponse) => {
        console.trace();
      }
    );
  }

  onClipboardButtonClicked(elm: SessionAPI): void {
    this.snackBar.open(this.translate.instant('SESSION.URL_COPIED'), undefined, {duration: this.URL_COPIED_DURATION});

    this.clipboard.copy(this.urlPipe.transform(elm.password));
  }

  onEventDeleteButtonClicked(elm: EventAPI): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent).afterClosed().subscribe((result: boolean) => {
      if (result) {
        this.apiService.deleteEvent(elm.id).subscribe(() => {
          this.reload();
        });
      } else {
        this.reload();
      }
    });
  }

  onSessionDeleteButtonClicked(elm: SessionAPI): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent).afterClosed().subscribe((result: boolean) => {
      if (result) {
        this.apiService.deleteSession(elm.id).subscribe(() => {
          this.reload();
        });
      } else {
        this.reload();
      }
    });
  }

  onAddEventButtonClicked(): void {
    const dialogRef = this.dialog.open(AddEventDialogComponent).afterClosed().subscribe(() => {
      this.reload();
    });
  }

  onAddSessionButtonClicked(eventName?: string): void {
    const config = eventName ? { data: { eventName } } : {};
    this.dialog.open(AddSessionDialogComponent, config).afterClosed().subscribe(() => {
      this.reload();
    });
  }

}
