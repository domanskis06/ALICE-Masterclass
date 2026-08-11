import { Component, EventEmitter, Input, Output } from '@angular/core';

import { DatasetDescriptor, DatasetId } from '../../models/jpsi.models';
import { CollisionSystemId, PbPbCentralityDescriptor } from '../../models/pbpb-minv.models';
import { QuickAnalysisPreset, QUICK_ANALYSIS_PRESETS } from '../../services/jpsi-quick-analysis.service';

@Component({
  selector: 'app-jpsi-dataset-toolbar',
  templateUrl: './dataset-toolbar.component.html',
  styleUrls: ['./dataset-toolbar.component.scss'],
  standalone: false,
})
export class DatasetToolbarComponent {
  @Input() datasets: DatasetDescriptor[] = [];
  @Input() publishedOptions: PbPbCentralityDescriptor[] = [];
  @Input() activeDataset: CollisionSystemId = 'pp';
  /** Hides the event count / Run analysis / progress / Reset histograms controls. */
  @Input() isPublishedActive = false;
  @Input() processedCount = 0;
  @Input() totalEvents = 0;
  @Input() isRunning = false;
  @Input() eventsLeft = 0;

  @Output() datasetChange = new EventEmitter<CollisionSystemId>();
  @Output() runAnalysis = new EventEmitter<QuickAnalysisPreset>();
  @Output() resetHistograms = new EventEmitter<void>();

  readonly presets = QUICK_ANALYSIS_PRESETS;
  selectedPreset: QuickAnalysisPreset = 100;

  presetLabel(preset: QuickAnalysisPreset): string {
    return preset === 'all' ? 'JPSI.TOOLBAR.PRESET_ALL' : String(preset);
  }

  /** Compact collision-system labels for the dropdown (pp, p-Pb, …). */
  shortLabelKey(datasetId: DatasetId): string {
    return datasetId === 'pp' ? 'JPSI.DATASET.PP_SHORT' : 'JPSI.DATASET.PPB_SHORT';
  }

  get progressPercent(): number {
    return this.totalEvents > 0 ? (this.processedCount / this.totalEvents) * 100 : 0;
  }

  /** Nothing left to append: every event of this dataset has already been processed. */
  get exhausted(): boolean {
    return this.eventsLeft === 0;
  }
}
