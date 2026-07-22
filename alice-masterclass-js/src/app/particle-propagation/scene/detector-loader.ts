/**
 * Loads the ALICE detector shell (ITS/TPC/TRD/TOF/calorimeters/L3 magnet plus
 * forward muon-system layers MCH/ABSO/DIPO and the beam pipe BP) for the
 * Particle Propagation module.
 *
 * Reproduces the interactive Visual Analysis / EventDisplay look and
 * performance profile — per-layer materials (opaque with polygon offset, see
 * `detector-appearance.ts`), a `path -> root` map so each layer can be
 * toggled/faded from the GUI, and a whole-model recenter onto the beam axis so
 * tracks starting at the world origin appear in the middle of the detector.
 *
 * First paint is accelerated in two ways:
 * 1. **Inside→out reveal** — GLBs prefetch in parallel, then shells fade in
 *    from the beam pipe outward (BP → ITS → … → L3 → muon arm).
 * 2. **Deferred low-LOD** — high detail attaches immediately; far levels
 *    (Melax-from-merged / InstancedMesh thinning) attach after the first painted
 *    frame (`scheduleDeferredLowLods`).
 *
 * L3 is special-cased: sector families become {@link THREE.InstancedMesh} (no
 * material merge — that creates one giant transparent blob and hurts fill-rate)
 * wrapped in a distance {@link THREE.LOD}. TPC / MCH use InstancedMesh families
 * for repeated panels. BP uses a distance LOD (gltfpack ~20k high + Melax far).
 * ITS / ABSO / DIPO stay on the full merged mesh (ITS is mild-gltfpacked ~50k
 * tris of thin concentric shells; ABSO ~6k; DIPO ~750 — Melax far-LOD shreds
 * those silhouettes at the default orbit distance). TRD / TOF / calorimeters
 * still merge by material.
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
  BEAM_PIPE_LOD_FAR_DISTANCE,
  BEAM_PIPE_LOW_VERTEX_KEEP,
  buildLowLodFromMergedHigh,
  buildMchInstanced,
  buildOuterMagnetInstanced,
  buildTpcInstanced,
  defaultLayerOpacity,
  DETECTOR_REVEAL_DURATION_MS,
  DETECTOR_REVEAL_STAGGER_FRACTION,
  detectorPartLabel,
  fadeInDetectorPart,
  isBeamPipe,
  isDipo,
  isMch,
  isOuterMagnet,
  isTpc,
  MCH_VERTEX_KEEP,
  MUON_AUX_LOD_FAR_DISTANCE,
  MUON_DECIMATE_MIN_VERTICES,
  OUTER_MAGNET_LOD_FAR_DISTANCE,
  OUTER_MAGNET_LOD_NAME,
  setDetectorPartOpacity,
  TPC_FINE_DETAIL_KEEP_EVERY,
  TPC_HEAVY_PANEL_VERTEX_KEEP,
  TPC_LOD_FAR_DISTANCE,
} from './detector-appearance';

/**
 * ALICE detector shell for Particle Propagation (inner → outer).
 * Beam pipe first, then barrel layers, L3 yoke, then forward muon arm
 * (absorber → dipole → chambers).
 */
export const DETECTOR_PART_PATHS: readonly string[] = [
  `${DETECTOR_MODEL_BASE_PATH}/BP.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/its.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/tpc.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/TRD.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/TOF.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/EMCAL.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/DCAL.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/PHOS.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/L3_pp.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/ABSO.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/DIPO.glb`,
  `${DETECTOR_MODEL_BASE_PATH}/MCH.glb`,
];

/**
 * Inner barrel used for the first usable frame (and optional
 * {@link DetectorProgressiveOptions.waitBeforeSecondary} gate).
 */
export function isDetectorInnerPart(assetPath: string): boolean {
  return /(^|[/\\])(bp|its|tpc)\.glb($|\?)/i.test(assetPath);
}

/** @deprecated Prefer {@link isDetectorInnerPart}; kept for older call sites/tests. */
export function isDetectorCorePart(assetPath: string): boolean {
  return /(^|[/\\])(its|tpc|l3_pp)\.glb($|\?)/i.test(assetPath);
}

/** Per-slider clamp for the layer radial inflate (reduces z-fighting between shells). */
const LAYER_RADIAL_INFLATE_STEP = 0.0015;

