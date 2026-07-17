import * as THREE from 'three';
import { DETECTOR_PART_PATHS, DetectorModel, loadDetectorModel } from './detector-loader';
import {
  ITS_LOD_FAR_DISTANCE,
  MUON_AUX_LOD_FAR_DISTANCE,
  OUTER_MAGNET_DEFAULT_OPACITY,
  OUTER_MAGNET_LOD_FAR_DISTANCE,
  TPC_LOD_FAR_DISTANCE,
} from './detector-appearance';

describe('loadDetectorModel', () => {
  /** One shared load — re-fetching all GLBs per `it` freezes headless Chrome in CI. */
  let model: DetectorModel;

  beforeAll(async () => {
    model = await loadDetectorModel(DETECTOR_PART_PATHS, 1e-2);
  }, 90000);

  afterAll(() => {
    model?.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) mat?.dispose();
    });
  });

  it('lists the PP detector assembly including forward muon-system layers', () => {
    expect(DETECTOR_PART_PATHS).toEqual([
      'assets/models/alice components/its.glb',
      'assets/models/alice components/tpc.glb',
      'assets/models/alice components/TRD.glb',
      'assets/models/alice components/TOF.glb',
      'assets/models/alice components/EMCAL.glb',
      'assets/models/alice components/DCAL.glb',
      'assets/models/alice components/PHOS.glb',
      'assets/models/alice components/L3.glb',
      'assets/models/alice components/MCH.glb',
      'assets/models/alice components/ABSO.glb',
      'assets/models/alice components/SHIL.glb',
      'assets/models/alice components/DIPO.glb',
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

    for (const part of model.parts) {
      const box = new THREE.Box3().setFromObject(part.root);
      const size = box.getSize(new THREE.Vector3());
      expect(size.length()).toBeGreaterThan(0);
      expect(size.length()).toBeLessThan(50); // detector ~500cm across -> ~5 units at 1e-2 scale.

      const isL3 = /l3\.glb$/i.test(part.assetPath);
      let sawMesh = false;
      part.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        sawMesh = true;
        const material = mesh.material as THREE.Material;
        expect(material.depthWrite).toBe(true);
        expect(material.opacity).toBeGreaterThan(0);
        if (isL3) {
          expect(material.opacity).toBeCloseTo(OUTER_MAGNET_DEFAULT_OPACITY, 5);
          expect(material.transparent).toBe(true);
        } else {
          expect(material.transparent).toBe(true);
          expect(material.opacity).toBeLessThan(1);
        }
      });
      expect(sawMesh).toBe(true);
    }
  });

  it('wraps L3 in a distance LOD of InstancedMesh sector families (no material merge)', () => {
    const l3 = model.parts.find((p) => /l3\.glb$/i.test(p.assetPath));
    expect(l3).toBeDefined();
    expect(l3!.root).toBeInstanceOf(THREE.LOD);
    const lod = l3!.root as THREE.LOD;
    expect(lod.levels.length).toBe(2);
    expect(lod.levels[0].distance).toBe(0);
    expect(lod.levels[1].distance).toBe(OUTER_MAGNET_LOD_FAR_DISTANCE);

    const countInstanced = (root: THREE.Object3D): number => {
      let n = 0;
      root.traverse((obj) => {
        if ((obj as THREE.InstancedMesh).isInstancedMesh) n += 1;
      });
      return n;
    };
    const instanceCount = (root: THREE.Object3D): number => {
      let n = 0;
      root.traverse((obj) => {
        const mesh = obj as THREE.InstancedMesh;
        if (mesh.isInstancedMesh) n += mesh.count;
      });
      return n;
    };
    expect(countInstanced(lod.levels[0].object)).toBeGreaterThanOrEqual(3);
    expect(instanceCount(lod.levels[1].object)).toBeLessThan(instanceCount(lod.levels[0].object));
  });

  it('wraps TPC in a distance LOD with a lighter far level (thinned + decimated)', () => {
    const tpc = model.parts.find((p) => /tpc\.glb$/i.test(p.assetPath));
    expect(tpc).toBeDefined();
    expect(tpc!.root).toBeInstanceOf(THREE.LOD);
    const lod = tpc!.root as THREE.LOD;
    expect(lod.levels.length).toBe(2);
    expect(lod.levels[0].distance).toBe(0);
    expect(lod.levels[1].distance).toBe(TPC_LOD_FAR_DISTANCE);

    const triCount = (root: THREE.Object3D): number => {
      let tris = 0;
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry as THREE.BufferGeometry;
        tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      });
      return tris;
    };
    expect(triCount(lod.levels[1].object)).toBeLessThan(triCount(lod.levels[0].object));
  });

  it('wraps ITS in a distance LOD with a lighter far level (decimated Mesh_0)', () => {
    const its = model.parts.find((p) => /its\.glb$/i.test(p.assetPath));
    expect(its).toBeDefined();
    expect(its!.root).toBeInstanceOf(THREE.LOD);
    const lod = its!.root as THREE.LOD;
    expect(lod.levels.length).toBe(2);
    expect(lod.levels[0].distance).toBe(0);
    expect(lod.levels[1].distance).toBe(ITS_LOD_FAR_DISTANCE);

    const triCount = (root: THREE.Object3D): number => {
      let tris = 0;
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry as THREE.BufferGeometry;
        tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      });
      return tris;
    };
    expect(triCount(lod.levels[1].object)).toBeLessThan(triCount(lod.levels[0].object));
  });

  it('wraps MCH / ABSO / SHIL in distance LODs with lighter far levels', () => {
    const triCount = (root: THREE.Object3D): number => {
      let tris = 0;
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry as THREE.BufferGeometry;
        tris += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
      });
      return tris;
    };

    for (const re of [/mch\.glb$/i, /abso\.glb$/i, /shil\.glb$/i, /dipo\.glb$/i]) {
      const part = model.parts.find((p) => re.test(p.assetPath));
      expect(part).toBeDefined();
      expect(part!.label.length).toBeGreaterThan(0);
      expect(part!.root).toBeInstanceOf(THREE.LOD);
      const lod = part!.root as THREE.LOD;
      expect(lod.levels.length).toBe(2);
      expect(lod.levels[1].distance).toBe(MUON_AUX_LOD_FAR_DISTANCE);
      expect(triCount(lod.levels[1].object)).toBeLessThanOrEqual(triCount(lod.levels[0].object));
    }
  });

  it('freezes detector transforms after load (static scene graph)', () => {
    expect(model.group.matrixAutoUpdate).toBe(false);
    model.group.traverse((obj) => {
      expect(obj.matrixAutoUpdate).toBe(false);
    });
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

  it('lifts muon-arm parts so near-symmetric shells sit on the ITS beam axis (Y)', () => {
    model.group.updateMatrixWorld(true);
    // MCH / SHIL are roughly cylindrical about the beam — their AABB centre Y
    // should land near 0 after the +30 cm frame lift + ITS recenter. ABSO/DIPO
    // are asymmetric so AABB centre is not a reliable pipe proxy.
    for (const re of [/\/mch\.glb$/i, /\/shil\.glb$/i]) {
      const part = model.parts.find((p) => re.test(p.assetPath));
      expect(part).toBeDefined();
      const center = new THREE.Box3().setFromObject(part!.root).getCenter(new THREE.Vector3());
      expect(Math.abs(center.x)).toBeLessThan(0.05);
      expect(Math.abs(center.y)).toBeLessThan(0.05);
    }
  });

  it('collapses each non-LOD part down to a small number of draw calls', () => {
    for (const part of model.parts) {
      if ((part.root as THREE.LOD).isLOD) continue;
      let meshCount = 0;
      part.root.traverse((obj) => {
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
