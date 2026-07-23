import * as THREE from 'three';
import {
  DETECTOR_PART_PATHS,
  DetectorModel,
  attachDeferredLowLods,
  isDetectorCorePart,
  isDetectorInnerPart,
  loadDetectorModel,
  loadDetectorModelProgressive,
} from './detector-loader';
import {
  MAX_LOW_TO_HIGH_DRAWABLE_RATIO,
  MUON_AUX_LOD_FAR_DISTANCE,
  OUTER_MAGNET_DEFAULT_OPACITY,
  OUTER_MAGNET_LOD_FAR_DISTANCE,
  RENDER_ORDER_LAYER_STRIDE,
  TPC_LOD_FAR_DISTANCE,
  countDetectorDrawables,
} from './detector-appearance';

describe('loadDetectorModel', () => {
  /** One shared load — re-fetching all GLBs per `it` freezes headless Chrome in CI. */
  let model: DetectorModel;

  beforeAll(async () => {
    // Eager Melax so LOD triangle assertions stay deterministic in CI.
    model = await loadDetectorModel(DETECTOR_PART_PATHS, 1e-2, true, false);
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

  it('lists the PP detector assembly inside→out (BP → barrel → L3 → muon arm)', () => {
    expect(DETECTOR_PART_PATHS).toEqual([
      'assets/models/alice components/BP.glb',
      'assets/models/alice components/its.glb',
      'assets/models/alice components/tpc.glb',
      'assets/models/alice components/TRD.glb',
      'assets/models/alice components/TOF.glb',
      'assets/models/alice components/EMCAL.glb',
      'assets/models/alice components/DCAL.glb',
      'assets/models/alice components/PHOS.glb',
      'assets/models/alice components/L3_pp.glb',
      'assets/models/alice components/ABSO.glb',
      'assets/models/alice components/DIPO.glb',
      'assets/models/alice components/MCH.glb',
    ]);
  });

  it('marks BP/ITS/TPC as the inner reveal wave', () => {
    expect(isDetectorInnerPart('assets/models/alice components/BP.glb')).toBe(true);
    expect(isDetectorInnerPart('assets/models/alice components/its.glb')).toBe(true);
    expect(isDetectorInnerPart('assets/models/alice components/tpc.glb')).toBe(true);
    expect(isDetectorInnerPart('assets/models/alice components/L3_pp.glb')).toBe(false);
    expect(isDetectorInnerPart('assets/models/alice components/TRD.glb')).toBe(false);
    expect(isDetectorCorePart('assets/models/alice components/its.glb')).toBe(true);
    expect(isDetectorCorePart('assets/models/alice components/L3_pp.glb')).toBe(true);
    expect(isDetectorCorePart('assets/models/alice components/BP.glb')).toBe(false);
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

      const isL3 = /l3_pp\.glb$/i.test(part.assetPath);
      const isBp = /bp\.glb$/i.test(part.assetPath);
      const layerIndex = DETECTOR_PART_PATHS.indexOf(part.assetPath);
      let sawMesh = false;
      part.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        sawMesh = true;
        const material = mesh.material as THREE.Material;
        // Translucent defaults: BP disables depthWrite; other shells keep it (VA-style).
        expect(material.depthWrite).toBe(!isBp);
        expect(material.depthTest).toBe(true);
        // Every layer must keep a stable, layer-scoped renderOrder — the
        // regression this guards against is mergeStaticMeshesByMaterial
        // resetting it to 0 for every merged part (TRD/TOF/EMCal/DCal/PHOS/
        // ITS/ABSO/DIPO), which lets Three.js fall back to an unstable,
        // camera-distance-based transparent sort and makes overlapping
        // shells swap which one is drawn "on top" (and its colour) as the
        // camera rotates. See applyDetectorPartOpacity.
        expect(mesh.renderOrder).toBeGreaterThan(0);
        if (!isBp) {
          expect(mesh.renderOrder).toBeGreaterThanOrEqual(layerIndex * RENDER_ORDER_LAYER_STRIDE);
        }
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

  it('keeps each layer\'s renderOrder band non-overlapping, inner->outer (BP excepted, always foreground)', () => {
    // The reported "colour jump on rotation" was caused by every merged
    // layer sharing the default renderOrder=0 and falling back to an
    // unstable, per-frame camera-distance sort. This asserts the fix holds
    // end-to-end: layer i's meshes never reach into layer i+1's band.
    const bandFor = (assetPath: string): { min: number; max: number } => {
      const part = model.parts.find((p) => p.assetPath === assetPath);
      expect(part).toBeDefined();
      let min = Infinity;
      let max = -Infinity;
      part!.root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        min = Math.min(min, mesh.renderOrder);
        max = Math.max(max, mesh.renderOrder);
      });
      return { min, max };
    };

    // Skip BP (index 0): it intentionally jumps to BEAM_PIPE_RENDER_ORDER, far
    // above every other layer, so it always wins ties at the bore.
    for (let i = 1; i < DETECTOR_PART_PATHS.length - 1; i++) {
      const current = bandFor(DETECTOR_PART_PATHS[i]);
      const next = bandFor(DETECTOR_PART_PATHS[i + 1]);
      expect(current.max).toBeLessThan(next.min);
    }
  });

  it('wraps L3_pp in a distance LOD (lightweight octagon stand-in)', () => {
    const l3 = model.parts.find((p) => /l3_pp\.glb$/i.test(p.assetPath));
    expect(l3).toBeDefined();
    expect(l3!.root).toBeInstanceOf(THREE.LOD);
    const lod = l3!.root as THREE.LOD;
    expect(lod.levels.length).toBe(2);
    expect(lod.levels[0].distance).toBe(0);
    expect(lod.levels[1].distance).toBe(OUTER_MAGNET_LOD_FAR_DISTANCE);

    const countMeshes = (root: THREE.Object3D): number => {
      let n = 0;
      root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) n += 1;
      });
      return n;
    };
    // Stand-in is Mesh_0 liner + Mesh_1 yoke (InstancedMesh count 1 + leftover).
    expect(countMeshes(lod.levels[0].object)).toBeGreaterThanOrEqual(2);
    expect(countMeshes(lod.levels[1].object)).toBe(countMeshes(lod.levels[0].object));
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
        const local = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        const instanced = obj as THREE.InstancedMesh;
        tris += local * (instanced.isInstancedMesh ? instanced.count : 1);
      });
      return tris;
    };
    expect(triCount(lod.levels[1].object)).toBeLessThan(triCount(lod.levels[0].object));
  });

  it('keeps BP unmerged with BeamPipeSupport intact (no Melax far LOD)', () => {
    const bp = model.parts.find((p) => /bp\.glb$/i.test(p.assetPath));
    expect(bp).toBeDefined();
    expect(bp!.root).not.toBeInstanceOf(THREE.LOD);

    const names: string[] = [];
    let meshCount = 0;
    const geometries = new Set<THREE.BufferGeometry>();
    bp!.root.traverse((obj) => {
      if (obj.name) names.push(obj.name);
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      meshCount += 1;
      geometries.add(mesh.geometry as THREE.BufferGeometry);
    });
    // Support bars/foam must survive — aggressive gltfpack -si deleted these.
    expect(names.some((n) => /supportBarCarbon/i.test(n))).toBe(true);
    expect(names.some((n) => /supportBarFoam/i.test(n))).toBe(true);
    expect(names.some((n) => /bracket/i.test(n))).toBe(true);
    // Shared mesh defs (~27) across ~180 nodes; do not merge (would bake ~10×).
    expect(meshCount).toBeGreaterThan(20);
    expect(meshCount).toBeLessThan(250);
    expect(geometries.size).toBeLessThan(80);
  });

  it('keeps low-LOD drawable counts within MAX_LOW_TO_HIGH_DRAWABLE_RATIO of high', () => {
    for (const part of model.parts) {
      const lod = part.root as THREE.LOD;
      if (!lod.isLOD || lod.levels.length < 2) continue;
      const high = countDetectorDrawables(lod.levels[0].object);
      const low = countDetectorDrawables(lod.levels[1].object);
      expect(low)
        .withContext(`${part.assetPath}: low=${low} high=${high}`)
        .toBeLessThanOrEqual(Math.max(high * MAX_LOW_TO_HIGH_DRAWABLE_RATIO, high + 4));
    }
  });

  it('keeps ITS at full merged detail (no Melax far LOD)', () => {
    const its = model.parts.find((p) => /its\.glb$/i.test(p.assetPath));
    expect(its).toBeDefined();
    expect(its!.root).not.toBeInstanceOf(THREE.LOD);
  });

  it('wraps MCH in a distance LOD; ABSO / DIPO stay full merged meshes', () => {
    const triCount = (root: THREE.Object3D): number => {
      let tris = 0;
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const g = mesh.geometry as THREE.BufferGeometry;
        const base = g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
        const instanced = obj as THREE.InstancedMesh;
        tris += instanced.isInstancedMesh ? base * instanced.count : base;
      });
      return tris;
    };

    const mch = model.parts.find((p) => /mch\.glb$/i.test(p.assetPath));
    expect(mch).toBeDefined();
    expect(mch!.label.length).toBeGreaterThan(0);
    expect(mch!.root).toBeInstanceOf(THREE.LOD);
    const lod = mch!.root as THREE.LOD;
    expect(lod.levels.length).toBe(2);
    expect(lod.levels[1].distance).toBe(MUON_AUX_LOD_FAR_DISTANCE);
    expect(triCount(lod.levels[1].object)).toBeLessThanOrEqual(triCount(lod.levels[0].object));

    for (const re of [/abso\.glb$/i, /dipo\.glb$/i]) {
      const part = model.parts.find((p) => re.test(p.assetPath));
      expect(part).toBeDefined();
      expect(part!.root).not.toBeInstanceOf(THREE.LOD);
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
    // MCH is roughly cylindrical about the beam — its AABB centre Y should land
    // near 0 after the +30 cm frame lift + ITS recenter. ABSO/DIPO are
    // asymmetric so AABB centre is not a reliable pipe proxy.
    const part = model.parts.find((p) => /\/mch\.glb$/i.test(p.assetPath));
    expect(part).toBeDefined();
    const center = new THREE.Box3().setFromObject(part!.root).getCenter(new THREE.Vector3());
    expect(Math.abs(center.x)).toBeLessThan(0.05);
    expect(Math.abs(center.y)).toBeLessThan(0.05);
  });

  it('keeps the beam pipe on the ITS beam axis without a muon-arm Y lift', () => {
    model.group.updateMatrixWorld(true);
    const part = model.parts.find((p) => /\/bp\.glb$/i.test(p.assetPath));
    expect(part).toBeDefined();
    expect(part!.label).toBe('Beam Pipe');
    // Main tube meshes are authored at Y≈30 (ITS frame); after ITS recenter the
    // pipe AABB centre drifts a bit from flanges, but X stays on axis.
    const center = new THREE.Box3().setFromObject(part!.root).getCenter(new THREE.Vector3());
    expect(Math.abs(center.x)).toBeLessThan(0.05);
    expect(Math.abs(center.y)).toBeLessThan(0.25);
  });

  it('collapses each non-LOD part down to a small number of draw calls', () => {
    for (const part of model.parts) {
      if ((part.root as THREE.LOD).isLOD) continue;
      let meshCount = 0;
      part.root.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) meshCount += 1;
      });
      expect(meshCount).toBeGreaterThan(0);
      // BP.glb keeps many distinct CAD materials; other static parts merge tightly.
      const isBp = /bp\.glb$/i.test(part.assetPath);
      expect(meshCount).withContext(part.assetPath).toBeLessThan(isBp ? 250 : 50);
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

