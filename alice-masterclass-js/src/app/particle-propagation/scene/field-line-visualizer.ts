/**
 * Builds magnetic **field lines** (streamlines through B(r)) as fat `LineSegments2`
 * polylines plus direction arrowheads, in the style of Fig. 19 of
 * "Distributed simulation and visualization of the ALICE detector magnetic field"
 * (Nowakowski, Rokita, Graczykowski, 2022) — but sparser, and **lines only**
 * (no colour-mapped slice plane).
 *
 * Tracing itself lives in `physics/field-line-tracer.ts`; this module only turns
 * the resulting polylines into renderable Three.js objects.
 *
 * Depth visibility matches particle tracks (`track-renderer.ts`): default
 * `depthTest` / no elevated `renderOrder`, so lines are occluded by detector
 * geometry the same way tracks are.
 */

import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry';

import { FieldLineDensity, FieldSampler, FieldLinePolyline, traceFieldLines } from '../physics/field-line-tracer';

export interface FieldLineOptions {
  /** cm -> world units (PropagationScene.objectScale). */
  scale: number;
  /** Seed-grid density preset. */
  density?: FieldLineDensity;
  /** Initial material opacity. */
  opacity?: number;
  /** Line width in CSS pixels (LineMaterial). */
  linewidth?: number;
  /** Canvas size used to initialise LineMaterial.resolution. */
  resolution?: { width: number; height: number };
}

/** Dark orange — reads clearly on both dark background and blue detector shells. */
const FIELD_LINE_COLOR = 0xa8480f;

/** Default fat-line width in CSS pixels. */
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
}

/**
 * Returns a group holding:
 * - one `LineSegments2` with every traced field line (fat lines, one draw call),
 * - one `InstancedMesh` of cone arrowheads showing +B̂ direction,
 * or an empty group if none were traced.
 */
export function buildFieldLines(sample: FieldSampler, options: FieldLineOptions): THREE.Group {
  const {
    scale,
    density = 'medium',
    opacity = 0.35,
    linewidth = DEFAULT_FIELD_LINEWIDTH,
    resolution = { width: 1, height: 1 },
  } = options;
  const group = new THREE.Group();
  group.name = 'magnetic-field-lines';

  const { lines } = traceFieldLines(sample, { density });
  if (lines.length === 0) return group;

  let segmentCount = 0;
  for (const line of lines) segmentCount += Math.max(0, line.pointCount - 1);
  if (segmentCount === 0) return group;

  const positions = new Float32Array(segmentCount * 2 * 3);
  let cursor = 0;
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
    }
  }

  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(positions);

  const material = new LineMaterial({
    color: FIELD_LINE_COLOR,
    linewidth,
    transparent: true,
    opacity,
    depthWrite: false,
    resolution: new THREE.Vector2(Math.max(1, resolution.width), Math.max(1, resolution.height)),
  });

  const segments = new LineSegments2(geometry, material);
  segments.name = 'field-line-segments';
  segments.frustumCulled = false;
  group.add(segments);

  const arrows = buildDirectionArrows(lines, scale, opacity);
  if (arrows) group.add(arrows);

  group.userData['lineMaterial'] = material;
  return group;
}

function buildDirectionArrows(
  lines: FieldLinePolyline[],
  scale: number,
  opacity: number
): THREE.InstancedMesh | null {
  const placements: ArrowPlacement[] = [];
  for (const line of lines) {
    collectArrowPlacements(line, placements);
  }
  if (placements.length === 0) return null;

  const coneLenWorld = ARROW_LEN_CM * scale;
  const coneRadiusWorld = ARROW_RADIUS_CM * scale;
  const geometry = new THREE.ConeGeometry(coneRadiusWorld, coneLenWorld, 8);
  // ConeGeometry points +Y; we orient via setFromUnitVectors(UP, dir).
  const material = new THREE.MeshBasicMaterial({
    color: FIELD_LINE_COLOR,
    transparent: true,
    opacity,
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  mesh.name = 'field-line-arrows';
  mesh.frustumCulled = false;

  const quat = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const posWorld = new THREE.Vector3();
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    quat.setFromUnitVectors(UP, p.dir);
    posWorld.copy(p.pos).multiplyScalar(scale);
    // Offset the cone so its base sits on the line and the tip points +B̂.
    posWorld.addScaledVector(p.dir, coneLenWorld * 0.5);
    matrix.compose(posWorld, quat, new THREE.Vector3(1, 1, 1));
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

/**
 * Walks a polyline (already ordered −B̂ → +B̂) and emits arrow placements at
 * roughly {@link ARROW_SPACING_CM} intervals along the arc.
 */
function collectArrowPlacements(line: FieldLinePolyline, out: ArrowPlacement[]): void {
  if (line.pointCount < 2) return;

  let distSinceLast = ARROW_SPACING_CM * 0.5; // first arrow not right at the tip
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
    let remaining = segLen;
    let cursor = 0;
    while (distSinceLast + remaining >= ARROW_SPACING_CM) {
      const need = ARROW_SPACING_CM - distSinceLast;
      cursor += need;
      const t = cursor / segLen;
      out.push({
        pos: new THREE.Vector3(ax + dx * t, ay + dy * t, az + dz * t),
        dir: dir.clone(),
      });
      remaining -= need;
      distSinceLast = 0;
    }
    distSinceLast += remaining;
  }
}

/** Sets opacity on both fat lines and arrow cones in a {@link buildFieldLines} group. */
export function setFieldLinesOpacity(group: THREE.Object3D, opacity: number): void {
  group.traverse((o) => {
    if ((o as LineSegments2).isLineSegments2 || (o as Line2).isLine2) {
      const mat = (o as LineSegments2).material as LineMaterial;
      mat.opacity = opacity;
      mat.transparent = true;
      mat.needsUpdate = true;
      return;
    }
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      const mat = mesh.material as THREE.Material;
      mat.opacity = opacity;
      mat.transparent = true;
      mat.needsUpdate = true;
    }
  });
}

/** Sets fat-line width (CSS pixels) without rebuilding geometry. */
export function setFieldLinesWidth(group: THREE.Object3D, linewidth: number): void {
  const mat = group.userData['lineMaterial'] as LineMaterial | undefined;
  if (mat) {
    mat.linewidth = linewidth;
    mat.needsUpdate = true;
    return;
  }
  group.traverse((o) => {
    if ((o as LineSegments2).isLineSegments2) {
      ((o as LineSegments2).material as LineMaterial).linewidth = linewidth;
    }
  });
}

/** Updates LineMaterial.resolution after a canvas resize (required for correct fat-line width). */
export function setFieldLinesResolution(group: THREE.Object3D, width: number, height: number): void {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const mat = group.userData['lineMaterial'] as LineMaterial | undefined;
  if (mat?.resolution) {
    mat.resolution.set(w, h);
    return;
  }
  group.traverse((o) => {
    if ((o as LineSegments2).isLineSegments2) {
      const lineMat = (o as LineSegments2).material as LineMaterial;
      lineMat.resolution?.set(w, h);
    }
  });
}
