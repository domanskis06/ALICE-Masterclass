/**
 * Appearance helpers for the Particle Propagation detector shell.
 *
 * These are plain, dependency-free functions (no Angular, no EventDisplay) that
 * reproduce the *look and performance profile* of
 * `EventDisplayComponent.setDetectorMaterialsWithPolygonOffset` /
 * `setDetectorPartOpacity` / `applyDarkModeToObject` without importing that
 * god node (per `.cursor/rules/architecture.mdc`). Keeping the GLB's own
 * per-layer colours (red L3, yellow/teal barrels, ...) is deliberate.
 *
 * Performance note: unlike the previous PP loader (every layer `transparent`,
 * `opacity 0.35`, `depthWrite = false`), these materials keep `depthWrite =
 * true` and rely on per-mesh `polygonOffset` + `renderOrder`. Depth writes let
 * the GPU reject fragments hidden behind nearer shells instead of blending all
 * of them. The L3 magnet is built as {@link THREE.InstancedMesh} families (no
 * material merge) inside a distance {@link THREE.LOD}, with a default opacity of
 * {@link OUTER_MAGNET_DEFAULT_OPACITY}. TPC uses a distance LOD whose far level
 * thins fine detail and decimates the heavy sector panels (see
 * {@link simplifyTpcForLowLod}). MCH uses a distance LOD with Melax on the
 * heavier Mesh_* panels. ITS / ABSO / DIPO stay at full merged detail — Melax
 * shreds thin-shell / boxy CAD silhouettes at the default orbit distance. The
 * beam pipe (BP) is a gltfpack-simplified cut tube (~20k tris) with a Melax far
 * LOD; it keeps a higher render order and slightly stronger dark-mode emissive
 * so the thin grey tube stays readable inside the barrel.
 */

import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier';
import { mergeStaticMeshesByMaterial } from '../../shared/three/merge-static-meshes';

/** Default opacity for every detector shell (sidebar starting value). */
export const DETECTOR_DEFAULT_OPACITY = 0.75;
/** Kept for the inner→outer lerp API; both ends share {@link DETECTOR_DEFAULT_OPACITY}. */
export const DETECTOR_INNER_OPACITY = DETECTOR_DEFAULT_OPACITY;
export const DETECTOR_OUTER_OPACITY = DETECTOR_DEFAULT_OPACITY;
/** Calorimeter layers never go below this (they'd otherwise vanish). */
export const CALORIMETER_MIN_OPACITY = 0.45;
/** UI slider clamp. Upper bound is 1 so the L3 yoke can stay fully opaque. */
export const MIN_PART_OPACITY = 0.05;
export const MAX_PART_OPACITY = 1;

/** Default L3 magnet opacity — same as the rest of the detector stack. */
export const OUTER_MAGNET_DEFAULT_OPACITY = DETECTOR_DEFAULT_OPACITY;

/** Default beam-pipe opacity (matches the sidebar starting value). */
export const BEAM_PIPE_DEFAULT_OPACITY = 0.3;

/**
 * Camera distance (world units) at which BP switches from the authored ~20k-tri
 * mesh to the Melax far level. Matches L3/TPC/MCH so the default orbit uses low.
 */
export const BEAM_PIPE_LOD_FAR_DISTANCE = 7;

/**
 * Fraction of vertices to keep when building the BP far LOD from the merged
 * high level (~20k → ~8k). Cheap at deferred attach time.
 */
export const BEAM_PIPE_LOW_VERTEX_KEEP = 0.4;

/** Paint the pipe after every other detector shell. */
const BEAM_PIPE_RENDER_ORDER = 500_000;

/**
 * Keep 1 of every N azimuthal yoke sectors (Mesh_1/2/3 families in L3.glb) in
 * the low-detail LOD level. The authored GLB repeats the same ~128-tri panel
 * ~168× around the ring.
 */
export const OUTER_MAGNET_SECTOR_KEEP_EVERY = 2;

/**
 * Camera distance (world units) at which L3 switches from full to thinned LOD.
 * Default orbit (~12 wu) uses the simplified level; zooming into the bore uses full.
 */
export const OUTER_MAGNET_LOD_FAR_DISTANCE = 7;

/**
 * Hide L3 when the orbit distance drops to this (world units). ~10% closer
 * than the previous 8 wu threshold so the yoke stays visible a bit longer
 * while zooming into the barrel.
 */
export const OUTER_MAGNET_HIDE_NEAR_DISTANCE = 7.2;

/**
 * Re-show L3 once the camera pulls back past this distance (hysteresis so the
 * yoke does not flicker at the hide threshold).
 */
export const OUTER_MAGNET_SHOW_NEAR_DISTANCE = 8.1;

/** Scene-graph name of the L3 {@link THREE.LOD} root built by the detector loader. */
export const OUTER_MAGNET_LOD_NAME = 'l3-magnet-lod';

/** Sector mesh name families that make up the L3 yoke ring. */
const OUTER_MAGNET_SECTOR_FAMILY_RE = /^(Mesh_[123])/;

/**
 * Keep 1 of every N azimuthal fine-detail pieces (Mesh_15/17 in tpc.glb) in the
 * TPC low-LOD level. These are small ~80-tri repeats (~340× each).
 */
export const TPC_FINE_DETAIL_KEEP_EVERY = 2;

/**
 * Fraction of vertices to keep when decimating heavy TPC sector panels
 * (Mesh_22/26 — ~4800 tris × 20). 0.5 ≈ half the panel detail, full ring kept.
 */
export const TPC_HEAVY_PANEL_VERTEX_KEEP = 0.5;

/**
 * Camera distance (world units) at which TPC switches from full to simplified LOD.
 * Matches L3 so the default orbit pose uses both low levels together.
 */
