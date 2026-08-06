import { EventDisplayComponent } from './event-display.component';
import * as THREE from 'three';

describe('EventDisplayComponent detector part UI defaults', () => {
  const paths = [
    'assets/models/alice components/ITS.glb',
    'assets/models/alice components/FIT.glb',
    'assets/models/alice components/L3.glb',
  ];

  afterEach(() => {
    sessionStorage.removeItem(EventDisplayComponent.DETECTOR_PART_UI_STORAGE_KEY);
  });

  it('exposes a dedicated sessionStorage key for layer toggles', () => {
    expect(EventDisplayComponent.DETECTOR_PART_UI_STORAGE_KEY).toContain('detectorPartUi');
  });

  it('treats FIT and L3 as hidden by default after a restored assembly', () => {
    expect(EventDisplayComponent.isFitAssetPath(paths[1])).toBe(true);
    expect(EventDisplayComponent.isL3AssetPath(paths[2])).toBe(true);
    expect(EventDisplayComponent.isFitAssetPath(paths[0])).toBe(false);
  });
});

describe('EventDisplayComponent calorimeter assembly grouping', () => {
  it('freezes static detector transforms after bake', () => {
    const root = new THREE.Group();
    const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
    child.position.set(1, 2, 3);
    root.add(child);
    EventDisplayComponent.freezeStaticTransforms(root);
    expect(root.matrixAutoUpdate).toBe(false);
    expect(child.matrixAutoUpdate).toBe(false);
    expect(child.matrix.elements[12]).toBeCloseTo(1);
    expect(child.matrix.elements[13]).toBeCloseTo(2);
    expect(child.matrix.elements[14]).toBeCloseTo(3);
  });

  it('labels EMCal as Calorimeters in the assembly palette', () => {
    expect(
      EventDisplayComponent.assemblyPalettePresentation(
        'assets/models/alice components/EMCAL.glb'
      )
    ).toEqual({ labelKey: 'EVENT_DISPLAY.DETECTOR_CALORIMETERS' });
  });

  it('keeps separate EMCal / DCal labels for layer toggles', () => {
    expect(
      EventDisplayComponent.detectorPartPresentation(
        'assets/models/alice components/EMCAL.glb'
      )
    ).toEqual({ labelKey: 'EVENT_DISPLAY.DETECTOR_EMCAL' });
    expect(
      EventDisplayComponent.detectorPartPresentation(
        'assets/models/alice components/DCAL.glb'
      )
    ).toEqual({ labelKey: 'EVENT_DISPLAY.DETECTOR_DCAL' });
  });

  it('recognizes EMCal and DCal asset paths', () => {
    expect(EventDisplayComponent.isEmcalAssetPath('assets/x/EMCAL.glb')).toBe(true);
    expect(EventDisplayComponent.isDcalAssetPath('assets/x/DCAL.glb')).toBe(true);
    expect(EventDisplayComponent.isDcalAssetPath('assets/x/EMCAL.glb')).toBe(false);
  });
});

