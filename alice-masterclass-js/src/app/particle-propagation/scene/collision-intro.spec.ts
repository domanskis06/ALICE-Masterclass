import * as THREE from 'three';
import { CollisionIntro, LEAD_NUCLEUS_KIND } from './collision-intro';
import {
  LEAD_NEUTRON_COUNT,
  LEAD_NUCLEON_COUNT,
  LEAD_PROTON_COUNT,
  NEUTRON_COLOR,
  PROTON_COLOR,
} from './lead-nucleus-mesh';
import { PROTON_MODEL_PATH } from '../physics/constants';
import {
  BEAM_HALF_SEPARATION_START,
  INTRO_DURATION_MS,
  NUCLEUS_TARGET_DIAMETER_WORLD,
} from './timeline-constants';

describe('CollisionIntro (proton beams)', () => {
  let intro: CollisionIntro;

  beforeEach(async () => {
    intro = await CollisionIntro.create('proton', PROTON_MODEL_PATH);
  });

  afterEach(() => {
    intro.dispose();
  });

  it('loads two visible proton clones into its group', () => {
    expect(intro.beamKind).toBe('proton');
    expect(intro.group.children.length).toBe(2);
    for (const child of intro.group.children) {
      expect(child.userData['kind']).toBe('proton');
      expect(child.visible).toBe(true);
    }
  });

  it('reset() places the protons at maximum separation along z', () => {
    intro.reset();
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.position.z).toBeCloseTo(BEAM_HALF_SEPARATION_START, 6);
    expect(minusZ.position.z).toBeCloseTo(-BEAM_HALF_SEPARATION_START, 6);
  });

  it('update() hides both protons once t >= 0', () => {
    intro.update(0);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.visible).toBe(false);
    expect(minusZ.visible).toBe(false);
  });

  it('treats the translucent shell as glass so RGB quarks stay visible', () => {
    const proton = intro.group.children[0] as THREE.Object3D;
    const mats: THREE.Material[] = [];
    proton.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as THREE.Mesh & { isMesh?: boolean }).isMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) if (m) mats.push(m);
    });
    expect(mats.length).toBeGreaterThanOrEqual(2);

    const shell =
      mats.find((m) => /material\.002/i.test(m.name || '')) ??
      mats.reduce((best, m) => {
        const o = (m as THREE.Material & { opacity?: number }).opacity ?? 1;
        const bo = (best as THREE.Material & { opacity?: number }).opacity ?? 1;
        return o < bo ? m : best;
      });
    expect(shell.depthWrite).toBe(false);
    expect(shell.transparent).toBe(true);
  });
});