export const TPC_LOD_FAR_DISTANCE = 7;

/** Fine-detail families thinned in TPC low-LOD. */
const TPC_FINE_DETAIL_FAMILY_RE = /^(Mesh_15|Mesh_17)(?:\.|$)/;
/** Heavy sector-panel families decimated in TPC low-LOD. */
const TPC_HEAVY_PANEL_FAMILY_RE = /^(Mesh_22|Mesh_26)(?:\.|$)/;

/**
 * Legacy Melax keep-ratio for ITS (unused in the loader). The coloured ITS GLB
 * is thin concentric CAD shells — Melax at the default orbit shreds the rings,
 * so ITS renders at full merged detail (mild-gltfpacked asset) without a far LOD.
 */
export const ITS_SHELL_VERTEX_KEEP = 1;

/**
 * Legacy ITS far-LOD distance (unused — Melax LOD disabled for ITS, like DIPO).
 */
export const ITS_LOD_FAR_DISTANCE = 7;

/** Heavy ITS shell mesh decimated in the low-LOD level. */
const ITS_SHELL_FAMILY_RE = /^(Mesh_0)(?:\.|$)/;

/**
 * Fraction of vertices to keep when decimating heavy MCH chamber panels in the
 * coloured multi-mesh export (~14k tris). 0.55 keeps ribs readable.
 */
export const MCH_VERTEX_KEEP = 0.55;

/**
 * Legacy Melax keep-ratio for DIPO (unused in the loader). The yoke GLB is
 * already ~750 tris of box/tube CAD — further Melax shreds the silhouette, so
 * DIPO renders at full merged detail without a far LOD.
 */
export const DIPO_VERTEX_KEEP = 1;

/**
 * Legacy Melax keep-ratio for ABSO (unused in the loader). The absorber GLB is
 * already mild-gltfpacked (~6k tris); further Melax at the default orbit
 * distance risks shredding fins/cone facets, so ABSO renders at full merged
 * detail without a far LOD (same rationale as {@link DIPO_VERTEX_KEEP}).
 */
export const MUON_AUX_VERTEX_KEEP = 0.7;

/**
 * Camera distance (world units) at which MCH switches to its simplified LOD.
 * Matches L3/TPC/ITS so the default orbit uses the low level. ABSO / DIPO do
 * not use a Melax far LOD.
 */
export const MUON_AUX_LOD_FAR_DISTANCE = 7;

/**
 * Skip Melax on tiny CAD fragments in the muon-arm GLBs (dozens of verts).
 * Only panels above this count are worth decimating.
 */
export const MUON_DECIMATE_MIN_VERTICES = 128;

/** Mesh_* families in the coloured muon-arm GLBs (Mesh_0_1, Mesh_33, …). */
const MUON_AUX_MESH_RE = /^Mesh_/;

/**
 * TPC azimuthal families collapsed to {@link THREE.InstancedMesh} (same idea as
 * L3 Mesh_1/2/3). Fine detail (15/17) is thinned in low LOD; heavy panels
 * (22/26) keep the full ring but Melax the shared prototype once.
 */
const TPC_INSTANCE_FAMILY_RE = /^(Mesh_15|Mesh_17|Mesh_22|Mesh_26)(?:\.|$)/;
const TPC_FINE_INSTANCE_FAMILY_RE = /^(Mesh_15|Mesh_17)(?:\.|$)/;
const TPC_HEAVY_INSTANCE_FAMILY_RE = /^(Mesh_22|Mesh_26)(?:\.|$)/;

/**
 * MCH chamber panels that repeat with a shared prototype — instanced like L3
 * when a family has at least this many members (avoids one-off CAD fragments).
 */
export const MCH_INSTANCE_MIN_FAMILY_SIZE = 4;

/**
 * Low-LOD drawable count must stay within this factor of the high level
 * (regression guard — the old per-mesh material clone blew past 100×).
 */
export const MAX_LOW_TO_HIGH_DRAWABLE_RATIO = 3;

const RENDER_ORDER_LAYER_STRIDE = 10000;

/** Human-readable label for a detector GLB path (filename -> short name). */
export function detectorPartLabel(assetPath: string): string {
  const file = assetPath.replace(/^.*[/\\]/, '').toLowerCase();
  const labels: Record<string, string> = {
    'its.glb': 'ITS',
    'tpc.glb': 'TPC',
    'trd.glb': 'TRD',
    'tof.glb': 'TOF',
    'emcal.glb': 'EMCal',
    'dcal.glb': 'DCal',
    'phos.glb': 'PHOS',
    'l3.glb': 'L3 magnet',
    'mch.glb': 'MCH',
    'abso.glb': 'ABSO',
    'dipo.glb': 'DIPO magnet',
    'bp.glb': 'Beam pipe',
  };
  return labels[file] ?? assetPath.replace(/^.*[/\\]/, '').replace(/\.glb$/i, '');
}

/** Re-export shared GLB accent colours used by opacity sliders / part chips. */
export { detectorPartAccentColor } from '../../shared/three/detector-part-accent';
function isCalorimeter(assetPath: string): boolean {
  return /(^|[/\\])(emcal|dcal|phos)\.glb($|\?)/i.test(assetPath);
}

/** Outer L3 magnet yoke — large screen coverage under the PP camera. */
export function isOuterMagnet(assetPath: string): boolean {
  return /(^|[/\\])l3\.glb($|\?)/i.test(assetPath);
}

/** TPC barrel — largest triangle budget in the ALICE detector GLB set. */
export function isTpc(assetPath: string): boolean {
  return /(^|[/\\])tpc\.glb($|\?)/i.test(assetPath);
}

