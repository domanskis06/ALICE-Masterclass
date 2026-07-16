import * as THREE from 'three';
import { isCadHelperCubeName, stripCadHelperCubes } from './cad-helper-cubes';

describe('cad-helper-cubes', () => {
  it('matches Blender and plain CAD cube names', () => {
    expect(isCadHelperCubeName('Cube')).toBe(true);
    expect(isCadHelperCubeName('cube')).toBe(true);
    expect(isCadHelperCubeName('Cube.001')).toBe(true);
    expect(isCadHelperCubeName('Cube.002')).toBe(true);
    expect(isCadHelperCubeName('Cube1')).toBe(true);
    expect(isCadHelperCubeName('Cube12')).toBe(true);
  });

  it('does not match real detector node names', () => {
    expect(isCadHelperCubeName('ITS')).toBe(false);
    expect(isCadHelperCubeName('RibVolume_1')).toBe(false);
    expect(isCadHelperCubeName('Cube_helper')).toBe(false);
    expect(isCadHelperCubeName('MyCube')).toBe(false);
    expect(isCadHelperCubeName('')).toBe(false);
    expect(isCadHelperCubeName(null)).toBe(false);
  });

  it('strips helper cubes (and nested ones) from a scene graph', () => {
    const root = new THREE.Group();
    root.name = 'part';
    const keep = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    keep.name = 'RibVolume_1';
    const cube = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    cube.name = 'Cube';
    const cubeDot = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
    cubeDot.name = 'Cube.001';
    root.add(keep, cube, cubeDot);

    stripCadHelperCubes(root);

    const names: string[] = [];
    root.traverse((o) => names.push(o.name));
    expect(names).toContain('RibVolume_1');
    expect(names).not.toContain('Cube');
    expect(names).not.toContain('Cube.001');
  });
});