/**
 * Barrel ITS/TPC GLBs are authored with the beam pipe ~+30 cm in Y, while
 * MCH / DIPO sit on the true ALICE axis at Y = 0. After
 * {@link recenterOnBeamAxis} pins the collision vertex to the ITS tube, those
 * parts sit ~30 cm too low unless lifted by this amount. ABSO is excluded —
 * its authored placement already matches the ITS frame after recenter.
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
  /**
   * When set, outer shells (TRD…MCH) wait until this resolves after the inner
   * barrel (BP/ITS/TPC) has been revealed — e.g. after the welcome dialog.
   */
  waitBeforeSecondary?: () => Promise<void>;
  /** Fade each shell in from opacity 0 (default true). */
  animateReveal?: boolean;
  /** Per-shell fade duration; default {@link DETECTOR_REVEAL_DURATION_MS}. */
  revealDurationMs?: number;
  /** Host should re-render the WebGL canvas (called during fades). */
  onRevealFrame?: () => void;
  /** Fired after each part is attached (before/while its fade runs). */
  onPart?: (model: DetectorModel, part: DetectorPart) => void;
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
 * Builds a distance LOD for L3: full InstancedMesh yoke at both levels.
 *
 * Both levels used to keep every Nth sector (`OUTER_MAGNET_SECTOR_KEEP_EVERY`
 * in `detector-appearance.ts`) at the far level to save triangles, but that
 * leaves real gaps
 * between kept sectors. Those gaps blend into the near-black
 * `DARK_BACKGROUND` and are easy to miss, but against the pale
 * `LIGHT_BACKGROUND` (light mode) they read as glaring white patches "inside"
 * the yoke — mistaken for a different element covering L3. Keeping the full
 * ring at both levels costs more triangles at the default (far) orbit
 * distance but removes that background-dependent artifact.
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
  const low = buildOuterMagnetInstanced(root, 1);
  low.userData = { ...userData, lodLevel: 'low' };

  const lod = new THREE.LOD();
  lod.name = OUTER_MAGNET_LOD_NAME;
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  lod.addLevel(low, OUTER_MAGNET_LOD_FAR_DISTANCE);
  setDetectorPartOpacity(lod, opacity);
  return lod;
}

/** TPC: InstancedMesh repeated panels + merged remainder; low thins / Melax-es. */
function buildTpcLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>,
  deferLowLod: boolean,
  darkMode: boolean
): THREE.LOD {
  applyDetectorLayerMaterials(root, opacity, layerIndex);

  const high = buildTpcInstanced(root, { fineKeepEvery: 1, heavyVertexKeep: 1 });
  high.userData = { ...userData, lodLevel: 'high' };

  const lod = new THREE.LOD();
  lod.name = 'tpc-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  setDetectorPartOpacity(high, opacity);

  const buildLow = (): THREE.Object3D => {
    const low = buildTpcInstanced(root, {
      fineKeepEvery: TPC_FINE_DETAIL_KEEP_EVERY,
      heavyVertexKeep: TPC_HEAVY_PANEL_VERTEX_KEEP,
    });
    low.userData = { ...userData, lodLevel: 'low' };
    setDetectorPartOpacity(low, opacity);
    return low;
  };

  if (!deferLowLod) {
    lod.addLevel(buildLow(), TPC_LOD_FAR_DISTANCE);
  } else {
    lod.userData[PENDING_LOW_LOD_KEY] = {
      farDistance: TPC_LOD_FAR_DISTANCE,
      darkMode,
      build: buildLow,
    } satisfies PendingLowLod;
  }

  setDetectorPartOpacity(lod, opacity);
  return lod;
}

/** MCH: InstancedMesh for repeated Mesh_* families; low Melax from the high level. */
function buildMchLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>,
  deferLowLod: boolean,
  darkMode: boolean
): THREE.LOD {
  applyDetectorLayerMaterials(root, opacity, layerIndex);

  const high = buildMchInstanced(root, { vertexKeep: 1 });
  high.userData = { ...userData, lodLevel: 'high' };

  const lod = new THREE.LOD();
  lod.name = 'mch-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  setDetectorPartOpacity(high, opacity);

  const buildLow = (): THREE.Object3D => {
    const low = buildLowLodFromMergedHigh(high, MCH_VERTEX_KEEP, MUON_DECIMATE_MIN_VERTICES);
    setDetectorPartOpacity(low, opacity);
    return low;
  };

  if (!deferLowLod) {
    lod.addLevel(buildLow(), MUON_AUX_LOD_FAR_DISTANCE);
  } else {
    lod.userData[PENDING_LOW_LOD_KEY] = {
      farDistance: MUON_AUX_LOD_FAR_DISTANCE,
      darkMode,
      build: buildLow,
    } satisfies PendingLowLod;
  }

  setDetectorPartOpacity(lod, opacity);
  return lod;
}