describe('EventDisplayComponent assembly camera', () => {
  it('keeps the close framing at progress 0', () => {
    expect(EventDisplayComponent.cameraPositionForAssemblyProgress(0)).toEqual(
      EventDisplayComponent.CAMERA_3D_ASSEMBLY_START
    );
  });

  it('reaches the overview framing at progress 1', () => {
    expect(EventDisplayComponent.cameraPositionForAssemblyProgress(1)).toEqual(
      EventDisplayComponent.CAMERA_3D_OVERVIEW
    );
  });

  it('interpolates midway between start and overview', () => {
    const mid = EventDisplayComponent.cameraPositionForAssemblyProgress(0.5);
    const a = EventDisplayComponent.CAMERA_3D_ASSEMBLY_START;
    const b = EventDisplayComponent.CAMERA_3D_OVERVIEW;
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2);
    expect(mid.z).toBeCloseTo((a.z + b.z) / 2);
  });

  it('clamps progress outside [0, 1]', () => {
    expect(EventDisplayComponent.cameraPositionForAssemblyProgress(-1)).toEqual(
      EventDisplayComponent.CAMERA_3D_ASSEMBLY_START
    );
    expect(EventDisplayComponent.cameraPositionForAssemblyProgress(2)).toEqual(
      EventDisplayComponent.CAMERA_3D_OVERVIEW
    );
  });

  it('reports orbit distance for scripted assembly framing', () => {
    const a = EventDisplayComponent.CAMERA_3D_ASSEMBLY_START;
    const b = EventDisplayComponent.CAMERA_3D_OVERVIEW;
    expect(EventDisplayComponent.cameraDistanceForAssemblyProgress(0)).toBeCloseTo(
      Math.hypot(a.x, a.y, a.z)
    );
    expect(EventDisplayComponent.cameraDistanceForAssemblyProgress(1)).toBeCloseTo(
      Math.hypot(b.x, b.y, b.z)
    );
    expect(EventDisplayComponent.cameraDistanceForAssemblyProgress(0.5)).toBeGreaterThan(
      EventDisplayComponent.cameraDistanceForAssemblyProgress(0)
    );
    expect(EventDisplayComponent.cameraDistanceForAssemblyProgress(0.5)).toBeLessThan(
      EventDisplayComponent.cameraDistanceForAssemblyProgress(1)
    );
  });
});

describe('EventDisplayComponent cluster sampling', () => {
  const radial = (p: number[]) => Math.hypot(p[0], p[1]);

  it('samples along a radial track inside the TPC shell with soft noise', () => {
    const traj = [
      [0, 0, 0],
      [300, 0, 0],
    ];
    const clusters = EventDisplayComponent.sampleNoisyClustersAlongTrajectory(traj, {
      stepCm: 3,
      noiseSigmaCm: 0.2,
      rMin: 90,
      rMax: 250,
      seed: 42,
    });
    expect(clusters.length).toBeGreaterThan(40);
    for (const c of clusters) {
      expect(radial(c)).toBeGreaterThan(90);
      expect(radial(c)).toBeLessThan(255);
    }
  });

  it('is deterministic for the same seed', () => {
    const traj = [
      [50, 0, 0],
      [200, 0, 0],
    ];
    const a = EventDisplayComponent.sampleNoisyClustersAlongTrajectory(traj, { seed: 7 });
    const b = EventDisplayComponent.sampleNoisyClustersAlongTrajectory(traj, { seed: 7 });
    expect(a).toEqual(b);
  });

  it('does not lie exactly on the track when noise > 0', () => {
    const traj = [
      [60, 0, 0],
      [240, 0, 0],
    ];
    const clusters = EventDisplayComponent.sampleNoisyClustersAlongTrajectory(traj, {
      stepCm: 20,
      noiseSigmaCm: 0.2,
      seed: 99,
    });
    expect(clusters.length).toBeGreaterThan(0);
    const offTrack = clusters.some((c) => Math.abs(c[1]) > 0.01 || Math.abs(c[2]) > 0.01);
    expect(offTrack).toBe(true);
  });
});

