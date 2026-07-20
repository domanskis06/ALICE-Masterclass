/**
 * Merges GLTF-loaded static meshes that share the same material into a single
 * draw call per material, baking each node's world transform into the merged
 * vertex data.
 *
 * Why this exists: the ALICE detector GLB parts (`assets/models/alice
 * components/*.glb`) model repeated fine structure — e.g. individual
 * calorimeter crystals/towers — as thousands of scene-graph *nodes* that all
 * reference the same handful of tiny mesh definitions (a few triangles each).
 * Three.js does not auto-batch this: every node instance is its own draw call,
 * so the actual rendering cost is dominated by draw-call/CPU overhead (matrix
 * updates, state changes), not triangle count. Merging collapses an entire
 * part down to ~1 draw call per unique material, which is what actually makes
 * orbiting/zooming smooth.
 *
 * Only safe for **static** geometry that will never be independently
 * transformed after this call (true for the read-only detector shell in both
 * `EventDisplayComponent` and Particle Propagation's `detector-loader.ts`).
 * Skinned/morphed meshes and meshes with multiple material slots are passed
 * through unmerged (rare/absent in these assets, but preserved for safety).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils';

function isMergeableSingleMaterialMesh(obj: THREE.Object3D): obj is THREE.Mesh {
  const mesh = obj as THREE.Mesh & { isSkinnedMesh?: boolean };
  return (
    (mesh as { isMesh?: boolean }).isMesh === true &&
    !mesh.isSkinnedMesh &&
    !mesh.morphTargetInfluences &&
    !Array.isArray(mesh.material) &&
    !!mesh.material &&
    !!(mesh.geometry as THREE.BufferGeometry | undefined)?.isBufferGeometry
  );
}

/**
 * Copies a geometry into a plain (non-interleaved) BufferGeometry.
 *
 * `gltfpack` / meshoptimizer emit InterleavedBufferAttributes. Three's
 * `mergeGeometries` rejects those, and `applyMatrix4` on a shared interleaved
 * buffer can also corrupt quantized positions — which made the muon-arm GLBs
 * (ABSO/SHIL/MCH/DIPO) vanish after `mergeStaticMeshesByMaterial`.
 */
export function toNonInterleavedGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(source.attributes)) {
    const attr = source.attributes[name];
    if ((attr as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
      const interleaved = attr as THREE.InterleavedBufferAttribute;
      const itemSize = interleaved.itemSize;
      const count = interleaved.count;
      const array = new Float32Array(count * itemSize);
      for (let i = 0; i < count; i++) {
        if (itemSize >= 1) array[i * itemSize] = interleaved.getX(i);
        if (itemSize >= 2) array[i * itemSize + 1] = interleaved.getY(i);
        if (itemSize >= 3) array[i * itemSize + 2] = interleaved.getZ(i);
        if (itemSize >= 4) array[i * itemSize + 3] = interleaved.getW(i);
      }
      out.setAttribute(name, new THREE.BufferAttribute(array, itemSize, false));
    } else {
      out.setAttribute(name, (attr as THREE.BufferAttribute).clone());
    }
  }
  if (source.index) {
    out.setIndex(source.index.clone());
  }
  return out;
}

/**
 * Returns a new `Object3D` visually equivalent to `root` (same world-space
 * appearance, assuming it's re-parented where `root` would have been), but
 * with far fewer meshes. `root` itself is left untouched but should be
 * discarded by the caller — its geometries are cloned, not reused, and it is
 * never added to the scene.
 */
export function mergeStaticMeshesByMaterial(root: THREE.Object3D): THREE.Object3D {
  root.updateMatrixWorld(true);

  const geometriesByMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const passthrough: THREE.Mesh[] = [];

  root.traverse((obj) => {
    if (!isMergeableSingleMaterialMesh(obj)) {
      if ((obj as { isMesh?: boolean }).isMesh) passthrough.push(obj as THREE.Mesh);
      return;
    }
    const baked = toNonInterleavedGeometry(obj.geometry as THREE.BufferGeometry).applyMatrix4(
      obj.matrixWorld
    );
    const material = obj.material as THREE.Material;
    const list = geometriesByMaterial.get(material);
    if (list) {
      list.push(baked);
    } else {
      geometriesByMaterial.set(material, [baked]);
    }
  });

  const merged = new THREE.Group();
  merged.name = root.name;
  merged.userData = { ...root.userData };

  for (const [material, geometries] of geometriesByMaterial) {
    const mergedGeometry = geometries.length > 1 ? mergeGeometries(geometries) : geometries[0];
    if (!mergedGeometry) continue;
    merged.add(new THREE.Mesh(mergedGeometry, material));
    if (geometries.length > 1) {
      geometries.forEach((geometry) => geometry.dispose());
    }
  }

  for (const mesh of passthrough) {
    const baked = toNonInterleavedGeometry(mesh.geometry as THREE.BufferGeometry).applyMatrix4(
      mesh.matrixWorld
    );
    merged.add(new THREE.Mesh(baked, mesh.material));
  }

  return merged;
}
