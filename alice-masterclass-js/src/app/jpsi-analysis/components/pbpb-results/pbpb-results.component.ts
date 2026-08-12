import { Component, EventEmitter, Input, Output } from '@angular/core';

import { PbPbCentralityId, PbPbYieldRow } from '../../models/pbpb-minv.models';

/**
 * Accepted Pb-Pb yields, kept separate from the pp/p-Pb `ResultsTableComponent` /
 * `ComparePanelComponent` (decision #5). S/B and significance are read straight off the
 * student's own `ResidualFitResult` (`JpsiResidualFitService`) — not read from the paper, so
 * the student's result is not just compared against a published number but actually derived
 * themselves.
 */
@Component({
  selector: 'app-jpsi-pbpb-results',
  templateUrl: './pbpb-results.component.html',
  styleUrls: ['./pbpb-results.component.scss'],
  standalone: false,
})
export class PbPbResultsComponent {
  @Input() rows: PbPbYieldRow[] = [];

  @Output() removeResult = new EventEmitter<PbPbCentralityId>();

  readonly displayedColumns = [
    'centrality',
    'signal',
    'background',
    'signalToBackground',
    'significance',
    'actions',
  ];

  onRemoveClick(row: PbPbYieldRow): void {
    this.removeResult.emit(row.centralityId);
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }
}