/**
 * Beam pipe: merged gltfpack ~20k high level + deferred Melax far level.
 * The authored cut length is preserved in the asset; we only drop tessellation.
 */
function buildBpLod(
  root: THREE.Object3D,
  opacity: number,
  layerIndex: number,
  userData: Record<string, unknown>,
  deferLowLod: boolean,
  darkMode: boolean
): THREE.LOD {
  applyDetectorLayerMaterials(root, opacity, layerIndex);
  const high = mergeStaticMeshesByMaterial(root);
  high.userData = { ...userData, lodLevel: 'high' };

  const lod = new THREE.LOD();
  lod.name = 'bp-lod';
  lod.userData = { ...userData };
  lod.addLevel(high, 0);
  setDetectorPartOpacity(high, opacity);

  const buildLow = (): THREE.Object3D => {
    const low = buildLowLodFromMergedHigh(high, BEAM_PIPE_LOW_VERTEX_KEEP, 64);
    setDetectorPartOpacity(low, opacity);
    return low;
  };

  if (!deferLowLod) {
    lod.addLevel(buildLow(), BEAM_PIPE_LOD_FAR_DISTANCE);
  } else {
    lod.userData[PENDING_LOW_LOD_KEY] = {
      farDistance: BEAM_PIPE_LOD_FAR_DISTANCE,
      darkMode,
      build: buildLow,
    } satisfies PendingLowLod;
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
        // Lift MCH/DIPO into the ITS/TPC beam frame (see MUON_ARM_BEAM_Y_LIFT_CM).
        // ABSO is already authored to sit correctly after ITS recenter — do not lift it.
        // Applied after scale so the translation is in world units; merge/LOD then
        // bakes matrixWorld into the static geometry.
        if (isMch(path) || isDipo(path)) {
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
          resolve(buildTpcLod(root, opacity, layerIndex, userData, deferLowLod, darkMode));
          return;
        }
        if (isMch(path)) {
          resolve(buildMchLod(root, opacity, layerIndex, userData, deferLowLod, darkMode));
          return;
        }
        if (isBeamPipe(path)) {
          resolve(buildBpLod(root, opacity, layerIndex, userData, deferLowLod, darkMode));
          return;
        }
        // ITS / ABSO / DIPO: no Melax LOD. ITS is mild-gltfpacked thin-shell CAD
        // (~50k tris); ABSO ~6k; DIPO ~750 box/tube. Melax at the default orbit
        // distance shreds those silhouettes — MCH / BP keep their own LODs.
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
 *
 * Intentionally ignores BP: the cut beam-pipe mesh is not centered on the
 * interaction point, so using it (e.g. when it loads first in the inside→out
 * reveal) would shift the whole detector along Z relative to tracks / field lines.
 */
function beamAxisReference(parts: DetectorPart[]): THREE.Object3D | null {
  const prefer = [/\/its\.glb$/i, /\/tpc\.glb$/i, /\/l3\.glb$/i];
  for (const re of prefer) {
    const hit = parts.find((p) => re.test(p.assetPath));
    if (hit) return hit.root;
  }
  return null;
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
  darkMode: boolean,
  startOpacity = -1
): DetectorPart[] {
  const added: DetectorPart[] = [];
  roots.forEach((root, i) => {
    if (!root) return;
    const assetPath = paths[i];
    applyDetectorDarkMode(root, darkMode);
    if (startOpacity >= 0) {
      setDetectorPartOpacity(root, startOpacity);
    }
    group.add(root);
    const part = { assetPath, label: detectorPartLabel(assetPath), root };
    parts.push(part);
    added.push(part);
  });
  return added;
}

function readTargetOpacity(root: THREE.Object3D): number {
  let found: number | null = null;
  root.traverse((obj) => {
    if (found !== null || !(obj as THREE.Mesh).isMesh) return;
    const raw = (obj as THREE.Mesh).material;
    const mat = Array.isArray(raw) ? raw[0] : raw;
    const base = (mat as THREE.Material | undefined)?.userData?.['baseOpacity'];
    if (typeof base === 'number' && Number.isFinite(base)) found = base;
  });
  return found ?? 0.75;
}

function delayMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(), ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        resolve();
      },
      { once: true }
    );
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
 * Progressive detector load: GLBs prefetch in parallel within each wave, then
 * shells attach and fade in **inside → out** (path order). Emits `core` after
 * the inner barrel (BP/ITS/TPC), then `complete` when the full assembly is in.
 */