describe('EventDisplayComponent decay/background track dedupe', () => {
  const track = (partial: Partial<{ px: number; py: number; pz: number; sign: number; particleId: number }>) => ({
    E: 1,
    mass: 0.14,
    particleId: partial.particleId ?? 0,
    comboId: 0,
    sign: partial.sign ?? 0,
    type: 0,
    px: partial.px ?? 0,
    py: partial.py ?? 0,
    pz: partial.pz ?? 0,
    trajectory: [[0, 0, 0], [1, 0, 0]],
  });

  it('matches a V0 daughter to its reconstructed helix by momentum, ignoring PDG/sign', () => {
    const decay = track({ px: 0.31, py: -0.219, pz: -0.03, sign: -1, particleId: -211 });
    const background = track({ px: 0.311, py: -0.217, pz: -0.03, sign: 0, particleId: 0 });
    expect(EventDisplayComponent.momentaMatchDecayToBackground(decay as any, background as any)).toBe(true);
  });

  it('does not match unrelated momenta', () => {
    const decay = track({ px: 0.31, py: -0.219, pz: -0.03, sign: -1 });
    const other = track({ px: -0.5, py: 0.1, pz: 0.2, sign: 0 });
    expect(EventDisplayComponent.momentaMatchDecayToBackground(decay as any, other as any)).toBe(false);
  });

  it('returns background indices that duplicate decay daughters (one-to-one)', () => {
    const event = {
      tracks: [
        track({ px: 0.311, py: -0.217, pz: -0.03 }),
        track({ px: 1, py: 0, pz: 0 }),
        track({ px: -0.018, py: -0.346, pz: 0.176 }),
      ],
      clusters: [],
      decays: [[
        track({ px: 0.31, py: -0.219, pz: -0.03, sign: -1, particleId: -211 }),
        track({ px: -0.015, py: -0.346, pz: 0.176, sign: 1, particleId: 211 }),
      ]],
    };
    expect(EventDisplayComponent.backgroundTrackIndicesHiddenByDecays(event as any)).toEqual(
      new Set([0, 2])
    );
  });
});

describe('EventDisplayComponent straight-track building mode', () => {
  it('points along momentum, ignoring a misleading far helix sample', () => {
    const trajectory = [
      [0, 0, 0],
      [10, 0.1, 0],
      [-30, 40, -400],
    ];
    const result = EventDisplayComponent.buildStraightTrajectory(trajectory, 1, 0, 0);
    expect(result).not.toBeNull();
    const [p0, p1] = result!;
    expect(p0).toEqual([0, 0, 0]);
    expect(p1[0]).toBeGreaterThan(0);
    expect(Math.abs(p1[1])).toBeLessThan(1e-6);
    expect(Math.abs(p1[2])).toBeLessThan(1e-6);
  });

  it('uses a fixed reach independent of the trajectory chord length', () => {
    const shortTraj = [[0, 0, 0], [1, 0, 0]];
    const longTraj = [[0, 0, 0], [1, 0, 0], [5000, 0, 0]];
    const a = EventDisplayComponent.buildStraightTrajectory(shortTraj, 1, 0, 0)!;
    const b = EventDisplayComponent.buildStraightTrajectory(longTraj, 1, 0, 0)!;
    const lenA = Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1], a[1][2] - a[0][2]);
    const lenB = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1], b[1][2] - b[0][2]);
    expect(lenA).toBeCloseTo(lenB);
    expect(lenA).toBeGreaterThan(
      Math.hypot(EventDisplayComponent.TRACK_RADIUS_TPC, EventDisplayComponent.TRACK_Z_TPC)
    );
  });

  it('returns null without usable momentum', () => {
    expect(EventDisplayComponent.buildStraightTrajectory([[0, 0, 0], [1, 0, 0]], 0, 0, 0)).toBeNull();
    expect(EventDisplayComponent.buildStraightTrajectory([[0, 0, 0]], 0, 0, 0)).toBeNull();
  });

  it('pins the origin to startOverride while keeping the momentum direction', () => {
    const trajectory = [
      [10, 0, 0],
      [11, 1, 0],
    ];
    const vertex = [5, 5, 5];
    const result = EventDisplayComponent.buildStraightTrajectory(trajectory, 0, 1, 0, vertex);
    expect(result).not.toBeNull();
    const [p0, p1] = result!;
    expect(p0).toEqual(vertex);
    expect(p1[0]).toBeCloseTo(vertex[0]);
    expect(p1[1]).toBeGreaterThan(vertex[1]);
    expect(p1[2]).toBeCloseTo(vertex[2]);
  });

  it('centers primary tracks on the beam axis at the original sample z', () => {
    const trajectory = [
      [20, 15, -8],
      [25, 18, -10],
    ];
    const result = EventDisplayComponent.buildStraightTrajectory(trajectory, 0.3, 0.4, 0.1);
    expect(result).not.toBeNull();
    const [p0, p1] = result!;
    expect(p0[0]).toBeCloseTo(0);
    expect(p0[1]).toBeCloseTo(0);
    expect(p0[2]).toBeCloseTo(-8);
    const pMag = Math.hypot(0.3, 0.4, 0.1);
    const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    expect(d[0] / len).toBeCloseTo(0.3 / pMag);
    expect(d[1] / len).toBeCloseTo(0.4 / pMag);
    expect(d[2] / len).toBeCloseTo(0.1 / pMag);
  });
});

