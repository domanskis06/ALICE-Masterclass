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

import { applyDetectorDarkMode, OUTER_MAGNET_LOD_NAME } from './detector-appearance';

/**
 * Default camera pose: a 3/4 "down the barrel" view (looking into the L3 magnet
 * opening from front-left-above), matching the module's reference screenshot.
 * Z-dominant so the beam axis recedes into the frame. Detector / field / tracks
 * may be re-attached from the in-memory session cache on revisit.
 */
const INITIAL_CAMERA_POSITION = new THREE.Vector3(-2.8, 2.4, 11.5);
const INITIAL_CAMERA_TARGET = new THREE.Vector3(0, 0, 0);

/**
 * Near-black (matches the reference screenshot) vs. a soft light background.
 * Dark is lifted slightly off pure black (`0x05070d` -> `0x0a0f18`) so very
 * low-opacity shells keep a faint, dark-blue "glass" tint against the
 * background instead of reading as a flat void — still near-black, not a
 * visible navy tint at a glance.
 */
const DARK_BACKGROUND = new THREE.Color(0x0a0f18);
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
  /** Raised from 0.05 so linear depth keeps more bits in the detector volume. */
  private static readonly NEAR_CLIPPING_PLANE = 0.1;
  /** Detector + orbit fit well inside ~40 wu; 1500 wasted depth precision. */
  private static readonly FAR_CLIPPING_PLANE = 200;
  /** OrbitControls default is 1 — lower values feel slower and less jumpy. */
  private static readonly ORBIT_ROTATE_SPEED = 0.5;
  /** Same pan tuning as `EventDisplayComponent` free-camera mode. */
  private static readonly PAN_SPEED_FACTOR = 0.007;
  private static readonly WHEEL_PAN_FACTOR = 0.05;
  private static readonly MOUSE_DRAG_PAN_FACTOR = 0.001;

  /**
   * Light retune on dark/light toggle, mirroring
   * `EventDisplayComponent.syncSceneLighting` (see `docs/event-display.md`).
   * Dark values match the previous static `setupLights` — no regression there.
   * Light values give a brighter, flatter fill so albedo-only (non-neon)
   * materials don't stay dim against the pale `LIGHT_BACKGROUND`.
   */
  private static readonly DARK_MODE_AMBIENT = { color: 0x444444, intensity: 1 };
  private static readonly DARK_MODE_HEMISPHERE = { sky: 0xb8c8e8, ground: 0x2a2a30, intensity: 0.5 };
  private static readonly DARK_MODE_DIRECTIONAL_INTENSITY = 0.45;
  private static readonly LIGHT_MODE_AMBIENT = { color: 0xa2a2a2, intensity: 0.925 };
  private static readonly LIGHT_MODE_HEMISPHERE = { sky: 0xd5dff4, ground: 0x81838b, intensity: 0.7 };
  private static readonly LIGHT_MODE_DIRECTIONAL_INTENSITY = 0.5;

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
  private ambientLight?: THREE.AmbientLight;
  private hemisphereLight?: THREE.HemisphereLight;
  private directionalLightA?: THREE.DirectionalLight;
  private directionalLightB?: THREE.DirectionalLight;
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
  /** Pointer/touch actively driving OrbitControls (rotate / zoom / pan). */
  private controlsInteracting = false;
  /** Sidebar preference for L3 (no auto-hide anymore — see applyOuterMagnetVisibility). */
  private outerMagnetUserVisible = true;

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
      // Needed to stop ITS/TPC/ABSO z-fighting once shells overlap in depth.
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
      this.controlsInteracting = true;
      this.applyPixelRatio(1);
      this.needsRender = true;
    });
    this.controls.addEventListener('end', () => {
      this.controlsInteracting = false;
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
   * Sidebar preference for the L3 magnet. Safe to call before the L3 root is
   * attached — the preference is applied on the next visibility pass.
   */
  setOuterMagnetUserVisible(visible: boolean): void {
    this.outerMagnetUserVisible = visible;
    this.applyOuterMagnetVisibility();
    this.needsRender = true;
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
      this.controls.enableZoom = true;
      this.controls.target.set(0, 0, 0);
    } else {
      // Free look: custom WASD / drag / wheel fly. Disable OrbitControls
      // dolly so it does not fight the wheel handler (opposing directions).
      this.controls.enablePan = true;
      this.controls.enableRotate = false;
      this.controls.enableZoom = false;
    }
    this.isMousePanning = false;
    this.needsRender = true;
  }

  /** True while free-cam mouse/keyboard navigation still needs continuous frames. */
  isNavigating(): boolean {
    return this.isMousePanning || this.hasPanKeysDown();
  }

  /** Toggles background + lights + detector material treatment between dark and light. */
  setDarkMode(darkMode: boolean): void {
    this._darkMode = darkMode;
    this.scene.background = darkMode ? DARK_BACKGROUND : LIGHT_BACKGROUND;
    this.syncSceneLighting();
    applyDetectorDarkMode(this.detectorGroup, darkMode);
    this.needsRender = true;
  }

  /** Restores the reference "down the barrel" pose (used on (re)mount). */
  resetCamera(): void {
    this.camera.position.copy(INITIAL_CAMERA_POSITION);
    this.controls.target.copy(INITIAL_CAMERA_TARGET);
    this.controls.update();
    this.applyOuterMagnetVisibility();
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
    this.ambientLight = ambientLight;
    this.hemisphereLight = hemisphereLight;
    this.directionalLightA = directionalLightA;
    this.directionalLightB = directionalLightB;
    this.syncSceneLighting();
  }

  /**
   * Bright, flatter fill in light mode; keeps the darker neon contrast in dark
   * mode. Mirrors `EventDisplayComponent.syncSceneLighting` — see
   * `docs/event-display.md`. Note: only the *scene* fill lights are retuned
   * here. Boosting these does not fix low-opacity shells reading as black —
   * `Material.opacity` scales the *entire* blended fragment (diffuse +
   * emissive) toward the background colour, so no amount of scene light can
   * compensate at very low alpha. That is handled by
   * `syncDetectorFadeAppearance`'s emissive boost in `detector-appearance.ts`.
   */
  private syncSceneLighting(): void {
    if (
      !this.ambientLight ||
      !this.hemisphereLight ||
      !this.directionalLightA ||
      !this.directionalLightB
    ) {
      return;
    }
    if (this._darkMode) {
      const a = PropagationScene.DARK_MODE_AMBIENT;
      const h = PropagationScene.DARK_MODE_HEMISPHERE;
      this.ambientLight.color.setHex(a.color);
      this.ambientLight.intensity = a.intensity;
      this.hemisphereLight.color.setHex(h.sky);
      this.hemisphereLight.groundColor.setHex(h.ground);
      this.hemisphereLight.intensity = h.intensity;
      this.directionalLightA.intensity = PropagationScene.DARK_MODE_DIRECTIONAL_INTENSITY;
      this.directionalLightB.intensity = PropagationScene.DARK_MODE_DIRECTIONAL_INTENSITY;
    } else {
      const a = PropagationScene.LIGHT_MODE_AMBIENT;
      const h = PropagationScene.LIGHT_MODE_HEMISPHERE;
      this.ambientLight.color.setHex(a.color);
      this.ambientLight.intensity = a.intensity;
      this.hemisphereLight.color.setHex(h.sky);
      this.hemisphereLight.groundColor.setHex(h.ground);
      this.hemisphereLight.intensity = h.intensity;
      this.directionalLightA.intensity = PropagationScene.LIGHT_MODE_DIRECTIONAL_INTENSITY;
      this.directionalLightB.intensity = PropagationScene.LIGHT_MODE_DIRECTIONAL_INTENSITY;
    }
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
    // Fly along the look axis (same as WASD W/S): move camera and target
    // together so distance stays constant. Scroll up = forward.
    const distance = this.controls.target.distanceTo(this.camera.position);
    const step = (e.deltaY > 0 ? -1 : 1) * distance * PropagationScene.WHEEL_PAN_FACTOR;
    this.panDir.subVectors(this.controls.target, this.camera.position).normalize();
    this.panVec.copy(this.panDir).multiplyScalar(step);
    this.camera.position.add(this.panVec);
    this.controls.target.add(this.panVec);
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

  private findOuterMagnet(): THREE.Object3D | null {
    return this.detectorGroup.getObjectByName(OUTER_MAGNET_LOD_NAME) ?? null;
  }

  /**
   * L3 visibility now follows only the sidebar toggle
   * ({@link setOuterMagnetUserVisible}) — no more auto-hide while orbiting or
   * when the camera zooms into the TRD region. Both auto-hide paths were a
   * fill-rate mitigation for the previous, heavier L3 model; the model has
   * since been shrunk, so unconditionally hiding/showing the yoke mid-drag
   * (or mid-zoom) is no longer needed and was itself a visible "jump" tied to
   * every rotation/zoom gesture.
   */
  private applyOuterMagnetVisibility(): void {
    const root = this.findOuterMagnet();
    if (!root) return;
    root.visible = this.outerMagnetUserVisible;
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
    this.applyOuterMagnetVisibility();
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
