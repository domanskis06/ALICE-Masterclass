import { Component, Input } from '@angular/core';

import {
  centralClassColor,
  peripheralClassColor,
  semiCentralClassColor,
} from '../../shared/globals';
import { NmfEventClass } from '../../shared/services/api.service';
import { NmfCollectSeries } from '../nuclear-modification-event-exploration.component';

const CLASS_COLORS: Record<NmfEventClass, string> = {
  [NmfEventClass.PBPB_PERIPHERAL]: peripheralClassColor,
  [NmfEventClass.PBPB_SEMI_CENTRAL]: semiCentralClassColor,
  [NmfEventClass.PBPB_CENTRAL]: centralClassColor,
};

const CLASS_TITLE_KEYS: Record<NmfEventClass, string> = {
  [NmfEventClass.PBPB_PERIPHERAL]: 'EVENT_EXPLORATION.PERIPHERAL',
  [NmfEventClass.PBPB_SEMI_CENTRAL]: 'EVENT_EXPLORATION.SEMI_CENTRAL',
  [NmfEventClass.PBPB_CENTRAL]: 'EVENT_EXPLORATION.CENTRAL',
};

/**
 * The collected part-1 R_AA measurements, laid out exactly like the desktop
 * instructor tool's Collect canvas: the canvas is divided 2 x 1 and each half
 * 1 x 3, so the left column is R_AA over all pT and the right column is
 * R_AA restricted to pT > 1 GeV/c, with peripheral / semi-central / central
 * down the rows.
 */
@Component({
  selector: 'app-nmf-collect-plots',
  templateUrl: './collect-plots.component.html',
  styleUrls: ['./collect-plots.component.scss'],
  standalone: false,
})
export class NmfCollectPlotsComponent {
  @Input() series: NmfCollectSeries[] = [];
  @Input() maxStudent = 0;

  colorOf(series: NmfCollectSeries): string {
    return CLASS_COLORS[series.eventClass];
  }

  titleKeyOf(series: NmfCollectSeries): string {
    return CLASS_TITLE_KEYS[series.eventClass];
  }

  trackBy(_index: number, series: NmfCollectSeries): string {
    return `${series.eventClass}-${series.minPt}`;
  }

  get hasData(): boolean {
    return this.series.some((s) => s.points.length > 0);
  }
}
