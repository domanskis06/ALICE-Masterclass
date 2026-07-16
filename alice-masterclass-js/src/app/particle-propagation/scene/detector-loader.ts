/**
 * Loads the ALICE detector shell (ITS/TPC/TRD/TOF/calorimeters/L3 magnet plus
 * forward muon-system layers MCH/ABSO/SHIL/DIPO) for the Particle Propagation module.
 *
 * Reproduces the interactive Visual Analysis / EventDisplay look and
 * performance profile — per-layer materials (opaque with polygon offset, see
 * `detector-appearance.ts`), a `path -> root` map so each layer can be
 * toggled/faded from the GUI, and a whole-model recenter onto the beam axis so
 * tracks starting at the world origin appear in the middle of the detector.
 *
 * L3 is special-cased: sector families become {@link THREE.InstancedMesh} (no
 * material merge — that creates one giant transparent blob and hurts fill-rate)
 * wrapped in a distance {@link THREE.LOD}. TPC is also a distance LOD: full
 * merged geometry up close, fine-detail thinning + heavy-panel decimation far
 * away. ITS is a distance LOD with a decimated Mesh_0 shell in the far level.
 * Other parts still merge by material.
 * It does NOT import `EventDisplayComponent` (god-node isolation, per
 * `.cursor/rules/architecture.mdc`).
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { DETECTOR_MODEL_BASE_PATH } from '../physics/constants';
import { stripCadHelperCubes } from '../../shared/three/cad-helper-cubes';
import { mergeStaticMeshesByMaterial } from '../../shared/three/merge-static-meshes';
import {
  applyDetectorLayerMaterials,
  applyDetectorDarkMode,
  buildOuterMagnetInstanced,
  cloneDetectorSubtree,
  defaultLayerOpacity,
  detectorPartLabel,
  isAuxiliaryMuonPart,
  isDipo,
  isIts,
  isMch,
  isOuterMagnet,
  isTpc,
  ITS_LOD_FAR_DISTANCE,
  MUON_AUX_LOD_FAR_DISTANCE,
  OUTER_MAGNET_LOD_FAR_DISTANCE,
  OUTER_MAGNET_SECTOR_KEEP_EVERY,
  setDetectorPartOpacity,
  simplifyAuxiliaryForLowLod,
  simplifyDipoForLowLod,
  simplifyItsForLowLod,
  simplifyMchForLowLod,
  simplifyTpcForLowLod,
  TPC_LOD_FAR_DISTANCE,
} from './detector-appearance';

/**
 * ALICE detector shell for Particle Propagation (inner -> outer).
 * Includes the VA assembly plus forward muon-system layers (MCH / ABSO / SHIL / DIPO).
 */
export const DETECTOR_PART_PATHS: readonly string[] = [
  `${DETECTOR_MODEL_BASE_PATH}/its.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/tpc.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/TRD.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/TOF.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/EMCAL.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/DCAL.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/PHOS.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/L3.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/MCH.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/ABSO.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/SHIL.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/DIPO.glb`,
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

/** Materials + merge + target opacity for one static detector part graph. */
function finalizePartMeshes(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>
): THREE.Object3D {
  applyDetectorLayerMaterials(root, opacity, layerIndex);
  const merged = mergeStaticMeshesByMaterial(root);
  merged.userData = { ...userData };
  setDetectorPartOpacity(merged, opacity);
  return merged;
}

/**
 * Builds a distance LOD for L3: full InstancedMesh yoke up close, every-Nth
 * sector far away (default PP orbit distance uses the simplified level).
 * No `mergeStaticMeshesByMaterial` — instancing keeps draw calls low without
 * baking all sectors into one unsorted transparent mesh.
 */
function buildOuterMagnetLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>
): THREE.LOD {
  applyDetectorLayerMaterials(root, opacity, layerIndex);

  const high = buildOuterMagnetInstanced(root, 1);
  high.userData = { ...userData, lodLevel: 'high' };
  const low = buildOuterMagnetInstanced(root, OUTER_MAGNET_SECTOR_KEEP_EVERY);
  low.userData = { ...userData, lodLevel: 'low' };

  const lod = new THREE.LOD();
  lod.name = 'l3-magnet-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  lod.addLevel(low, OUTER_MAGNET_LOD_FAR_DISTANCE);
  setDetectorPartOpacity(lod, opacity);
  return lod;
}

/**
 * Builds a distance LOD for TPC: full merged barrel up close; far level drops
 * every other Mesh_15/17 fine piece and Melax-decimates Mesh_22/26 panels
 * (~half vertices) while keeping all 20 sector instances (no ring gaps).
 */
function buildTpcLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>
): THREE.LOD {
  const lowSrc = cloneDetectorSubtree(root);
  simplifyTpcForLowLod(lowSrc);

  const high = finalizePartMeshes(root, opacity, layerIndex, { ...userData, lodLevel: 'high' });
  const low = finalizePartMeshes(lowSrc, opacity, layerIndex, { ...userData, lodLevel: 'low' });

  const lod = new THREE.LOD();
  lod.name = 'tpc-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  lod.addLevel(low, TPC_LOD_FAR_DISTANCE);
  return lod;
}

