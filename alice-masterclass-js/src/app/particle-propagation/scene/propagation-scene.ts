/**
 * Core Three.js scene for the Particle Propagation module.
 *
 * Deliberately a plain TypeScript class (not an Angular service/component) so
 * it stays a dumb rendering shell: no physics, no HTTP, no RxJS. Instantiated
 * once by `ParticlePropagationComponent` and driven from its `requestAnimationFrame`
 * loop. Camera/lighting setup mirrors `EventDisplayComponent.createScene()` —
 * see `docs/event-display.md` — but this class does **not** extend or import
 * that component (god-node isolation, per `.cursor/rules/architecture.mdc`).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import { applyDetectorDarkMode } from './detector-appearance';

/**
 * Default camera pose: a 3/4 "down the barrel" view (looking into the L3 magnet
 * opening from front-left-above), matching the module's reference screenshot.
 * Z-dominant so the beam axis recedes into the frame. Applied on every open of
 * `/particle-propagation` (no session persistence) — see plan §6.
 */
const INITIAL_CAMERA_POSITION = new THREE.Vector3(-2.8, 2.4, 11.5);
const INITIAL_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

/** Near-black (matches the reference screenshot) vs. a soft light background. */
const DARK_BACKGROUND = new THREE.Color(0x05070d);
const LIGHT_BACKGROUND = new THREE.Color(0xeef1f6);

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(material)) {
      material.forEach((m) => m.dispose());
    } else {
      material?.dispose();
    }
  });
}

export class PropagationScene {
  /** cm -> Three.js world units, matches `EventDisplayComponent.objectScale`. */
  static readonly objectScale = 1.0e-2;

  private static readonly FIELD_OF_VIEW = 70;
  private static readonly NEAR_CLIPPING_PLANE = 0.05;
  private static readonly FAR_CLIPPING_PLANE = 1500;

  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly controls: OrbitControls;

  /** Static detector geometry (Faza 7). */
  readonly detectorGroup = new THREE.Group();
  /** Magnetic-field line visualization (streamlines + direction arrows). */
  readonly fieldGroup = new THREE.Group();
  /** Pre-computed particle tracks (Faza 9). Hidden until `t > 0` (Faza 10). */
  readonly tracksGroup = new THREE.Group();
  /** Incoming-proton intro animation (Faza 8). Hidden once `t >= 0`. */
  readonly introGroup = new THREE.Group();

  private readonly lights = new THREE.Group();
  private _darkMode = true;
  /** Capped DPR for idle frames; interaction temporarily drops to 1. */
  private readonly maxPixelRatio: number;
  private viewWidth = 1;
  private viewHeight = 1;

