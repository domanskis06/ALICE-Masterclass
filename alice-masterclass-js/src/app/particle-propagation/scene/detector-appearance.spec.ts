import * as THREE from 'three';
import {
  applyDetectorDarkMode,
  applyDetectorLayerMaterials,
  CALORIMETER_MIN_OPACITY,
  defaultLayerOpacity,
  detectorPartLabel,
  MAX_PART_OPACITY,
  MIN_PART_OPACITY,
  setDetectorPartOpacity,
  setDetectorPartVisibility,
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
    expect(detectorPartLabel('assets/models/alice components/EMCal_Dcal.glb')).toBe('EMCal / DCal');
  });

  it('falls back to the bare filename (minus extension) for unknown parts', () => {
    expect(detectorPartLabel('assets/models/alice components/foo.glb')).toBe('foo');
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
