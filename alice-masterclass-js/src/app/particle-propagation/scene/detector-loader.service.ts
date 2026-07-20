import { Injectable } from '@angular/core';

import {
  DETECTOR_PART_PATHS,
  DetectorModel,
  DetectorProgressiveOptions,
  loadDetectorModel,
  loadDetectorModelProgressive,
} from './detector-loader';

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

  /**
   * Progressive core→secondary load with deferred Melax low-LOD (see
   * {@link loadDetectorModelProgressive}).
   */
  loadProgressive(
    scale: number,
    darkMode: boolean,
    options: Omit<DetectorProgressiveOptions, 'scale' | 'darkMode'> &
      Partial<Pick<DetectorProgressiveOptions, 'scale' | 'darkMode'>>,
    paths: readonly string[] = DETECTOR_PART_PATHS
  ): Promise<DetectorModel> {
    return loadDetectorModelProgressive(paths, {
      ...options,
      scale: options.scale ?? scale,
      darkMode: options.darkMode ?? darkMode,
    });
  }
}