describe('loadDetectorModelProgressive + deferred Melax', () => {
  it('reveals the inner barrel (BP/ITS/TPC) before the complete assembly', async () => {
    const waves: Array<{ wave: string; count: number }> = [];
    const model = await loadDetectorModelProgressive(DETECTOR_PART_PATHS, {
      scale: 1e-2,
      darkMode: true,
      deferLowLod: true,
      animateReveal: false,
      onWave: (m, wave) => waves.push({ wave, count: m.parts.length }),
    });

    expect(waves.map((w) => w.wave)).toEqual(['core', 'complete']);
    expect(waves[0].count).toBe(3);
    expect(waves[1].count).toBe(DETECTOR_PART_PATHS.length);
    expect(model.parts.length).toBe(DETECTOR_PART_PATHS.length);

    const innerPaths = model.parts.slice(0, 3).map((p) => p.assetPath);
    expect(innerPaths.every(isDetectorInnerPart)).toBe(true);
    expect(model.parts.map((p) => p.assetPath)).toEqual([...DETECTOR_PART_PATHS]);
  }, 90000);

  it('waits for waitBeforeSecondary before revealing outer shells', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const waves: string[] = [];
    // Tiny path set keeps this fast: one inner (BP) + one outer (L3).
    const paths = [
      DETECTOR_PART_PATHS.find((p) => /bp\.glb$/i.test(p))!,
      DETECTOR_PART_PATHS.find((p) => /l3_pp\.glb$/i.test(p))!,
    ];

    const loading = loadDetectorModelProgressive(paths, {
      scale: 1e-2,
      darkMode: true,
      deferLowLod: true,
      animateReveal: false,
      waitBeforeSecondary: () => gate,
      onWave: (_m, wave) => waves.push(wave),
    });

    for (let i = 0; i < 40 && !waves.includes('core'); i++) {
      await new Promise<void>((r) => setTimeout(r, 50));
    }
    expect(waves).toEqual(['core']);

    release();
    await loading;
    expect(waves).toEqual(['core', 'complete']);
  }, 60000);

  it('fades each part in inside→out order when animateReveal is on', async () => {
    const order: string[] = [];
    const paths = [
      DETECTOR_PART_PATHS.find((p) => /bp\.glb$/i.test(p))!,
      DETECTOR_PART_PATHS.find((p) => /its\.glb$/i.test(p))!,
    ];

    await loadDetectorModelProgressive(paths, {
      scale: 1e-2,
      darkMode: true,
      deferLowLod: true,
      animateReveal: true,
      revealDurationMs: 40,
      onPart: (_m, part) => order.push(part.assetPath),
      onWave: () => undefined,
    });

    expect(order).toEqual(paths);
  }, 60000);

  it('recenters on ITS even when BP is revealed first (cut pipe is not the IP)', async () => {
    const model = await loadDetectorModelProgressive(DETECTOR_PART_PATHS, {
      scale: 1e-2,
      darkMode: true,
      deferLowLod: true,
      animateReveal: false,
      onWave: () => undefined,
    });

    model.group.updateMatrixWorld(true);
    const its = model.parts.find((p) => /\/its\.glb$/i.test(p.assetPath));
    expect(its).toBeDefined();
    const center = new THREE.Box3().setFromObject(its!.root).getCenter(new THREE.Vector3());
    expect(Math.abs(center.x)).toBeLessThan(0.05);
    expect(Math.abs(center.y)).toBeLessThan(0.05);
    expect(Math.abs(center.z)).toBeLessThan(0.05);

    // BP's authored cut is Z-asymmetric — its AABB must NOT pin the assembly.
    const bp = model.parts.find((p) => /\/bp\.glb$/i.test(p.assetPath));
    const bpCenter = new THREE.Box3().setFromObject(bp!.root).getCenter(new THREE.Vector3());
    expect(Math.abs(bpCenter.z)).toBeGreaterThan(0.5);
  }, 90000);

  it('defers Melax low-LOD until attachDeferredLowLods', async () => {
    const deferred = await loadDetectorModel(DETECTOR_PART_PATHS, 1e-2, true, true);

    // ITS / BP / ABSO / DIPO no longer use Melax far LOD.
    const its = deferred.parts.find((p) => /its\.glb$/i.test(p.assetPath));
    expect(its).toBeDefined();
    expect(its!.root).not.toBeInstanceOf(THREE.LOD);

    const bp = deferred.parts.find((p) => /bp\.glb$/i.test(p.assetPath));
    expect(bp).toBeDefined();
    expect(bp!.root).not.toBeInstanceOf(THREE.LOD);

    const tpc = deferred.parts.find((p) => /tpc\.glb$/i.test(p.assetPath));
    expect((tpc!.root as THREE.LOD).levels.length).toBe(1);

    // L3 thinning is sync (no Melax) — both levels present immediately.
    const l3 = deferred.parts.find((p) => /l3_pp\.glb$/i.test(p.assetPath));
    expect((l3!.root as THREE.LOD).levels.length).toBe(2);

    const attached = attachDeferredLowLods(deferred.group);
    expect(attached).toBeGreaterThan(0);
    expect((tpc!.root as THREE.LOD).levels.length).toBe(2);
    expect(attachDeferredLowLods(deferred.group)).toBe(0);

    deferred.group.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) mat?.dispose();
    });
  }, 90000);
});