/** Inner tracking system — second-heaviest shell after TPC. */
export function isIts(assetPath: string): boolean {
  return /(^|[/\\])its\.glb($|\?)/i.test(assetPath);
}

/** Muon chamber — moderate triangle budget in the muon aux GLB set. */
export function isMch(assetPath: string): boolean {
  return /(^|[/\\])mch\.glb($|\?)/i.test(assetPath);
}

/** Forward absorber shell (ABSO). */
export function isAuxiliaryMuonPart(assetPath: string): boolean {
  return /(^|[/\\])abso\.glb($|\?)/i.test(assetPath);
}

/** Dipole magnet at the forward muon-arm end — bends field lines out of the solenoid. */
export function isDipo(assetPath: string): boolean {
  return /(^|[/\\])dipo\.glb($|\?)/i.test(assetPath);
}

/** Accelerator beam pipe along the ALICE axis (BP.glb). */
export function isBeamPipe(assetPath: string): boolean {
  return /(^|[/\\])bp\.glb($|\?)/i.test(assetPath);
}

/** Forward muon-arm shells (MCH / ABSO / DIPO). */
export function isForwardMuonPart(assetPath: string): boolean {
  return isMch(assetPath) || isAuxiliaryMuonPart(assetPath) || isDipo(assetPath);
}

/** Default sidebar/scene visibility — muon-arm parts match the barrel shells. */
export function defaultDetectorPartVisible(_assetPath: string): boolean {
  return true;
}

/** Sidebar / scene default opacity for a detector asset (ignores layer depth). */
export function defaultOpacityForAsset(assetPath: string): number {
  if (isOuterMagnet(assetPath)) return OUTER_MAGNET_DEFAULT_OPACITY;
  if (isBeamPipe(assetPath)) return BEAM_PIPE_DEFAULT_OPACITY;
  return DETECTOR_DEFAULT_OPACITY;
}

/** Default opacity for a layer given its depth index (inner -> outer lerp). */
export function defaultLayerOpacity(assetPath: string, layerIndex: number, totalLayers: number): number {
  if (isOuterMagnet(assetPath) || isBeamPipe(assetPath)) return defaultOpacityForAsset(assetPath);
  const t = totalLayers > 1 ? layerIndex / (totalLayers - 1) : 0;
  const opacity = DETECTOR_INNER_OPACITY * (1 - t) + DETECTOR_OUTER_OPACITY * t;
  return isCalorimeter(assetPath) ? Math.max(opacity, CALORIMETER_MIN_OPACITY) : opacity;
}

function collectOuterMagnetSectorFamilies(root: THREE.Object3D): Map<string, THREE.Mesh[]> {
  const families = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const match = OUTER_MAGNET_SECTOR_FAMILY_RE.exec(o.name || '');
    if (!match) return;
    const list = families.get(match[1]);
    if (list) list.push(o as THREE.Mesh);
    else families.set(match[1], [o as THREE.Mesh]);
  });
  return families;
}

function sortMeshesByAzimuth(meshes: THREE.Mesh[]): THREE.Mesh[] {
  const center = new THREE.Vector3();
  return [...meshes].sort((a, b) => {
    a.getWorldPosition(center);
    const aa = Math.atan2(center.y, center.x);
    b.getWorldPosition(center);
    return aa - Math.atan2(center.y, center.x);
  });
}

/**
 * Drops every other (or Nth) L3 sector mesh so the yoke stays recognisable with
 * fewer triangles. Operates on the unmerged GLB graph.
 * Prefer {@link buildOuterMagnetInstanced} for the live scene (InstancedMesh LOD).
 * @returns number of detached meshes.
 */
export function thinOuterMagnetSectors(
  root: THREE.Object3D,
  keepEvery = OUTER_MAGNET_SECTOR_KEEP_EVERY
): number {
  if (keepEvery <= 1) return 0;
  root.updateMatrixWorld(true);

  const victims: THREE.Object3D[] = [];
  for (const meshes of collectOuterMagnetSectorFamilies(root).values()) {
    sortMeshesByAzimuth(meshes).forEach((mesh, i) => {
      if (i % keepEvery !== 0) victims.push(mesh);
    });
  }
  for (const obj of victims) obj.removeFromParent();
  return victims.length;
}

/**
 * Drops every other (or Nth) TPC fine-detail mesh (Mesh_15/17) around the ring.
 * Operates on the unmerged GLB graph; call before material merge.
 * @returns number of detached meshes.
 */
export function thinTpcFineDetail(
  root: THREE.Object3D,
  keepEvery = TPC_FINE_DETAIL_KEEP_EVERY
): number {
  if (keepEvery <= 1) return 0;
  root.updateMatrixWorld(true);

  const families = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const match = TPC_FINE_DETAIL_FAMILY_RE.exec(o.name || '');
    if (!match) return;
    const list = families.get(match[1]);
    if (list) list.push(o as THREE.Mesh);
    else families.set(match[1], [o as THREE.Mesh]);
  });

  const victims: THREE.Object3D[] = [];
  for (const meshes of families.values()) {
    sortMeshesByAzimuth(meshes).forEach((mesh, i) => {
      if (i % keepEvery !== 0) victims.push(mesh);
    });
  }
  for (const obj of victims) obj.removeFromParent();
  return victims.length;
}

/**
 * Decimates shared geometries of heavy TPC sector panels (Mesh_22/26) in place
 * on `root`. Each unique BufferGeometry is simplified once and reassigned to
 * every mesh that referenced it — the azimuthal ring stays complete.
 * @returns number of unique geometries simplified.
 */
