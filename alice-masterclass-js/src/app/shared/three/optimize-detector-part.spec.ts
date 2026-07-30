import * as THREE from 'three';
import {
  optimizeStaticDetectorPart,
  shouldMergeDetectorPart,
} from './optimize-detector-part';

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((o) => {
    if ((o as { isMesh?: boolean }).isMesh) count += 1;
  });
  return count;
}

describe('optimizeStaticDetectorPart', () => {
  it('merges only ITS and TPC paths', () => {
    expect(shouldMergeDetectorPart('assets/models/alice components/its.glb')).toBe(true);
    expect(shouldMergeDetectorPart('assets/models/alice components/tpc.glb')).toBe(true);
    expect(shouldMergeDetectorPart('assets/models/alice components/FIT.glb')).toBe(false);
    expect(shouldMergeDetectorPart('assets/models/alice components/TRD.glb')).toBe(false);
    expect(shouldMergeDetectorPart('assets/models/alice components/EMCAL.glb')).toBe(false);
  });

  it('merges ITS / TPC nodes that share a material', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = 0; i < 20; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), mat);
      mesh.position.set(i * 5, 0, 0);
      root.add(mesh);
    }

    const optimized = optimizeStaticDetectorPart(root, 'assets/models/alice components/tpc.glb');
    expect(countMeshes(optimized)).toBe(1);
  });

  it('leaves non-ITS/TPC scene graphs untouched', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), mat);
      mesh.name = `Mesh_${i}`;
      mesh.position.set(i * 5, 0, 0);
      root.add(mesh);
    }

    const out = optimizeStaticDetectorPart(root, 'assets/models/alice components/FIT.glb');
    expect(out).toBe(root);
    expect(countMeshes(out)).toBe(8);
  });

  it('leaves EMCal scene graph untouched', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), mat);
      mesh.name = `SMOD_${i}`;
      mesh.position.set(i * 5, 0, 0);
      root.add(mesh);
    }

    const out = optimizeStaticDetectorPart(root, 'assets/models/alice components/EMCAL.glb');
    expect(out).toBe(root);
    expect(countMeshes(out)).toBe(8);
    expect(out.children.some((c) => c.name === 'SMOD_3')).toBe(true);
  });
});
