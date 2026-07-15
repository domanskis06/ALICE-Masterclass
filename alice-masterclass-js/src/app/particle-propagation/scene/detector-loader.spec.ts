import * as THREE from 'three';
import { DETECTOR_PART_PATHS, loadDetectorModel } from './detector-loader';

describe('loadDetectorModel', () => {
  it('lists the same 8 ALICE parts as StrangenessVisualAnalysisComponent.ALICE_DETECTOR_MODEL', () => {
    expect(DETECTOR_PART_PATHS).toEqual([
      'assets/models/alice components/its.glb',
      'assets/models/alice components/tpc.glb',
      'assets/models/alice components/TRD.glb',
      'assets/models/alice components/TOF.glb',
      'assets/models/alice components/EMCal_Dcal.glb',
      'assets/models/alice components/DCAL.glb',
      'assets/models/alice components/PHOS.glb',
      'assets/models/alice components/L3.glb',
    ]);
  });

  it('loads all real detector GLBs into a recentered group with one toggleable part each', async () => {
    const model = await loadDetectorModel(DETECTOR_PART_PATHS, 1e-2);

    expect(model.group).toBeInstanceOf(THREE.Group);
    expect(model.group.children.length).toBe(DETECTOR_PART_PATHS.length);
    expect(model.parts.length).toBe(DETECTOR_PART_PATHS.length);

    // Each part is exposed with a path + human label + its scene root.
    for (const part of model.parts) {
      expect(DETECTOR_PART_PATHS).toContain(part.assetPath);
      expect(part.label.length).toBeGreaterThan(0);
      expect(part.root).toBeDefined();
    }

    for (const part of model.group.children) {
      // Scale is baked into merged vertex data; assert on the real-world size.
      const box = new THREE.Box3().setFromObject(part);
      const size = box.getSize(new THREE.Vector3());
      expect(size.length()).toBeGreaterThan(0);
      expect(size.length()).toBeLessThan(50); // detector ~500cm across -> ~5 units at 1e-2 scale.

      let sawMesh = false;
      part.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!(mesh as THREE.Mesh).isMesh) return;
        sawMesh = true;
        const material = mesh.material as THREE.Material;
        // Perf: translucent but still depth-writing (no runaway overdraw).
        expect(material.transparent).toBe(true);
        expect(material.opacity).toBeGreaterThan(0);
        expect(material.opacity).toBeLessThan(1);
        expect(material.depthWrite).toBe(true);
      });
      expect(sawMesh).toBe(true);
    }
  }, 20000);

  it('recenters the model so the ITS (beam-pipe) center sits at the world origin', async () => {
    const model = await loadDetectorModel(DETECTOR_PART_PATHS, 1e-2);
    model.group.updateMatrixWorld(true);
    const its = model.parts.find((p) => /\/its\.glb$/i.test(p.assetPath));
    expect(its).toBeDefined();
    const box = new THREE.Box3().setFromObject(its!.root);
    const center = box.getCenter(new THREE.Vector3());
    // Tracks and the collision intro start at (0,0,0); the ITS tube axis must match.
    expect(Math.abs(center.x)).toBeLessThan(0.05);
    expect(Math.abs(center.y)).toBeLessThan(0.05);
    expect(Math.abs(center.z)).toBeLessThan(0.05);
  }, 20000);

  it('collapses each part down to a small number of draw calls (one per unique material)', async () => {
    const model = await loadDetectorModel(DETECTOR_PART_PATHS, 1e-2);

    for (const part of model.group.children) {
      let meshCount = 0;
      part.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) meshCount += 1;
      });
      expect(meshCount).toBeGreaterThan(0);
      expect(meshCount).toBeLessThan(50);
    }
  }, 20000);

  it('skips (does not reject) an unresolvable path, still returning the parts that loaded', async () => {
    const paths = [...DETECTOR_PART_PATHS.slice(0, 2), 'assets/models/alice components/does-not-exist.glb'];
    const model = await loadDetectorModel(paths, 1e-2);
    expect(model.group.children.length).toBe(2);
    expect(model.parts.length).toBe(2);
  }, 20000);
});
