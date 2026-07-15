/**
 * Pre-collision animation: two protons flying in from opposite ends of the
 * beam axis along `z`, meeting at the origin at `t = 0`.
 *
 * `update(tIntroMs)` is a pure function of the *global* intro time (always in
 * `[-INTRO_DURATION_MS, 0]`), not an accumulated per-frame delta — this is what
 * lets `PropagationTimeline` scrub the slider backward/forward through the intro
 * without drift. See `docs/event-display.md` for the delta-time-driven variant
 * this intentionally does not reuse (god-node isolation,
 * `.cursor/rules/architecture.mdc`).
 *
 * A stand-in beam-pipe mesh is intentionally **not** drawn here — a proper
 * beam-pipe GLB will be added once available; until then the protons alone
 * communicate the incoming-beam geometry.
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import { INTRO_DURATION_MS, PROTON_HALF_SEPARATION_START, PROTON_TARGET_DIAMETER_WORLD } from './timeline-constants';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function setDepthWriteRecursive(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of materials) {
      if (!mat) continue;
      mat.depthWrite = true;
      mat.needsUpdate = true;
    }
  });
}

export class CollisionIntro {
  readonly group = new THREE.Group();

  private constructor(
    private readonly protonPlusZ: THREE.Object3D,
    private readonly protonMinusZ: THREE.Object3D,
    private readonly halfSeparationStart: number
  ) {
    this.group.add(protonMinusZ, protonPlusZ);
  }

  /**
   * Loads `proton.glb`, clones it for the two incoming beams, and rescales
   * both clones to a fixed on-screen size (mirrors
   * `EventDisplayComponent`'s `targetDiameter = objectScale * 10` sizing).
   */
  static async create(protonModelUrl: string): Promise<CollisionIntro> {
    const loader = new GLTFLoader();
    const gltf = await new Promise<GLTF>((resolve, reject) => {
      loader.load(protonModelUrl, resolve, undefined, reject);
    });

    const template = gltf.scene;
    const plusZ = template.clone(true);
    const minusZ = template.clone(true);

    const bbox = new THREE.Box3().setFromObject(template);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
    const uniformScale = PROTON_TARGET_DIAMETER_WORLD / maxDim;
    plusZ.scale.setScalar(uniformScale);
    minusZ.scale.setScalar(uniformScale);
    setDepthWriteRecursive(plusZ);
    setDepthWriteRecursive(minusZ);

    const intro = new CollisionIntro(plusZ, minusZ, PROTON_HALF_SEPARATION_START);
    intro.reset();
    return intro;
  }

  /**
   * Positions the protons for intro time `tIntroMs` (expected range
   * `[-INTRO_DURATION_MS, 0]`); for `tIntroMs >= 0` (collision has happened)
   * both protons are hidden — the caller (`PropagationTimeline`) is
   * responsible for showing the track group instead.
   */
  update(tIntroMs: number): void {
    if (tIntroMs >= 0) {
      this.protonPlusZ.visible = false;
      this.protonMinusZ.visible = false;
      return;
    }
    this.protonPlusZ.visible = true;
    this.protonMinusZ.visible = true;

    const progress = clamp01((tIntroMs + INTRO_DURATION_MS) / INTRO_DURATION_MS);
    const halfSep = lerp(this.halfSeparationStart, 0, progress);
    this.protonPlusZ.position.set(0, 0, halfSep);
    this.protonMinusZ.position.set(0, 0, -halfSep);
  }

  /** Rewinds to the start of the intro (`t = -INTRO_DURATION_MS`), e.g. when the slider jumps back. */
  reset(): void {
    this.update(-INTRO_DURATION_MS);
  }

  dispose(): void {
    for (const root of [this.protonPlusZ, this.protonMinusZ]) {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        mesh.geometry?.dispose?.();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });
    }
    this.group.clear();
  }
}