describe('EventDisplayComponent cylinder track clip', () => {
  it('clips a radial track at the barrel wall', () => {
    const traj = [
      [0, 0, 0],
      [300, 0, 0],
    ];
    const clipped = EventDisplayComponent.clipTrajectoryToCylinder(traj, 250, 250);
    expect(clipped.length).toBe(2);
    expect(clipped[0]).toEqual([0, 0, 0]);
    expect(Math.hypot(clipped[1][0], clipped[1][1])).toBeCloseTo(250);
    expect(clipped[1][2]).toBeCloseTo(0);
  });

  it('clips a forward track at the end-cap instead of dying mid-volume', () => {
    // Nearly along +z: never reaches R=250 within a short path — without z
    // clip this would keep the whole segment and look like a random stub.
    const traj = [
      [0, 0, 0],
      [10, 0, 400],
    ];
    const clipped = EventDisplayComponent.clipTrajectoryToCylinder(traj, 250, 250);
    expect(clipped.length).toBe(2);
    expect(Math.abs(clipped[1][2])).toBeCloseTo(250);
    expect(Math.hypot(clipped[1][0], clipped[1][1])).toBeLessThan(250);
  });

  it('returns empty when the first sample is already outside', () => {
    expect(
      EventDisplayComponent.clipTrajectoryToCylinder([[300, 0, 0], [400, 0, 0]], 250, 250)
    ).toEqual([]);
    expect(
      EventDisplayComponent.clipTrajectoryToCylinder([[0, 0, 300], [0, 0, 400]], 250, 250)
    ).toEqual([]);
  });
});

describe('EventDisplayComponent layer-hit radius intersection', () => {
  it('returns the crossing on the barrel wall within zMax', () => {
    const traj = [
      [0, 0, 0],
      [500, 0, 50],
    ];
    const hit = EventDisplayComponent.intersectTrajectoryAtRadius(traj, 370, 250);
    expect(hit).not.toBeNull();
    expect(Math.hypot(hit![0], hit![1])).toBeCloseTo(370);
    expect(Math.abs(hit![2])).toBeLessThan(250);
  });

  it('rejects a crossing that lies past the layer half-length in z', () => {
    // Hits TRD radius at z ≈ 300, outside TRACK_Z_TRD = 250.
    const traj = [
      [0, 0, 0],
      [370, 0, 300],
    ];
    expect(
      EventDisplayComponent.intersectTrajectoryAtRadius(traj, 370, 250)
    ).toBeNull();
  });
});

