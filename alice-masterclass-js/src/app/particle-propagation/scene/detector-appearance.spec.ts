import * as THREE from 'three';
import {
  applyDetectorDarkMode,
  applyDetectorLayerMaterials,
  buildOuterMagnetInstanced,
  CALORIMETER_MIN_OPACITY,
  cloneDetectorSubtree,
  decimateTpcHeavyPanels,
  decimateItsShell,
  decimateMchShell,
  defaultDetectorPartVisible,
  defaultLayerOpacity,
  detectorPartAccentColor,
  detectorPartLabel,
  isAuxiliaryMuonPart,
  isDipo,
  isForwardMuonPart,
  isIts,
  isMch,
  isTpc,
  MAX_PART_OPACITY,
  MIN_PART_OPACITY,
  OUTER_MAGNET_DEFAULT_OPACITY,
  setDetectorPartOpacity,
  setDetectorPartVisibility,
  thinOuterMagnetSectors,
  thinTpcFineDetail,
} from './detector-appearance';

function makePart(color = 0x3366cc): THREE.Object3D {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color })
  );
  root.add(mesh);
  return root;
}

function firstMaterial(root: THREE.Object3D): THREE.MeshStandardMaterial {
  let found: THREE.MeshStandardMaterial | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Mesh).isMesh) found = (o as THREE.Mesh).material as THREE.MeshStandardMaterial;
  });
  return found!;
}

describe('detectorPartLabel', () => {
  it('maps known GLB filenames to short human labels', () => {
    expect(detectorPartLabel('assets/models/alice components/its.glb')).toBe('ITS');
    expect(detectorPartLabel('assets/models/alice components/L3.glb')).toBe('L3 magnet');
    expect(detectorPartLabel('assets/models/alice components/EMCAL.glb')).toBe('EMCal');
    expect(detectorPartLabel('assets/models/alice components/MCH.glb')).toBe('MCH');
    expect(detectorPartLabel('assets/models/alice components/ABSO.glb')).toBe('ABSO');
    expect(detectorPartLabel('assets/models/alice components/SHIL.glb')).toBe('SHIL');
    expect(detectorPartLabel('assets/models/alice components/DIPO.glb')).toBe('DIPO magnet');
  });

  it('falls back to the bare filename (minus extension) for unknown parts', () => {
    expect(detectorPartLabel('assets/models/alice components/foo.glb')).toBe('foo');
  });
});

describe('detectorPartAccentColor', () => {
  it('maps known GLB filenames to signature accent hex colours', () => {
    expect(detectorPartAccentColor('assets/models/alice components/its.glb')).toBe('#33FF71');
    expect(detectorPartAccentColor('assets/models/alice components/L3.glb')).toBe('#FF0D12');
    expect(detectorPartAccentColor('assets/models/alice components/tpc.glb')).toBe('#22C4FF');
    expect(detectorPartAccentColor('assets/models/alice components/MCH.glb')).toBe('#814244');
    expect(detectorPartAccentColor('assets/models/alice components/ABSO.glb')).toBe('#DE782B');
    expect(detectorPartAccentColor('assets/models/alice components/SHIL.glb')).toBe('#BA92AB');
    expect(detectorPartAccentColor('assets/models/alice components/DIPO.glb')).toBe('#0068D0');
  });

  it('falls back to the default orange accent for unknown parts', () => {
    expect(detectorPartAccentColor('assets/models/alice components/foo.glb')).toBe('#ff6f00');
  });
});

describe('defaultLayerOpacity', () => {
  it('lerps inner -> outer across layer index', () => {
    const inner = defaultLayerOpacity('its.glb', 0, 8);
    const outer = defaultLayerOpacity('its.glb', 7, 8);
    expect(inner).toBeGreaterThan(outer);
  });

  it('never lets calorimeter layers fall below the visibility floor', () => {
    const calo = defaultLayerOpacity('assets/x/PHOS.glb', 7, 8);
    expect(calo).toBeGreaterThanOrEqual(CALORIMETER_MIN_OPACITY);
  });

  it('defaults the L3 magnet to OUTER_MAGNET_DEFAULT_OPACITY', () => {
    expect(defaultLayerOpacity('assets/models/alice components/L3.glb', 7, 8)).toBe(
      OUTER_MAGNET_DEFAULT_OPACITY
    );
  });
});

describe('isTpc', () => {
  it('detects tpc.glb paths', () => {
    expect(isTpc('assets/models/alice components/tpc.glb')).toBe(true);
    expect(isTpc('assets/models/alice components/its.glb')).toBe(false);
  });
});

describe('isIts', () => {
  it('detects its.glb paths', () => {
    expect(isIts('assets/models/alice components/its.glb')).toBe(true);
    expect(isIts('assets/models/alice components/tpc.glb')).toBe(false);
  });
});

