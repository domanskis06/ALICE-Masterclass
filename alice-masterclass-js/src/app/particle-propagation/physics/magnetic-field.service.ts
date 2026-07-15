/**
 * Angular-facing wrapper around the ALICE Chebyshev magnetic field map.
 *
 * The heavy lifting (binary parsing, Clenshaw/Chebyshev evaluation) is ported
 * from https://github.com/pnwkw/gpu_propagator and
 * https://github.com/pnwkw/distributed_field (both GPL-3.0) — see
 * `cheb-field-data.ts` and `cheb-field-eval.ts` for the file-level attribution
 * and the 1:1 mapping to the original C++ (`mag_field::mag_cheb`).
 *
 * This service only owns: fetching the 4 `.bin` LUT files over HTTP, parsing
 * them once, and exposing a small public API in physical units (Tesla). The
 * actual per-point evaluation is delegated to `ChebFieldEvaluator`, which has
 * no Angular/DOM dependency so it can be reused verbatim inside
 * `propagation-physics.worker.ts` (Faza 4).
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { ChebFieldEvaluator } from './cheb-field-eval';
import { ChebFieldBuffers, parseChebFieldData } from './cheb-field-data';
import { FIELD_DATA_BASE_PATH, FIELD_SCALE } from './constants';
import { Vec3 } from './propagation-types';

@Injectable({ providedIn: 'root' })
export class MagneticFieldService {
  private evaluator: ChebFieldEvaluator | null = null;
  private rawBuffers: ChebFieldBuffers | null = null;
  private loadPromise: Promise<void> | null = null;

  constructor(private readonly http: HttpClient) {}

  /** True once the field map has been fetched and parsed. */
  get isLoaded(): boolean {
    return this.evaluator !== null;
  }

  /**
   * Fetches and parses the 4 binary LUT files. Safe to call multiple times
   * (subsequent calls await the same in-flight/completed load).
   */
  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.doLoad();
    }
    return this.loadPromise;
  }

  private async doLoad(): Promise<void> {
    const [solSegments, solParams, dipSegments, dipParams] = await Promise.all([
      this.fetchArrayBuffer('sol_segments.bin'),
      this.fetchArrayBuffer('sol_params.bin'),
      this.fetchArrayBuffer('dip_segments.bin'),
      this.fetchArrayBuffer('dip_params.bin'),
    ]);

    this.rawBuffers = { solSegments, solParams, dipSegments, dipParams };
    const data = parseChebFieldData(this.rawBuffers);
    this.evaluator = new ChebFieldEvaluator(data);
  }

  private fetchArrayBuffer(fileName: string): Promise<ArrayBuffer> {
    return firstValueFrom(
      this.http.get(`${FIELD_DATA_BASE_PATH}/${fileName}`, { responseType: 'arraybuffer' })
    );
  }

  /**
   * Magnetic field at `pos` (cm), in Tesla. Call `load()` (and await it) first;
   * throws if the field map has not finished loading yet.
   */
  field(pos: Vec3): Vec3 {
    if (!this.evaluator) {
      throw new Error(
        '[MagneticFieldService] field() called before load() resolved — await load() first.'
      );
    }
    const raw = this.evaluator.field(pos);
    return { x: raw.x * FIELD_SCALE, y: raw.y * FIELD_SCALE, z: raw.z * FIELD_SCALE };
  }

  /**
   * Raw (still little-endian-parsed, un-scaled) LUT buffers, so a Web Worker
   * can be handed the same bytes (as `Transferable`s) instead of re-fetching
   * them over HTTP a second time from inside the worker.
   */
  getRawBuffers(): ChebFieldBuffers | null {
    return this.rawBuffers;
  }
}
