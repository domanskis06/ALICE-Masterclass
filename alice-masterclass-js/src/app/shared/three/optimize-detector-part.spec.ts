import * as THREE from 'three';
import {
  isMergeOnlyDetectorPart,
  mustPreserveDetectorSceneGraph,
  optimizeStaticDetectorPart,
  pruneTinyDetectorMeshes,
} from './optimize-detector-part';

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((o) => {
    if ((o as { isMesh?: boolean }).isMesh) count += 1;
  });
  return count;
}

describe('optimizeStaticDetectorPart', () => {
  it('classifies calorimeter / merge-only / other layers', () => {
    expect(mustPreserveDetectorSceneGraph('assets/models/alice components/EMCAL.glb')).toBe(true);
    expect(mustPreserveDetectorSceneGraph('assets/models/alice components/DCAL.glb')).toBe(true);
    expect(isMergeOnlyDetectorPart('assets/models/alice components/its.glb')).toBe(true);
    expect(isMergeOnlyDetectorPart('assets/models/alice components/tpc.glb')).toBe(true);
    expect(isMergeOnlyDetectorPart('assets/models/alice components/FIT.glb')).toBe(false);
  });

  it('prunes only sub-threshold meshes', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat));
    root.add(new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), mat));
    expect(pruneTinyDetectorMeshes(root, 1.5)).toBe(1);
    expect(countMeshes(root)).toBe(1);
  });

  it('merges ITS / TPC without pruning tiny fragments', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), mat);
      mesh.position.set(i * 5, 0, 0);
      root.add(mesh);
    }
    // Screw-sized fragment must survive on ITS/TPC (merge-only path).
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat));

    const optimized = optimizeStaticDetectorPart(root, 'assets/models/alice components/its.glb');
    expect(countMeshes(optimized)).toBe(1);
    const posCount = ((optimized.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry)
      .attributes.position.count;
    // 10 large boxes + 1 tiny box worth of vertices.
    expect(posCount).toBe(11 * 24);
  });

  it('prunes then merges non-ITS/TPC layers', () => {
    const root = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    for (let i = 0; i < 10; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), mat);
      mesh.position.set(i * 5, 0, 0);
      root.add(mesh);
    }
    root.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat));

    const optimized = optimizeStaticDetectorPart(root, 'assets/models/alice components/FIT.glb');
    expect(countMeshes(optimized)).toBe(1);
    const posCount = ((optimized.children[0] as THREE.Mesh).geometry as THREE.BufferGeometry)
      .attributes.position.count;
    expect(posCount).toBe(10 * 24);
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