describe('isMch', () => {
  it('detects mch.glb paths', () => {
    expect(isMch('assets/models/alice components/MCH.glb')).toBe(true);
    expect(isMch('assets/models/alice components/ABSO.glb')).toBe(false);
  });
});

describe('isAuxiliaryMuonPart', () => {
  it('detects abso.glb and shil.glb paths', () => {
    expect(isAuxiliaryMuonPart('assets/models/alice components/ABSO.glb')).toBe(true);
    expect(isAuxiliaryMuonPart('assets/models/alice components/SHIL.glb')).toBe(true);
    expect(isAuxiliaryMuonPart('assets/models/alice components/MCH.glb')).toBe(false);
  });
});

describe('isDipo', () => {
  it('detects dipo.glb paths', () => {
    expect(isDipo('assets/models/alice components/DIPO.glb')).toBe(true);
    expect(isDipo('assets/models/alice components/MCH.glb')).toBe(false);
  });
});

describe('defaultDetectorPartVisible', () => {
  it('shows barrel and forward muon-arm parts by default', () => {
    expect(isForwardMuonPart('assets/models/alice components/MCH.glb')).toBe(true);
    expect(isForwardMuonPart('assets/models/alice components/ABSO.glb')).toBe(true);
    expect(isForwardMuonPart('assets/models/alice components/SHIL.glb')).toBe(true);
    expect(isForwardMuonPart('assets/models/alice components/DIPO.glb')).toBe(true);
    expect(isForwardMuonPart('assets/models/alice components/its.glb')).toBe(false);

    expect(defaultDetectorPartVisible('assets/models/alice components/MCH.glb')).toBe(true);
    expect(defaultDetectorPartVisible('assets/models/alice components/ABSO.glb')).toBe(true);
    expect(defaultDetectorPartVisible('assets/models/alice components/SHIL.glb')).toBe(true);
    expect(defaultDetectorPartVisible('assets/models/alice components/DIPO.glb')).toBe(true);
    expect(defaultDetectorPartVisible('assets/models/alice components/its.glb')).toBe(true);
    expect(defaultDetectorPartVisible('assets/models/alice components/L3.glb')).toBe(true);
  });
});

describe('decimateMchShell', () => {
  it('reduces vertex count on Mesh_0', () => {
    const root = new THREE.Group();
    const geo = new THREE.BoxGeometry(2, 2, 2, 8, 8, 8);
    const before = geo.attributes.position.count;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial());
    mesh.name = 'Mesh_0';
    root.add(mesh);
    expect(decimateMchShell(root, 0.5)).toBe(1);
    expect(mesh.geometry.attributes.position.count).toBeLessThan(before);
  });
});

describe('decimateItsShell', () => {
  it('reduces vertex count on Mesh_0 and leaves other meshes alone', () => {
    const root = new THREE.Group();
    const heavyGeo = new THREE.BoxGeometry(2, 2, 2, 8, 8, 8);
    const lightGeo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const mat = new THREE.MeshStandardMaterial();
    const beforeHeavy = heavyGeo.attributes.position.count;

    const shell = new THREE.Mesh(heavyGeo, mat);
    shell.name = 'Mesh_0';
    root.add(shell);
    const other = new THREE.Mesh(lightGeo, mat);
    other.name = 'Mesh_9';
    root.add(other);

    const changed = decimateItsShell(root, 0.5);
    expect(changed).toBe(1);
    expect(shell.geometry.attributes.position.count).toBeLessThan(beforeHeavy);
    expect(other.geometry).toBe(lightGeo);
  });
});

describe('thinOuterMagnetSectors', () => {
  it('keeps every Nth Mesh_1/2/3 sector around the ring', () => {
    const root = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = `Mesh_2${i.toString().padStart(3, '0')}`;
      mesh.position.set(Math.cos((i / 8) * Math.PI * 2) * 10, Math.sin((i / 8) * Math.PI * 2) * 10, 0);
      root.add(mesh);
    }
    const removed = thinOuterMagnetSectors(root, 2);
    expect(removed).toBe(4);
    let remaining = 0;
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) remaining += 1;
    });
    expect(remaining).toBe(4);
  });
});

describe('thinTpcFineDetail', () => {
  it('keeps every Nth Mesh_15/17 piece around the ring', () => {
    const root = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
      mesh.name = i === 0 ? 'Mesh_15' : `Mesh_15.${i}`;
      mesh.position.set(Math.cos((i / 8) * Math.PI * 2) * 10, Math.sin((i / 8) * Math.PI * 2) * 10, 0);
      root.add(mesh);
    }
    const removed = thinTpcFineDetail(root, 2);
    expect(removed).toBe(4);
    let remaining = 0;
    root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) remaining += 1;
    });
    expect(remaining).toBe(4);
  });
});

