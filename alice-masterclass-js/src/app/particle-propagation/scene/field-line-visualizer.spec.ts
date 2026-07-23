import * as THREE from 'three';

import {
  buildFieldLines,
  effectiveFieldOpacity,
  LIGHT_MODE_FIELD_OPACITY_BOOST,
  setFieldLinesColorRange,
  setFieldLinesDarkMode,
  setFieldLinesOpacity,
  setFieldLinesWidth,
} from './field-line-visualizer';
import { FIELD_LINE_RENDER_ORDER, RENDER_ORDER_LAYER_STRIDE } from './detector-appearance';
import { Vec3 } from '../physics/propagation-types';
import { fieldColorRangeForStrength } from '../physics/field-colormap';

/** Uniform 0.5 T field along +z, like the ALICE solenoid interior. */
const uniformZField = (): Vec3 => ({ x: 0, y: 0, z: 0.5 });

function fieldLineSegments(group: THREE.Object3D): THREE.LineSegments | null {
  let found: THREE.LineSegments | null = null;
  group.traverse((o) => {
    const line = o as THREE.LineSegments;
    if (!found && line.isLineSegments && o.name === 'field-line-segments') {
      found = line;
    }
  });
  return found;
}

function arrowMesh(group: THREE.Object3D): THREE.InstancedMesh | null {
  let found: THREE.InstancedMesh | null = null;
  group.traverse((o) => {
    if (!found && (o as THREE.InstancedMesh).isInstancedMesh && o.name === 'field-line-arrows') {
      found = o as THREE.InstancedMesh;
    }
  });
  return found;
}

function anyPlane(group: THREE.Object3D): boolean {
  let found = false;
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry?.type === 'PlaneGeometry') found = true;
  });
  return found;
}

