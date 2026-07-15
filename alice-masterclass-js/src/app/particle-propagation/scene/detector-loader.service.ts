import { Injectable } from '@angular/core';

import { DETECTOR_PART_PATHS, DetectorModel, loadDetectorModel } from './detector-loader';

/**
 * Thin Angular-injectable wrapper around the pure `loadDetectorModel()`
 * function. Exists purely so `ParticlePropagationComponent` can be tested with
 * a `TestBed` provider override instead of fighting webpack's read-only ESM
 * export bindings with `spyOn()` on a bare function import — `loadDetectorModel`
 * itself stays a plain, dependency-free function.
 */
@Injectable({ providedIn: 'root' })
export class DetectorLoaderService {
  load(scale: number, darkMode = true, paths: readonly string[] = DETECTOR_PART_PATHS): Promise<DetectorModel> {
    return loadDetectorModel(paths, scale, darkMode);
  }
}