describe('decimateTpcHeavyPanels', () => {
  it('reduces vertex count on Mesh_22/26 geometries and leaves other meshes alone', () => {
    const root = new THREE.Group();
    const heavyGeo = new THREE.BoxGeometry(2, 2, 2, 8, 8, 8);
    const lightGeo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    const mat = new THREE.MeshStandardMaterial();
    const beforeHeavy = heavyGeo.attributes.position.count;

    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(heavyGeo, mat);
      mesh.name = i === 0 ? 'Mesh_22' : `Mesh_22.${i}`;
      root.add(mesh);
    }
    const other = new THREE.Mesh(lightGeo, mat);
    other.name = 'Mesh_15';
    root.add(other);

    const changed = decimateTpcHeavyPanels(root, 0.5);
    expect(changed).toBe(1);

    const heavyMesh = root.children[0] as THREE.Mesh;
    expect(heavyMesh.geometry.attributes.position.count).toBeLessThan(beforeHeavy);
    expect((root.children[3] as THREE.Mesh).geometry).toBe(lightGeo);
  });
});

describe('buildOuterMagnetInstanced', () => {
  it('collapses Mesh_1/2/3 families into InstancedMeshes and keeps other meshes', () => {
    const root = new THREE.Group();
    const sharedGeo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(sharedGeo, mat);
      mesh.name = `Mesh_1.${i}`;
      mesh.position.set(Math.cos((i / 6) * Math.PI * 2) * 5, Math.sin((i / 6) * Math.PI * 2) * 5, 0);
      root.add(mesh);
    }
    const other = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat.clone());
    other.name = 'Mesh_0';
    root.add(other);
    root.updateMatrixWorld(true);

    const full = buildOuterMagnetInstanced(root, 1);
    const low = buildOuterMagnetInstanced(root, 2);

    let instancedFull = 0;
    let countFull = 0;
    full.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh) {
        instancedFull += 1;
        countFull += m.count;
      }
    });
    expect(instancedFull).toBe(1);
    expect(countFull).toBe(6);

    let countLow = 0;
    low.traverse((o) => {
      const m = o as THREE.InstancedMesh;
      if (m.isInstancedMesh) countLow += m.count;
    });
    expect(countLow).toBe(3);

    let otherCount = 0;
    full.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh) otherCount += 1;
    });
    expect(otherCount).toBe(1);
  });
});

describe('cloneDetectorSubtree', () => {
  it('clones materials so edits on the copy do not touch the original', () => {
    const root = makePart(0xff0000);
    const clone = cloneDetectorSubtree(root);
    const origMat = firstMaterial(root);
    const cloneMat = firstMaterial(clone);
    expect(cloneMat).not.toBe(origMat);
    cloneMat.color.setHex(0x00ff00);
    expect(origMat.color.getHex()).toBe(0xff0000);
  });
});

describe('applyDetectorLayerMaterials', () => {
  it('starts materials solid but records the target baseOpacity and keeps depthWrite on', () => {
    const part = makePart();
    applyDetectorLayerMaterials(part, 0.75, 2);
    const mat = firstMaterial(part);
    expect(mat.opacity).toBe(1);
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
    expect((mat as THREE.Material & { polygonOffset: boolean }).polygonOffset).toBe(true);
    expect(mat.userData['baseOpacity']).toBeCloseTo(0.75, 6);
  });
});

describe('setDetectorPartOpacity', () => {
  it('clamps to [MIN, MAX] and toggles transparency', () => {
    const part = makePart();
    expect(setDetectorPartOpacity(part, 2)).toBe(MAX_PART_OPACITY);
    expect(setDetectorPartOpacity(part, -1)).toBe(MIN_PART_OPACITY);

    const applied = setDetectorPartOpacity(part, 0.5);
    const mat = firstMaterial(part);
    expect(applied).toBe(0.5);
    expect(mat.opacity).toBe(0.5);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(true); // stays cheap to blend
  });

  it('keeps fully opaque parts on the non-transparent path', () => {
    const part = makePart();
    setDetectorPartOpacity(part, 1);
    const mat = firstMaterial(part);
    expect(mat.opacity).toBe(1);
    expect(mat.transparent).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });
});

describe('setDetectorPartVisibility', () => {
  it('toggles the root visibility flag', () => {
    const part = makePart();
    setDetectorPartVisibility(part, false);
    expect(part.visible).toBe(false);
    setDetectorPartVisibility(part, true);
    expect(part.visible).toBe(true);
  });
});

describe('applyDetectorDarkMode', () => {
  it('remembers the base colour and restores it when toggled back to light', () => {
    const part = makePart(0x2277dd);
    const mat = firstMaterial(part);
    const base = mat.color.clone();

    applyDetectorDarkMode(part, true);
    expect(mat.emissiveIntensity).toBeGreaterThan(0);

    applyDetectorDarkMode(part, false);
    expect(mat.color.getHexString()).toBe(base.getHexString());
    expect(mat.emissive.getHexString()).toBe('000000');
  });
});
