import * as THREE from 'three';
import {
  OUTER_MAGNET_HIDE_NEAR_DISTANCE,
  OUTER_MAGNET_LOD_NAME,
  OUTER_MAGNET_SHOW_NEAR_DISTANCE,
} from './detector-appearance';
import { PropagationScene } from './propagation-scene';

describe('PropagationScene', () => {
  let canvas: HTMLCanvasElement;
  let scene: PropagationScene;

  beforeEach(() => {
    canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    document.body.appendChild(canvas);
    scene = new PropagationScene(canvas);
  });

  afterEach(() => {
    scene.dispose();
    canvas.remove();
  });

  it('creates a real WebGL renderer/camera/controls and wires up the scene groups', () => {
    expect(scene.renderer).toBeInstanceOf(THREE.WebGLRenderer);
    expect(scene.camera).toBeInstanceOf(THREE.PerspectiveCamera);
    expect(scene.scene.children).toContain(scene.detectorGroup);
    expect(scene.scene.children).toContain(scene.introGroup);
    expect(scene.scene.children).toContain(scene.tracksGroup);
    expect(scene.controls.enableDamping).toBe(true);
    expect(scene.controls.rotateSpeed).toBeLessThan(1);
  });

  it('hides tracksGroup by default (nothing to show before t > 0)', () => {
    expect(scene.tracksGroup.visible).toBe(false);
  });

  it('renders a frame without throwing', () => {
    expect(() => scene.render()).not.toThrow();
  });

  it('resizes the camera aspect ratio and renderer to the given dimensions', () => {
    scene.resize(800, 400);
    expect(scene.camera.aspect).toBeCloseTo(2, 5);
  });

  it('ignores non-positive resize dimensions instead of producing NaN aspect ratios', () => {
    const before = scene.camera.aspect;
    scene.resize(0, 500);
    expect(scene.camera.aspect).toBe(before);
  });

  it('defaults to centered camera mode with pan disabled', () => {
    expect(scene.cameraMode).toBe('centered');
    expect(scene.controls.enablePan).toBe(false);
    expect(scene.controls.enableRotate).toBe(true);
    expect(scene.controls.enableZoom).toBe(true);
  });

  it('allows full polar orbit (view from below), matching EventDisplay', () => {
    expect(scene.controls.minPolarAngle).toBe(0);
    expect(scene.controls.maxPolarAngle).toBe(Math.PI);
  });

  it('switches to free camera mode (pan on, rotate/zoom off) like EventDisplay', () => {
    scene.setCameraMode('free');
    expect(scene.cameraMode).toBe('free');
    expect(scene.controls.enablePan).toBe(true);
    expect(scene.controls.enableRotate).toBe(false);
    expect(scene.controls.enableZoom).toBe(false);
  });

  it('restores centered mode and locks the orbit target to the origin', () => {
    scene.setCameraMode('free');
    scene.controls.target.set(1, 2, 3);
    scene.setCameraMode('centered');
    expect(scene.controls.enablePan).toBe(false);
    expect(scene.controls.enableRotate).toBe(true);
    expect(scene.controls.enableZoom).toBe(true);
    expect(scene.controls.target.x).toBe(0);
    expect(scene.controls.target.y).toBe(0);
    expect(scene.controls.target.z).toBe(0);
  });

  it('auto-hides L3 while orbiting and when the camera enters the TRD region', () => {
    const l3 = new THREE.Group();
    l3.name = OUTER_MAGNET_LOD_NAME;
    scene.detectorGroup.add(l3);
    scene.setOuterMagnetUserVisible(true);
    scene.render();
    expect(l3.visible).toBe(true);

    scene.controls.dispatchEvent({ type: 'start' });
    scene.render();
    expect(l3.visible).toBe(false);

    scene.controls.dispatchEvent({ type: 'end' });
    // Idle: L3 returns at the default orbit distance.
    scene.camera.position.set(-2.8, 2.4, 11.5);
    scene.controls.target.set(0, 0, 0);
    scene.render();
    expect(l3.visible).toBe(true);

    // Zoom into the TRD region — L3 stays hidden past the hide threshold.
    scene.camera.position.set(0, 0, OUTER_MAGNET_HIDE_NEAR_DISTANCE - 0.2);
    scene.render();
    expect(l3.visible).toBe(false);

    // Still hidden in the hysteresis band.
    scene.camera.position.set(
      0,
      0,
      (OUTER_MAGNET_HIDE_NEAR_DISTANCE + OUTER_MAGNET_SHOW_NEAR_DISTANCE) / 2
    );
    scene.render();
    expect(l3.visible).toBe(false);

    // Pull back past the show threshold.
    scene.camera.position.set(0, 0, OUTER_MAGNET_SHOW_NEAR_DISTANCE + 0.2);
    scene.render();
    expect(l3.visible).toBe(true);

    // Sidebar off always wins.
    scene.setOuterMagnetUserVisible(false);
    scene.render();
    expect(l3.visible).toBe(false);
  });

  it('free-cam wheel flies along the look axis without changing orbit distance', () => {
    scene.setCameraMode('free');
    const distBefore = scene.controls.target.distanceTo(scene.camera.position);
    const camBefore = scene.camera.position.clone();
    const targetBefore = scene.controls.target.clone();

    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));

    const distAfter = scene.controls.target.distanceTo(scene.camera.position);
    expect(distAfter).toBeCloseTo(distBefore, 5);
    // Scroll up = forward toward the previous look point.
    expect(scene.camera.position.distanceTo(camBefore)).toBeGreaterThan(0);
    expect(scene.controls.target.distanceTo(targetBefore)).toBeGreaterThan(0);
    const camDelta = new THREE.Vector3().subVectors(scene.camera.position, camBefore);
    const targetDelta = new THREE.Vector3().subVectors(scene.controls.target, targetBefore);
    expect(camDelta.distanceTo(targetDelta)).toBeCloseTo(0, 5);
  });
});
