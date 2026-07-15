/**
 * Loads the ALICE detector shell (ITS/TPC/TRD/TOF/calorimeters/L3 magnet) for
 * the Particle Propagation module.
 *
 * Reproduces the interactive Visual Analysis / EventDisplay look and
 * performance profile — per-layer materials (opaque with polygon offset, see
 * `detector-appearance.ts`), a `path -> root` map so each layer can be
 * toggled/faded from the GUI, and a whole-model recenter onto the beam axis so
 * tracks starting at the world origin appear in the middle of the detector.
 * It does NOT import `EventDisplayComponent` (god-node isolation, per
 * `.cursor/rules/architecture.mdc`).
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DETECTOR_MODEL_BASE_PATH } from '../physics/constants';
import { mergeStaticMeshesByMaterial } from '../../shared/three/merge-static-meshes';
import {
  applyDetectorLayerMaterials,
  applyDetectorDarkMode,
  defaultLayerOpacity,
  detectorPartLabel,
  setDetectorPartOpacity,
} from './detector-appearance';

/** Identical part list (and inner->outer order) to `StrangenessVisualAnalysisComponent.ALICE_DETECTOR_MODEL`. */
export const DETECTOR_PART_PATHS: readonly string[] = [
  `${DETECTOR_MODEL_BASE_PATH}/its.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/tpc.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/TRD.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/TOF.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/EMCal_Dcal.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/DCAL.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/PHOS.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/L3.glb`,
];

/** Per-slider clamp for the layer radial inflate (reduces z-fighting between shells). */
const LAYER_RADIAL_INFLATE_STEP = 0.0009;

/** One toggleable detector layer. */
export interface DetectorPart {
  assetPath: string;
  label: string;
  root: THREE.Object3D;
}

export interface DetectorModel {
  /** Recentered group holding every successfully-loaded part. */
  group: THREE.Group;
  /** Layers in load order, for building GUI controls. */
  parts: DetectorPart[];
}

function loadOnePart(
  loader: GLTFLoader,
  path: string,
  scale: number,
  layerIndex: number,
  totalLayers: number
): Promise<THREE.Object3D | null> {
  return new Promise((resolve) => {
    loader.load(
      path,
      (gltf: GLTF) => {
        const root = gltf.scene;
        const radialInflate = 1 + layerIndex * LAYER_RADIAL_INFLATE_STEP;
        root.scale.setScalar(scale * radialInflate);
        root.updateMatrixWorld(true);
        root.userData = { ...(root.userData || {}), detectorAssetPath: path, detectorLayerIndex: layerIndex };

        const opacity = defaultLayerOpacity(path, layerIndex, totalLayers);
        // Order matters: materials (the merge grouping key) must be set first.
        applyDetectorLayerMaterials(root, opacity, layerIndex);
        const merged = mergeStaticMeshesByMaterial(root);
        merged.userData = { ...(root.userData || {}) };
        // Apply the translucent target opacity now that meshes are merged.
        setDetectorPartOpacity(merged, opacity);
        resolve(merged);
      },
      undefined,
      (err) => {
        console.error(`[ParticlePropagation] Failed to load detector model: ${path}`, err);
        resolve(null);
      }
    );
  });
}

/**
 * Returns the part that best defines the beam / pipe axis. The whole-assembly
 * AABB is a poor reference: calorimeters are one-sided and L3's AABB can sit at
 * the origin while ITS/TPC (the visual "tube") are systematically offset in the
 * authored GLBs (~+30 cm in Y). Centering on ITS/TPC is what puts the collision
 * vertex at the middle of the pipe.
 */
function beamAxisReference(parts: DetectorPart[]): THREE.Object3D | null {
  const prefer = [/\/its\.glb$/i, /\/tpc\.glb$/i, /\/l3\.glb$/i];
  for (const re of prefer) {
    const hit = parts.find((p) => re.test(p.assetPath));
    if (hit) return hit.root;
  }
  return parts[0]?.root ?? null;
}

/**
 * Shifts the group so the detector's beam-pipe axis sits on the world origin
 * (where tracks and the collision intro start). Uses ITS (then TPC, then L3)
 * as the axis reference — not the whole-assembly AABB.
 */
function recenterOnBeamAxis(group: THREE.Object3D, parts: DetectorPart[]): void {
  const ref = beamAxisReference(parts);
  if (!ref) return;
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(ref);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3());
  group.position.x -= center.x;
  group.position.y -= center.y;
  group.position.z -= center.z;
  group.updateMatrixWorld(true);
}

/**
 * Loads every detector part in parallel and returns the recentered group plus a
 * per-part list (failures are logged and skipped, never rejected, so one
 * missing asset doesn't block the whole scene).
 */
export async function loadDetectorModel(
  paths: readonly string[] = DETECTOR_PART_PATHS,
  scale = 1,
  darkMode = true
): Promise<DetectorModel> {
  const loader = new GLTFLoader();
  const roots = await Promise.all(
    paths.map((path, i) => loadOnePart(loader, path, scale, i, paths.length))
  );

  const group = new THREE.Group();
  group.name = 'particle-propagation-detector';
  const parts: DetectorPart[] = [];

  roots.forEach((root, i) => {
    if (!root) return;
    const assetPath = paths[i];
    applyDetectorDarkMode(root, darkMode);
    group.add(root);
    parts.push({ assetPath, label: detectorPartLabel(assetPath), root });
  });

  recenterOnBeamAxis(group, parts);
  return { group, parts };
}
