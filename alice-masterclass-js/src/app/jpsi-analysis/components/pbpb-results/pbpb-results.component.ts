import { Component, EventEmitter, Input, Output } from '@angular/core';

import { PbPbCentralityId, PbPbYieldRow } from '../../models/pbpb-minv.models';

/**
 * Accepted Pb-Pb yields, kept separate from the pp/p-Pb `ResultsTableComponent` /
 * `ComparePanelComponent` (decision #5): the published columns are here to let the student
 * check their fit against the paper, not to feed R_AA yet.
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
    'publishedNJpsi',
    'publishedSOverB',
    'publishedSignificance',
    'actions',
  ];

  onRemoveClick(row: PbPbYieldRow): void {
    this.removeResult.emit(row.centralityId);
  }
}
