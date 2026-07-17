import * as THREE from 'three';
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
  });

  it('switches to free camera mode (pan on, rotate off) like EventDisplay', () => {
    scene.setCameraMode('free');
    expect(scene.cameraMode).toBe('free');
    expect(scene.controls.enablePan).toBe(true);
    expect(scene.controls.enableRotate).toBe(false);
  });

  it('restores centered mode and locks the orbit target to the origin', () => {
    scene.setCameraMode('free');
    scene.controls.target.set(1, 2, 3);
    scene.setCameraMode('centered');
    expect(scene.controls.enablePan).toBe(false);
    expect(scene.controls.enableRotate).toBe(true);
    expect(scene.controls.target.x).toBe(0);
    expect(scene.controls.target.y).toBe(0);
    expect(scene.controls.target.z).toBe(0);
  });
});
