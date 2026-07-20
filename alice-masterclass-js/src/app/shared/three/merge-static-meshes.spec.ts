import * as THREE from 'three';
import { mergeStaticMeshesByMaterial, toNonInterleavedGeometry } from './merge-static-meshes';

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((o) => {
    if ((o as { isMesh?: boolean }).isMesh) count += 1;
  });
  return count;
}

describe('mergeStaticMeshesByMaterial', () => {
  it('collapses many nodes sharing one material/geometry into a single draw call', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    for (let i = 0; i < 50; i++) {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(i, 0, 0);
      root.add(mesh);
    }

    const merged = mergeStaticMeshesByMaterial(root);

    expect(countMeshes(merged)).toBe(1);
    const mergedMesh = merged.children[0] as THREE.Mesh;
    expect((mergedMesh.geometry as THREE.BufferGeometry).attributes.position.count).toBe(
      50 * geometry.attributes.position.count
    );
  });

  it('bakes each node world transform, preserving the original world-space bounding box', () => {
    const root = new THREE.Group();
    root.position.set(10, 0, 0);
    const geometry = new THREE.BoxGeometry(2, 2, 2);
    const materialA = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const materialB = new THREE.MeshBasicMaterial({ color: 0x0000ff });

    const meshA = new THREE.Mesh(geometry, materialA);
    meshA.position.set(5, 0, 0);
    root.add(meshA);

    const meshB = new THREE.Mesh(geometry, materialB);
    meshB.position.set(-5, 3, 0);
    root.add(meshB);

    const originalBox = new THREE.Box3().setFromObject(root);

    const merged = mergeStaticMeshesByMaterial(root);
    merged.updateMatrixWorld(true);
    const mergedBox = new THREE.Box3().setFromObject(merged);

    expect(countMeshes(merged)).toBe(2); // different materials stay separate.
    expect(mergedBox.min.toArray()).toEqual(originalBox.min.toArray());
    expect(mergedBox.max.toArray()).toEqual(originalBox.max.toArray());
  });

  it('keeps multi-material meshes untouched (passthrough), just baked in place', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const materials = [new THREE.MeshBasicMaterial({ color: 0xff0000 }), new THREE.MeshBasicMaterial({ color: 0x00ff00 })];
    const multiMaterialMesh = new THREE.Mesh(geometry, materials);
    root.add(multiMaterialMesh);

    const merged = mergeStaticMeshesByMaterial(root);

    expect(countMeshes(merged)).toBe(1);
    const passthroughMesh = merged.children[0] as THREE.Mesh;
    expect(Array.isArray(passthroughMesh.material)).toBe(true);
  });

  it('returns an empty group for an object with no meshes', () => {
    const root = new THREE.Group();
    root.add(new THREE.Object3D());

    const merged = mergeStaticMeshesByMaterial(root);

    expect(countMeshes(merged)).toBe(0);
  });

  it('deinterleaves gltfpack-style attributes so mergeGeometries can batch them', () => {
    const root = new THREE.Group();
    const material = new THREE.MeshBasicMaterial({ color: 0x2b6cff });
    // Two box meshes sharing one interleaved position+normal buffer (as gltfpack emits).
    const proto = new THREE.BoxGeometry(1, 1, 1);
    const interleaved = new THREE.InterleavedBuffer(
      new Float32Array([
        // pos.xyz + nrm.xyz per vertex — 8 verts * 6 floats
        ...Array.from({ length: 8 }, (_, i) => {
          const p = proto.attributes.position;
          const n = proto.attributes.normal;
          return [p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)];
        }).flat(),
      ]),
      6
    );
    const makeInterleavedGeo = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.InterleavedBufferAttribute(interleaved, 3, 0));
      g.setAttribute('normal', new THREE.InterleavedBufferAttribute(interleaved, 3, 3));
      g.setIndex(proto.index!.clone());
      return g;
    };

    for (let i = 0; i < 4; i++) {
      const mesh = new THREE.Mesh(makeInterleavedGeo(), material);
      mesh.position.set(i * 2, 0, 0);
      root.add(mesh);
    }

    const plain = toNonInterleavedGeometry(makeInterleavedGeo());
    expect(
      (plain.attributes.position as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute
    ).toBeFalsy();

    const merged = mergeStaticMeshesByMaterial(root);
    expect(countMeshes(merged)).toBe(1);
    const box = new THREE.Box3().setFromObject(merged);
    expect(box.isEmpty()).toBe(false);
    expect(box.getSize(new THREE.Vector3()).x).toBeGreaterThan(6);
  });
});
