import { Component, Input, OnChanges } from '@angular/core';

import {
  RaaPlotTarget,
  RaaReadout,
  RaaReported,
} from '../../shared/models/raa/spectrum';
import {
  centralityColor,
  centralityImpactOffset,
  centralityLabel,
  centralityMidpoint,
} from '../../shared/utils/raa-centrality';

/** The two momenta groups report back in `ALICE_RAA_Moderation.ipynb`. */
export const RAA_REPORT_MOMENTA = [5.5, 10] as const;

export interface NmfResultCell {
  pt: number;
  value: number | null;
  error: number | null;
  /** The recipe read this number out itself, with a `Read value at` block. */
  confirmed: boolean;
}

export interface NmfResultRow {
  key: string;
  label: string;
  color: string;
  impact: number;
  raa: NmfResultCell[];
  rcp: NmfResultCell[];
}

/**
 * The sheet a group fills in.
 *
 * The desktop exercise ends with a table, not a plot: every centrality class on
 * one line with its R_AA at the two momenta the moderator collects. The web
 * version only ever showed one number at a time, so a group that had run five
 * classes had to write them down by hand before the last one overwrote the
 * readout. The numbers come from the plotted series, so simply plotting a class
 * fills its row; a `Read value at` block marks the cell as read on purpose.
 */
@Component({
  selector: 'app-nmf-results-table',
  templateUrl: './results-table.component.html',
  styleUrls: ['./results-table.component.scss'],
  standalone: false,
})
export class NmfResultsTableComponent implements OnChanges {
  @Input() readouts: RaaReadout[] = [];
  @Input() reported: RaaReported[] = [];

  readonly momenta = RAA_REPORT_MOMENTA;

  rows: NmfResultRow[] = [];
  /** R_CP columns only appear once a recipe has actually produced an R_CP. */
  showRcp = false;

  ngOnChanges(): void {
    const classes = [
      ...new Set(
        this.readouts
          .filter((readout) => readout.target !== 'pt')
          .map((readout) => readout.centrality),
      ),
    ].sort((a, b) => centralityMidpoint(a) - centralityMidpoint(b));

    this.showRcp = this.readouts.some((readout) => readout.target === 'rcp');
    this.rows = classes.map((key) => ({
      key,
      label: centralityLabel(key),
      color: centralityColor(key),
      impact: centralityImpactOffset(key),
      raa: this.cellsFor(key, 'raa'),
      rcp: this.cellsFor(key, 'rcp'),
    }));
  }

  get hasRows(): boolean {
    return this.rows.length > 0;
  }

  private cellsFor(centrality: string, target: RaaPlotTarget): NmfResultCell[] {
    const readout = this.readouts.find(
      (entry) => entry.centrality === centrality && entry.target === target,
    );
    return this.momenta.map((pt) => {
      const point = readout?.points.find((p) => pt >= p.xLow && pt < p.xHigh);
      return {
        pt,
        value: point ? point.y : null,
        error: point ? point.yErr : null,
        confirmed: this.reported.some(
          (entry) =>
            entry.centrality === centrality &&
            entry.target === target &&
            Math.abs(entry.pt - pt) < 1e-6,
        ),
      };
    });
  }
}