describe('EventDisplayComponent side-view layers', () => {
  it('assigns main-only layer recursively so side cameras skip the subtree', () => {
    const root = new THREE.Group();
    const child = new THREE.Mesh();
    root.add(child);
    EventDisplayComponent.assignMainOnlyLayer(root);

    const sideCam = new THREE.Layers();
    sideCam.set(EventDisplayComponent.LAYER_SHARED);
    const mainCam = new THREE.Layers();
    mainCam.enable(EventDisplayComponent.LAYER_SHARED);
    mainCam.enable(EventDisplayComponent.LAYER_MAIN_ONLY);

    expect(root.layers.test(sideCam)).toBe(false);
    expect(child.layers.test(sideCam)).toBe(false);
    expect(root.layers.test(mainCam)).toBe(true);
    expect(child.layers.test(mainCam)).toBe(true);
  });

  it('sideViewAllowsPart: side ρz = ITS+TRD; front Rφ = ITS+TPC+TRD+TOF', () => {
    const its = 'assets/models/alice components/ITS.glb';
    const fit = 'assets/models/alice components/FIT.glb';
    const tpc = 'assets/models/alice components/TPC.glb';
    const trd = 'assets/models/alice components/TRD.glb';
    const tof = 'assets/models/alice components/TOF.glb';
    const rphi = EventDisplayComponent.SIDE_VIEW_RPHI;
    const rhoz = EventDisplayComponent.SIDE_VIEW_RHOZ;

    // View 1 (side / ρz): no TPC, no TOF, no FIT
    expect(EventDisplayComponent.sideViewAllowsPart(its, rhoz)).toBe(true);
    expect(EventDisplayComponent.sideViewAllowsPart(trd, rhoz)).toBe(true);
    expect(EventDisplayComponent.sideViewAllowsPart(tpc, rhoz)).toBe(false);
    expect(EventDisplayComponent.sideViewAllowsPart(tof, rhoz)).toBe(false);
    expect(EventDisplayComponent.sideViewAllowsPart(fit, rhoz)).toBe(false);

    // View 2 (front / Rφ): ITS + TPC + TRD + TOF
    expect(EventDisplayComponent.sideViewAllowsPart(its, rphi)).toBe(true);
    expect(EventDisplayComponent.sideViewAllowsPart(tpc, rphi)).toBe(true);
    expect(EventDisplayComponent.sideViewAllowsPart(trd, rphi)).toBe(true);
    expect(EventDisplayComponent.sideViewAllowsPart(tof, rphi)).toBe(true);
    expect(EventDisplayComponent.sideViewAllowsPart(fit, rphi)).toBe(false);
  });

  it('computeSideViewZoomFromDistance: Rφ overview framing; ρz 15% wider than matched X window', () => {
    const overviewZ = EventDisplayComponent.CAMERA_3D_OVERVIEW.z;
    const rphi = EventDisplayComponent.SIDE_VIEW_RPHI;
    const rhoz = EventDisplayComponent.SIDE_VIEW_RHOZ;

    const rphiOverview = EventDisplayComponent.computeSideViewZoomFromDistance(overviewZ, rphi);
    expect(rphiOverview).toBeCloseTo(EventDisplayComponent.SIDE_VIEW_FIXED_ZOOM, 5);

    const rhozOverview = EventDisplayComponent.computeSideViewZoomFromDistance(overviewZ, rhoz);
    const rphiPlane =
      EventDisplayComponent.SIDE_CAMERA_DISTANCE -
      EventDisplayComponent.SIDE_VIEW_RPHI_SCALE_DEPTH_M;
    const matchedRhoz =
      rphiOverview * (EventDisplayComponent.SIDE_CAMERA_DISTANCE / rphiPlane);
    expect(rhozOverview).toBeCloseTo(
      matchedRhoz * EventDisplayComponent.SIDE_VIEW_RHOZ_ZOOM_FACTOR,
      5
    );
    expect(EventDisplayComponent.SIDE_VIEW_RHOZ_ZOOM_FACTOR).toBeCloseTo(0.85, 5);
    expect(rhozOverview).toBeLessThan(matchedRhoz);
    expect(rhozOverview).toBeGreaterThan(rphiOverview);

    const closer = EventDisplayComponent.computeSideViewZoomFromDistance(overviewZ / 2, rphi);
    expect(closer).toBeCloseTo(rphiOverview * 2, 5);

    expect(EventDisplayComponent.computeSideViewZoomFromDistance(Number.NaN, rphi))
      .toBeCloseTo(rphiOverview, 5);
  });

  it('side-view scale constants: TOF depth and TRD height target', () => {
    expect(EventDisplayComponent.SIDE_VIEW_RPHI_SCALE_DEPTH_M).toBeCloseTo(3.75, 2);
    expect(EventDisplayComponent.SIDE_VIEW_TRD_HEIGHT_M).toBeCloseTo(7.36, 2);
    expect(EventDisplayComponent.SIDE_VIEW_RHOZ_Y_OVERREAD_M).toBeGreaterThan(
      EventDisplayComponent.SIDE_VIEW_TRD_HEIGHT_M
    );
  });
});
