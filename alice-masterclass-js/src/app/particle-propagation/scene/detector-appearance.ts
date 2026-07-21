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
 * {@link simplifyTpcForLowLod}). ITS uses a distance LOD whose far level
 * decimates the heavy shell mesh (Mesh_0). MCH / ABSO / SHIL / DIPO use the same
 * distance-LOD pattern with Melax on the heavier Mesh_* panels.
 */

import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier';

/** Inner shells slightly more opaque than outer, matching EventDisplay. */
export const DETECTOR_INNER_OPACITY = 0.8;
export const DETECTOR_OUTER_OPACITY = 0.75;
/** Calorimeter layers never go below this (they'd otherwise vanish). */
export const CALORIMETER_MIN_OPACITY = 0.45;
/** UI slider clamp. Upper bound is 1 so the L3 yoke can stay fully opaque. */
export const MIN_PART_OPACITY = 0.05;
export const MAX_PART_OPACITY = 1;

/**
 * Default L3 magnet opacity. Matches the outer-shell lerp (~0.75) used elsewhere
 * in the detector stack.
 */
export const OUTER_MAGNET_DEFAULT_OPACITY = 0.75;

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
 * Fraction of vertices to keep when decimating the heavy ITS shell (Mesh_0 —
 * ~26k tris, roughly half the ITS budget). 0.45 keeps the silhouette readable.
 */
export const ITS_SHELL_VERTEX_KEEP = 0.45;

/**
 * Camera distance (world units) at which ITS switches from full to decimated LOD.
 * Matches L3/TPC so the default orbit pose uses all low levels together.
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
 * Fraction of vertices to keep when decimating DIPO yoke panels. Dipole is
 * mostly boxes/tubes — 0.5 keeps the bend silhouette readable.
 */
export const DIPO_VERTEX_KEEP = 0.5;

/**
 * Fraction of vertices to keep for ABSO / SHIL shells (~7k tris each in the
 * coloured export). Gentle trim — silhouette stays intact.
 */
export const MUON_AUX_VERTEX_KEEP = 0.7;

/**
 * Camera distance (world units) at which MCH / ABSO / SHIL / DIPO switch to
 * simplified LOD. Matches L3/TPC/ITS so the default orbit uses low levels.
 */
export const MUON_AUX_LOD_FAR_DISTANCE = 7;

/**
 * Skip Melax on tiny CAD fragments in the muon-arm GLBs (dozens of verts).
 * Only panels above this count are worth decimating.
 */
export const MUON_DECIMATE_MIN_VERTICES = 128;

/** Mesh_* families in the coloured muon-arm GLBs (Mesh_0_1, Mesh_33, …). */
const MUON_AUX_MESH_RE = /^Mesh_/;

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
    'shil.glb': 'SHIL',
    'dipo.glb': 'DIPO magnet',
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

/** Forward absorber / shield shells (ABSO, SHIL). */
export function isAuxiliaryMuonPart(assetPath: string): boolean {
  return /(^|[/\\])(abso|shil)\.glb($|\?)/i.test(assetPath);
}

/** Dipole magnet at the forward muon-arm end — bends field lines out of the solenoid. */
export function isDipo(assetPath: string): boolean {
  return /(^|[/\\])dipo\.glb($|\?)/i.test(assetPath);
}

/** Forward muon-arm shells (MCH / ABSO / SHIL / DIPO). */
export function isForwardMuonPart(assetPath: string): boolean {
  return isMch(assetPath) || isAuxiliaryMuonPart(assetPath) || isDipo(assetPath);
}

/** Default sidebar/scene visibility — muon-arm parts match the barrel shells. */
export function defaultDetectorPartVisible(_assetPath: string): boolean {
  return true;
}

/** Default opacity for a layer given its depth index (inner -> outer lerp). */
export function defaultLayerOpacity(assetPath: string, layerIndex: number, totalLayers: number): number {
  if (isOuterMagnet(assetPath)) return OUTER_MAGNET_DEFAULT_OPACITY;
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
 * Lightly decimates heavy ABSO / SHIL meshes. Mutates `root` (clone first for high LOD).
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
 * Deep-clones an Object3D subgraph and clones each mesh material so the copy
 * can be independently thinned / restyled (Three's default clone shares materials).
 */
export function cloneDetectorSubtree(root: THREE.Object3D): THREE.Object3D {
  const clone = root.clone(true);
  clone.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const raw = mesh.material;
    if (Array.isArray(raw)) mesh.material = raw.map((m) => m.clone());
    else if (raw) mesh.material = raw.clone();
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
  const layerOffset = -(layerIndex + 1) * 2;
  root.renderOrder = layerRenderOrderBase;

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

  meshes.forEach((mesh, meshIndex) => {
    mesh.renderOrder = layerRenderOrderBase + meshIndex;
    const subOffset = layerOffset - meshIndex * 0.01;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!mat) continue;
      const m = mat as THREE.Material & { userData: Record<string, unknown> };
      m.transparent = false;
      m.opacity = 1;
      m.side = THREE.FrontSide;
      m.depthWrite = true;
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

/**
 * Sets a detector part's opacity (clamped to [MIN_PART_OPACITY,
 * MAX_PART_OPACITY]); keeps `depthWrite = true` so blending stays cheap.
 */
export function setDetectorPartOpacity(root: THREE.Object3D, value: number): number {
  const opacity = Math.max(MIN_PART_OPACITY, Math.min(MAX_PART_OPACITY, value));
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const raw = (o as THREE.Mesh).material;
    const mats = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const mat of mats) {
      const m = mat as THREE.Material & { userData: Record<string, unknown> };
      m.transparent = opacity < 0.995;
      m.opacity = opacity;
      m.userData = { ...(m.userData || {}), baseOpacity: opacity };
      m.needsUpdate = true;
    }
  });
  return opacity;
}

const DARK_EMISSIVE_INTENSITY = 0.12;

/** Boosts saturation + self-emissive glow (dark) or restores base colour (light). */
export function applyDetectorDarkMode(root: THREE.Object3D, darkMode: boolean): void {
  const hsl = { h: 0, s: 0, l: 0 };
  root.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    const raw = (o as THREE.Mesh).material;
    const mats = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial & { userData: Record<string, unknown> };
      if (!m || !('color' in m)) continue;
      const userData = (m.userData || (m.userData = {})) as { neonBaseColor?: THREE.Color };
      if (!userData.neonBaseColor) {
        userData.neonBaseColor = m.color.clone();
      }
      if (darkMode) {
        userData.neonBaseColor.getHSL(hsl);
        m.color.setHSL(hsl.h, Math.min(1, hsl.s * 1.1 + 0.05), Math.min(0.55, Math.max(0.3, hsl.l)));
        if ('emissive' in m) {
          m.emissive.copy(m.color);
          m.emissiveIntensity = DARK_EMISSIVE_INTENSITY;
        }
      } else {
        m.color.copy(userData.neonBaseColor);
        if ('emissive' in m) {
          m.emissive.setRGB(0, 0, 0);
        }
      }
      m.needsUpdate = true;
    }
  });
}