export function decimateTpcHeavyPanels(
  root: THREE.Object3D,
  vertexKeepFraction = TPC_HEAVY_PANEL_VERTEX_KEEP
): number {
  return decimateMeshesByFamily(root, TPC_HEAVY_PANEL_FAMILY_RE, vertexKeepFraction);
}

/**
 * Applies TPC low-LOD geometry cuts: fine-detail thinning + heavy-panel decimation.
 * Mutates `root` (use a {@link cloneDetectorSubtree} copy so the high LOD stays full).
 */
export function simplifyTpcForLowLod(root: THREE.Object3D): void {
  thinTpcFineDetail(root, TPC_FINE_DETAIL_KEEP_EVERY);
  decimateTpcHeavyPanels(root, TPC_HEAVY_PANEL_VERTEX_KEEP);
}

function decimateMeshesByFamily(
  root: THREE.Object3D,
  familyRe: RegExp,
  vertexKeepFraction: number,
  minVertices = 0
): number {
  const keep = Math.min(1, Math.max(0.05, vertexKeepFraction));
  if (keep >= 0.999) return 0;

  const modifier = new SimplifyModifier();
  const simplifiedBySource = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();

  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    if (!familyRe.test(mesh.name || '')) return;
    const source = mesh.geometry as THREE.BufferGeometry;
    if (!source?.attributes?.position) return;

    let simplified = simplifiedBySource.get(source);
    if (!simplified) {
      const vertexCount = source.attributes.position.count;
      if (vertexCount < minVertices) {
        simplifiedBySource.set(source, source);
        return;
      }
      const removeCount = Math.max(0, Math.floor(vertexCount * (1 - keep)));
      if (removeCount <= 0) {
        simplifiedBySource.set(source, source);
        return;
      }
      simplified = modifier.modify(source, removeCount);
      simplified.computeVertexNormals();
      simplifiedBySource.set(source, simplified);
    }
    if (simplified !== source) mesh.geometry = simplified;
  });

  let changed = 0;
  for (const [source, simplified] of simplifiedBySource) {
    if (simplified !== source) changed += 1;
  }
  return changed;
}

/**
 * Decimates the heavy ITS shell (Mesh_0) in place on `root`.
 * @returns number of unique geometries simplified.
 */
export function decimateItsShell(
  root: THREE.Object3D,
  vertexKeepFraction = ITS_SHELL_VERTEX_KEEP
): number {
  return decimateMeshesByFamily(root, ITS_SHELL_FAMILY_RE, vertexKeepFraction);
}

/**
 * Applies ITS low-LOD geometry cuts. Mutates `root` (clone first for high LOD).
 */
export function simplifyItsForLowLod(root: THREE.Object3D): void {
  decimateItsShell(root, ITS_SHELL_VERTEX_KEEP);
}

/**
 * Decimates heavy MCH chamber meshes in place on `root` (skips tiny fragments).
 */
export function decimateMchShell(
  root: THREE.Object3D,
  vertexKeepFraction = MCH_VERTEX_KEEP
): number {
  return decimateMeshesByFamily(
    root,
    MUON_AUX_MESH_RE,
    vertexKeepFraction,
    MUON_DECIMATE_MIN_VERTICES
  );
}

/** Applies MCH low-LOD geometry cuts. Mutates `root` (clone first for high LOD). */
export function simplifyMchForLowLod(root: THREE.Object3D): void {
  decimateMchShell(root, MCH_VERTEX_KEEP);
}

/** Decimates heavy DIPO meshes in place on `root`. */
export function decimateDipoShell(
  root: THREE.Object3D,
  vertexKeepFraction = DIPO_VERTEX_KEEP
): number {
  return decimateMeshesByFamily(
    root,
    MUON_AUX_MESH_RE,
    vertexKeepFraction,
    MUON_DECIMATE_MIN_VERTICES
  );
}

/** Applies DIPO low-LOD geometry cuts. Mutates `root` (clone first for high LOD). */
export function simplifyDipoForLowLod(root: THREE.Object3D): void {
  decimateDipoShell(root, DIPO_VERTEX_KEEP);
}

/**
 * Legacy ABSO Melax helper (unused in the loader — ABSO has no far LOD).
 * Mutates `root` (clone first if preserving a high level).
 */
export function simplifyAuxiliaryForLowLod(
  root: THREE.Object3D,
  vertexKeepFraction = MUON_AUX_VERTEX_KEEP
): void {
  decimateMeshesByFamily(
    root,
    MUON_AUX_MESH_RE,
    vertexKeepFraction,
    MUON_DECIMATE_MIN_VERTICES
  );
}

/**
 * Counts Mesh / InstancedMesh drawables under `root` (for LOD regression tests).
 * Does not recurse into invisible LOD siblings unless they are still in the graph —
 * callers should pass a single LOD level object.
 */
export function countDetectorDrawables(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) n += 1;
  });
  return n;
}

function melaxGeometry(
  source: THREE.BufferGeometry,
  vertexKeepFraction: number,
  minVertices = 0
): THREE.BufferGeometry {
  const keep = Math.min(1, Math.max(0.05, vertexKeepFraction));
  if (keep >= 0.999) return source.clone();
  const vertexCount = source.attributes.position?.count ?? 0;
  if (vertexCount < minVertices) return source.clone();
  const removeCount = Math.max(0, Math.floor(vertexCount * (1 - keep)));
  if (removeCount <= 0) return source.clone();
  const simplified = new SimplifyModifier().modify(source, removeCount);
  simplified.computeVertexNormals();
  return simplified;
}

function collectMeshesByFamily(root: THREE.Object3D, familyRe: RegExp): Map<string, THREE.Mesh[]> {
  const families = new Map<string, THREE.Mesh[]>();
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const match = familyRe.exec(o.name || '');
    if (!match) return;
    const key = match[1];
    const list = families.get(key);
    if (list) list.push(o as THREE.Mesh);
    else families.set(key, [o as THREE.Mesh]);
  });
  return families;
}

