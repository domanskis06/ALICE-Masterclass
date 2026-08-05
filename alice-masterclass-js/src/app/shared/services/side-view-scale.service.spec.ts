import { SideViewScaleService } from './side-view-scale.service';

describe('SideViewScaleService', () => {
  const service = new SideViewScaleService();

  const baseInput = {
    fovDeg: 70,
    aspect: 1,
    zoom: 10 / 11,
    cameraDistanceWu: 10,
    objectScale: 1e-2,
    viewportCssW: 400,
    viewportCssH: 400,
  };

  it('visibleHalfExtentsM: 1 world unit = 1 metre at the origin plane', () => {
    const { halfWM, halfHM } = service.visibleHalfExtentsM(baseInput);
    const expectedHalfH =
      Math.tan((70 * Math.PI) / 360) * 10 / (10 / 11);
    expect(halfHM).toBeCloseTo(expectedHalfH, 5);
    expect(halfWM).toBeCloseTo(expectedHalfH, 5);
  });

  it('scalePlaneDistanceWu shrinks labelled extents (Rφ TOF near-face fix)', () => {
    const atOrigin = service.visibleHalfExtentsM(baseInput);
    const atTofFace = service.visibleHalfExtentsM({
      ...baseInput,
      scalePlaneDistanceWu: 10 - 3.75,
    });
    expect(atTofFace.halfHM).toBeCloseTo(atOrigin.halfHM * (6.25 / 10), 5);
    // TOF (~8 m tall) fits inside the corrected half-extent window.
    expect(atTofFace.halfHM * 2).toBeGreaterThan(8);
    expect(atTofFace.halfHM).toBeLessThan(6);
  });

  it('zooming in shrinks the visible extent', () => {
    const wide = service.visibleHalfExtentsM({ ...baseInput, zoom: 1 });
    const tight = service.visibleHalfExtentsM({ ...baseInput, zoom: 2 });
    expect(tight.halfWM).toBeCloseTo(wide.halfWM / 2, 5);
  });

  it('niceStepM returns a canonical step in metres', () => {
    expect(service.niceStepM(16, 5)).toBe(5);
    expect(service.niceStepM(2, 5)).toBe(0.5);
    expect(service.niceStepM(0.4, 5)).toBe(0.1);
  });

  it('compute maps Rφ axes to x/y and ρz to z/y with metre labels', () => {
    const rphi = service.compute({
      ...baseInput,
      axisKind: 'rphi',
      scalePlaneDistanceWu: 10 - 3.75,
    });
    const rhoz = service.compute({
      ...baseInput,
      axisKind: 'rhoz',
      scalePlaneDistanceWu: 10, // origin plane
    });
    expect(rphi.xAxisLabel).toBe('x');
    expect(rphi.yAxisLabel).toBe('y');
    expect(rhoz.xAxisLabel).toBe('z');
    expect(rhoz.yAxisLabel).toBe('y');
    expect(rphi.xTicks.length).toBeGreaterThan(2);
    expect(rphi.scaleBar.lengthM).toBeGreaterThan(0);
    expect(rphi.scaleBar.label).toMatch(/ m$/);
    // Rφ near-face plane is tighter than ρz origin plane.
    expect(rphi.xMaxM).toBeLessThan(rhoz.xMaxM);
  });

  it('niceScaleBarM stays inside the visible width', () => {
    const { halfWM } = service.visibleHalfExtentsM(baseInput);
    const bar = service.niceScaleBarM(halfWM);
    expect(bar).toBeGreaterThan(0);
    expect(bar).toBeLessThanOrEqual(halfWM * 2);
  });
});
