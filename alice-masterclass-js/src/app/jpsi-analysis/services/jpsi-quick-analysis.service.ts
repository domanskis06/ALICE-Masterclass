import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { BATCH_SIZE, CompactEvent } from '../models/jpsi.models';
import { JpsiAnalysisStateService } from './jpsi-analysis-state.service';
import { JpsiDataService } from './jpsi-data.service';

/** Events handed to the state per tick, small enough to keep the heatmap animating. */
const CHUNK_SIZE = 25;

export type QuickAnalysisPreset = 100 | 200 | 500 | 1000 | 'all';

export const QUICK_ANALYSIS_PRESETS: QuickAnalysisPreset[] = [100, 200, 500, 1000, 'all'];

/**
 * Drives the appendable Quick Analysis loop: fetch a batch, hand it to the state in small
 * chunks so the PID heatmap fills in front of the student, repeat.
 */
@Injectable()
export class JpsiQuickAnalysisService {
  private running = false;
  private cancelled = false;

  constructor(
    private readonly data: JpsiDataService,
    private readonly state: JpsiAnalysisStateService
  ) {}

  get isRunning(): boolean {
    return this.running;
  }

  /** How many events a run would actually process, given what is left in the dataset. */
  eventsToProcess(preset: QuickAnalysisPreset, totalEvents: number): number {
    const remaining = Math.max(0, totalEvents - this.state.state.nextEventIndex);
    if (preset === 'all') {
      return remaining;
    }
    return Math.min(preset, remaining);
  }

  /**
   * Appends up to `preset` further events of the active dataset.
   *
   * Resolves with the number of events processed. Rejects when a batch fails to load; the
   * events appended before the failure are kept on purpose so the student does not lose
   * work.
   */
  async run(preset: QuickAnalysisPreset, totalEvents: number): Promise<number> {
    if (this.running) {
      return 0;
    }

    const toProcess = this.eventsToProcess(preset, totalEvents);
    if (toProcess === 0) {
      return 0;
    }

    this.running = true;
    this.cancelled = false;

    const datasetId = this.state.activeDataset;
    let processed = 0;

    try {
      while (processed < toProcess && !this.cancelled) {
        const cursor = this.state.state.nextEventIndex;
        const batchIndex = Math.floor(cursor / BATCH_SIZE);
        const offsetInBatch = cursor % BATCH_SIZE;

        const batch = await firstValueFrom(this.data.getBatch(datasetId, batchIndex));

        // The dataset may have been switched while the request was in flight.
        if (this.cancelled || this.state.activeDataset !== datasetId) {
          break;
        }

        const availableInBatch = batch.length - offsetInBatch;
        const wantedFromBatch = Math.min(availableInBatch, toProcess - processed);

        for (
          let taken = 0;
          taken < wantedFromBatch && !this.cancelled;
          taken += CHUNK_SIZE
        ) {
          const from = offsetInBatch + taken;
          const to = from + Math.min(CHUNK_SIZE, wantedFromBatch - taken);
          const chunk: CompactEvent[] = batch.slice(from, to);

          this.state.appendEvents(chunk);
          processed += chunk.length;

          await this.yieldToBrowser();
        }
      }
    } finally {
      this.running = false;
    }

    return processed;
  }

  cancel(): void {
    this.cancelled = true;
  }

  /** Lets Angular paint the freshly binned tracks before the next chunk is processed. */
  private yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}
