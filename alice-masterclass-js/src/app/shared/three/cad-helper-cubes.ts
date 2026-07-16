import * as THREE from 'three';

/**
 * Leftover Blender/CAD helper boxes baked into ALICE detector GLB exports
 * (`Cube`, `Cube.001`, `Cube1`, …). Not real detector geometry.
 */
export function isCadHelperCubeName(name: string | undefined | null): boolean {
  return /^Cube(\.\d+|\d+)?$/i.test(name || '');
}

/**
 * Detaches CAD helper cubes from the scene graph so they are neither rendered
 * nor folded into a material merge (Particle Propagation merges meshes by
 * material — `visible = false` alone would still bake them in).
 */
export function stripCadHelperCubes(root: THREE.Object3D): void {
  const victims: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (isCadHelperCubeName(obj.name)) victims.push(obj);
  });
  for (const obj of victims) {
    obj.removeFromParent();
  }
}
