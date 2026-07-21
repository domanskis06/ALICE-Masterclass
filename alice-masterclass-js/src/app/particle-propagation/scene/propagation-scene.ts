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
 * Z-dominant so the beam axis recedes into the frame. Detector / field / tracks
 * may be re-attached from the in-memory session cache on revisit.
 */
const INITIAL_CAMERA_POSITION = new THREE.Vector3(-2.8, 2.4, 11.5);
const INITIAL_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

/** Near-black (matches the reference screenshot) vs. a soft light background. */
const DARK_BACKGROUND = new THREE.Color(0x05070d);
const LIGHT_BACKGROUND = new THREE.Color(0xeef1f6);

/** Matches `EventDisplayComponent` camera radio: orbit-about-origin vs free-look pan. */
export type PropagationCameraMode = 'centered' | 'free';

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
  /** OrbitControls default is 1 — lower values feel slower and less jumpy. */
  private static readonly ORBIT_ROTATE_SPEED = 0.5;
  /** Same pan tuning as `EventDisplayComponent` free-camera mode. */
  private static readonly PAN_SPEED_FACTOR = 0.005;
  private static readonly WHEEL_PAN_FACTOR = 0.03;
  private static readonly MOUSE_DRAG_PAN_FACTOR = 0.0008;

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
  private _cameraMode: PropagationCameraMode = 'centered';
  private readonly keysDown: Record<string, boolean> = {};
  private isMousePanning = false;
  private lastMousePanX = 0;
  private lastMousePanY = 0;
  private readonly panDir = new THREE.Vector3();
  private readonly panRight = new THREE.Vector3();
  private readonly panVec = new THREE.Vector3();
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
    // Full vertical orbit (same as EventDisplay): allow viewing from below.
    this.controls.minPolarAngle = 0;
    this.controls.maxPolarAngle = Math.PI;
    // Clamp zoom: without a floor the camera can sit on the target and trip
    // near-plane clipping. Keep this low enough to enter the ITS bore
    // (outer ~0.4 wu at scale 1e-2) while staying above NEAR_CLIPPING_PLANE.
    this.controls.minDistance = 0.15;
    this.controls.maxDistance = 40;
    this.controls.rotateSpeed = PropagationScene.ORBIT_ROTATE_SPEED;
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    // Default "centered" mode: no pan so the vertex stays under the cursor
    // while orbiting (same as EventDisplayComponent). Free mode re-enables pan.
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
    this.attachCameraInputListeners();

    this.tracksGroup.visible = false;
    this.scene.add(this.lights, this.detectorGroup, this.fieldGroup, this.introGroup, this.tracksGroup);
    this.scene.background = this._darkMode ? DARK_BACKGROUND : LIGHT_BACKGROUND;

    this.resize(width, height);
  }

  /** Whether the neon/dark look is active. */
  get darkMode(): boolean {
    return this._darkMode;
  }

  /** Current orbit vs free-look mode (matches EventDisplay camera radio). */
  get cameraMode(): PropagationCameraMode {
    return this._cameraMode;
  }

  /**
   * Switches between centered orbit (rotate about origin) and free look
   * (WASD / drag / wheel pan, no orbit rotate) — same behaviour as
   * `EventDisplayComponent.updateCameraMode()`.
   */
  setCameraMode(mode: PropagationCameraMode): void {
    this._cameraMode = mode;
    if (mode === 'centered') {
      this.controls.enablePan = false;
      this.controls.enableRotate = true;
      this.controls.target.set(0, 0, 0);
    } else {
      this.controls.enablePan = true;
      this.controls.enableRotate = false;
    }
    this.isMousePanning = false;
    this.needsRender = true;
  }

  /** True while free-cam mouse/keyboard navigation still needs continuous frames. */
  isNavigating(): boolean {
    return this.isMousePanning || this.hasPanKeysDown();
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
    this.needsRender = true;
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

  private attachCameraInputListeners(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private detachCameraInputListeners(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement;
    if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
    this.keysDown[e.key] = true;
    if (this._cameraMode === 'free' && this.hasPanKeysDown()) this.needsRender = true;
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysDown[e.key] = false;
  };

  private onPointerDown = (event: PointerEvent): void => {
    if (this._cameraMode !== 'free' || event.button !== 0) return;
    this.isMousePanning = true;
    this.lastMousePanX = event.clientX;
    this.lastMousePanY = event.clientY;
    this.needsRender = true;
  };

  private onPointerMove = (event: PointerEvent): void => {
    if (!this.isMousePanning) return;
    const deltaX = event.clientX - this.lastMousePanX;
    const deltaY = event.clientY - this.lastMousePanY;
    this.lastMousePanX = event.clientX;
    this.lastMousePanY = event.clientY;
    this.applyMousePan(deltaX, deltaY);
  };

  private onPointerUp = (): void => {
    this.isMousePanning = false;
  };

  private onWheel = (e: WheelEvent): void => {
    if (this._cameraMode !== 'free') return;
    e.preventDefault();
    const distance = this.controls.target.distanceTo(this.camera.position);
    const step = (e.deltaY > 0 ? 1 : -1) * distance * PropagationScene.WHEEL_PAN_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera.position).normalize();
    this.panVec.copy(this.panDir).multiplyScalar(step);
    this.camera.position.add(this.panVec);
    this.needsRender = true;
  };

  private applyMousePan(deltaX: number, deltaY: number): void {
    const distance = this.controls.target.distanceTo(this.camera.position);
    const scale = distance * PropagationScene.MOUSE_DRAG_PAN_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera.position).normalize();
    this.panRight.crossVectors(this.panDir, this.camera.up).normalize();
    this.panVec.set(0, 0, 0);
    this.panVec.addScaledVector(this.panRight, -deltaX * scale);
    this.panVec.addScaledVector(this.camera.up, deltaY * scale);
    this.camera.position.add(this.panVec);
    this.controls.target.add(this.panVec);
    this.needsRender = true;
  }

  private applyKeyboardPan(): void {
    if (this._cameraMode !== 'free') return;
    const focusEl = document.activeElement as HTMLElement;
    if (focusEl?.tagName === 'INPUT' || focusEl?.tagName === 'TEXTAREA' || focusEl?.isContentEditable) {
      return;
    }
    if (!this.hasPanKeysDown()) return;
    const distance = this.controls.target.distanceTo(this.camera.position);
    const step = distance * PropagationScene.PAN_SPEED_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera.position).normalize();
    this.panRight.crossVectors(this.panDir, this.camera.up).normalize();
    this.panVec.set(0, 0, 0);
    const k = this.keysDown;
    if (k['w'] || k['W'] || k['ArrowUp']) this.panVec.add(this.panDir);
    if (k['s'] || k['S'] || k['ArrowDown']) this.panVec.sub(this.panDir);
    if (k['d'] || k['D'] || k['ArrowRight']) this.panVec.add(this.panRight);
    if (k['a'] || k['A'] || k['ArrowLeft']) this.panVec.sub(this.panRight);
    if (k['e'] || k['E']) this.panVec.y += 1;
    if (k['q'] || k['Q']) this.panVec.y -= 1;
    if (this.panVec.lengthSq() > 0) {
      this.panVec.normalize().multiplyScalar(step);
      this.camera.position.add(this.panVec);
      this.controls.target.add(this.panVec);
      this.needsRender = true;
    }
  }

  private hasPanKeysDown(): boolean {
    const k = this.keysDown;
    return !!(
      k['w'] ||
      k['W'] ||
      k['ArrowUp'] ||
      k['s'] ||
      k['S'] ||
      k['ArrowDown'] ||
      k['a'] ||
      k['A'] ||
      k['ArrowLeft'] ||
      k['d'] ||
      k['D'] ||
      k['ArrowRight'] ||
      k['q'] ||
      k['Q'] ||
      k['e'] ||
      k['E']
    );
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
    if (this._cameraMode === 'centered') {
      this.controls.target.set(0, 0, 0);
    } else {
      this.applyKeyboardPan();
    }
    const dampingActive = this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.needsRender = false;
    // OrbitControls.update() returns true while damping still moves the camera.
    if (dampingActive || this.isNavigating()) this.needsRender = true;
    return !!dampingActive || this.isNavigating();
  }

  dispose(): void {
    this.detachCameraInputListeners();
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
