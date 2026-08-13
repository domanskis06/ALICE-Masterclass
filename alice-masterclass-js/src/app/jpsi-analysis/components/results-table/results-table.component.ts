import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ApiService } from '../../../shared/services/api.service';
import { DatasetId, SummaryRow } from '../../models/jpsi.models';

@Component({
  selector: 'app-jpsi-results-table',
  templateUrl: './results-table.component.html',
  styleUrls: ['./results-table.component.scss'],
  standalone: false,
})
export class ResultsTableComponent {
  @Input() rows: SummaryRow[] = [];

  @Output() uploadResults = new EventEmitter<void>();
  @Output() removeResult = new EventEmitter<DatasetId>();

  readonly displayedColumns = [
    'dataset',
    'events',
    'signal',
    'background',
    'signalToBackground',
    'significance',
    'actions',
  ];

  constructor(public readonly apiService: ApiService) {}

  datasetLabelKey(row: SummaryRow): string {
    return row.datasetId === 'pp' ? 'JPSI.DATASET.PP' : 'JPSI.DATASET.PPB';
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }

  onRemoveClick(row: SummaryRow): void {
    this.removeResult.emit(row.datasetId);
  }
}