function cloneMaterialShared(
  source: THREE.Material,
  map: Map<THREE.Material, THREE.Material>
): THREE.Material {
  let cloned = map.get(source);
  if (!cloned) {
    cloned = source.clone();
    // Material.clone() JSON-clones userData, which turns THREE.Color into a hex
    // number (or `{}`). Restore a real Color so dark-mode / opacity keep the
    // authored pigment instead of falling back to white.
    const srcNeon = source.userData?.['neonBaseColor'];
    if (srcNeon instanceof THREE.Color) {
      cloned.userData = { ...(cloned.userData || {}), neonBaseColor: srcNeon.clone() };
    } else if (typeof srcNeon === 'number') {
      cloned.userData = {
        ...(cloned.userData || {}),
        neonBaseColor: new THREE.Color(srcNeon),
      };
    }
    map.set(source, cloned);
  }
  return cloned;
}

/** Revive a Color that may have been JSON-cloned (hex number or {r,g,b}). */
function reviveNeonBaseColor(
  value: unknown,
  fallback: THREE.Color
): THREE.Color {
  if (value instanceof THREE.Color) return value;
  if (typeof value === 'number') return new THREE.Color(value);
  if (value && typeof value === 'object' && 'r' in (value as object)) {
    const c = value as { r: number; g: number; b: number };
    return new THREE.Color(c.r, c.g, c.b);
  }
  return fallback.clone();
}

/**
 * Collapses L3 sector families (Mesh_1/2/3) into one {@link THREE.InstancedMesh}
 * per family — few draw calls without merging into a single transparent blob.
 * Non-sector meshes (e.g. Mesh_0) stay as ordinary meshes with baked world matrices.
 * Does **not** call `mergeStaticMeshesByMaterial`.
 *
 * @param keepEvery Keep 1 of every N azimuthal sectors (2 = low-LOD thinning).
 */
export function buildOuterMagnetInstanced(
  root: THREE.Object3D,
  keepEvery = 1
): THREE.Group {
  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = 'l3-magnet-instanced';

  const sectorMeshes = new Set<THREE.Mesh>();
  for (const [family, meshes] of collectOuterMagnetSectorFamilies(root)) {
    const sorted = sortMeshesByAzimuth(meshes);
    const kept = keepEvery <= 1 ? sorted : sorted.filter((_, i) => i % keepEvery === 0);
    if (kept.length === 0) continue;

    const proto = kept[0];
    const geometry = (proto.geometry as THREE.BufferGeometry).clone();
    const material = Array.isArray(proto.material)
      ? proto.material[0].clone()
      : (proto.material as THREE.Material).clone();

    const instanced = new THREE.InstancedMesh(geometry, material, kept.length);
    instanced.name = `${family}-instanced`;
    instanced.frustumCulled = true;
    instanced.renderOrder = proto.renderOrder;
    for (let i = 0; i < kept.length; i++) {
      instanced.setMatrixAt(i, kept[i].matrixWorld);
      sectorMeshes.add(kept[i]);
    }
    // Mark all family members so leftovers are not double-added below.
    for (const mesh of meshes) sectorMeshes.add(mesh);
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
  }

  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    if (sectorMeshes.has(mesh)) return;
    if (Array.isArray(mesh.material)) return;
    const baked = (mesh.geometry as THREE.BufferGeometry).clone().applyMatrix4(mesh.matrixWorld);
    const mat = (mesh.material as THREE.Material).clone();
    const single = new THREE.Mesh(baked, mat);
    single.name = mesh.name || 'l3-other';
    single.renderOrder = mesh.renderOrder;
    group.add(single);
  });

  return group;
}

/**
 * TPC high/low level: InstancedMesh for repeated Mesh_15/17/22/26 panels, then
 * material-merge of everything else. Low LOD thins fine families and Melax-es
 * the heavy-panel prototype once (full azimuthal ring kept).
 */
export function buildTpcInstanced(
  root: THREE.Object3D,
  options: { fineKeepEvery?: number; heavyVertexKeep?: number } = {}
): THREE.Group {
  const fineKeepEvery = options.fineKeepEvery ?? 1;
  const heavyVertexKeep = options.heavyVertexKeep ?? 1;

  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = 'tpc-instanced';

  const families = collectMeshesByFamily(root, TPC_INSTANCE_FAMILY_RE);
  const consumed = new Set<THREE.Mesh>();
  const materialMap = new Map<THREE.Material, THREE.Material>();

  for (const [family, meshes] of families) {
    const sorted = sortMeshesByAzimuth(meshes);
    const isFine = TPC_FINE_INSTANCE_FAMILY_RE.test(family);
    const kept =
      isFine && fineKeepEvery > 1 ? sorted.filter((_, i) => i % fineKeepEvery === 0) : sorted;
    if (kept.length === 0) {
      for (const m of meshes) consumed.add(m);
      continue;
    }

    const proto = kept[0];
    let geometry = (proto.geometry as THREE.BufferGeometry).clone();
    if (TPC_HEAVY_INSTANCE_FAMILY_RE.test(family) && heavyVertexKeep < 0.999) {
      geometry = melaxGeometry(geometry, heavyVertexKeep);
    }
    const sourceMat = Array.isArray(proto.material)
      ? (proto.material[0] as THREE.Material)
      : (proto.material as THREE.Material);
    const material = cloneMaterialShared(sourceMat, materialMap);

    const instanced = new THREE.InstancedMesh(geometry, material, kept.length);
    instanced.name = `${family}-instanced`;
    instanced.frustumCulled = true;
    instanced.renderOrder = proto.renderOrder;
    for (let i = 0; i < kept.length; i++) {
      instanced.setMatrixAt(i, kept[i].matrixWorld);
    }
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
    for (const m of meshes) consumed.add(m);
  }

  const staging = new THREE.Group();
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    if (consumed.has(mesh)) return;
    if (Array.isArray(mesh.material)) return;
    const proxy = new THREE.Mesh(mesh.geometry, mesh.material);
    proxy.matrix.copy(mesh.matrixWorld);
    proxy.matrixAutoUpdate = false;
    staging.add(proxy);
  });
  const mergedRest = mergeStaticMeshesByMaterial(staging);
  for (const child of [...mergedRest.children]) {
    group.add(child);
  }

  return group;
}

