import { Component, Input, Output, EventEmitter } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';

import { JpsiResultRow } from '../jpsi-raa.models';

@Component({
    selector: 'app-jpsi-results',
    templateUrl: './results.component.html',
    styleUrls: ['./results.component.scss'],
    standalone: false
})
export class ResultsComponent {
  @Input()
  get resultsData(): JpsiResultRow[] { return this._results; }
  set resultsData(results: JpsiResultRow[]) {
    this._results = results;
    this.tableRows.data = this._results;
  }
  private _results: JpsiResultRow[] = [];

  @Output()
  reloadClickedEvent = new EventEmitter<void>();

  public readonly displayedColumns: string[] = [
    'system', 'nParticipants', 'nEvents', 'signal', 'efficiency', 'yield', 'nColl', 'raa'
  ];

  public tableRows: MatTableDataSource<JpsiResultRow> = new MatTableDataSource<JpsiResultRow>();

  reloadButtonClicked(): void {
    this.reloadClickedEvent.emit();
  }
}
