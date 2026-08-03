/**
 * Pre-collision animation: two beam particles flying in from opposite ends of
 * the beam axis along `z` — starting just inside the beam pipe's end
 * (`BEAM_HALF_SEPARATION_START`) — meeting at the origin at `t = 0`.
 *
 * Beam species:
 *   - `'proton'`     — cloned `proton.glb` (standard events)
 *   - `'pb-nucleus'` — procedural Pb nuclei (dense Pb–Pb demo event)
 *
 * `update(tIntroMs)` is a pure function of the *global* intro time (always in
 * `[-INTRO_DURATION_MS, 0]`), not an accumulated per-frame delta — this is what
 * lets `PropagationTimeline` scrub the slider backward/forward through the intro
 * without drift.
 *
 * No beam-pipe mesh is drawn here — the real `BP.glb` already lives on the
 * beam axis as part of the detector shell.
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader';
import {
  INTRO_DURATION_MS,
  INTRO_EASE_IN_POWER,
  BEAM_HALF_SEPARATION_START,
  NUCLEUS_TARGET_DIAMETER_WORLD,
} from './timeline-constants';
import {
  createLeadNucleusMesh,
  disposeLeadNucleusMesh,
  LEAD_NUCLEUS_KIND,
  LEAD_NUCLEUS_LOCAL_DIAMETER,
} from './lead-nucleus-mesh';

/** Which projectile pair the intro shows. */
export type CollisionIntroBeamKind = 'proton' | 'pb-nucleus';

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
  if (/material\.002/i.test(named)) return 0;
  if (/material\.00[345]/i.test(named)) return 1;
  const opacity = (mat as THREE.Material & { opacity?: number }).opacity;
  return typeof opacity === 'number' ? opacity : 1;
}

/**
 * `proton.glb` is one multi-material sphere: a translucent shell wrapping three
 * RGB quark blobs. Treat the shell as glass (`depthWrite = false`); leave quarks
 * writing depth. Shell gets a higher `renderOrder` so it does not bury quarks.
 */
function configureProtonAppearance(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!(mesh as THREE.Mesh & { isMesh?: boolean }).isMesh) return;
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

function scaleToTargetDiameter(root: THREE.Object3D, localDiameter: number): void {
  const uniformScale = NUCLEUS_TARGET_DIAMETER_WORLD / Math.max(localDiameter, 1e-6);
  root.scale.setScalar(uniformScale);
}

function disposeObjectTree(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}

async function loadProtonPair(protonModelUrl: string): Promise<[THREE.Object3D, THREE.Object3D]> {
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
  plusZ.scale.setScalar(NUCLEUS_TARGET_DIAMETER_WORLD / maxDim);
  minusZ.scale.setScalar(NUCLEUS_TARGET_DIAMETER_WORLD / maxDim);
  configureProtonAppearance(plusZ);
  configureProtonAppearance(minusZ);
  plusZ.userData['kind'] = 'proton';
  minusZ.userData['kind'] = 'proton';
  return [plusZ, minusZ];
}

function createPbPair(): [THREE.Object3D, THREE.Object3D] {
  const plusZ = createLeadNucleusMesh();
  const minusZ = createLeadNucleusMesh();
  scaleToTargetDiameter(plusZ, LEAD_NUCLEUS_LOCAL_DIAMETER);
  scaleToTargetDiameter(minusZ, LEAD_NUCLEUS_LOCAL_DIAMETER);
  return [plusZ, minusZ];
}

export class CollisionIntro {
  readonly group = new THREE.Group();
  readonly beamKind: CollisionIntroBeamKind;

  private constructor(
    beamKind: CollisionIntroBeamKind,
    private readonly beamPlusZ: THREE.Object3D,
    private readonly beamMinusZ: THREE.Object3D,
    private readonly halfSeparationStart: number
  ) {
    this.beamKind = beamKind;
    this.group.add(beamMinusZ, beamPlusZ);
  }

  /**
   * Builds two incoming beam projectiles for `beamKind`.
   * - `'proton'`: loads `protonModelUrl` (default {@link PROTON_MODEL_PATH} via caller)
   * - `'pb-nucleus'`: procedural lead nuclei (no fetch)
   */
  static async create(
    beamKind: CollisionIntroBeamKind = 'proton',
    protonModelUrl = 'assets/models/proton.glb'
  ): Promise<CollisionIntro> {
    const [plusZ, minusZ] =
      beamKind === 'pb-nucleus' ? createPbPair() : await loadProtonPair(protonModelUrl);

    const intro = new CollisionIntro(beamKind, plusZ, minusZ, BEAM_HALF_SEPARATION_START);
    intro.reset();
    return intro;
  }

  /**
   * Positions the beams for intro time `tIntroMs` (expected range
   * `[-INTRO_DURATION_MS, 0]`); for `tIntroMs >= 0` both are hidden.
   */
  update(tIntroMs: number): void {
    if (tIntroMs >= 0) {
      this.beamPlusZ.visible = false;
      this.beamMinusZ.visible = false;
      return;
    }
    this.beamPlusZ.visible = true;
    this.beamMinusZ.visible = true;

    const progress = clamp01((tIntroMs + INTRO_DURATION_MS) / INTRO_DURATION_MS);
    const halfSep = lerp(this.halfSeparationStart, 0, easeIn(progress));
    this.beamPlusZ.position.set(0, 0, halfSep);
    this.beamMinusZ.position.set(0, 0, -halfSep);
  }

  /** Rewinds to the start of the intro (`t = -INTRO_DURATION_MS`). */
  reset(): void {
    this.update(-INTRO_DURATION_MS);
  }

  dispose(): void {
    for (const root of [this.beamPlusZ, this.beamMinusZ]) {
      if (root.userData['kind'] === LEAD_NUCLEUS_KIND) {
        disposeLeadNucleusMesh(root);
      } else {
        disposeObjectTree(root);
      }
    }
    this.group.clear();
  }
}

export { LEAD_NUCLEUS_KIND };
