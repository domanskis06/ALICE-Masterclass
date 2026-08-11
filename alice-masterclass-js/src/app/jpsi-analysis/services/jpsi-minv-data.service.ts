import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, shareReplay, switchMap } from 'rxjs/operators';

import { PbPbCentralityId, PbPbManifest, PublishedMinvHistogram } from '../models/pbpb-minv.models';

const MANIFEST_PATH = 'assets/exercises/jpsi/minv/manifest.json';
const BASE_PATH = 'assets/exercises/jpsi/minv';

/**
 * Loads the published Pb-Pb Minv histograms digitized from Fig. 15 (see
 * assets/exercises/jpsi/minv/README.md). Unlike JpsiDataService these are not per-event
 * batches: each file is a single, already-binned U/L histogram, so there is at most one
 * request per centrality, cached for the lifetime of the app.
 */
@Injectable()
export class JpsiMinvDataService {
  private manifest$: Observable<PbPbManifest> | null = null;
  private readonly histogramCache = new Map<PbPbCentralityId, Observable<PublishedMinvHistogram>>();

  constructor(private readonly http: HttpClient) {}

  getManifest(): Observable<PbPbManifest> {
    if (this.manifest$ === null) {
      this.manifest$ = this.http.get<PbPbManifest>(MANIFEST_PATH).pipe(shareReplay(1));
    }
    return this.manifest$;
  }

  getHistogram(id: PbPbCentralityId): Observable<PublishedMinvHistogram> {
    const cached = this.histogramCache.get(id);
    if (cached !== undefined) {
      return cached;
    }

    const request$ = this.getManifest().pipe(
      map((manifest) => manifest.histograms.find((h) => h.id === id)),
      switchMap((entry) => {
        if (entry === undefined) {
          throw new Error(`Unknown Pb-Pb Minv histogram id: ${id}`);
        }
        return this.http.get<PublishedMinvHistogram>(`${BASE_PATH}/${entry.file}`);
      }),
      shareReplay(1)
    );

    this.histogramCache.set(id, request$);
    return request$;
  }
}