  /**
   * Set when the scene graph / camera changed and a frame must be drawn.
   * The host component drives a demand-based RAF loop: continuous only while
   * playing or while OrbitControls damping still settles.
   */
  needsRender = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      logarithmicDepthBuffer: true,
      powerPreference: 'high-performance',
    });
    // Cap the device pixel ratio: uncapped HiDPI rendering multiplies fragment
    // work quadratically and was a major cause of the orbit lag when zoomed in
    // (fill-rate bound). 1.5 keeps edges crisp without shading 4x the pixels.
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;
    this.maxPixelRatio = Math.min(dpr, 1.5);
    this.renderer.setPixelRatio(this.maxPixelRatio);
    this.renderer.shadowMap.enabled = false;
    this.renderer.sortObjects = true;

    const width = canvas.clientWidth || 1;
    const height = canvas.clientHeight || 1;
    this.camera = new THREE.PerspectiveCamera(
      PropagationScene.FIELD_OF_VIEW,
      width / height,
      PropagationScene.NEAR_CLIPPING_PLANE,
      PropagationScene.FAR_CLIPPING_PLANE
    );
    this.camera.position.copy(INITIAL_CAMERA_POSITION);
    this.camera.up.set(0, 1, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(INITIAL_CAMERA_TARGET);
    this.controls.maxPolarAngle = 0.5 * Math.PI;
    // Clamp zoom: without a minDistance the camera can dive *inside* the
    // geometry, where near-plane clipping + full-screen overdraw tank the frame
    // rate. Bounds sized to the ~5-unit detector (scale 1e-2 of ~500 cm).
    // Keep the camera outside the innermost shell (VA-like orbit), not inside
    // the L3 barrel opening where nested translucent layers fill the screen.
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 40;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    // The collision vertex and the detector model are both centred on the
    // world origin (see docs/particle-propagation.md); disabling pan is what
    // guarantees they *stay* visually centred under the cursor no matter how
    // the user orbits/zooms — same rationale as EventDisplayComponent's
    // "centered" camera mode (`updateCameraMode`), applied here unconditionally
    // since this scene has no free/pan mode to begin with.
    this.controls.enablePan = false;
    this.controls.addEventListener('change', () => {
      this.needsRender = true;
    });
    this.controls.addEventListener('start', () => {
      // Drop to 1× DPR while dragging — fill-rate dominated when zoomed in.
      this.applyPixelRatio(1);
      this.needsRender = true;
    });
    this.controls.addEventListener('end', () => {
      this.applyPixelRatio(this.maxPixelRatio);
      this.needsRender = true;
    });

    this.setupLights();

    this.tracksGroup.visible = false;
    this.scene.add(this.lights, this.detectorGroup, this.fieldGroup, this.introGroup, this.tracksGroup);
    this.scene.background = this._darkMode ? DARK_BACKGROUND : LIGHT_BACKGROUND;

    this.resize(width, height);
  }

  /** Whether the neon/dark look is active. */
  get darkMode(): boolean {
    return this._darkMode;
  }

  /** Toggles background + detector material treatment between dark and light. */
  setDarkMode(darkMode: boolean): void {
    this._darkMode = darkMode;
    this.scene.background = darkMode ? DARK_BACKGROUND : LIGHT_BACKGROUND;
    applyDetectorDarkMode(this.detectorGroup, darkMode);
    this.needsRender = true;
  }

  /** Restores the reference "down the barrel" pose (used on (re)mount). */
  resetCamera(): void {
    this.camera.position.copy(INITIAL_CAMERA_POSITION);
    this.controls.target.copy(INITIAL_CAMERA_TARGET);
    this.controls.update();
  }

  private setupLights(): void {
    const ambientLight = new THREE.AmbientLight(0x444444);
    const hemisphereLight = new THREE.HemisphereLight(0xb8c8e8, 0x2a2a30, 0.5);
    const directionalLightA = new THREE.DirectionalLight(0xffffff, 0.45);
    directionalLightA.position.set(1, 1, 1);
    const directionalLightB = new THREE.DirectionalLight(0xffffff, 0.45);
    directionalLightB.position.set(-1, 1, -1);
    this.lights.add(ambientLight, hemisphereLight, directionalLightA, directionalLightB);
  }

  /** Resizes the renderer/camera to match the canvas's current CSS size. */
  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.viewWidth = width;
    this.viewHeight = height;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.needsRender = true;
  }

  private applyPixelRatio(ratio: number): void {
    if (this.renderer.getPixelRatio() === ratio) return;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(this.viewWidth, this.viewHeight, false);
  }

  /**
   * Renders one frame. Callers are responsible for driving time-dependent
   * visibility first (`PropagationTimeline.applyTime(t)`, Faza 10) — this
   * class only owns the camera/renderer/scene graph, not "what time it is".
   *
   * @returns `true` if damping is still settling (caller should keep RAF alive).
   */
  render(): boolean {
    const dampingActive = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
    // OrbitControls.update() returns true while damping still moves the camera.
    if (dampingActive) this.needsRender = true;
    return !!dampingActive;
  }

  dispose(): void {
    this.controls.dispose();
    disposeObject3D(this.detectorGroup);
    disposeObject3D(this.fieldGroup);
    disposeObject3D(this.tracksGroup);
    disposeObject3D(this.introGroup);
    this.detectorGroup.clear();
    this.fieldGroup.clear();
    this.tracksGroup.clear();
    this.introGroup.clear();
    this.renderer.dispose();
  }
}
