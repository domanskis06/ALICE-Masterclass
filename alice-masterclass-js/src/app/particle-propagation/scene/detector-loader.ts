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
 * First paint is accelerated in two ways:
 * 1. **Progressive waves** — ITS/TPC/L3 show first; calorimeters + muon-arm follow.
 * 2. **Deferred Melax low-LOD** — high detail merges immediately; SimplifyModifier
 *    low levels attach after the first painted frame (`scheduleDeferredLowLods`).
 *
 * L3 is special-cased: sector families become {@link THREE.InstancedMesh} (no
 * material merge — that creates one giant transparent blob and hurts fill-rate)
 * wrapped in a distance {@link THREE.LOD}. TPC/ITS/muon Melax LODs follow the
 * deferred path when requested. Other parts still merge by material.
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

/** First-paint core: beam axis + outer magnet yoke. */
export function isDetectorCorePart(assetPath: string): boolean {
  return /(^|[/\\])(its|tpc|l3)\.glb($|\?)/i.test(assetPath);
}

/** Per-slider clamp for the layer radial inflate (reduces z-fighting between shells). */
const LAYER_RADIAL_INFLATE_STEP = 0.0009;

/**
 * Barrel ITS/TPC GLBs are authored with the beam pipe ~+30 cm in Y, while
 * MCH / SHIL / DIPO sit on the true ALICE axis at Y = 0. After
 * {@link recenterOnBeamAxis} pins the collision vertex to the ITS tube, those
 * three parts sit ~30 cm too low unless lifted by this amount. ABSO is excluded
 * — its authored placement already matches the ITS frame after recenter.
 * Applied as `position.y += MUON_ARM_BEAM_Y_LIFT_CM * scale` after the part
 * scale so the translation is in world units and gets baked by merge/LOD.
 */
export const MUON_ARM_BEAM_Y_LIFT_CM = 30;

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

export type DetectorLoadWave = 'core' | 'complete';

export interface DetectorProgressiveOptions {
  scale?: number;
  darkMode?: boolean;
  /** Skip Melax low-LOD at load; call {@link scheduleDeferredLowLods} after paint. */
  deferLowLod?: boolean;
  signal?: AbortSignal;
  onWave: (model: DetectorModel, wave: DetectorLoadWave) => void;
}

interface PendingLowLod {
  farDistance: number;
  darkMode: boolean;
  build: () => THREE.Object3D;
}

const PENDING_LOW_LOD_KEY = 'pendingLowLod';

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
 * sector far away. Sector thinning is cheap (no Melax) — both levels stay sync.
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

function buildMelaxLod(options: {
  name: string;
  root: THREE.Object3D;
  opacity: number;
  layerIndex: number;
  userData: Record<string, unknown>;
  farDistance: number;
  deferLowLod: boolean;
  darkMode: boolean;
  simplify: (src: THREE.Object3D) => void;
}): THREE.LOD {
  const { name, root, opacity, layerIndex, userData, farDistance, deferLowLod, darkMode, simplify } =
    options;

  const lowSrc = cloneDetectorSubtree(root);
  const high = finalizePartMeshes(root, opacity, layerIndex, { ...userData, lodLevel: 'high' });

  const lod = new THREE.LOD();
  lod.name = name;
  lod.userData = { ...userData };
  lod.addLevel(high, 0);

  if (!deferLowLod) {
    simplify(lowSrc);
    const low = finalizePartMeshes(lowSrc, opacity, layerIndex, { ...userData, lodLevel: 'low' });
    lod.addLevel(low, farDistance);
  } else {
    const pending: PendingLowLod = {
      farDistance,
      darkMode,
      build: () => {
        simplify(lowSrc);
        return finalizePartMeshes(lowSrc, opacity, layerIndex, { ...userData, lodLevel: 'low' });
      },
    };
    lod.userData[PENDING_LOW_LOD_KEY] = pending;
  }

  setDetectorPartOpacity(lod, opacity);
  return lod;
}

