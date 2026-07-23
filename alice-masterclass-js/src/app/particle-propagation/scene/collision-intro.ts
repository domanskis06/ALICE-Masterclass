/**
 * Pre-collision animation: two protons flying in from opposite ends of the
 * beam axis along `z` — starting just inside the beam pipe's end
 * (`PROTON_HALF_SEPARATION_START`, see that constant's doc for why the pipe
 * — `BP.glb`, part of the detector model loaded separately by
 * `detector-loader.ts` — is asymmetric) — through the pipe, meeting at the
 * origin at `t = 0`.
 *
 * `update(tIntroMs)` is a pure function of the *global* intro time (always in
 * `[-INTRO_DURATION_MS, 0]`), not an accumulated per-frame delta — this is what
 * lets `PropagationTimeline` scrub the slider backward/forward through the intro
 * without drift. See `ci/docs/event-display.md` for the delta-time-driven variant
 * this intentionally does not reuse (god-node isolation,
 * `.cursor/rules/architecture.mdc`).
 *
 * No beam-pipe mesh is drawn here — the real `BP.glb` already lives on the
 * beam axis as part of the detector shell; the protons just travel through it.
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import {
  INTRO_DURATION_MS,
  INTRO_EASE_IN_POWER,
  PROTON_HALF_SEPARATION_START,
  PROTON_TARGET_DIAMETER_WORLD,
} from './timeline-constants';

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Ease-in: slow while far down the beam pipe, sharply accelerating into the collision. */
function easeIn(t: number): number {
  return Math.pow(t, INTRO_EASE_IN_POWER);
}

/** Lower score → more likely the translucent proton shell (vs RGB quarks). */
function shellLikelihood(mat: THREE.Material): number {
  const named = mat.name || '';
  // Authored names in proton.glb: Material.002 = shell, .003/.004/.005 = R/B/G.
  if (/material\.002/i.test(named)) return 0;
  if (/material\.00[345]/i.test(named)) return 1;
  const opacity = (mat as THREE.Material & { opacity?: number }).opacity;
  return typeof opacity === 'number' ? opacity : 1;
}

/**
 * `proton.glb` is one multi-material sphere: a translucent shell (lowest alpha)
 * wrapping three RGB quark blobs. Forcing `depthWrite` on the shell fills the
 * depth buffer with the envelope and depth-tests away any quark that sits
 * inside / behind it (the blue one was the usual casualty). Treat the shell
 * as glass (`depthWrite = false`); leave the more-opaque quarks writing depth
 * so they still sort against each other.
 *
 * Shell detection is global across the whole proton (lowest likelihood score),
 * not per-mesh — so a loader that splits primitives into separate meshes still
 * only marks the true envelope as glass. Quarks also get a lower `renderOrder`
 * than the shell: all four meshes share the same world position, so Three's
 * transparent distance-sort cannot break ties — without an explicit order the
 * shell sometimes paints over the blue quark.
 */
function configureProtonAppearance(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as any).isMesh) return;
    meshes.push(mesh);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of list) {
      if (mat) materials.add(mat);
    }
  });

  let bestShellScore = Number.POSITIVE_INFINITY;
  for (const mat of materials) {
    bestShellScore = Math.min(bestShellScore, shellLikelihood(mat));
  }

  for (const mat of materials) {
    const isShell = shellLikelihood(mat) <= bestShellScore + 1e-6;
    mat.transparent = true;
    mat.depthTest = true;
    mat.depthWrite = !isShell;
    mat.needsUpdate = true;
  }

  const quarkOrder = 600_000;
  const shellOrder = 600_010;
  for (const mesh of meshes) {
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const isShellMesh = list.some(
      (m) => !!m && shellLikelihood(m) <= bestShellScore + 1e-6
    );
    mesh.renderOrder = isShellMesh ? shellOrder : quarkOrder;
  }
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
    configureProtonAppearance(plusZ);
    configureProtonAppearance(minusZ);

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
    const halfSep = lerp(this.halfSeparationStart, 0, easeIn(progress));
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
