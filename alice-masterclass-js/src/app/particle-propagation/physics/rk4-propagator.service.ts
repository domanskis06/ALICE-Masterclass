/**
 * Angular-facing facade around the RK4 trajectory pre-computation.
 *
 * Offloads the actual math to `propagation-physics.worker.ts` (Web Worker) so
 * the UI thread never blocks while pre-computing up to `MAX_TRACKED_PARTICLES`
 * trajectories. Falls back to a main-thread, chunked (non-blocking) computation
 * when `Worker` is unavailable (e.g. some SSR/test environments).
 */

import { Injectable } from '@angular/core';
import { Observable, Subscriber } from 'rxjs';

import { MagneticFieldService } from './magnetic-field.service';
import { ChebFieldBuffers, parseChebFieldData } from './cheb-field-data';
import { ChebFieldEvaluator } from './cheb-field-eval';
import { FIELD_SCALE, MAX_TRACKED_PARTICLES } from './constants';
import { computeTrajectory, FieldFn, RK4Options } from './rk4-integrator';
import {
  BufferedTrack,
  PropagationParticle,
  PropagationResult,
  PropagationWorkerMessage,
  PropagationWorkerRequest,
} from './propagation-types';

const CHUNK_SIZE = 10;

export type PrecomputeEvent =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; result: PropagationResult };

function cloneFieldBuffers(buffers: ChebFieldBuffers): ChebFieldBuffers {
  return {
    solSegments: buffers.solSegments.slice(0),
    solParams: buffers.solParams.slice(0),
    dipSegments: buffers.dipSegments.slice(0),
    dipParams: buffers.dipParams.slice(0),
  };
}

@Injectable({ providedIn: 'root' })
export class Rk4PropagatorService {
  constructor(private readonly magneticField: MagneticFieldService) {}

  /**
   * Pre-computes trajectories for `particles`, emitting `progress` events as
   * chunks complete and a single terminal `result` event before completing.
   * Requires `MagneticFieldService.load()` to have resolved already.
   */
  precompute(particles: PropagationParticle[], options?: RK4Options): Observable<PrecomputeEvent> {
    const fieldBuffers = this.magneticField.getRawBuffers();
    if (!fieldBuffers) {
      return new Observable((subscriber) => {
        subscriber.error(
          new Error(
            '[Rk4PropagatorService] precompute() called before MagneticFieldService.load() resolved.'
          )
        );
      });
    }

    if (typeof Worker !== 'undefined') {
      return this.precomputeWithWorker(particles, fieldBuffers, options);
    }
    return this.precomputeChunkedFallback(particles, fieldBuffers, options);
  }

  private precomputeWithWorker(
    particles: PropagationParticle[],
    fieldBuffers: ChebFieldBuffers,
    options: RK4Options | undefined
  ): Observable<PrecomputeEvent> {
    return new Observable<PrecomputeEvent>((subscriber) => {
      const worker = new Worker(new URL('./propagation-physics.worker', import.meta.url));

      worker.onmessage = ({ data }: MessageEvent<PropagationWorkerMessage>) => {
        if (data.type === 'progress') {
          subscriber.next({ type: 'progress', done: data.done, total: data.total });
        } else if (data.type === 'result') {
          subscriber.next({
            type: 'result',
            result: { tracks: data.tracks, maxTimeNs: data.maxTimeNs },
          });
          subscriber.complete();
          worker.terminate();
        } else {
          subscriber.error(new Error(`[Rk4PropagatorService] worker reported an error: ${data.message}`));
          worker.terminate();
        }
      };

      worker.onerror = (event: ErrorEvent) => {
        subscriber.error(new Error(`[Rk4PropagatorService] worker crashed: ${event.message}`));
        worker.terminate();
      };

      // Transfer a *clone* of the cached buffers — `MagneticFieldService` keeps
      // the originals around (e.g. for a second precompute() call), and a real
      // structured-clone "transfer" detaches the buffers on the sending side.
      const request: PropagationWorkerRequest = {
        particles,
        fieldBuffers: cloneFieldBuffers(fieldBuffers),
        options,
      };
      const transferables: Transferable[] = [
        request.fieldBuffers.solSegments,
        request.fieldBuffers.solParams,
        request.fieldBuffers.dipSegments,
        request.fieldBuffers.dipParams,
      ];
      worker.postMessage(request, transferables);

      return () => worker.terminate();
    });
  }

  private precomputeChunkedFallback(
    particles: PropagationParticle[],
    fieldBuffers: ChebFieldBuffers,
    options: RK4Options | undefined
  ): Observable<PrecomputeEvent> {
    return new Observable<PrecomputeEvent>((subscriber) => {
      let cancelled = false;
      this.runChunkedFallback(particles, fieldBuffers, options, subscriber, () => cancelled).catch((err) =>
        subscriber.error(err)
      );
      return () => {
        cancelled = true;
      };
    });
  }

  private async runChunkedFallback(
    particles: PropagationParticle[],
    fieldBuffers: ChebFieldBuffers,
    options: RK4Options | undefined,
    subscriber: Subscriber<PrecomputeEvent>,
    isCancelled: () => boolean
  ): Promise<void> {
    const fieldData = parseChebFieldData(fieldBuffers);
    const evaluator = new ChebFieldEvaluator(fieldData);
    const fieldTesla: FieldFn = (pos) => {
      const raw = evaluator.field(pos);
      return { x: raw.x * FIELD_SCALE, y: raw.y * FIELD_SCALE, z: raw.z * FIELD_SCALE };
    };

    const bounded = particles.slice(0, MAX_TRACKED_PARTICLES);
    const total = bounded.length;
    const allTracks: BufferedTrack[] = [];
    let maxTimeNs = 0;

    for (let offset = 0; offset < total; offset += CHUNK_SIZE) {
      if (isCancelled()) return;

      const batch = bounded.slice(offset, offset + CHUNK_SIZE);
      for (const particle of batch) {
        const track = computeTrajectory(particle, fieldTesla, options ?? {});
        allTracks.push(track);
        if (track.pointCount > 0) {
          maxTimeNs = Math.max(maxTimeNs, track.times[track.pointCount - 1]);
        }
      }

      const done = Math.min(offset + CHUNK_SIZE, total);
      subscriber.next({ type: 'progress', done, total });
      // Yield back to the event loop so the UI (e.g. a loading spinner) can repaint.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    if (isCancelled()) return;
    subscriber.next({ type: 'result', result: { tracks: allTracks, maxTimeNs } });
    subscriber.complete();
  }
}
