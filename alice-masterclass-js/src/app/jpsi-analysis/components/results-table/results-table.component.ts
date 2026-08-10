import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ApiService } from '../../../shared/services/api.service';
import { DATASET_LABEL_KEYS, SummaryRow } from '../../models/jpsi.models';

@Component({
  selector: 'app-jpsi-results-table',
  templateUrl: './results-table.component.html',
  styleUrls: ['./results-table.component.scss'],
  standalone: false,
})
export class ResultsTableComponent {
  @Input() rows: SummaryRow[] = [];

  @Output() uploadResults = new EventEmitter<void>();

  readonly displayedColumns = [
    'dataset',
    'events',
    'signal',
    'background',
    'signalToBackground',
    'significance',
    'window',
  ];

  constructor(public readonly apiService: ApiService) {}

  datasetLabelKey(row: SummaryRow): string {
    return DATASET_LABEL_KEYS[row.datasetId];
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }
}
