import * as THREE from 'three';
import { CollisionIntro } from './collision-intro';
import { INTRO_DURATION_MS, PROTON_HALF_SEPARATION_START } from './timeline-constants';
import { PROTON_MODEL_PATH } from '../physics/constants';

describe('CollisionIntro', () => {
  let intro: CollisionIntro;

  beforeEach(async () => {
    intro = await CollisionIntro.create(PROTON_MODEL_PATH);
  });

  afterEach(() => {
    intro.dispose();
  });

  it('loads two visible proton clones into its group', () => {
    expect(intro.group.children.length).toBe(2);
  });

  it('reset() places the protons at maximum separation along z, symmetric about the origin', () => {
    intro.reset();
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.position.z).toBeCloseTo(PROTON_HALF_SEPARATION_START, 6);
    expect(minusZ.position.z).toBeCloseTo(-PROTON_HALF_SEPARATION_START, 6);
    expect(plusZ.visible).toBe(true);
    expect(minusZ.visible).toBe(true);
  });

  it('update() moves the protons together as t approaches 0, meeting at the origin', () => {
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

  it('starts the protons just inside the beam pipe end, not floating past it', () => {
    // BP.glb is authored asymmetrically about the IP: after the detector's
    // ITS-based recenter it spans z ~ [-12.95, +5.81] at the scene scale
    // (1e-2). A symmetric start distance is bounded by the shorter (+z)
    // side, so assert it sits comfortably inside that ~5.81 edge (with
    // margin) rather than checking the exact constant, which is free to be
    // retuned by a few percent.
    expect(PROTON_HALF_SEPARATION_START).toBeGreaterThan(4);
    expect(PROTON_HALF_SEPARATION_START).toBeLessThan(5.81);
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
    const dropInLast10Pct = sepAt90PctIn - 0; // separation at t~=0 is ~0
    expect(dropInLast10Pct).toBeGreaterThan(dropInFirst10Pct);
  });

  it('update() hides both protons once t >= 0 (post-collision)', () => {
    intro.update(0);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.visible).toBe(false);
    expect(minusZ.visible).toBe(false);

    intro.update(500);
    expect(plusZ.visible).toBe(false);
    expect(minusZ.visible).toBe(false);
  });

  it('is scrubbable: moving back to t < 0 after t >= 0 re-shows the protons at the right position', () => {
    intro.update(100);
    intro.update(-INTRO_DURATION_MS);
    const [minusZ, plusZ] = intro.group.children as THREE.Object3D[];
    expect(plusZ.visible).toBe(true);
    expect(plusZ.position.z).toBeCloseTo(PROTON_HALF_SEPARATION_START, 6);
    expect(minusZ.position.z).toBeCloseTo(-PROTON_HALF_SEPARATION_START, 6);
  });

  it('dispose() does not throw', () => {
    expect(() => intro.dispose()).not.toThrow();
  });
});
