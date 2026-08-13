import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ApiService, ExerciseKind } from '../../../shared/services/api.service';
import { DatasetId, SummaryRow } from '../../models/jpsi.models';

@Component({
  selector: 'app-jpsi-results-table',
  templateUrl: './results-table.component.html',
  styleUrls: ['./results-table.component.scss'],
  standalone: false,
})
export class ResultsTableComponent {
  @Input() rows: SummaryRow[] = [];
  /** Whether accepted Pb-Pb rows exist elsewhere on the page - upload should stay enabled
   * even with zero pp/p-Pb rows as long as there is something to submit. */
  @Input() hasOtherResults = false;

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

  /** True once the student is logged into a session whose event is not `jpsi` - submissions to
   * it would be rejected server-side anyway (`Event.kind` guard). */
  get wrongExerciseKind(): boolean {
    return !this.apiService.matchesSessionKind(ExerciseKind.JPSI);
  }

  get uploadDisabled(): boolean {
    return !this.apiService.isAuthenticated || this.wrongExerciseKind || (this.rows.length === 0 && !this.hasOtherResults);
  }

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
