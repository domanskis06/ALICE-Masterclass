import { Component, Input, OnChanges } from '@angular/core';

import { RaaPlotTarget, RaaPoint, RaaReadout } from '../../shared/models/raa/spectrum';
import { centralityLabel } from '../../shared/utils/raa-centrality';
import { RAA_REPORT_MOMENTA } from '../results-table/results-table.component';

interface NmfExtractOption {
  index: number;
  label: string;
}

/**
 * Reads a number off the result. The bins are shown as real momentum ranges in
 * GeV/c rather than as indices, and the two momenta the moderator's notebook
 * collects from every group are one click away.
 */
@Component({
  selector: 'app-nmf-extract-panel',
  templateUrl: './extract-panel.component.html',
  styleUrls: ['./extract-panel.component.scss'],
  standalone: false,
})
export class NmfExtractPanelComponent implements OnChanges {
  @Input() readouts: RaaReadout[] = [];

  readonly reportMomenta = RAA_REPORT_MOMENTA;

  selectedKey = '';
  binIndex = 0;
  value: number | null = null;
  error: number | null = null;

  ngOnChanges(): void {
    if (!this.readouts.some((r) => this.keyOf(r) === this.selectedKey)) {
      this.selectedKey = this.defaultKey();
      this.binIndex = 0;
    }
    this.refresh();
  }

  /**
   * The exercise asks for a nuclear modification factor, so that is what the
   * panel offers first; the p_T spectrum is a step on the way, not the answer.
   */
  private defaultKey(): string {
    const ratio = this.readouts.find((r) => r.target !== 'pt');
    const first = ratio ?? this.readouts[0];
    return first ? this.keyOf(first) : '';
  }

  get sourceOptions(): { key: string; label: string }[] {
    return this.readouts.map((readout) => ({
      key: this.keyOf(readout),
      label: `${this.targetLabel(readout.target)} · ${centralityLabel(readout.centrality)}`,
    }));
  }

  get binOptions(): NmfExtractOption[] {
    return this.points.map((point, index) => ({
      index,
      label: `${format(point.xLow)} – ${format(point.xHigh)} GeV/c`,
    }));
  }

  onChange(): void {
    this.refresh();
  }

  /** Jump to the bin that contains a reported momentum. */
  selectMomentum(pt: number): void {
    const index = this.points.findIndex(
      (point) => pt >= point.xLow && pt < point.xHigh,
    );
    if (index < 0) {
      return;
    }
    this.binIndex = index;
    this.refresh();
  }

  momentumAvailable(pt: number): boolean {
    return this.points.some((point) => pt >= point.xLow && pt < point.xHigh);
  }

  private get points(): RaaPoint[] {
    return this.readouts.find((r) => this.keyOf(r) === this.selectedKey)?.points ?? [];
  }

  private keyOf(readout: RaaReadout): string {
    return `${readout.target}|${readout.centrality}`;
  }

  private targetLabel(target: RaaPlotTarget): string {
    switch (target) {
      case 'raa':
        return 'R_AA';
      case 'rcp':
        return 'R_CP';
      case 'pt':
        return 'pT';
    }
  }

  private refresh(): void {
    const point = this.points[this.binIndex];
    this.value = point ? point.y : null;
    this.error = point ? point.yErr : null;
  }
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}
