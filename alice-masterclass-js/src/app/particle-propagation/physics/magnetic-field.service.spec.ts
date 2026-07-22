import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';

import { MagneticFieldService } from './magnetic-field.service';

describe('MagneticFieldService', () => {
  let service: MagneticFieldService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient()],
    });
    service = TestBed.inject(MagneticFieldService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('throws if field() is called before load() resolves', () => {
    expect(() => service.field({ x: 0, y: 0, z: 0 })).toThrowError(/load\(\)/);
  });

  it('loads the real field map and reports ~0.5T along z at the detector center (nominal ALICE solenoid field)', async () => {
    await service.load();
    expect(service.isLoaded).toBe(true);

    const b = service.field({ x: 0, y: 0, z: 0 });
    const magnitude = Math.hypot(b.x, b.y, b.z);

    expect(magnitude).toBeGreaterThan(0.45);
    expect(magnitude).toBeLessThan(0.55);
    // The barrel field is overwhelmingly axial (Bz); transverse leakage should be tiny.
    expect(Math.abs(b.z)).toBeCloseTo(magnitude, 2);
  });

  it('scales the spatially varying map when the selected field strength changes', async () => {
    await service.load();
    const atOrigin = (s: MagneticFieldService) => {
      const b = s.field({ x: 0, y: 0, z: 0 });
      return Math.hypot(b.x, b.y, b.z);
    };
    const atFarZ = (s: MagneticFieldService) => {
      const b = s.field({ x: 0, y: 0, z: 400 });
      return Math.hypot(b.x, b.y, b.z);
    };

    const nominal = atOrigin(service);
    service.setFieldStrengthT(2);
    expect(service.fieldStrengthScale).toBeCloseTo(4, 6);
    expect(atOrigin(service) / nominal).toBeCloseTo(4, 2);

    // Far along z the map is weaker, but the scale factor still applies.
    service.setFieldStrengthT(0.5);
    const farNominal = atFarZ(service);
    service.setFieldStrengthT(2);
    expect(atFarZ(service) / farNominal).toBeCloseTo(4, 2);
  });

  it('reverses only the L3 solenoid contribution when polarity is flipped', async () => {
    await service.load();
    const atOrigin = () => service.field({ x: 0, y: 0, z: 0 });
    const atDipole = () => service.field({ x: 0, y: -50, z: -900 });

    const solBefore = atOrigin();
    const dipBefore = atDipole();

    expect(service.toggleSolenoidPolarity()).toBe(-1);
    expect(service.fieldSolenoidPolarity).toBe(-1);

    const solAfter = atOrigin();
    const dipAfter = atDipole();

    expect(solAfter.z).toBeCloseTo(-solBefore.z, 5);
    expect(solAfter.x).toBeCloseTo(-solBefore.x, 5);
    expect(solAfter.y).toBeCloseTo(-solBefore.y, 5);
    // Dipole magnet is a separate circuit — polarity toggle must not flip it.
    expect(dipAfter.x).toBeCloseTo(dipBefore.x, 5);
    expect(dipAfter.y).toBeCloseTo(dipBefore.y, 5);
    expect(dipAfter.z).toBeCloseTo(dipBefore.z, 5);
  });

  it('exposes the raw parsed buffers once loaded, for handing off to the Web Worker', async () => {
    expect(service.getRawBuffers()).toBeNull();
    await service.load();
    const buffers = service.getRawBuffers();
    expect(buffers).not.toBeNull();
    expect(buffers!.solSegments.byteLength).toBeGreaterThan(0);
    expect(buffers!.dipParams.byteLength).toBeGreaterThan(0);
  });

  it('load() is idempotent (concurrent callers await the same fetch)', async () => {
    const [a, b] = await Promise.all([service.load(), service.load()]);
    expect(a).toBeUndefined();
    expect(b).toBeUndefined();
    expect(service.isLoaded).toBe(true);
  });

  it('dipole LUT region has mostly transverse B along the beam at z ≈ −900 cm', async () => {
    await service.load();
    const b = service.field({ x: 0, y: -50, z: -900 });
    const mag = Math.hypot(b.x, b.y, b.z);
    expect(mag).toBeGreaterThan(0.4);
    expect(Math.abs(b.x) / mag).toBeGreaterThan(0.85);
  });

  it('solenoid map: |B| falls on axis at end-caps but can peak at mid-r near z ≈ ±560', async () => {
    await service.load();
    const mag = (p: { x: number; y: number; z: number }) => {
      const b = service.field(p);
      return Math.hypot(b.x, b.y, b.z);
    };
    const onAxisCentre = mag({ x: 0, y: 0, z: 0 });
    const onAxisEnd = mag({ x: 0, y: 0, z: 560 });
    const midREnd = mag({ x: 200, y: 0, z: 560 });
    const gapMidplane = mag({ x: 400, y: 0, z: 0 });
    const gapEnd = mag({ x: 400, y: 0, z: 560 });

    expect(onAxisCentre).toBeGreaterThan(0.48);
    expect(onAxisCentre).toBeLessThan(0.52);
    // Classic solenoid fall-off on axis.
    expect(onAxisEnd).toBeLessThan(onAxisCentre - 0.1);
    // Real ALICE LUT: mid-radius end-cap |B| can exceed the IP plateau (iron / Br).
    expect(midREnd).toBeGreaterThan(onAxisCentre);
    // Outer free-bore is more axial: weaker end-cap Br than at r ≈ 200.
    const brRatio = (p: { x: number; y: number; z: number }) => {
      const b = service.field(p);
      const m = Math.hypot(b.x, b.y, b.z);
      const r = Math.hypot(p.x, p.y);
      const br = r > 0 ? (b.x * p.x + b.y * p.y) / r : 0;
      return Math.abs(br) / m;
    };
    expect(brRatio({ x: 200, y: 0, z: 560 })).toBeGreaterThan(0.1);
    expect(brRatio({ x: 400, y: 0, z: 560 })).toBeLessThan(0.08);
    expect(gapEnd).toBeLessThan(gapMidplane);
  });
});