/**
 * MCH high/low level: InstancedMesh for Mesh_* families with enough repeats,
 * Melax on the prototype for low LOD, then material-merge of leftovers.
 */
export function buildMchInstanced(
  root: THREE.Object3D,
  options: { vertexKeep?: number; minFamilySize?: number } = {}
): THREE.Group {
  const vertexKeep = options.vertexKeep ?? 1;
  const minFamilySize = options.minFamilySize ?? MCH_INSTANCE_MIN_FAMILY_SIZE;

  root.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.name = 'mch-instanced';

  const families = collectMeshesByFamily(root, /^(Mesh_[^.]+)/);
  const consumed = new Set<THREE.Mesh>();
  const materialMap = new Map<THREE.Material, THREE.Material>();

  for (const [family, meshes] of families) {
    if (meshes.length < minFamilySize) continue;
    // Only instance when they share one geometry (true CAD repeats).
    const geo0 = meshes[0].geometry;
    if (!meshes.every((m) => m.geometry === geo0)) continue;

    const sorted = sortMeshesByAzimuth(meshes);
    const proto = sorted[0];
    let geometry = (proto.geometry as THREE.BufferGeometry).clone();
    if (vertexKeep < 0.999) {
      geometry = melaxGeometry(geometry, vertexKeep, MUON_DECIMATE_MIN_VERTICES);
    }
    const sourceMat = Array.isArray(proto.material)
      ? (proto.material[0] as THREE.Material)
      : (proto.material as THREE.Material);
    const material = cloneMaterialShared(sourceMat, materialMap);

    const instanced = new THREE.InstancedMesh(geometry, material, sorted.length);
    instanced.name = `${family}-instanced`;
    instanced.frustumCulled = true;
    instanced.renderOrder = proto.renderOrder;
    for (let i = 0; i < sorted.length; i++) {
      instanced.setMatrixAt(i, sorted[i].matrixWorld);
    }
    instanced.instanceMatrix.needsUpdate = true;
    group.add(instanced);
    for (const m of meshes) consumed.add(m);
  }

  const staging = new THREE.Group();
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    if (consumed.has(mesh)) return;
    if (Array.isArray(mesh.material)) return;
    const proxy = new THREE.Mesh(mesh.geometry, mesh.material);
    proxy.matrix.copy(mesh.matrixWorld);
    proxy.matrixAutoUpdate = false;
    staging.add(proxy);
  });
  const mergedRest = mergeStaticMeshesByMaterial(staging);
  for (const child of [...mergedRest.children]) {
    group.add(child);
  }

  return group;
}

/**
 * Builds a far LOD level by cloning an already-merged/instanced high level and
 * Melax-decimating each mesh geometry in place. Draw-call count stays ≈ high.
 */
export function buildLowLodFromMergedHigh(
  high: THREE.Object3D,
  vertexKeepFraction: number,
  minVertices = 64
): THREE.Object3D {
  const low = high.clone(true);
  const materialMap = new Map<THREE.Material, THREE.Material>();
  const geoMap = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();

  low.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;

    const raw = mesh.material;
    if (Array.isArray(raw)) {
      mesh.material = raw.map((m) => cloneMaterialShared(m, materialMap));
    } else if (raw) {
      mesh.material = cloneMaterialShared(raw, materialMap);
    }

    const source = mesh.geometry as THREE.BufferGeometry;
    if (!source?.attributes?.position) return;
    let simplified = geoMap.get(source);
    if (!simplified) {
      simplified = melaxGeometry(source, vertexKeepFraction, minVertices);
      geoMap.set(source, simplified);
    }
    mesh.geometry = simplified;
  });

  low.userData = { ...high.userData, lodLevel: 'low' };
  return low;
}

/**
 * Deep-clones an Object3D subgraph. Materials that were shared on `root` stay
 * shared on the clone (one clone per unique source material) so a later
 * {@link mergeStaticMeshesByMaterial} still collapses draw calls. The clone's
 * materials are independent of `root` (edits do not leak back).
 */
export function cloneDetectorSubtree(root: THREE.Object3D): THREE.Object3D {
  const clone = root.clone(true);
  const materialMap = new Map<THREE.Material, THREE.Material>();
  clone.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const raw = mesh.material;
    if (Array.isArray(raw)) {
      mesh.material = raw.map((m) => cloneMaterialShared(m, materialMap));
    } else if (raw) {
      mesh.material = cloneMaterialShared(raw, materialMap);
    }
  });
  return clone;
}

/**
 * Applies EventDisplay-style per-mesh polygon offset + render order to a freshly
 * loaded (pre-merge) detector part, and records the target opacity in each
 * material's `userData.baseOpacity`. Materials start solid (`opacity 1`,
 * `transparent false`); call {@link setDetectorPartOpacity} afterwards to fade
 * them to their translucent look. Must run BEFORE `mergeStaticMeshesByMaterial`
 * (which groups by material).
 */