/**
 * Builds a distance LOD for ITS: full merged shell up close; far level Melax-
 * decimates Mesh_0 (~half vertices) while keeping smaller detail meshes intact.
 */
function buildItsLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>
): THREE.LOD {
  const lowSrc = cloneDetectorSubtree(root);
  simplifyItsForLowLod(lowSrc);

  const high = finalizePartMeshes(root, opacity, layerIndex, { ...userData, lodLevel: 'high' });
  const low = finalizePartMeshes(lowSrc, opacity, layerIndex, { ...userData, lodLevel: 'low' });

  const lod = new THREE.LOD();
  lod.name = 'its-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  lod.addLevel(low, ITS_LOD_FAR_DISTANCE);
  return lod;
}

/**
 * Builds a distance LOD for MCH: full merged chamber up close; far level Melax-
 * decimates Mesh_0 (~half vertices).
 */
function buildMchLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>
): THREE.LOD {
  const lowSrc = cloneDetectorSubtree(root);
  simplifyMchForLowLod(lowSrc);

  const high = finalizePartMeshes(root, opacity, layerIndex, { ...userData, lodLevel: 'high' });
  const low = finalizePartMeshes(lowSrc, opacity, layerIndex, { ...userData, lodLevel: 'low' });

  const lod = new THREE.LOD();
  lod.name = 'mch-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  lod.addLevel(low, MUON_AUX_LOD_FAR_DISTANCE);
  return lod;
}

/**
 * Builds a distance LOD for the dipole magnet (DIPO): full yoke up close,
 * decimated far level (same strategy as MCH).
 */
function buildDipoLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>
): THREE.LOD {
  const lowSrc = cloneDetectorSubtree(root);
  simplifyDipoForLowLod(lowSrc);

  const high = finalizePartMeshes(root, opacity, layerIndex, { ...userData, lodLevel: 'high' });
  const low = finalizePartMeshes(lowSrc, opacity, layerIndex, { ...userData, lodLevel: 'low' });

  const lod = new THREE.LOD();
  lod.name = 'dipo-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  lod.addLevel(low, MUON_AUX_LOD_FAR_DISTANCE);
  return lod;
}

/**
 * Builds a distance LOD for lightweight muon aux layers (ABSO / SHIL): full mesh
 * up close, lightly decimated far level.
 */
function buildAuxiliaryMuonLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>
): THREE.LOD {
  const lowSrc = cloneDetectorSubtree(root);
  simplifyAuxiliaryForLowLod(lowSrc);

  const high = finalizePartMeshes(root, opacity, layerIndex, { ...userData, lodLevel: 'high' });
  const low = finalizePartMeshes(lowSrc, opacity, layerIndex, { ...userData, lodLevel: 'low' });

  const lod = new THREE.LOD();
  lod.name = 'muon-aux-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  lod.addLevel(low, MUON_AUX_LOD_FAR_DISTANCE);
  return lod;
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
        // Drop Blender/CAD helper boxes before material merge / instancing —
        // otherwise they get baked into draw calls (visible=false is not enough).
        stripCadHelperCubes(root);
        const radialInflate = 1 + layerIndex * LAYER_RADIAL_INFLATE_STEP;
        root.scale.setScalar(scale * radialInflate);
        root.updateMatrixWorld(true);
        const userData = {
          ...(root.userData || {}),
          detectorAssetPath: path,
          detectorLayerIndex: layerIndex,
        };
        root.userData = userData;

        const opacity = defaultLayerOpacity(path, layerIndex, totalLayers);
        if (isOuterMagnet(path)) {
          resolve(buildOuterMagnetLod(root, opacity, layerIndex, userData));
          return;
        }
        if (isTpc(path)) {
          resolve(buildTpcLod(root, opacity, layerIndex, userData));
          return;
        }
        if (isIts(path)) {
          resolve(buildItsLod(root, opacity, layerIndex, userData));
          return;
        }
        if (isMch(path)) {
          resolve(buildMchLod(root, opacity, layerIndex, userData));
          return;
        }
        if (isDipo(path)) {
          resolve(buildDipoLod(root, opacity, layerIndex, userData));
          return;
        }
        if (isAuxiliaryMuonPart(path)) {
          resolve(buildAuxiliaryMuonLod(root, opacity, layerIndex, userData));
          return;
        }
        resolve(finalizePartMeshes(root, opacity, layerIndex, userData));
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
  // Detector geometry is static after load — skip per-frame matrix walks.
  freezeStaticTransforms(group);
  return { group, parts };
}

/** Disables `matrixAutoUpdate` once world matrices are final. */
function freezeStaticTransforms(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    obj.matrixAutoUpdate = false;
  });
}
