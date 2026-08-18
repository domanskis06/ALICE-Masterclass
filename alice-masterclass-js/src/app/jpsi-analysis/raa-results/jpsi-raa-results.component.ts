import { Component, Input } from '@angular/core';
import { MatTableDataSource } from '@angular/material/table';

import { JpsiRaaResultRow } from '../../services/jpsi-raa.service';

/** R_AA summary per Pb-Pb centrality (demo layout only). See `JpsiRaaService`. */
@Component({
  selector: 'app-jpsi-raa-results',
  templateUrl: './jpsi-raa-results.component.html',
  styleUrls: ['./jpsi-raa-results.component.scss'],
  standalone: false,
})
export class JpsiRaaResultsComponent {
  @Input()
  get rows(): JpsiRaaResultRow[] {
    return this._rows;
  }
  set rows(rows: JpsiRaaResultRow[]) {
    this._rows = rows ?? [];
    this.tableRows.data = this._rows;
  }
  private _rows: JpsiRaaResultRow[] = [];

  readonly displayedColumns: string[] = [
    'centrality',
    'nParticipants',
    'nEvents',
    'signal',
    'efficiency',
    'yield',
    'nColl',
    'raa',
  ];

  readonly tableRows: MatTableDataSource<JpsiRaaResultRow> = new MatTableDataSource<JpsiRaaResultRow>();
}