export function applyDetectorLayerMaterials(root: THREE.Object3D, opacity: number, layerIndex: number): void {
  const layerRenderOrderBase = layerIndex * RENDER_ORDER_LAYER_STRIDE;
  // Stronger per-layer bias than the old ×2 — linear or log depth both benefit
  // when translucent ITS/TPC sit in front of opaque ABSO.
  const layerOffset = -(layerIndex + 1) * 4;
  const assetPath = String(root.userData?.['detectorAssetPath'] ?? '');
  const beamPipe = isBeamPipe(assetPath);
  // Paint BP after inner shells so the thin tube wins tie-breaks at the bore.
  const renderOrderBase = beamPipe ? BEAM_PIPE_RENDER_ORDER : layerRenderOrderBase;
  root.renderOrder = renderOrderBase;

  const tempVec = new THREE.Vector3();
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  // Sort inner-to-outer so sibling shells get a stable, unique render order.
  meshes.sort((a, b) => {
    a.getWorldPosition(tempVec);
    const da = tempVec.lengthSq();
    b.getWorldPosition(tempVec);
    return da - tempVec.lengthSq();
  });

  const offsetByMaterial = new Map<THREE.Material, number>();

  meshes.forEach((mesh, meshIndex) => {
    mesh.renderOrder = renderOrderBase + meshIndex;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!mat) continue;
      const m = mat as THREE.Material & { userData: Record<string, unknown> };
      // One polygon-offset slot per unique material (not per mesh) so shared
      // materials stay mergeable into a single draw call.
      let subOffset = offsetByMaterial.get(m);
      if (subOffset === undefined) {
        subOffset = layerOffset - offsetByMaterial.size * 0.01;
        offsetByMaterial.set(m, subOffset);
      }
      m.transparent = false;
      m.opacity = 1;
      m.side = THREE.FrontSide;
      m.depthWrite = true;
      m.depthTest = true;
      (m as THREE.Material & { polygonOffset: boolean }).polygonOffset = true;
      (m as THREE.Material & { polygonOffsetFactor: number }).polygonOffsetFactor = subOffset;
      (m as THREE.Material & { polygonOffsetUnits: number }).polygonOffsetUnits = subOffset * 2;
      m.userData = { ...(m.userData || {}), baseOpacity: opacity };
      m.needsUpdate = true;
    }
  });
}

/** Shows/hides a whole detector part. */
export function setDetectorPartVisibility(root: THREE.Object3D, visible: boolean): void {
  root.visible = visible;
}

/** Dark-mode self-glow for most shells. */
export const DARK_EMISSIVE_INTENSITY = 0.12;
/** Beam pipe is thin grey aluminium — needs extra punch without touching opacity. */
export const BEAM_PIPE_DARK_EMISSIVE_INTENSITY = 0.28;

/**
 * Caps how hard {@link syncDetectorFadeAppearance} may amplify dark-mode
 * emissive when opacity drops (keeps default 0.75 look unchanged: factor 1).
 */
export const FADE_EMISSIVE_MAX_FACTOR = 3.5;

/**
 * In dark mode, boosts emissive (and slightly lifts shell lightness) as opacity
 * falls below {@link DETECTOR_DEFAULT_OPACITY}, so low-α shells with
 * depthWrite=true still read as coloured glass instead of a black silhouette.
 * Light mode is a no-op (emissive stays off).
 */
export function syncDetectorFadeAppearance(
  mat: THREE.Material,
  opacity: number,
  isBeamPipePart: boolean
): void {
  const m = mat as THREE.MeshStandardMaterial & { userData: Record<string, unknown> };
  if (!m || !('emissive' in m)) return;
  const userData = (m.userData || (m.userData = {})) as {
    detectorDarkMode?: boolean;
    fadeBaseColor?: THREE.Color;
  };
  if (!userData.detectorDarkMode) return;

  const o = Math.max(MIN_PART_OPACITY, Math.min(1, opacity));
  const baseEmissive = isBeamPipePart
    ? BEAM_PIPE_DARK_EMISSIVE_INTENSITY
    : DARK_EMISSIVE_INTENSITY;
  const factor = Math.min(
    FADE_EMISSIVE_MAX_FACTOR,
    Math.max(1, DETECTOR_DEFAULT_OPACITY / o)
  );
  m.emissiveIntensity = baseEmissive * factor;

  // Lightness lift only for thick shells (BP already has a brighter dark palette).
  if (!isBeamPipePart && userData.fadeBaseColor instanceof THREE.Color) {
    const hsl = { h: 0, s: 0, l: 0 };
    userData.fadeBaseColor.getHSL(hsl);
    const lift = (factor - 1) / (FADE_EMISSIVE_MAX_FACTOR - 1); // 0 at default, 1 at cap
    const litL = Math.min(0.65, hsl.l + lift * 0.12);
    m.color.setHSL(hsl.h, hsl.s, litL);
    m.emissive.copy(m.color);
  } else if ('emissive' in m && m.emissive) {
    m.emissive.copy(m.color);
  }
}

/**
 * Sets a detector part's opacity (clamped to [MIN_PART_OPACITY,
 * MAX_PART_OPACITY]). Shells keep depthWrite on while translucent (same as
 * EventDisplay / VA) so nested layers stay readable. The beam pipe alone stops
 * writing depth when translucent — it is thin enough that true alpha fade
 * works without muddying the stack.
 */
export function setDetectorPartOpacity(root: THREE.Object3D, value: number): number {
  const opacity = Math.max(MIN_PART_OPACITY, Math.min(MAX_PART_OPACITY, value));
  applyDetectorPartOpacity(root, opacity, true);
  return opacity;
}

