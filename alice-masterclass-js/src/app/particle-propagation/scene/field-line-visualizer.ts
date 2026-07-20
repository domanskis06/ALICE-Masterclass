/**
 * Builds magnetic **field lines** (streamlines through B(r)) as cheap native
 * `THREE.LineSegments` polylines plus direction arrowheads — same depth stack as
 * particle tracks (`track-renderer.ts`: `depthTest` / `depthWrite` on).
 *
 * Vertex colours encode `|B|` via a Jet-style colormap (`physics/field-colormap.ts`).
 * Tracing lives in `physics/field-line-tracer.ts`; this module only builds
 * Three.js objects.
 *
 * Performance: fat `LineSegments2` (screen-space quads) dominated orbit cost
 * when looking down the L3 barrel. Native `LineSegments` are 1 px GPU lines
 * (same cheap path EventDisplay used before Line2) and keep the |B| colour
 * legend via `vertexColors`.
 */

import * as THREE from 'three';

import {
  FIELD_COLOR_MAX_T,
  FIELD_COLOR_MIN_T,
  FieldColorRange,
  magnitudeToRgb,
} from '../physics/field-colormap';
import { FieldLineDensity, FieldSampler, FieldLinePolyline, traceFieldLines } from '../physics/field-line-tracer';

export interface FieldLineOptions {
  /** cm -> world units (PropagationScene.objectScale). */
  scale: number;
  /** Seed-grid density preset. */
  density?: FieldLineDensity;
  /** Initial material opacity. */
  opacity?: number;
  /**
   * Desired line width in CSS pixels. Stored for UI compatibility; native
   * WebGL `LineBasicMaterial` ignores `linewidth` on most platforms.
   */
  linewidth?: number;
  /** Canvas size (kept for API parity with the previous fat-line path). */
  resolution?: { width: number; height: number };
  /** `|B|` colour-scale window (defaults to the nominal 0.5 T band). */
  colorRange?: FieldColorRange;
  /** Extend barrel streamlines into the dipole region (continuous lines). */
  includeDipoleTransition?: boolean;
  /**
   * Extra dipole-aperture arcs (paper-style). Defaults to
   * {@link includeDipoleTransition}; does not densify the solenoid barrel.
   */
  includeDipoleArcs?: boolean;
}

/** Default stored linewidth (UI slider default; see {@link FieldLineOptions.linewidth}). */
export const DEFAULT_FIELD_LINEWIDTH = 1.5;

/** Place one arrowhead every this many cm of arc length along each line. */
const ARROW_SPACING_CM = 300;

/** Arrow cone length in cm (before world scale). */
const ARROW_LEN_CM = 8;

/** Arrow cone base radius in cm (before world scale). */
const ARROW_RADIUS_CM = 2;

const UP = new THREE.Vector3(0, 1, 0);

interface ArrowPlacement {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  magnitude: number;
}

function writeRgb(
  out: Float32Array,
  offset: number,
  bTesla: number,
  colorRange: FieldColorRange
): void {
  const [r, g, b] = magnitudeToRgb(bTesla, colorRange);
  out[offset] = r;
  out[offset + 1] = g;
  out[offset + 2] = b;
}

/**
 * Returns a group holding:
 * - one `THREE.LineSegments` with every traced field line (single draw call),
 * - one `InstancedMesh` of cone arrowheads showing +B̂ direction,
 * or an empty group if none were traced.
 */
