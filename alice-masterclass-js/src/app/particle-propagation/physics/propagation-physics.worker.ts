/// <reference lib="webworker" />

/**
 * Off-main-thread RK4 pre-computation of every particle trajectory for an event.
 *
 * This is the "main thread non-blocking" requirement from the plan: with up to
 * `MAX_TRACKED_PARTICLES` (200) particles x `MAX_RK4_STEPS` (500) steps, each
 * requiring 4 Chebyshev field evaluations (RK4 stages), a synchronous run on
 * the UI thread would freeze the browser for a noticeable amount of time.
 * Instead, `rk4-propagator.service.ts` posts the raw field-map buffers and the
 * particle list here once, and this worker does all the math, streaming back
 * progress after every chunk of particles.
 *
 * Field buffers arrive as real `ArrayBuffer`s (see `ChebFieldBuffers`) — they
 * were fetched and parsed once on the main thread by `MagneticFieldService`
 * and are handed to `postMessage` as transferable objects, so no re-fetch and
 * no structured-clone copy of the ~2.6 MB of coefficients is needed.
 */

import { parseChebFieldData } from './cheb-field-data';
import { ChebFieldEvaluator } from './cheb-field-eval';
import { FIELD_SCALE, MAX_TRACKED_PARTICLES } from './constants';
import { computeTrajectoriesInChunks } from './rk4-integrator';
import { BufferedTrack, PropagationWorkerMessage, PropagationWorkerRequest, Vec3 } from './propagation-types';

const CHUNK_SIZE = 10;

addEventListener('message', ({ data }: MessageEvent<PropagationWorkerRequest>) => {
  try {
    const { particles, fieldBuffers, options } = data;
    const fieldData = parseChebFieldData(fieldBuffers);
    const evaluator = new ChebFieldEvaluator(fieldData);

    const fieldTesla = (pos: Vec3): Vec3 => {
      const raw = evaluator.field(pos);
      return { x: raw.x * FIELD_SCALE, y: raw.y * FIELD_SCALE, z: raw.z * FIELD_SCALE };
    };

    const boundedParticles = particles.slice(0, MAX_TRACKED_PARTICLES);
    const allTracks: BufferedTrack[] = [];
    let maxTimeNs = 0;

    computeTrajectoriesInChunks(boundedParticles, fieldTesla, options ?? {}, CHUNK_SIZE, (tracks, done, total) => {
      for (const track of tracks) {
        allTracks.push(track);
        if (track.pointCount > 0) {
          maxTimeNs = Math.max(maxTimeNs, track.times[track.pointCount - 1]);
        }
      }
      const progress: PropagationWorkerMessage = { type: 'progress', done, total };
      postMessage(progress);
    });

    const transferables: Transferable[] = [];
    for (const t of allTracks) {
      transferables.push(t.positions.buffer as ArrayBuffer, t.times.buffer as ArrayBuffer);
    }
    const result: PropagationWorkerMessage = { type: 'result', tracks: allTracks, maxTimeNs };
    postMessage(result, transferables);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const errorMessage: PropagationWorkerMessage = { type: 'error', message };
    postMessage(errorMessage);
  }
});
