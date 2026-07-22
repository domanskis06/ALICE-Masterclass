import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Event, LSAData } from '../shared/models';
import { ParticleType, CollisionType, CentralityType, VisualAnalysisResultsEntry, LargeScaleAnalysisResultsEntry, ApiService } from '../shared/services/api.service';
import { Observable } from 'rxjs';

export interface CollisionCentralityEntry {
  collision: CollisionType;
  centrality: CentralityType;
}

/** UI picker values for special datasets (not server dataset IDs). */
export const DATASET_PICKER_DEMO = -1;
export const DATASET_PICKER_FULL_EVENT = -2;

@Injectable({
  providedIn: 'root'
})
export class StrangenessDataService {

  readonly EVENT_DATA_PATH = "assets/exercises/strangeness/part1";

  readonly EVENTS_IN_DEMO_DATASET = 4;
  readonly DEMO_DATASET_ID = 0;

  readonly EVENTS_IN_DATASET = 15;

  readonly EVENTS_IN_FULL_DATASET = 4;
  readonly FULL_DATASET_ID = 20;

  readonly DATA_UPLOAD_COMPLETED_DURATION = 800;

  readonly VA_DATASET = {
    hasDemo: true,
    hasFull: true,
    dataset: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
  };

  readonly HISTOGRAM_DATA_PATH = "assets/exercises/strangeness/part2";

  readonly LSA_DATASET: Map<string, Array<CollisionCentralityEntry>> = new Map<string, Array<CollisionCentralityEntry>>([
    [ParticleType.KAON, [
      {collision: CollisionType.PP, centrality: CentralityType.C000_000},
      {collision: CollisionType.PBPB, centrality: CentralityType.C000_010},
      {collision: CollisionType.PBPB, centrality: CentralityType.C010_020},
      {collision: CollisionType.PBPB, centrality: CentralityType.C020_030},
      {collision: CollisionType.PBPB, centrality: CentralityType.C030_040},
      {collision: CollisionType.PBPB, centrality: CentralityType.C040_050},
      {collision: CollisionType.PBPB, centrality: CentralityType.C050_060},
      {collision: CollisionType.PBPB, centrality: CentralityType.C060_070},
      {collision: CollisionType.PBPB, centrality: CentralityType.C070_080},
      {collision: CollisionType.PBPB, centrality: CentralityType.C080_090}
    ]],
    [ParticleType.LAMBDA, [
      {collision: CollisionType.PP, centrality: CentralityType.C000_000},
      {collision: CollisionType.PBPB, centrality: CentralityType.C000_010},
      {collision: CollisionType.PBPB, centrality: CentralityType.C010_020},
      {collision: CollisionType.PBPB, centrality: CentralityType.C020_030},
      {collision: CollisionType.PBPB, centrality: CentralityType.C030_040},
      {collision: CollisionType.PBPB, centrality: CentralityType.C040_050},
      {collision: CollisionType.PBPB, centrality: CentralityType.C050_060},
      {collision: CollisionType.PBPB, centrality: CentralityType.C060_070},
      {collision: CollisionType.PBPB, centrality: CentralityType.C070_080},
    ]],
    [ParticleType.ANTI_LAMBDA, [
      {collision: CollisionType.PP, centrality: CentralityType.C000_000},
      {collision: CollisionType.PBPB, centrality: CentralityType.C000_010},
      {collision: CollisionType.PBPB, centrality: CentralityType.C010_020},
      {collision: CollisionType.PBPB, centrality: CentralityType.C020_030},
      {collision: CollisionType.PBPB, centrality: CentralityType.C030_040},
      {collision: CollisionType.PBPB, centrality: CentralityType.C040_050},
      {collision: CollisionType.PBPB, centrality: CentralityType.C050_060},
      {collision: CollisionType.PBPB, centrality: CentralityType.C060_070},
      {collision: CollisionType.PBPB, centrality: CentralityType.C070_080},
    ]],
  ]);

  // Note: objects are re-created each time to properly trigger updates when data is used as @Input

  /** Per-event histogram entries (multi-V0 events may have several). */
  get visualAnalysisResults(): Map<string, VisualAnalysisResultsEntry[]> { return this._vaResults; }
  private _vaResults: Map<string, VisualAnalysisResultsEntry[]> = new Map<string, VisualAnalysisResultsEntry[]>();

  /** Decay-track particleIds already contributed to a histogram entry, keyed by event id. */
  private _analyzedDecayTrackIds: Map<string, Set<number>> = new Map<string, Set<number>>();

  addVisualAnalysisResult(key: string, value: VisualAnalysisResultsEntry, trackIds: number[] = []): void {
    this._vaResults = new Map<string, VisualAnalysisResultsEntry[]>(this._vaResults);
    const existing = this._vaResults.get(key) ?? [];
    this._vaResults.set(key, [...existing, value]);

    if (trackIds.length > 0) {
      const analyzed = new Map(this._analyzedDecayTrackIds);
      const set = new Set(analyzed.get(key) ?? []);
      for (const id of trackIds) {
        set.add(id);
      }
      analyzed.set(key, set);
      this._analyzedDecayTrackIds = analyzed;
    }
  }

  /** True once every required decay-track particleId has been used in a histogram add. */
  areAllDecayTracksAnalyzed(key: string, requiredTrackIds: Iterable<number>): boolean {
    const done = this._analyzedDecayTrackIds.get(key);
    if (!done || done.size === 0) {
      return false;
    }
    for (const id of requiredTrackIds) {
      if (!done.has(id)) {
        return false;
      }
    }
    return true;
  }

  clearVisualAnalysisResults(): void {
    // New Map instance so Angular @Input change detection updates histograms immediately.
    this._vaResults = new Map<string, VisualAnalysisResultsEntry[]>();
    this._analyzedDecayTrackIds = new Map<string, Set<number>>();
  }

  submitVisualAnalysisResults(datasetID: number): Observable<any> {
    return this.apiService.submitVisualAnalysisResults(this.visualAnalysisResults, datasetID);
  }

  get largeScaleAnalysisResults(): Map<string, LargeScaleAnalysisResultsEntry> { return this._lsaResults; }
  private _lsaResults: Map<string, LargeScaleAnalysisResultsEntry> = new Map<string, LargeScaleAnalysisResultsEntry>();

  addLargeScaleAnalysisResult(key: string, value: LargeScaleAnalysisResultsEntry) {
    this._lsaResults = new Map<string, LargeScaleAnalysisResultsEntry>(this._lsaResults);
    this._lsaResults.set(key, value);
  }

  clearLargeScaleAnalysisResults(): void {
    this._lsaResults = new Map<string, LargeScaleAnalysisResultsEntry>();
  }

  submitLargeScaleAnalysisResults(): Observable<any> {
    return this.apiService.submitLargeScaleAnalysisResults(this.largeScaleAnalysisResults);
  }

  constructor(private http: HttpClient, private apiService: ApiService) { }

  getEvent(datasetNum: number, eventID: number) {
    const url = `${this.EVENT_DATA_PATH}/event_${datasetNum}_${eventID}.json`;

    return this.http.get<Event>(url);
  }

  getHistogram(filename: string) {
    const url = `${this.HISTOGRAM_DATA_PATH}/${filename}.json`;

    return this.http.get<LSAData>(url);
  }
}
