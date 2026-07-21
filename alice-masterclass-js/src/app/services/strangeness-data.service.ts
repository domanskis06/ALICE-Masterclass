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

  get visualAnalysisResults(): Map<string, VisualAnalysisResultsEntry> { return this._vaResults; }
  private _vaResults: Map<string, VisualAnalysisResultsEntry> = new Map<string, VisualAnalysisResultsEntry>();

  addVisualAnalysisResult(key: string, value: VisualAnalysisResultsEntry): void {
    this._vaResults = new Map<string, VisualAnalysisResultsEntry>(this._vaResults);
    this._vaResults.set(key, value);
  }

  clearVisualAnalysisResults(): void {
    this._vaResults.clear();
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
    this._lsaResults.clear();
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