/**
 * Like {@link setDetectorPartOpacity} but allows opacity in [0, 1] (no UI
 * slider floor). Used while fading a part in from invisible.
 * @param updateBase When false, keeps `userData.baseOpacity` (slider target).
 */
export function applyDetectorPartOpacity(
  root: THREE.Object3D,
  opacity: number,
  updateBase: boolean
): void {
  const o = Math.max(0, Math.min(1, opacity));
  const transparent = o < 0.995;
  const beamPipe = isBeamPipe(String(root.userData?.['detectorAssetPath'] ?? ''));
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    // mergeStaticMeshesByMaterial creates new Mesh instances and resets their
    // renderOrder to 0. Restore BP's foreground order on the final meshes.
    if (beamPipe) {
      mesh.renderOrder = Math.max(mesh.renderOrder, BEAM_PIPE_RENDER_ORDER);
    }
    const raw = mesh.material;
    const mats = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const mat of mats) {
      const m = mat as THREE.Material & { userData: Record<string, unknown> };
      m.transparent = transparent;
      m.opacity = o;
      // VA-style: thick shells keep depthWrite so nested barrels stay sorted.
      // Beam pipe is the exception — disable depth writes while translucent.
      m.depthWrite = beamPipe ? !transparent : true;
      m.depthTest = true;
      if (updateBase) {
        m.userData = { ...(m.userData || {}), baseOpacity: o };
      } else {
        m.userData = { ...(m.userData || {}) };
      }
      // Compensate against the *current* drawn alpha (including mid fade-in).
      syncDetectorFadeAppearance(m, o, beamPipe);
      m.needsUpdate = true;
    }
  });
}

/** Default fade-in duration for one detector shell during progressive load. */
export const DETECTOR_REVEAL_DURATION_MS = 240;

/** Start the next shell's fade after this fraction of the previous fade. */
export const DETECTOR_REVEAL_STAGGER_FRACTION = 0.55;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * Fades a detector part from opacity 0 up to `targetOpacity` (UI-clamped).
 * `userData.baseOpacity` is set to the target immediately so sliders stay correct.
 */
export function fadeInDetectorPart(
  root: THREE.Object3D,
  targetOpacity: number,
  options: {
    durationMs?: number;
    signal?: AbortSignal;
    onFrame?: () => void;
  } = {}
): Promise<void> {
  const target = Math.max(MIN_PART_OPACITY, Math.min(MAX_PART_OPACITY, targetOpacity));
  const durationMs = options.durationMs ?? DETECTOR_REVEAL_DURATION_MS;

  // Record the slider target even while the mesh is still invisible.
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const raw = (obj as THREE.Mesh).material;
    const mats = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const mat of mats) {
      const m = mat as THREE.Material & { userData: Record<string, unknown> };
      m.userData = { ...(m.userData || {}), baseOpacity: target };
    }
  });

  if (durationMs <= 0 || options.signal?.aborted) {
    setDetectorPartOpacity(root, target);
    options.onFrame?.();
    return Promise.resolve();
  }

  applyDetectorPartOpacity(root, 0, false);

  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now: number): void => {
      if (options.signal?.aborted) {
        setDetectorPartOpacity(root, target);
        options.onFrame?.();
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / durationMs);
      applyDetectorPartOpacity(root, target * easeOutCubic(t), false);
      options.onFrame?.();
      if (t < 1) {
        requestAnimationFrame(tick);
      } else {
        setDetectorPartOpacity(root, target);
        options.onFrame?.();
        resolve();
      }
    };
    requestAnimationFrame(tick);
  });
}

/** Boosts saturation + self-emissive glow (dark) or restores base colour (light). */
export function applyDetectorDarkMode(root: THREE.Object3D, darkMode: boolean): void {
  const hsl = { h: 0, s: 0, l: 0 };
  const beamPipe = isBeamPipe(String(root.userData?.['detectorAssetPath'] ?? ''));
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial & { userData: Record<string, unknown> };
      if (!m || !('color' in m)) continue;
      const userData = (m.userData || (m.userData = {})) as {
        neonBaseColor?: THREE.Color | number | { r: number; g: number; b: number };
        detectorDarkMode?: boolean;
        fadeBaseColor?: THREE.Color;
        baseOpacity?: number;
      };
      userData.neonBaseColor = reviveNeonBaseColor(userData.neonBaseColor, m.color);
      const baseColor = userData.neonBaseColor as THREE.Color;
      userData.detectorDarkMode = darkMode;
      if (darkMode) {
        baseColor.getHSL(hsl);
        const litLightness = beamPipe
          ? Math.min(0.72, Math.max(0.45, hsl.l * 1.12 + 0.06))
          : Math.min(0.55, Math.max(0.3, hsl.l));
        const lit = new THREE.Color().setHSL(
          hsl.h,
          Math.min(1, hsl.s * 1.1 + 0.05),
          litLightness
        );
        m.color.copy(lit);
        userData.fadeBaseColor = lit.clone();
        if ('emissive' in m) {
          m.emissive.copy(m.color);
          m.emissiveIntensity = beamPipe
            ? BEAM_PIPE_DARK_EMISSIVE_INTENSITY
            : DARK_EMISSIVE_INTENSITY;
        }
        const fadeOpacity =
          typeof userData.baseOpacity === 'number' && Number.isFinite(userData.baseOpacity)
            ? userData.baseOpacity
            : DETECTOR_DEFAULT_OPACITY;
        syncDetectorFadeAppearance(m, fadeOpacity, beamPipe);
      } else {
        m.color.copy(baseColor);
        delete userData.fadeBaseColor;
        if ('emissive' in m) {
          m.emissive.setRGB(0, 0, 0);
          m.emissiveIntensity = 0;
        }
      }
      m.needsUpdate = true;
    }
  });
}
