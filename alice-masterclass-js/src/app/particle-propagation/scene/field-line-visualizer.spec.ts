import * as THREE from 'three';

import {
  buildFieldLines,
  setFieldLinesOpacity,
  setFieldLinesWidth,
} from './field-line-visualizer';
import { Vec3 } from '../physics/propagation-types';

/** Uniform 0.5 T field along +z, like the ALICE solenoid interior. */
const uniformZField = (): Vec3 => ({ x: 0, y: 0, z: 0.5 });

function fieldLineSegments(group: THREE.Object3D): LineSegments2Like | null {
  let found: LineSegments2Like | null = null;
  group.traverse((o) => {
    if (!found && (o as LineSegments2Like).isLineSegments2 && o.name === 'field-line-segments') {
      found = o as LineSegments2Like;
    }
  });
  return found;
}

interface LineSegments2Like extends THREE.Object3D {
  isLineSegments2: true;
  material: THREE.Material;
  geometry: THREE.BufferGeometry & { attributes: Record<string, THREE.BufferAttribute> };
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
  it('packs all traced lines into a single fat LineSegments2 object', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const segments = fieldLineSegments(group);
    expect(segments).not.toBeNull();
    expect(segments!.geometry).toBeTruthy();
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

  it('setFieldLinesWidth updates LineMaterial linewidth', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse', linewidth: 2 });
    setFieldLinesWidth(group, 4.5);
    expect(group.userData['linewidth']).toBeCloseTo(4.5, 6);
    expect(((fieldLineSegments(group)!.material as unknown) as { linewidth: number }).linewidth).toBeCloseTo(4.5, 6);
  });

  it('matches particle-track depth stack (depthTest + depthWrite)', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const mat = fieldLineSegments(group)!.material as THREE.Material;
    expect(mat.depthTest).toBeTrue();
    expect(mat.depthWrite).toBeTrue();
    expect(fieldLineSegments(group)!.renderOrder).toBe(0);
    expect((arrowMesh(group)!.material as THREE.Material).depthTest).toBeTrue();
    expect((arrowMesh(group)!.material as THREE.Material).depthWrite).toBeTrue();
  });

  it('enables vertex colours mapped from |B|', () => {
    const group = buildFieldLines(uniformZField, { scale: 1e-2, density: 'sparse' });
    const segments = fieldLineSegments(group)!;
    const mat = segments.material as { vertexColors: boolean };
    expect(mat.vertexColors).toBeTrue();
    // LineSegmentsGeometry stores colours as instance attribute `instanceColorStart`/`End`
    // or a combined buffer — either way the material must request vertex colours.
    const attrs = segments.geometry.attributes;
    const hasColor =
      !!attrs['instanceColorStart'] ||
      !!attrs['instanceColorEnd'] ||
      !!attrs['color'];
    expect(hasColor).toBeTrue();
  });

  it('maps weak and strong |B| to different vertex colours', () => {
    const weak = (): Vec3 => ({ x: 0, y: 0, z: 0.47 });
    const strong = (): Vec3 => ({ x: 0, y: 0, z: 0.51 });
    const weakSeg = fieldLineSegments(buildFieldLines(weak, { scale: 1e-2, density: 'sparse' }))!;
    const strongSeg = fieldLineSegments(buildFieldLines(strong, { scale: 1e-2, density: 'sparse' }))!;
    const weakStart =
      weakSeg.geometry.attributes['instanceColorStart'] || weakSeg.geometry.attributes['color'];
    const strongStart =
      strongSeg.geometry.attributes['instanceColorStart'] || strongSeg.geometry.attributes['color'];
    expect(weakStart).toBeTruthy();
    expect(strongStart).toBeTruthy();
    // Weak = deep blue (higher B); strong = bright red (higher R).
    expect(weakStart.getZ(0)).toBeGreaterThan(strongStart.getZ(0));
    expect(weakStart.getX(0)).toBeLessThan(strongStart.getX(0));
  });
});
