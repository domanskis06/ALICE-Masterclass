import { Component, EventEmitter, Input, Output } from '@angular/core';

import { DatasetDescriptor, DatasetId } from '../../models/jpsi.models';
import { QuickAnalysisPreset, QUICK_ANALYSIS_PRESETS } from '../../services/jpsi-quick-analysis.service';

@Component({
  selector: 'app-jpsi-dataset-toolbar',
  templateUrl: './dataset-toolbar.component.html',
  styleUrls: ['./dataset-toolbar.component.scss'],
  standalone: false,
})
export class DatasetToolbarComponent {
  @Input() datasets: DatasetDescriptor[] = [];
  @Input() activeDataset: DatasetId = 'pp';
  @Input() processedCount = 0;
  @Input() totalEvents = 0;
  @Input() isRunning = false;
  @Input() eventsLeft = 0;

  @Output() datasetChange = new EventEmitter<DatasetId>();
  @Output() runAnalysis = new EventEmitter<QuickAnalysisPreset>();
  @Output() resetHistograms = new EventEmitter<void>();

  readonly presets = QUICK_ANALYSIS_PRESETS;
  selectedPreset: QuickAnalysisPreset = 100;

  presetLabel(preset: QuickAnalysisPreset): string {
    return preset === 'all' ? 'JPSI.TOOLBAR.PRESET_ALL' : String(preset);
  }

  get progressPercent(): number {
    return this.totalEvents > 0 ? (this.processedCount / this.totalEvents) * 100 : 0;
  }

  /** Nothing left to append: every event of this dataset has already been processed. */
  get exhausted(): boolean {
    return this.eventsLeft === 0;
  }
}