function loadOnePart(
  loader: GLTFLoader,
  path: string,
  scale: number,
  layerIndex: number,
  totalLayers: number,
  deferLowLod: boolean,
  darkMode: boolean
): Promise<THREE.Object3D | null> {
  return new Promise((resolve) => {
    loader.load(
      path,
      (gltf: GLTF) => {
        const root = gltf.scene;
        const radialInflate = 1 + layerIndex * LAYER_RADIAL_INFLATE_STEP;
        root.scale.setScalar(scale * radialInflate);
        // Lift MCH/SHIL/DIPO into the ITS/TPC beam frame (see MUON_ARM_BEAM_Y_LIFT_CM).
        // ABSO is already authored to sit correctly after ITS recenter — do not lift it.
        // Applied after scale so the translation is in world units; merge/LOD then
        // bakes matrixWorld into the static geometry.
        if (isMch(path) || isDipo(path) || /(^|[/\\])shil\.glb($|\?)/i.test(path)) {
          root.position.y += MUON_ARM_BEAM_Y_LIFT_CM * scale;
        }
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
          resolve(
            buildMelaxLod({
              name: 'tpc-lod',
              root,
              opacity,
              layerIndex,
              userData,
              farDistance: TPC_LOD_FAR_DISTANCE,
              deferLowLod,
              darkMode,
              simplify: simplifyTpcForLowLod,
            })
          );
          return;
        }
        if (isIts(path)) {
          resolve(
            buildMelaxLod({
              name: 'its-lod',
              root,
              opacity,
              layerIndex,
              userData,
              farDistance: ITS_LOD_FAR_DISTANCE,
              deferLowLod,
              darkMode,
              simplify: simplifyItsForLowLod,
            })
          );
          return;
        }
        if (isMch(path)) {
          resolve(
            buildMelaxLod({
              name: 'mch-lod',
              root,
              opacity,
              layerIndex,
              userData,
              farDistance: MUON_AUX_LOD_FAR_DISTANCE,
              deferLowLod,
              darkMode,
              simplify: simplifyMchForLowLod,
            })
          );
          return;
        }
        if (isDipo(path)) {
          resolve(
            buildMelaxLod({
              name: 'dipo-lod',
              root,
              opacity,
              layerIndex,
              userData,
              farDistance: MUON_AUX_LOD_FAR_DISTANCE,
              deferLowLod,
              darkMode,
              simplify: simplifyDipoForLowLod,
            })
          );
          return;
        }
        if (isAuxiliaryMuonPart(path)) {
          resolve(
            buildMelaxLod({
              name: 'muon-aux-lod',
              root,
              opacity,
              layerIndex,
              userData,
              farDistance: MUON_AUX_LOD_FAR_DISTANCE,
              deferLowLod,
              darkMode,
              simplify: simplifyAuxiliaryForLowLod,
            })
          );
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

/** Disables `matrixAutoUpdate` once world matrices are final. */
function freezeStaticTransforms(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    obj.matrixAutoUpdate = false;
  });
}

function appendLoadedParts(
  group: THREE.Group,
  parts: DetectorPart[],
  paths: readonly string[],
  roots: Array<THREE.Object3D | null>,
  darkMode: boolean
): void {
  roots.forEach((root, i) => {
    if (!root) return;
    const assetPath = paths[i];
    applyDetectorDarkMode(root, darkMode);
    group.add(root);
    parts.push({ assetPath, label: detectorPartLabel(assetPath), root });
  });
}

/**
 * Attaches any Melax low-LOD levels stashed by {@link loadOnePart} when
 * `deferLowLod` was true. Safe to call repeatedly (no-ops when nothing pending).
 * @returns number of low levels attached.
 */
export function attachDeferredLowLods(root: THREE.Object3D): number {
  let attached = 0;
  const jobs: Array<{ lod: THREE.LOD; pending: PendingLowLod }> = [];
  root.traverse((obj) => {
    const lod = obj as THREE.LOD;
    if (!(lod as THREE.LOD).isLOD) return;
    const pending = lod.userData[PENDING_LOW_LOD_KEY] as PendingLowLod | undefined;
    if (!pending) return;
    jobs.push({ lod, pending });
  });

  for (const { lod, pending } of jobs) {
    const low = pending.build();
    applyDetectorDarkMode(low, pending.darkMode);
    lod.addLevel(low, pending.farDistance);
    delete lod.userData[PENDING_LOW_LOD_KEY];
    freezeStaticTransforms(low);
    attached += 1;
  }
  return attached;
}

/**
 * Runs {@link attachDeferredLowLods} after the browser has painted at least one
 * frame (double rAF), preferring `requestIdleCallback` when available.
 * @returns cancel function (best-effort; in-flight Melax may still finish).
 */
export function scheduleDeferredLowLods(
  root: THREE.Object3D,
  onDone?: (attached: number) => void
): () => void {
  let cancelled = false;
  let raf1 = 0;
  let raf2 = 0;
  let idleId: number | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const finish = (): void => {
    if (cancelled) return;
    const attached = attachDeferredLowLods(root);
    onDone?.(attached);
  };

  raf1 = requestAnimationFrame(() => {
    raf2 = requestAnimationFrame(() => {
      const ric = (
        window as Window & {
          requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
        }
      ).requestIdleCallback;
      if (typeof ric === 'function') {
        idleId = ric(finish, { timeout: 2000 });
      } else {
        timeoutId = setTimeout(finish, 0);
      }
    });
  });

  return () => {
    cancelled = true;
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
    if (idleId != null) {
      const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
      cic?.(idleId);
    }
    if (timeoutId != null) clearTimeout(timeoutId);
  };
}

/**
 * Loads every detector part in parallel and returns the recentered group plus a
 * per-part list (failures are logged and skipped, never rejected, so one
 * missing asset doesn't block the whole scene).
 *
 * @param deferLowLod When true, Melax low-LOD levels are omitted until
 *   {@link attachDeferredLowLods} / {@link scheduleDeferredLowLods}.
 */
export async function loadDetectorModel(
  paths: readonly string[] = DETECTOR_PART_PATHS,
  scale = 1,
  darkMode = true,
  deferLowLod = false
): Promise<DetectorModel> {
  const loader = new GLTFLoader();
  const roots = await Promise.all(
    paths.map((path, i) => loadOnePart(loader, path, scale, i, paths.length, deferLowLod, darkMode))
  );

  const group = new THREE.Group();
  group.name = 'particle-propagation-detector';
  const parts: DetectorPart[] = [];
  appendLoadedParts(group, parts, paths, roots, darkMode);

  recenterOnBeamAxis(group, parts);
  freezeStaticTransforms(group);
  return { group, parts };
}

/**
 * Progressive detector load: emits a core wave (ITS/TPC/L3) as soon as those
 * GLBs are ready, then a complete wave once calorimeters + muon-arm join the
 * same recentered group. Melax low-LOD is deferred by default.
 */
export async function loadDetectorModelProgressive(
  paths: readonly string[] = DETECTOR_PART_PATHS,
  options: DetectorProgressiveOptions
): Promise<DetectorModel> {
  const scale = options.scale ?? 1;
  const darkMode = options.darkMode ?? true;
  const deferLowLod = options.deferLowLod ?? true;
  const signal = options.signal;

  const corePaths = paths.filter(isDetectorCorePart);
  const secondaryPaths = paths.filter((p) => !isDetectorCorePart(p));
  const totalLayers = paths.length;
  const indexInFull = (path: string): number => {
    const i = paths.indexOf(path);
    return i >= 0 ? i : 0;
  };

  const loader = new GLTFLoader();
  const group = new THREE.Group();
  group.name = 'particle-propagation-detector';
  const parts: DetectorPart[] = [];

  const loadWave = async (wavePaths: readonly string[]): Promise<void> => {
    if (signal?.aborted || wavePaths.length === 0) return;
    const roots = await Promise.all(
      wavePaths.map((path) =>
        loadOnePart(loader, path, scale, indexInFull(path), totalLayers, deferLowLod, darkMode)
      )
    );
    if (signal?.aborted) return;
    appendLoadedParts(group, parts, wavePaths, roots, darkMode);
  };

  await loadWave(corePaths);
  if (signal?.aborted) return { group, parts };

  recenterOnBeamAxis(group, parts);
  freezeStaticTransforms(group);
  options.onWave({ group, parts: parts.slice() }, 'core');

  await loadWave(secondaryPaths);
  if (signal?.aborted) return { group, parts };

  // Group position already pins the ITS beam axis — do not re-recenter (would
  // jump the core). Just freeze any newly attached secondary graphs.
  freezeStaticTransforms(group);
  options.onWave({ group, parts: parts.slice() }, 'complete');
  return { group, parts };
}
