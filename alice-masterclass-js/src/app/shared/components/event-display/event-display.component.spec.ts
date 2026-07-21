import { EventDisplayComponent } from './event-display.component';

describe('EventDisplayComponent calorimeter assembly grouping', () => {
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