export async function loadDetectorModelProgressive(
  paths: readonly string[] = DETECTOR_PART_PATHS,
  options: DetectorProgressiveOptions
): Promise<DetectorModel> {
  const scale = options.scale ?? 1;
  const darkMode = options.darkMode ?? true;
  const deferLowLod = options.deferLowLod ?? true;
  const signal = options.signal;
  const animateReveal = options.animateReveal !== false;
  const revealDurationMs = options.revealDurationMs ?? DETECTOR_REVEAL_DURATION_MS;
  const staggerMs = animateReveal
    ? Math.round(revealDurationMs * DETECTOR_REVEAL_STAGGER_FRACTION)
    : 0;

  const innerPaths = paths.filter(isDetectorInnerPart);
  const outerPaths = paths.filter((p) => !isDetectorInnerPart(p));
  const totalLayers = paths.length;
  const indexInFull = (path: string): number => {
    const i = paths.indexOf(path);
    return i >= 0 ? i : 0;
  };

  const loader = new GLTFLoader();
  const group = new THREE.Group();
  group.name = 'particle-propagation-detector';
  const parts: DetectorPart[] = [];
  let recentered = false;
  let coreEmitted = false;
  const fadeJobs: Promise<void>[] = [];

  const snapshot = (): DetectorModel => ({ group, parts: parts.slice() });

  const maybeRecenter = (): void => {
    if (recentered) return;
    if (!beamAxisReference(parts)) return;
    recenterOnBeamAxis(group, parts);
    freezeStaticTransforms(group);
    recentered = true;
  };

  const revealWave = async (wavePaths: readonly string[]): Promise<void> => {
    if (signal?.aborted || wavePaths.length === 0) return;

    // Prefetch the whole wave in parallel; reveal stays strictly ordered.
    const loadPromises = wavePaths.map((path) =>
      loadOnePart(loader, path, scale, indexInFull(path), totalLayers, deferLowLod, darkMode)
    );

    for (let i = 0; i < wavePaths.length; i++) {
      if (signal?.aborted) return;
      const root = await loadPromises[i];
      if (!root) continue;

      const added = appendLoadedParts(group, parts, [wavePaths[i]], [root], darkMode);
      const part = added[0];
      if (!part) continue;

      maybeRecenter();
      if (!recentered) freezeStaticTransforms(part.root);

      options.onPart?.(snapshot(), part);

      if (animateReveal) {
        const target = readTargetOpacity(part.root);
        const fade = fadeInDetectorPart(part.root, target, {
          durationMs: revealDurationMs,
          signal,
          onFrame: options.onRevealFrame,
        });
        fadeJobs.push(fade);
        if (staggerMs > 0 && i < wavePaths.length - 1) {
          await delayMs(staggerMs, signal);
        }
      } else {
        options.onRevealFrame?.();
      }

      if (!coreEmitted && innerPaths.every((p) => parts.some((part) => part.assetPath === p))) {
        coreEmitted = true;
        options.onWave(snapshot(), 'core');
      }
    }
  };

  await revealWave(innerPaths);
  if (signal?.aborted) {
    await Promise.all(fadeJobs);
    return { group, parts };
  }

  if (!coreEmitted && parts.length > 0) {
    coreEmitted = true;
    options.onWave(snapshot(), 'core');
  }

  if (options.waitBeforeSecondary) {
    await options.waitBeforeSecondary();
    if (signal?.aborted) {
      await Promise.all(fadeJobs);
      return { group, parts };
    }
  }

  await revealWave(outerPaths);
  await Promise.all(fadeJobs);
  if (signal?.aborted) return { group, parts };

  freezeStaticTransforms(group);
  options.onWave(snapshot(), 'complete');
  return { group, parts };
}