export function buildFieldLines(sample: FieldSampler, options: FieldLineOptions): THREE.Group {
  const {
    scale,
    density = 'dense',
    opacity = 0.65,
    linewidth = DEFAULT_FIELD_LINEWIDTH,
    colorRange = { minT: FIELD_COLOR_MIN_T, maxT: FIELD_COLOR_MAX_T },
    includeDipoleTransition = false,
    includeDipoleArcs,
  } = options;
  const group = new THREE.Group();
  group.name = 'magnetic-field-lines';

  const { lines } = traceFieldLines(sample, {
    density,
    includeDipoleTransition,
    includeDipoleArcs,
  });
  if (lines.length === 0) return group;

  let segmentCount = 0;
  for (const line of lines) segmentCount += Math.max(0, line.pointCount - 1);
  if (segmentCount === 0) return group;

  const positions = new Float32Array(segmentCount * 2 * 3);
  const colors = new Float32Array(segmentCount * 2 * 3);
  /** |B| (Tesla) at each line vertex — kept so strength-slider recolors skip re-tracing. */
  const magnitudes = new Float32Array(segmentCount * 2);
  let cursor = 0;
  let colorCursor = 0;
  let magCursor = 0;
  for (const line of lines) {
    for (let i = 0; i < line.pointCount - 1; i++) {
      const aBase = i * 3;
      const bBase = (i + 1) * 3;
      positions[cursor++] = line.positions[aBase] * scale;
      positions[cursor++] = line.positions[aBase + 1] * scale;
      positions[cursor++] = line.positions[aBase + 2] * scale;
      positions[cursor++] = line.positions[bBase] * scale;
      positions[cursor++] = line.positions[bBase + 1] * scale;
      positions[cursor++] = line.positions[bBase + 2] * scale;
      const magA = line.magnitudes[i];
      const magB = line.magnitudes[i + 1];
      magnitudes[magCursor++] = magA;
      magnitudes[magCursor++] = magB;
      writeRgb(colors, colorCursor, magA, colorRange);
      colorCursor += 3;
      writeRgb(colors, colorCursor, magB, colorRange);
      colorCursor += 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();

  const material = new THREE.LineBasicMaterial({
    // Must stay white so per-vertex colours are not tinted.
    color: 0xffffff,
    vertexColors: true,
    transparent: opacity < 0.995,
    opacity,
    depthTest: true,
    depthWrite: true,
  });

  const segments = new THREE.LineSegments(geometry, material);
  segments.name = 'field-line-segments';
  segments.frustumCulled = true;
  segments.userData['fieldMagnitudes'] = magnitudes;
  group.add(segments);

  const arrows = buildDirectionArrows(lines, scale, opacity, colorRange);
  if (arrows) group.add(arrows);

  group.userData['lineMaterial'] = material;
  group.userData['linewidth'] = linewidth;
  group.userData['fieldColorMinT'] = colorRange.minT;
  group.userData['fieldColorMaxT'] = colorRange.maxT;
  /**
   * Strength scale baked into {@link magnitudes} / arrow magnitudes at build time.
   * Recolor multiplies stored |B| by `currentScale / this` when the UI slider moves.
   */
  group.userData['fieldMagnitudeScale'] = 1;
  return group;
}

function buildDirectionArrows(
  lines: FieldLinePolyline[],
  scale: number,
  opacity: number,
  colorRange: FieldColorRange
): THREE.InstancedMesh | null {
  const placements: ArrowPlacement[] = [];
  for (const line of lines) {
    collectArrowPlacements(line, placements);
  }
  if (placements.length === 0) return null;

  const coneLenWorld = ARROW_LEN_CM * scale;
  const coneRadiusWorld = ARROW_RADIUS_CM * scale;
  const geometry = new THREE.ConeGeometry(coneRadiusWorld, coneLenWorld, 8);
  const material = new THREE.MeshBasicMaterial({
    transparent: opacity < 0.995,
    opacity,
    depthTest: true,
    depthWrite: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = 'field-line-arrows';
  mesh.frustumCulled = true;
  mesh.geometry.computeBoundingSphere();

  const arrowMagnitudes = new Float32Array(placements.length);
  const quat = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const posWorld = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    quat.setFromUnitVectors(UP, p.dir);
    posWorld.copy(p.pos).multiplyScalar(scale);
    posWorld.addScaledVector(p.dir, coneLenWorld * 0.5);
    matrix.compose(posWorld, quat, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, matrix);
    arrowMagnitudes[i] = p.magnitude;
    const [r, g, b] = magnitudeToRgb(p.magnitude, colorRange);
    color.setRGB(r, g, b);
    mesh.setColorAt(i, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.userData['fieldMagnitudes'] = arrowMagnitudes;
  mesh.computeBoundingSphere();
  return mesh;
}

function collectArrowPlacements(line: FieldLinePolyline, out: ArrowPlacement[]): void {
  if (line.pointCount < 2) return;

  let distSinceLast = ARROW_SPACING_CM * 0.5;
  for (let i = 0; i < line.pointCount - 1; i++) {
    const aBase = i * 3;
    const bBase = (i + 1) * 3;
    const ax = line.positions[aBase];
    const ay = line.positions[aBase + 1];
    const az = line.positions[aBase + 2];
    const bx = line.positions[bBase];
    const by = line.positions[bBase + 1];
    const bz = line.positions[bBase + 2];
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const segLen = Math.hypot(dx, dy, dz);
    if (segLen < 1e-9) continue;

    const dir = new THREE.Vector3(dx / segLen, dy / segLen, dz / segLen);
    const magA = line.magnitudes[i];
    const magB = line.magnitudes[i + 1];
    let remaining = segLen;
    let cursor = 0;
    while (distSinceLast + remaining >= ARROW_SPACING_CM) {
      const need = ARROW_SPACING_CM - distSinceLast;
      cursor += need;
      const t = cursor / segLen;
      out.push({
        pos: new THREE.Vector3(ax + dx * t, ay + dy * t, az + dz * t),
        dir: dir.clone(),
        magnitude: magA + (magB - magA) * t,
      });
      remaining -= need;
      distSinceLast = 0;
    }
    distSinceLast += remaining;
  }
}

/** Sets opacity on both lines and arrow cones in a {@link buildFieldLines} group. */
export function setFieldLinesOpacity(group: THREE.Object3D, opacity: number): void {
  group.traverse((o) => {
    const line = o as THREE.LineSegments;
    if (line.isLineSegments) {
      const mat = line.material as THREE.LineBasicMaterial;
      mat.opacity = opacity;
      mat.transparent = opacity < 0.995;
      mat.needsUpdate = true;
      return;
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.Material;
      mat.opacity = opacity;
      mat.transparent = opacity < 0.995;
      mat.needsUpdate = true;
    }
  });
}

/**
 * Recolours existing field lines for a new `|B|` window / strength scale.
 *
 * Streamline geometry follows B̂ and is independent of |B|, so the field-strength
 * slider must not re-trace the Chebyshev map — only remap stored magnitudes.
 *
 * @param magnitudeScale Multiplier applied to magnitudes stored at build time
 *   (typically `B_ui_now / B_ui_at_build`, or absolute if build used scale 1).
 */
export function setFieldLinesColorRange(
  group: THREE.Object3D,
  colorRange: FieldColorRange,
  magnitudeScale = 1
): void {
  const color = new THREE.Color();
  group.traverse((o) => {
    const line = o as THREE.LineSegments;
    if (line.isLineSegments && o.name === 'field-line-segments') {
      const mags = line.userData['fieldMagnitudes'] as Float32Array | undefined;
      const attr = line.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
      if (!mags || !attr || mags.length * 3 !== attr.array.length) return;
      const colors = attr.array as Float32Array;
      for (let i = 0; i < mags.length; i++) {
        writeRgb(colors, i * 3, mags[i] * magnitudeScale, colorRange);
      }
      attr.needsUpdate = true;
      return;
    }
    const mesh = o as THREE.InstancedMesh;
    if (mesh.isInstancedMesh && o.name === 'field-line-arrows') {
      const mags = mesh.userData['fieldMagnitudes'] as Float32Array | undefined;
      if (!mags || !mesh.instanceColor) return;
      for (let i = 0; i < mags.length; i++) {
        const [r, g, b] = magnitudeToRgb(mags[i] * magnitudeScale, colorRange);
        color.setRGB(r, g, b);
        mesh.setColorAt(i, color);
      }
      mesh.instanceColor.needsUpdate = true;
    }
  });
  group.userData['fieldColorMinT'] = colorRange.minT;
  group.userData['fieldColorMaxT'] = colorRange.maxT;
  group.userData['fieldMagnitudeScale'] = magnitudeScale;
}

/**
 * Stores the requested linewidth for UI state. Native WebGL lines ignore
 * `linewidth`, so this has no GPU effect — kept so the thickness slider stays
 * wired without forcing a rebuild to expensive fat lines.
 */
export function setFieldLinesWidth(group: THREE.Object3D, linewidth: number): void {
  group.userData['linewidth'] = linewidth;
}

/** No-op retained for callers that still update fat-line resolution after resize. */
export function setFieldLinesResolution(_group: THREE.Object3D, _width: number, _height: number): void {
  // Native LineSegments do not need a resolution uniform.
}
