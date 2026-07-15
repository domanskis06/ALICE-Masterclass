import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial';

import {
  buildFieldLines,
  setFieldLinesOpacity,
  setFieldLinesWidth,
} from './field-line-visualizer';
import { Vec3 } from '../physics/propagation-types';

/** Uniform 0.5 T field along +z, like the ALICE solenoid interior. */
const uniformZField = (): Vec3 => ({ x: 0, y: 0, z: 0.5 });

function lineSegments2(group: THREE.Object3D): LineSegments2 | null {
  let found: LineSegments2 | null = null;
  group.traverse((o) => {
    if (!found && (o as LineSegments2).isLineSegments2) found = o as LineSegments2;
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
  it('packs all traced lines into a single LineSegments2 object', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const segments = lineSegments2(group);
    expect(segments).not.toBeNull();
    expect(segments!.geometry).toBeTruthy();
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
    // ConeGeometry points +Y; after rotation it must point ~+z (= +B̂).
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
    expect(lineSegments2(group)).toBeNull();
    expect(arrowMesh(group)).toBeNull();
  });

  it('setFieldLinesOpacity updates both line and arrow materials', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse', opacity: 0.7 });
    setFieldLinesOpacity(group, 0.3);
    const segments = lineSegments2(group)!;
    expect((segments.material as LineMaterial).opacity).toBeCloseTo(0.3, 6);
    expect((arrowMesh(group)!.material as THREE.Material).opacity).toBeCloseTo(0.3, 6);
  });

  it('setFieldLinesWidth updates the LineMaterial linewidth', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse', linewidth: 2 });
    setFieldLinesWidth(group, 4.5);
    expect((lineSegments2(group)!.material as LineMaterial).linewidth).toBeCloseTo(4.5, 6);
  });

  it('uses default depthTest like particle tracks (occluded by detector geometry)', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    expect((lineSegments2(group)!.material as LineMaterial).depthTest).toBeTrue();
    expect((arrowMesh(group)!.material as THREE.Material).depthTest).toBeTrue();
    expect(lineSegments2(group)!.renderOrder).toBe(0);
    expect(arrowMesh(group)!.renderOrder).toBe(0);
  });
});
