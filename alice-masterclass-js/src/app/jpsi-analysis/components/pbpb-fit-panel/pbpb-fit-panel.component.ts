import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';

import { FitHistogramComponent } from '../../../shared/components/fit-histogram/fit-histogram.component';
import { FitSelectorComponent } from '../../../shared/components/fit-selector/fit-selector.component';
import { FitHistogramEntry } from '../../../shared/models';
import { FitService } from '../../../shared/services/fit.service';
import { PbPbPanelMode, PublishedMinvHistogram } from '../../models/pbpb-minv.models';

/**
 * Right panel for the published Pb-Pb datasets. Empty until the student subtracts the
 * background on the left panel; from then on it is the same Gauss+polynomial fit UI as LSA
 * (`app-fit-histogram` + `app-fit-selector`, both shared, unchanged), bound to this module's
 * own `FitService` instance (see `JpsiAnalysisComponent` providers). Pinch/scroll zoom is also
 * wired the same way as LSA's `HistogramDisplayComponent` (`enableZoom` + Reset range/zoom).
 */
@Component({
  selector: 'app-jpsi-pbpb-fit-panel',
  templateUrl: './pbpb-fit-panel.component.html',
  styleUrls: ['./pbpb-fit-panel.component.scss'],
  standalone: false,
})
export class PbPbFitPanelComponent implements OnChanges {
  @Input() mode: PbPbPanelMode = 'explore';
  @Input() histogram: PublishedMinvHistogram | null = null;
  @Input() canAccept = false;

  @Output() acceptResult = new EventEmitter<void>();
  @Output() showComponents = new EventEmitter<void>();

  @ViewChild('fitHistogram') private fitHistogramRef?: FitHistogramComponent;
  @ViewChild('fitSelector') private fitSelectorRef?: FitSelectorComponent;

  /** Tracks brush zoom, same pattern as LSA's `HistogramDisplayComponent`. */
  isZoomed = false;
  private zoomRange: [number, number] | null = null;

  constructor(public readonly fitService: FitService) {}

  /**
   * The fit-histogram/fit-selector pair lives inside the `mode !== 'explore'` branch of the
   * template, so it is destroyed and recreated every time `mode` flips back to `'subtracted'`
   * (fresh subtract, or switching back to a centrality that was already subtracted). Reset the
   * locally-tracked zoom then, so a stale window from a previous session never leaks into the
   * freshly mounted children.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mode'] && changes['mode'].currentValue === 'subtracted') {
      this.zoomRange = null;
      this.isZoomed = false;
    }
  }

  private get fullAxisRange(): [number, number] {
    return this.histogram !== null ? [this.histogram.xmin, this.histogram.xmax] : [0, 1];
  }

  /** Shrinks to the zoomed window so the fit-selector sliders track what's visible, like LSA. */
  get axisRange(): [number, number] {
    return this.zoomRange ?? this.fullAxisRange;
  }

  /** Read once per mount (right when the fit-selector appears) to restore the persisted range. */
  get initialSelection(): FitHistogramEntry {
    return {
      signalFitRange: this.fitService.signalFitRange,
      backgroundFitRange: this.fitService.backgroundFitRange,
    };
  }

  onTryFit(event: FitHistogramEntry): void {
    this.fitService.backgroundFitRange = event.backgroundFitRange;
    this.fitService.signalFitRange = event.signalFitRange;
    this.fitService.fit();
  }

  onClearFit(): void {
    this.fitService.clearFit();
  }

  onAcceptClick(): void {
    this.acceptResult.emit();
  }

  onShowComponentsClick(): void {
    this.showComponents.emit();
  }

  onZoom(range: [number, number]): void {
    const [xmin, xmax] = this.fullAxisRange;
    this.isZoomed = range[0] !== xmin || range[1] !== xmax;
    this.zoomRange = [range[0], range[1]];
  }

  onUnzoomClick(): void {
    this.fitHistogramRef?.unzoom();
  }

  onResetRangeClick(): void {
    this.fitSelectorRef?.resetRangesToAxisExtremes();
  }
}
