import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';

import { Event } from '../shared/models';
import {
  RaaMetadata,
  RaaPpReferenceStub,
  RaaPtSpectraStub,
} from '../shared/models/raa/raa';
import { withResolvedTrackSigns } from '../shared/utils/track-charge';

@Injectable({
  providedIn: 'root',
})
export class RaaDataService {
  readonly DATA_PATH = 'assets/exercises/raa';

  private metadata$?: Observable<RaaMetadata>;
  private spectra$?: Observable<RaaPtSpectraStub>;
  private pp$?: Observable<RaaPpReferenceStub>;

  constructor(private readonly http: HttpClient) {}

  getMetadata(): Observable<RaaMetadata> {
    if (!this.metadata$) {
      this.metadata$ = this.http
        .get<RaaMetadata>(`${this.DATA_PATH}/metadata.json`)
        .pipe(shareReplay(1));
    }
    return this.metadata$;
  }

  getPtSpectra(): Observable<RaaPtSpectraStub> {
    if (!this.spectra$) {
      this.spectra$ = this.http
        .get<RaaPtSpectraStub>(`${this.DATA_PATH}/pt_spectra.json`)
        .pipe(shareReplay(1));
    }
    return this.spectra$;
  }

  getPpReference(): Observable<RaaPpReferenceStub> {
    if (!this.pp$) {
      this.pp$ = this.http
        .get<RaaPpReferenceStub>(`${this.DATA_PATH}/pp_reference.json`)
        .pipe(shareReplay(1));
    }
    return this.pp$;
  }

  getShowcaseEvent(relativeFile: string): Observable<Event> {
    return this.http
      .get<Event>(`${this.DATA_PATH}/${relativeFile}`)
      .pipe(map((ev) => withResolvedTrackSigns(ev)));
  }

  /** Loads one real event from a real dataset, converted from the desktop app's VSD ROOT files. */
  getDatasetEvent(datasetId: number, eventNumber: number): Observable<Event> {
    return this.http
      .get<Event>(`${this.DATA_PATH}/datasets/event_${datasetId}_${eventNumber}.json`)
      .pipe(map((ev) => withResolvedTrackSigns(ev)));
  }
}
