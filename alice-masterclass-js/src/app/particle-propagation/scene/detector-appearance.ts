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
 * of them. The L3 magnet yoke defaults to fully opaque (`opacity = 1`) so the
 * down-the-barrel camera does not pay full-screen translucent overdraw for a
 * shell the student looks *through the opening of*, not through the yoke —
 * matching Visual Analysis orbit smoothness while keeping the red magnet visible.
 */

import * as THREE from 'three';

/** Inner shells slightly more opaque than outer, matching EventDisplay. */
export const DETECTOR_INNER_OPACITY = 0.8;
export const DETECTOR_OUTER_OPACITY = 0.75;
/** Calorimeter layers never go below this (they'd otherwise vanish). */
export const CALORIMETER_MIN_OPACITY = 0.45;
/** UI slider clamp. Upper bound is 1 so the L3 yoke can stay fully opaque. */
export const MIN_PART_OPACITY = 0.05;
export const MAX_PART_OPACITY = 1;

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
  };
  return labels[file] ?? assetPath.replace(/^.*[/\\]/, '').replace(/\.glb$/i, '');
}

/**
 * Dominant UI accent colour per GLB (from each part's signature
 * `baseColorFactor` in `assets/models/alice components/*.glb`).
 * Grey structural materials are ignored in favour of the coloured shell.
 */
const DETECTOR_PART_ACCENT_HEX: Record<string, string> = {
  'its.glb': '#33FF71',
  'tpc.glb': '#22C4FF',
  'trd.glb': '#FFAA32',
  'tof.glb': '#FF5E1C',
  'emcal.glb': '#2B1FFF',
  'dcal.glb': '#FF2FC0',
  'phos.glb': '#D1C30C',
  'l3.glb': '#FF0D12',
};

/** CSS hex accent for opacity sliders / part chips; falls back to orange. */
export function detectorPartAccentColor(assetPath: string): string {
  const file = assetPath.replace(/^.*[/\\]/, '').toLowerCase();
  return DETECTOR_PART_ACCENT_HEX[file] ?? '#ff6f00';
}

function isCalorimeter(assetPath: string): boolean {
  return /(^|[/\\])(emcal|dcal|phos)\.glb($|\?)/i.test(assetPath);
}

/** Outer L3 magnet yoke — large screen coverage under the PP camera. */
export function isOuterMagnet(assetPath: string): boolean {
  return /(^|[/\\])l3\.glb($|\?)/i.test(assetPath);
}

/** Default opacity for a layer given its depth index (inner -> outer lerp). */
export function defaultLayerOpacity(assetPath: string, layerIndex: number, totalLayers: number): number {
  // Opaque magnet: look through the aperture, not the yoke (fill-rate win).
  if (isOuterMagnet(assetPath)) return 1;
  const t = totalLayers > 1 ? layerIndex / (totalLayers - 1) : 0;
  const opacity = DETECTOR_INNER_OPACITY * (1 - t) + DETECTOR_OUTER_OPACITY * t;
  return isCalorimeter(assetPath) ? Math.max(opacity, CALORIMETER_MIN_OPACITY) : opacity;
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
