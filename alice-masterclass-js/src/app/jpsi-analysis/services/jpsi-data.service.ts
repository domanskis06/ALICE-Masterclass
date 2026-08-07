import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';

import { CompactEvent, DatasetId, JpsiBatch, JpsiManifest } from '../models/jpsi.models';

const MANIFEST_PATH = 'assets/exercises/jpsi/manifest.json';

/**
 * Loads the PID-only event assets produced by data/jpsi/convert_events.C.
 *
 * Batches are cached per dataset because Quick Analysis is appendable: a student who runs
 * 100 events and then 500 more must not refetch the first batch.
 */
@Injectable()
export class JpsiDataService {
  private manifest$: Observable<JpsiManifest> | null = null;
  private readonly batchCache = new Map<string, Observable<CompactEvent[]>>();

  constructor(private readonly http: HttpClient) {}

  getManifest(): Observable<JpsiManifest> {
    if (this.manifest$ === null) {
      this.manifest$ = this.http.get<JpsiManifest>(MANIFEST_PATH).pipe(shareReplay(1));
    }
    return this.manifest$;
  }

  /** Events of one batch, already split per event so pairing never crosses boundaries. */
  getBatch(datasetId: DatasetId, batchIndex: number): Observable<CompactEvent[]> {
    const key = `${datasetId}/${batchIndex}`;
    const cached = this.batchCache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const path = `assets/exercises/jpsi/${datasetId}/batch_${String(batchIndex).padStart(3, '0')}.json`;
    const request$ = this.http.get<JpsiBatch>(path).pipe(
      map((batch) => this.splitBatch(batch)),
      shareReplay(1)
    );

    this.batchCache.set(key, request$);
    return request$;
  }

  /**
   * Turns the columnar batch into one typed-array bundle per event. trackOffsets carries
   * the event boundaries; without it every pair count downstream would be wrong.
   */
  private splitBatch(batch: JpsiBatch): CompactEvent[] {
    const events: CompactEvent[] = [];

    for (let i = 0; i < batch.eventCount; i++) {
      const from = batch.trackOffsets[i];
      const to = batch.trackOffsets[i + 1];

      events.push({
        px: Float32Array.from(batch.px.slice(from, to)),
        py: Float32Array.from(batch.py.slice(from, to)),
        pz: Float32Array.from(batch.pz.slice(from, to)),
        p: Float32Array.from(batch.p.slice(from, to)),
        dedx: Float32Array.from(batch.dedx.slice(from, to)),
        sign: Int8Array.from(batch.sign.slice(from, to)),
      });
    }

    return events;
  }
}
