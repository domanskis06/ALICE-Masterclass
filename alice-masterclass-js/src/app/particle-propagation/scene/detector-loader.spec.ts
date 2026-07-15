import * as THREE from 'three';
import { DETECTOR_PART_PATHS, DetectorModel, loadDetectorModel } from './detector-loader';

describe('loadDetectorModel', () => {
  /** One shared load — re-fetching all 8 GLBs per `it` freezes headless Chrome in CI. */
  let model: DetectorModel;

  beforeAll(async () => {
    model = await loadDetectorModel(DETECTOR_PART_PATHS, 1e-2);
  }, 60000);

  afterAll(() => {
    model?.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) mat?.dispose();
    });
  });

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

  it('loads all real detector GLBs into a recentered group with one toggleable part each', () => {
    expect(model.group).toBeInstanceOf(THREE.Group);
    expect(model.group.children.length).toBe(DETECTOR_PART_PATHS.length);
    expect(model.parts.length).toBe(DETECTOR_PART_PATHS.length);

    for (const part of model.parts) {
      expect(DETECTOR_PART_PATHS).toContain(part.assetPath);
      expect(part.label.length).toBeGreaterThan(0);
      expect(part.root).toBeDefined();
    }

    for (const part of model.group.children) {
      const box = new THREE.Box3().setFromObject(part);
      const size = box.getSize(new THREE.Vector3());
      expect(size.length()).toBeGreaterThan(0);
      expect(size.length()).toBeLessThan(50); // detector ~500cm across -> ~5 units at 1e-2 scale.

      let sawMesh = false;
      part.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        sawMesh = true;
        const material = mesh.material as THREE.Material;
        expect(material.transparent).toBe(true);
        expect(material.opacity).toBeGreaterThan(0);
        expect(material.opacity).toBeLessThan(1);
        expect(material.depthWrite).toBe(true);
      });
      expect(sawMesh).toBe(true);
    }
  });

  it('recenters the model so the ITS (beam-pipe) center sits at the world origin', () => {
    model.group.updateMatrixWorld(true);
    const its = model.parts.find((p) => /\/its\.glb$/i.test(p.assetPath));
    expect(its).toBeDefined();
    const box = new THREE.Box3().setFromObject(its!.root);
    const center = box.getCenter(new THREE.Vector3());
    expect(Math.abs(center.x)).toBeLessThan(0.05);
    expect(Math.abs(center.y)).toBeLessThan(0.05);
    expect(Math.abs(center.z)).toBeLessThan(0.05);
  });

  it('collapses each part down to a small number of draw calls (one per unique material)', () => {
    for (const part of model.group.children) {
      let meshCount = 0;
      part.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) meshCount += 1;
      });
      expect(meshCount).toBeGreaterThan(0);
      expect(meshCount).toBeLessThan(50);
    }
  });

  it('skips (does not reject) an unresolvable path, still returning the parts that loaded', async () => {
    const errorSpy = spyOn(console, 'error');
    const paths = [
      DETECTOR_PART_PATHS[0],
      'assets/models/alice components/does-not-exist.glb',
    ];
    const partial = await loadDetectorModel(paths, 1e-2);
    expect(partial.group.children.length).toBe(1);
    expect(partial.parts.length).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  }, 20000);
});
