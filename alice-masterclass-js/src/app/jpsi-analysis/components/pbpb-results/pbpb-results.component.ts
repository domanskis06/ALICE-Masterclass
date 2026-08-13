import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ApiService, ExerciseKind } from '../../../shared/services/api.service';
import { PbPbCentralityId, PbPbYieldRow } from '../../models/pbpb-minv.models';

/**
 * Accepted Pb-Pb yields, kept separate from the pp/p-Pb `ResultsTableComponent` /
 * `ComparePanelComponent` (decision #5). S/B and significance are read straight off the
 * student's own `ResidualFitResult` (`JpsiResidualFitService`) — not read from the paper, so
 * the student's result is not just compared against a published number but actually derived
 * themselves.
 *
 * Shares the same upload action as `ResultsTableComponent` (`JpsiAnalysisComponent.onUploadResults`
 * submits pp/p-Pb and Pb-Pb rows together in one request) - this panel needs its own button
 * because it replaces the pp/p-Pb layout entirely while a published dataset is active.
 */
@Component({
  selector: 'app-jpsi-pbpb-results',
  templateUrl: './pbpb-results.component.html',
  styleUrls: ['./pbpb-results.component.scss'],
  standalone: false,
})
export class PbPbResultsComponent {
  @Input() rows: PbPbYieldRow[] = [];
  /** Whether accepted pp/p-Pb rows exist elsewhere on the page - upload should stay enabled
   * even with zero Pb-Pb rows as long as there is something to submit. */
  @Input() hasOtherResults = false;

  @Output() uploadResults = new EventEmitter<void>();
  @Output() removeResult = new EventEmitter<PbPbCentralityId>();

  readonly displayedColumns = [
    'centrality',
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

  onRemoveClick(row: PbPbYieldRow): void {
    this.removeResult.emit(row.centralityId);
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }
}