describe('CollisionIntro (Pb nuclei)', () => {
  let intro: CollisionIntro;

  beforeEach(async () => {
    intro = await CollisionIntro.create('pb-nucleus');
  });

  afterEach(() => {
    intro.dispose();
  });

  it('loads two visible Pb nucleus clones into its group', () => {
    expect(intro.beamKind).toBe('pb-nucleus');
    expect(intro.group.children.length).toBe(2);
    for (const child of intro.group.children) {
      expect(child.userData['kind']).toBe(LEAD_NUCLEUS_KIND);
      expect(child.visible).toBe(true);
    }
  });

  it('scales each nucleus to NUCLEUS_TARGET_DIAMETER_WORLD', () => {
    const nucleus = intro.group.children[0] as THREE.Object3D;
    const bbox = new THREE.Box3().setFromObject(nucleus);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    expect(maxDim).toBeCloseTo(NUCLEUS_TARGET_DIAMETER_WORLD, 2);
  });

  it('reset() places the nuclei at maximum separation along z, symmetric about the origin', () => {
    intro.reset();
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.position.z).toBeCloseTo(BEAM_HALF_SEPARATION_START, 6);
    expect(minusZ.position.z).toBeCloseTo(-BEAM_HALF_SEPARATION_START, 6);
    expect(plusZ.visible).toBe(true);
    expect(minusZ.visible).toBe(true);
  });

  it('update() moves the nuclei together as t approaches 0, meeting at the origin', () => {
    intro.update(-INTRO_DURATION_MS);
    const [minusZAtStart, plusZAtStart] = intro.group.children as THREE.Object3D[];
    const sepAtStart = plusZAtStart.position.z - minusZAtStart.position.z;

    intro.update(-INTRO_DURATION_MS / 2);
    const sepAtMid = plusZAtStart.position.z - minusZAtStart.position.z;

    intro.update(0 - 1e-6);
    const sepJustBeforeCollision = plusZAtStart.position.z - minusZAtStart.position.z;

    expect(sepAtStart).toBeGreaterThan(sepAtMid);
    expect(sepAtMid).toBeGreaterThan(sepJustBeforeCollision);
    expect(sepJustBeforeCollision).toBeGreaterThanOrEqual(0);
  });

  it('starts the nuclei just inside the beam pipe end, not floating past it', () => {
    expect(BEAM_HALF_SEPARATION_START).toBeGreaterThan(4);
    expect(BEAM_HALF_SEPARATION_START).toBeLessThan(5.81);
  });

  it('applies a non-linear ease-in: separation shrinks slowly at first, then rapidly near the collision', () => {
    intro.update(-INTRO_DURATION_MS);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    const sep = (): number => plusZ.position.z - minusZ.position.z;

    const sepAtStart = sep();
    intro.update(-INTRO_DURATION_MS * 0.9);
    const sepAt10PctIn = sep();
    intro.update(-INTRO_DURATION_MS * 0.1);
    const sepAt90PctIn = sep();

    const dropInFirst10Pct = sepAtStart - sepAt10PctIn;
    const dropInLast10Pct = sepAt90PctIn - 0;
    expect(dropInLast10Pct).toBeGreaterThan(dropInFirst10Pct);
  });

  it('update() hides both nuclei once t >= 0 (post-collision)', () => {
    intro.update(0);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.visible).toBe(false);
    expect(minusZ.visible).toBe(false);

    intro.update(500);
    expect(plusZ.visible).toBe(false);
    expect(minusZ.visible).toBe(false);
  });

  it('is scrubbable: moving back to t < 0 after t >= 0 re-shows the nuclei at the right position', () => {
    intro.update(100);
    intro.update(-INTRO_DURATION_MS);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.visible).toBe(true);
    expect(plusZ.position.z).toBeCloseTo(BEAM_HALF_SEPARATION_START, 6);
    expect(minusZ.position.z).toBeCloseTo(-BEAM_HALF_SEPARATION_START, 6);
  });

  it('dispose() does not throw', () => {
    expect(() => intro.dispose()).not.toThrow();
  });

  it('packs red protons and grey neutrons into a filled sphere', () => {
    const nucleus = intro.group.children[0] as THREE.Object3D;
    expect(nucleus.userData['protonCount']).toBe(LEAD_PROTON_COUNT);
    expect(nucleus.userData['neutronCount']).toBe(LEAD_NEUTRON_COUNT);

    const meshes: THREE.Mesh[] = [];
    nucleus.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if ((mesh as THREE.Mesh & { isMesh?: boolean }).isMesh) meshes.push(mesh);
    });
    const shellMeshes = meshes.filter((m) => /shell/i.test(m.name));
    const protonMeshes = meshes.filter((m) => m.userData['nucleon'] === 'proton');
    const neutronMeshes = meshes.filter((m) => m.userData['nucleon'] === 'neutron');
    expect(shellMeshes.length).toBe(1);
    expect(protonMeshes.length + neutronMeshes.length).toBe(LEAD_NUCLEON_COUNT);

    const protonMat = protonMeshes[0].material as THREE.MeshStandardMaterial;
    const neutronMat = neutronMeshes[0].material as THREE.MeshStandardMaterial;
    expect(protonMat.color.getHex()).toBe(PROTON_COLOR);
    expect(neutronMat.color.getHex()).toBe(NEUTRON_COLOR);
    expect(protonMat.emissiveIntensity).toBeGreaterThan(0.3);
    expect(neutronMat.emissiveIntensity).toBeGreaterThan(0.2);
  });

  it('treats the translucent shell as glass (depthWrite off) so nucleons inside stay visible', () => {
    const nucleus = intro.group.children[0] as THREE.Object3D;
    const mats: THREE.Material[] = [];
    const meshes: THREE.Mesh[] = [];
    nucleus.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!(mesh as THREE.Mesh & { isMesh?: boolean }).isMesh) return;
      meshes.push(mesh);
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) if (m) mats.push(m);
    });

    const shell = mats.find((m) => /pbshell/i.test(m.name || ''));
    expect(shell).toBeTruthy();
    expect(shell!.depthWrite).toBe(false);
    expect(shell!.transparent).toBe(true);

    const shellMeshes = meshes.filter((mesh) => {
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      return list.some((m) => m === shell);
    });
    const nucleonMeshes = meshes.filter((mesh) => !shellMeshes.includes(mesh));
    expect(nucleonMeshes.length).toBe(LEAD_NUCLEON_COUNT);
    const maxNucleonOrder = Math.max(...nucleonMeshes.map((m) => m.renderOrder));
    const minShellOrder = Math.min(...shellMeshes.map((m) => m.renderOrder));
    expect(minShellOrder).toBeGreaterThan(maxNucleonOrder);
  });
});
