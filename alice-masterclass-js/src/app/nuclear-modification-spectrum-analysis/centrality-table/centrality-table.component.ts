import { Component, Input, OnInit } from '@angular/core';

import { RaaDataService } from '../../services/raa-data.service';
import {
  centralityColor,
  centralityImpactOffset,
  centralityLabel,
} from '../../shared/utils/raa-centrality';

export interface NmfCentralityRow {
  key: string;
  label: string;
  color: string;
  impact: number;
  nEvents: number;
  nColl: number;
  /** N_coll of this class relative to the most central one, as a bar width. */
  share: number;
}

/**
 * The lookup table behind the `Look up number of collisions` block.
 *
 * In the desktop exercise the number of collisions is a printed table the student
 * reads from — it is Glauber input, not something the analysis measures — and the
 * block hid that table completely. Showing it turns two sentences of the tutorial
 * into something checkable: 0–5% has a hundred times the collisions of 80–90%,
 * which is exactly the factor R_AA has to divide out before it means anything.
 */
@Component({
  selector: 'app-nmf-centrality-table',
  templateUrl: './centrality-table.component.html',
  styleUrls: ['./centrality-table.component.scss'],
  standalone: false,
})
export class NmfCentralityTableComponent implements OnInit {
  /** Classes the current results cover; those rows are marked as used. */
  @Input() usedClasses: string[] = [];

  rows: NmfCentralityRow[] = [];

  constructor(private readonly data: RaaDataService) {}

  ngOnInit(): void {
    this.data.getTracksFine().subscribe((asset) => {
      const entries = Object.entries(asset.classes);
      const maxNColl = Math.max(...entries.map(([, value]) => value.nColl), 1);
      this.rows = entries
        .map(([key, value]) => ({
          key,
          label: centralityLabel(key),
          color: centralityColor(key),
          impact: centralityImpactOffset(key),
          nEvents: value.nEvents,
          nColl: value.nColl,
          share: value.nColl / maxNColl,
        }))
        .sort((a, b) => midpoint(a.key) - midpoint(b.key));
    });
  }

  isUsed(row: NmfCentralityRow): boolean {
    return this.usedClasses.includes(row.key);
  }

  get totalEvents(): number {
    return this.rows.reduce((sum, row) => sum + row.nEvents, 0);
  }
}

function midpoint(key: string): number {
  const [from, to] = key.split('-').map(Number);
  return (from + to) / 2;
}
