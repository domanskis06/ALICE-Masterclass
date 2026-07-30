/**
 * Visual Analysis detector-part load optimisations for EventDisplay.
 *
 * Only ITS and TPC are merged by material (draw-call cut). Other layers —
 * including FIT, TRD, TOF, L3, PHOS — keep the authored scene graph and full
 * triangle detail. EMCal / DCal must never be flattened: energy readout bars
 * locate panels by `SMOD_` / `DCSM_` node names.
 *
 * Particle Propagation keeps its own loader path (InstancedMesh / Melax LOD)
 * and still loads the same unsimplified GLBs.
 */

import * as THREE from 'three';
import { mergeStaticMeshesByMaterial } from './merge-static-meshes';

/** Layers that get a by-material merge at EventDisplay load time. */
export function shouldMergeDetectorPart(assetPath: string): boolean {
  return /(^|[/\\])(its|tpc)\.glb($|\?)/i.test(assetPath);
}

/**
 * Collapse ITS / TPC static meshes to one draw call per material.
 * Returns `root` unchanged for every other detector part.
 */
export function optimizeStaticDetectorPart(
  root: THREE.Object3D,
  assetPath: string
): THREE.Object3D {
  if (!shouldMergeDetectorPart(assetPath)) {
    return root;
  }
  return mergeStaticMeshesByMaterial(root);
}
