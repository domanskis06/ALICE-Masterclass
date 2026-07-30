/**
 * Visual Analysis detector-part load optimisations for EventDisplay.
 *
 * - EMCal / DCal: untouched scene graph (`SMOD_` / `DCSM_` needed for energy bars).
 * - ITS / TPC: merge by material only (full triangle detail — no prune / no asset
 *   decimate; close-up viewing stays sharp).
 * - Every other static layer (FIT, TRD, TOF, PHOS, L3, …): prune tiny CAD
 *   fragments then merge by material. Heavier layers are also pre-simplified in
 *   the GLB via gltfpack (see changelog).
 *
 * Particle Propagation keeps its own loader path (InstancedMesh / Melax LOD).
 */

import * as THREE from 'three';
import { mergeStaticMeshesByMaterial } from './merge-static-meshes';

/** EMCal / DCal must keep named panel nodes for cylindrical energy bars. */
export function mustPreserveDetectorSceneGraph(assetPath: string): boolean {
  return /(^|[/\\])(emcal|dcal)\.glb($|\?)/i.test(assetPath);
}

/** ITS / TPC: merge only — do not prune or asset-decimate. */
export function isMergeOnlyDetectorPart(assetPath: string): boolean {
  return /(^|[/\\])(its|tpc)\.glb($|\?)/i.test(assetPath);
}

/**
 * Authored GLB units are centimetres (before `detectorModelScale`). Fragments
 * smaller than this along every axis are usually screws / microfacets that do
 * not read at the VA camera distance.
 */
export const TINY_DETECTOR_MESH_MAX_DIM_CM = 1.5;

/**
 * Removes leaf meshes whose world-space AABB max dimension is below
 * {@link TINY_DETECTOR_MESH_MAX_DIM_CM}. Mutates `root`; returns how many
 * meshes were detached.
 */
export function pruneTinyDetectorMeshes(
  root: THREE.Object3D,
  maxDimCm = TINY_DETECTOR_MESH_MAX_DIM_CM
): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  const doomed: THREE.Object3D[] = [];

  root.traverse((obj) => {
    if ((obj as { isMesh?: boolean }).isMesh !== true) return;
    box.setFromObject(obj);
    if (box.isEmpty()) return;
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0 && maxDim < maxDimCm) {
      doomed.push(obj);
    }
  });

  for (const obj of doomed) {
    obj.parent?.remove(obj);
  }
  return doomed.length;
}

/**
 * Optimise one detector part for EventDisplay:
 * - calorimeters: unchanged
 * - ITS / TPC: merge only
 * - others: prune tiny fragments, then merge
 */
export function optimizeStaticDetectorPart(
  root: THREE.Object3D,
  assetPath: string
): THREE.Object3D {
  if (mustPreserveDetectorSceneGraph(assetPath)) {
    return root;
  }
  if (!isMergeOnlyDetectorPart(assetPath)) {
    pruneTinyDetectorMeshes(root);
  }
  return mergeStaticMeshesByMaterial(root);
}
