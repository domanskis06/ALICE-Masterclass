import { Component, Input } from '@angular/core';

import { DATASET_LABEL_KEYS, SummaryRow } from '../../models/jpsi.models';

@Component({
  selector: 'app-jpsi-compare-panel',
  templateUrl: './compare-panel.component.html',
  styleUrls: ['./compare-panel.component.scss'],
  standalone: false,
})
export class ComparePanelComponent {
  /** One entry per dataset with an accepted result, already ordered by JpsiAnalysisStateService.rows (DATASET_ORDER). */
  @Input() rows: SummaryRow[] = [];

  get ready(): boolean {
    return this.rows.length >= 2;
  }

  datasetLabelKey(row: SummaryRow): string {
    return DATASET_LABEL_KEYS[row.datasetId];
  }

  /**
   * Significance grows with the square root of the number of events, so comparing it
   * across very different statistics would mislead. S/B does not have that problem.
   * Checked across the full range (min vs max), not just adjacent pairs.
   */
  get statisticsWarning(): boolean {
    if (!this.ready) {
      return false;
    }
    const counts = this.rows.map((row) => row.nEvents);
    const low = Math.min(...counts);
    const high = Math.max(...counts);
    return low > 0 && high / low > 2;
  }

  /** Different windows measure different things; every row must match the first. */
  get windowWarning(): boolean {
    if (!this.ready) {
      return false;
    }
    const [first, ...rest] = this.rows;
    return rest.some(
      (row) => row.windowMin !== first.windowMin || row.windowMax !== first.windowMax
    );
  }

  /**
   * True when S/B decreases monotonically along DATASET_ORDER (busier system, worse
   * signal-to-background), checked on every adjacent pair actually present -- not just
   * the first and last -- so a non-monotonic middle dataset correctly breaks the claim.
   */
  get backgroundGrowsWithMultiplicity(): boolean {
    if (!this.ready) {
      return false;
    }
    for (let i = 1; i < this.rows.length; i++) {
      const prev = this.rows[i - 1].signalToBackground;
      const next = this.rows[i].signalToBackground;
      if (prev === null || next === null || next >= prev) {
        return false;
      }
    }
    return true;
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }
}
