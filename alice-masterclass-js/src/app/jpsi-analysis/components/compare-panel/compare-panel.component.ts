import { Component, Input } from '@angular/core';

import { SummaryRow } from '../../models/jpsi.models';

@Component({
  selector: 'app-jpsi-compare-panel',
  templateUrl: './compare-panel.component.html',
  styleUrls: ['./compare-panel.component.scss'],
  standalone: false,
})
export class ComparePanelComponent {
  @Input() ppRow: SummaryRow | null = null;
  @Input() pPbRow: SummaryRow | null = null;

  get ready(): boolean {
    return this.ppRow !== null && this.pPbRow !== null;
  }

  /**
   * Significance grows with the square root of the number of events, so comparing it
   * across very different statistics would mislead. S/B does not have that problem.
   */
  get statisticsWarning(): boolean {
    if (!this.ready) {
      return false;
    }
    const a = this.ppRow!.nEvents;
    const b = this.pPbRow!.nEvents;
    const [low, high] = a < b ? [a, b] : [b, a];
    return low > 0 && high / low > 2;
  }

  /** Two different windows measure two different things. */
  get windowWarning(): boolean {
    if (!this.ready) {
      return false;
    }
    return (
      this.ppRow!.signalWindow[0] !== this.pPbRow!.signalWindow[0] ||
      this.ppRow!.signalWindow[1] !== this.pPbRow!.signalWindow[1]
    );
  }

  /** True in the expected case: the denser system has the worse signal-to-background. */
  get backgroundGrew(): boolean {
    if (!this.ready) {
      return false;
    }
    const pp = this.ppRow!.signalToBackground;
    const pPb = this.pPbRow!.signalToBackground;
    return pp !== null && pPb !== null && pPb < pp;
  }

  formatRatio(value: number | null): string {
    return value === null ? '—' : value.toFixed(2);
  }
}