describe('buildFieldLines', () => {
  it('packs all traced lines into a single native LineSegments object', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const segments = fieldLineSegments(group);
    expect(segments).not.toBeNull();
    expect(segments!.geometry).toBeTruthy();
    expect(segments!.isLineSegments).toBeTrue();
  });

  it('enables frustum culling on static field geometry', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    expect(fieldLineSegments(group)!.frustumCulled).toBeTrue();
  });

  it('adds direction arrowheads and never a slice/plane mesh', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    expect(arrowMesh(group)).not.toBeNull();
    expect(arrowMesh(group)!.count).toBeGreaterThan(0);
    expect(anyPlane(group)).toBeFalse();
  });

  it('points arrowheads along +B (≈ +z) in a uniform Bz field', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const mesh = arrowMesh(group)!;
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(0, matrix);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    matrix.decompose(pos, quat, scl);
    const dir = new THREE.Vector3(0, 1, 0).applyQuaternion(quat);
    expect(dir.z).toBeGreaterThan(0.9);
  });

  it('dense density produces more geometry than sparse', () => {
    const sparse = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const dense = buildFieldLines(uniformZField, { scale: 1e-2, density: 'dense' });
    expect(arrowMesh(dense)!.count).toBeGreaterThan(arrowMesh(sparse)!.count);
  });

  it('returns an empty group when the field is everywhere negligible', () => {
    const group = buildFieldLines(() => ({ x: 0, y: 0, z: 0 }), { scale: 1e-2, density: 'sparse' });
    expect(fieldLineSegments(group)).toBeNull();
    expect(arrowMesh(group)).toBeNull();
  });

  it('setFieldLinesOpacity updates both line and arrow materials', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse', opacity: 0.7 });
    setFieldLinesOpacity(group, 0.3);
    const segments = fieldLineSegments(group)!;
    expect((segments.material as THREE.Material).opacity).toBeCloseTo(0.3, 6);
    expect((arrowMesh(group)!.material as THREE.Material).opacity).toBeCloseTo(0.3, 6);
  });

  it('boosts drawn opacity and darkens vertex colours in light mode', () => {
    const dark = buildFieldLines(uniformZField, {
      scale: 1e-2,
      density: 'sparse',
      opacity: 0.65,
      darkMode: true,
    });
    const light = buildFieldLines(uniformZField, {
      scale: 1e-2,
      density: 'sparse',
      opacity: 0.65,
      darkMode: false,
    });
    const darkMat = fieldLineSegments(dark)!.material as THREE.Material;
    const lightMat = fieldLineSegments(light)!.material as THREE.Material;
    expect(darkMat.opacity).toBeCloseTo(0.65, 6);
    expect(lightMat.opacity).toBeCloseTo(effectiveFieldOpacity(0.65, false), 6);
    expect(lightMat.opacity).toBeGreaterThan(darkMat.opacity);
    expect(lightMat.opacity).toBeCloseTo(0.65 * LIGHT_MODE_FIELD_OPACITY_BOOST, 6);

    const darkColor = fieldLineSegments(dark)!.geometry.attributes['color'];
    const lightColor = fieldLineSegments(light)!.geometry.attributes['color'];
    const darkLuma = 0.299 * darkColor.getX(0) + 0.587 * darkColor.getY(0) + 0.114 * darkColor.getZ(0);
    const lightLuma =
      0.299 * lightColor.getX(0) + 0.587 * lightColor.getY(0) + 0.114 * lightColor.getZ(0);
    expect(lightLuma).toBeLessThan(darkLuma);

    setFieldLinesDarkMode(light, true);
    expect((fieldLineSegments(light)!.material as THREE.Material).opacity).toBeCloseTo(0.65, 6);
  });

  it('setFieldLinesWidth stores linewidth for UI without requiring fat LineMaterial', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse', linewidth: 2 });
    setFieldLinesWidth(group, 4.5);
    expect(group.userData['linewidth']).toBeCloseTo(4.5, 6);
  });

  it('matches particle-track depth stack (depthTest + depthWrite)', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const mat = fieldLineSegments(group)!.material as THREE.Material;
    expect(mat.depthTest).toBeTrue();
    expect(mat.depthWrite).toBeTrue();
    expect((arrowMesh(group)!.material as THREE.Material).depthTest).toBeTrue();
    expect((arrowMesh(group)!.material as THREE.Material).depthWrite).toBeTrue();
  });

  it('draws above every detector layer at a fixed renderOrder (regression: used to default to 0)', () => {
    // A renderOrder of 0 puts the whole field-line mesh in the same unstable,
    // camera-distance-sorted transparent queue as the detector shells, so it
    // can flip from "in front of" to "behind" a shell as the camera orbits.
    // FIELD_LINE_RENDER_ORDER gives it a fixed, layer-independent slot.
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    expect(fieldLineSegments(group)!.renderOrder).toBe(FIELD_LINE_RENDER_ORDER);
    expect(arrowMesh(group)!.renderOrder).toBeGreaterThan(FIELD_LINE_RENDER_ORDER);
    // Sits above every detector layer band (max ~11 * RENDER_ORDER_LAYER_STRIDE
    // for the current 12-part detector set), never inside one.
    expect(FIELD_LINE_RENDER_ORDER).toBeGreaterThan(11 * RENDER_ORDER_LAYER_STRIDE);
  });

  it('enables vertex colours mapped from |B|', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const segments = fieldLineSegments(group)!;
    const mat = segments.material as THREE.LineBasicMaterial;
    expect(mat.vertexColors).toBeTrue();
    expect(segments.geometry.attributes['color']).toBeTruthy();
  });

  it('maps weak and strong |B| to different vertex colours', () => {
    const weak = (): Vec3 => ({ x: 0, y: 0, z: 0.3 });
    const strong = (): Vec3 => ({ x: 0, y: 0, z: 0.58 });
    const weakSeg = fieldLineSegments(buildFieldLines(weak, { scale: 1e-2, density: 'sparse' }))!;
    const strongSeg = fieldLineSegments(buildFieldLines(strong, { scale: 1e-2, density: 'sparse' }))!;
    const weakColor = weakSeg.geometry.attributes['color'];
    const strongColor = strongSeg.geometry.attributes['color'];
    expect(weakColor).toBeTruthy();
    expect(strongColor).toBeTruthy();
    // Weak = deep blue (higher B); strong = bright red (higher R).
    expect(weakColor.getZ(0)).toBeGreaterThan(strongColor.getZ(0));
    expect(weakColor.getX(0)).toBeLessThan(strongColor.getX(0));
  });

  it('recolours from stored magnitudes without rebuilding geometry', () => {
    const group = buildFieldLines(uniformZField, {
      scale: 1e-2,
      density: 'sparse',
      colorRange: fieldColorRangeForStrength(0.5),
    });
    const segments = fieldLineSegments(group)!;
    const positionsBefore = (segments.geometry.attributes['position'].array as Float32Array).slice();
    const colorBefore = (segments.geometry.attributes['color'].array as Float32Array).slice(0, 3);

    setFieldLinesColorRange(group, fieldColorRangeForStrength(2), 4);
    const colorAfter = segments.geometry.attributes['color'].array as Float32Array;
    const positionsAfter = segments.geometry.attributes['position'].array as Float32Array;

    expect(positionsAfter).toEqual(positionsBefore);
    // Same relative palette position after proportional scale — colours stay put.
    expect(colorAfter[0]).toBeCloseTo(colorBefore[0], 5);
    expect(colorAfter[1]).toBeCloseTo(colorBefore[1], 5);
    expect(colorAfter[2]).toBeCloseTo(colorBefore[2], 5);
    expect(group.userData['fieldMagnitudeScale']).toBe(4);
  });
});
